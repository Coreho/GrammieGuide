# Spec 3: Music tile

## Goal

A Home tile that plays music the caregiver has chosen for her, with the
fewest possible steps: tap the tile, tap a big card, music plays. Music
keeps playing while she uses the rest of the screen. The library is
whatever the caregiver wants it to be: her favorites, the grandkids'
recordings, a hymn collection, a talk-radio station. Nothing about "her
era" is assumed.

Phase 1 is local files plus internet radio streams. Phase 2 adds Spotify
Connect as an optional source for caregivers who already pay for Premium.
Phase 1 ships without any account.

## What she experiences

**Tile.** Builtin tile `music`, label "Music" (editable), a note icon in
the well.

**Music screen** (`MusicOverlay`, z-layer `musicOverlay`, full-screen clay
panel like Weather):

```
┌────────────────────────────────────────────────────────┐
│  Music                                        [ Back ] │
│                                                        │
│   ┌────────┐  ┌────────┐  ┌────────┐                   │
│   │ Hymns  │  │ Frank  │  │ Radio  │   ...up to 6      │
│   │  ♪     │  │ Sinatra│  │ WCBS   │   playlist cards  │
│   └────────┘  └────────┘  └────────┘                   │
│                                                        │
│   Now playing                                          │
│   ┌──────┐  Fly Me to the Moon                         │
│   │ art  │  Frank Sinatra                              │
│   └──────┘                                             │
│                                                        │
│      [ ◀◀ ]      [   ▶ / ❚❚   ]      [ ▶▶ ]           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- Tapping a card starts that playlist from the beginning, shuffled if the
  caregiver set it so. Tapping the card that is already playing does
  nothing (no accidental restart).
- Play/Pause is the largest control (160px). Previous and Next are
  secondary. There is no seek bar, no volume slider (volume is the OS
  ceiling), no queue view.
- Album art shows when embedded in the file; otherwise a colored clay
  square with the first letter of the playlist.
- Text uses the font-scale variable like everything else.

**Now-playing chip.** When she leaves the Music screen with music playing,
a chip appears on Home under the clock (z-layer `nowPlayingChip`):
`♪ Fly Me to the Moon  [ ❚❚ ]  [ Stop ]`. Tapping the chip text reopens the
Music screen. Stop clears the chip.

**Auto-stop.** Playback stops after `autoStopMinutes` (default 90) so a
playlist started in the morning is not still running at night. Radio
streams count too.

**Radio.** A radio station is a card like any other. Now-playing shows the
station name and the stream's ICY title if present. Prev/Next are hidden
for radio.

**Failure.** If a file is missing or a stream fails, the player skips to
the next track. If a whole playlist fails, the card dims and shows
"Not available right now" in small text; no error words beyond that.

## What the caregiver experiences

New **Music** admin tab:

- **Library**: list of imported tracks (title, artist, duration). "Add
  files…" opens the OS file dialog (mp3, m4a, aac, flac, ogg, wav); files
  are copied into the library, metadata read, art extracted. "Remove"
  deletes the copy. Import shows a progress count for large batches.
- **Playlists**: up to 6 cards. Each has a label, an accent color from the
  theme palette, shuffle on/off, and an ordered track list built by
  checking tracks from the library. A playlist can also be a single radio
  station (label + stream URL, tested with a "Try it" button that plays
  10 seconds in the admin window).
- **Settings**: `autoStopMinutes`, "Show now-playing chip on Home".

Activity tab gets `music-play` (playlist id), `music-stop`, `music-autostop`.

## Architecture

### Main

- `src/main/services/media/mediaProtocol.ts` and `mediaLibrary.ts` (shared
  infrastructure, see overview). The music library folder is
  `userData/media/music/`, index `music-library.json`.
- `src/main/services/music/musicLibrary.ts` wraps the generic library with
  music-specific import: `music-metadata` reads `common.title`,
  `common.artist`, `format.duration`, and `common.picture[0]` which is
  written as `<id>.art.jpg` next to the track.
- Playlists are config (small, caregiver-authored); tracks are library
  (large, derived). A playlist references track ids. `music:getLibrary`
  returns both resolved together so the renderer does one call.

### Renderer (launcher)

- `src/renderer/launcher/src/music/usePlayer.ts`: a single
  `HTMLAudioElement` created once at app start (not inside the overlay, so
  playback survives opening and closing the screen). State: current
  playlist, index, playing, trackTitle, art URL. Handles `ended` → next,
  `error` → skip with a counter that gives up after the playlist length.
  Tracks load from `grammie-media://music/<fileName>`; radio loads the
  stream URL directly (http/https only, checked with `isAllowedUrl`).
- `MusicOverlay.tsx`, `PlaylistCard.tsx`, `NowPlayingChip.tsx`.
- Auto-stop is a renderer timer reset on every `play`.
- Reports transitions with `window.launcher.reportMusic({ event, playlistId })`
  for the activity log.

### Renderer (admin)

- `MusicTab.tsx` with `LibraryList`, `PlaylistEditor`, `RadioStationForm`.
- Import goes through `music:importFiles`, which opens the dialog in main
  (`dialog.showOpenDialog` on the admin window) so the renderer never sees
  a filesystem path.

### Audio routing note

The OS volume ceiling (`volumeEnforcer.ts`) already caps output, so the
player sets `audio.volume = 1` and leaves loudness to the enforcer. Radio
streams that are mastered loud are the reason not to add a per-app boost.

## Config

```ts
music: z.object({
  playlists: z.array(z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(['tracks', 'radio']),
    accent: z.number().int().min(0).max(3).default(0),   // theme tile hue index
    shuffle: z.boolean().default(false),
    trackIds: z.array(z.string()).default([]),
    streamUrl: z.string().optional()
  })).max(6).default([]),
  autoStopMinutes: z.number().min(10).max(480).default(90),
  showNowPlayingChip: z.boolean().default(true)
})
```

Schema bump +1, migration `NNN-music.ts`. `builtinKey` enum gains
`'music'` (overview item 4).

## IPC

`IpcApi`:
- `music:getLibrary: { request: void; response: { tracks: MusicTrack[]; playlists: ResolvedPlaylist[] } }`
- `music:importFiles: { request: void; response: { imported: number; failed: number } }` (admin)
- `music:removeTrack: { request: { id: string }; response: void }` (admin)
- `music:previewStream: { request: { url: string }; response: { ok: boolean } }` (admin; HEAD/GET first bytes to validate)
- `music:report: { request: { event: 'play' | 'stop' | 'autostop' | 'error'; playlistId?: string }; response: void }`

`IpcEvents`:
- `music:libraryChanged: void` (after import/remove, so the launcher refetches)

Types in `ipcContract.ts`:

```ts
type MusicTrack = { id: string; fileName: string; title: string; artist?: string; durationMs: number; artFileName?: string }
type ResolvedPlaylist = Config['music']['playlists'][number] & { tracks: MusicTrack[] }
```

## Phase 2: Spotify Connect (optional, not scheduled)

- Caregiver signs in once in the admin tab (OAuth PKCE in a dedicated
  window; refresh token stored as a secret alongside the API key and
  stripped by `toPublicConfig`).
- A Spotify playlist becomes a card with `kind: 'spotify'`. Playback uses
  the Web Playback SDK inside the launcher renderer, which requires
  Premium and Widevine (Electron ships it by default on Windows).
- Everything in the Music screen stays identical; only `usePlayer` grows a
  second backend.
- Deferred because it adds an account, a token lifecycle, and a
  network-dependent failure mode to a comfort feature. Local files never
  fail on a Wi-Fi hiccup.

## Tests

Unit (`tests/unit/musicPlayer.test.ts`, pure queue logic extracted to
`src/shared/music/queue.ts`):
- next/previous wrap correctly, shuffle produces a permutation, skip-on-error
  gives up after N failures.
- auto-stop timer resets on play and fires once.
- radio playlists hide prev/next (pure `controlsFor(playlist)` helper).

Unit (`tests/unit/mediaProtocol.test.ts`, pure path validation extracted
to `src/shared/media/paths.ts`):
- rejects `..`, slashes, empty names, unknown libraries.

E2E (`tests/e2e/music.spec.ts`):
- seed the library folder with a 2-second generated WAV, add a playlist
  through the admin window, tap the tile and the card, assert the
  now-playing title and that `audio.paused` is false via `page.evaluate`.
- close the overlay, assert the chip is visible, tap Stop, chip gone.

## Out of scope

- Voice control ("Buddy, play my hymns") until speech-in exists; the
  player exposes `play(playlistId)` so that hook is one line later.
- Buddy dancing. The behavior machine can subscribe to `music:report`
  events when it exists.
- Lyrics, queue editing on the kiosk, per-track favorites.
