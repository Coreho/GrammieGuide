# Spec 4: Photo games

## Goal

Two gentle games built from the family's own photos: **Matching Pairs**
and **Who Is This?**. They exist to give her something pleasant to do that
also keeps names and faces in circulation. There is no score, no timer, no
"wrong" and no game over. Buddy sits alongside and comments from a local
phrase list.

The photo library built here is shared with a future Photos slideshow tile
and the life book; this spec only builds what the games need.

## What she experiences

**Tile.** Builtin tile `games`, label "Games", a puzzle-piece icon.

**Games screen** (`GamesOverlay`, z-layer `gamesOverlay`, full-screen clay
panel): two large cards, "Matching Pairs" and "Who Is This?", plus Back.
If the caregiver has enabled only one game, that game opens directly.

### Matching Pairs

- A grid of face-down clay cards: 3 pairs in a 3×2 grid by default, or 4
  pairs in a 4×2 grid (`matchingPairs` setting). Card backs are a soft
  pattern in the theme accent, never plain white (white reads as "empty"
  to some users).
- Tap a card: it flips (400ms, ease-out, no bounce). Tap a second card:
  - match → both stay face up with a soft glow and the person's name under
    each. Buddy: "That's Tom! Nice one."
  - no match → both stay visible for 1.5 seconds, then flip back together.
    Buddy: "Not those two. Let's try another." Never "wrong", never a
    buzzer.
- While two cards are up, other taps are ignored (no rapid-tap penalty;
  the confusion detector still runs globally).
- When all pairs are found: a full-panel "You found them all!" with a
  Buddy line and two buttons, **Play again** and **All done**. Play again
  reshuffles with different photos when the library allows.
- **Adaptive ease**: if the same session has 6 non-matches in a row, the
  next round quietly drops to 2 pairs (2×2). It never goes below 2 and
  never announces the change. It resets to the configured size on the
  next visit to the Games screen.

### Who Is This?

- One large photo (max 60% of the panel height), question "Who is this?"
  and 2 or 3 name buttons (`whoIsThisChoices`), one correct. Names are
  drawn from people tagged in the library; distractors are other tagged
  people, never invented names.
- Correct → the button glows, the photo caption appears ("Tom, your
  grandson, at the lake"). Buddy: "Yes, that's Tom."
- Not correct → the tapped button softens, the right one glows, and the
  same caption appears. Buddy: "That's Tom, your grandson." The framing is
  always "here is who it is", never "you got it wrong".
- **Next** appears after either outcome. There is no streak or count on
  screen.
- After 8 photos (or when the library runs out) the round ends with the
  same **Play again / All done** panel.
- Adaptive ease: after 3 misses in a session, choices drop from 3 to 2 for
  the rest of the session.

### Common rules

- Everything honors `--font-scale`. Minimum tap target is 200×200px for
  cards and 120px tall for name buttons.
- No sounds by default. `sounds` setting adds a soft chime on match.
- Back is always visible and always works mid-game; no "are you sure".
- Buddy's lines come from `src/shared/games/buddyLines.ts`, keyed by event
  (`match`, `noMatch`, `roundDone`, `whoCorrect`, `whoRevealed`), with 4–6
  variants each and `{name}` / `{relation}` slots. No API calls during
  play.

## What the caregiver experiences

New **Photos** admin tab (named for the library, since Games and the
future Photos tile share it):

- **Library**: grid of thumbnails. "Add photos…" opens the OS dialog (jpg,
  png, heic where Windows can decode it, webp). Each imported photo is
  downscaled to a 1600px long edge and a 320px thumbnail is written beside
  it. Import shows progress.
- Per photo: **Person** (free text with autocomplete over existing names),
  **Relation** (free text, e.g. "your grandson"), **Caption** (optional
  sentence), **Use in games** toggle (default on). Multi-select to set the
  same person on many photos at once.
- A gentle validation banner: "Who Is This? needs at least 3 different
  people with photos" / "Matching Pairs needs at least 4 photos", so the
  caregiver knows why a game card is greyed out on the kiosk.

**Games** settings live at the bottom of the same tab: which games are
enabled, `matchingPairs` (3 or 4), `whoIsThisChoices` (2 or 3), `sounds`.

Activity tab gets `game-started` (game id), `game-finished` (game id,
rounds, hits, misses) and `game-abandoned`. Hit and miss counts are for
the caregiver's trend view later; they are never shown on the kiosk.

## Architecture

### Main

- Photo library folder `userData/media/photos/`, index `photo-library.json`
  via the shared `mediaLibrary.ts`. Entry shape:

```ts
type Photo = {
  id: string
  fileName: string          // <id>.jpg, always re-encoded to JPEG on import
  thumbFileName: string     // <id>.thumb.jpg
  person?: string
  relation?: string
  caption?: string
  useInGames: boolean
  importedAt: string
}
```

- `src/main/services/photos/photoLibrary.ts` handles import: decode with
  `nativeImage.createFromPath`, `resize({ width: 1600 })` when the long
  edge exceeds 1600, `toJPEG(85)`, write; thumbnail the same way at 320.
  EXIF orientation is honored by `nativeImage` on Windows for JPEG; HEIC
  files that fail to decode are reported as failed imports rather than
  crashing the batch.
- `src/main/services/games/gameDeck.ts` (pure, in `src/shared/games/`
  actually, see Tests) builds a round from the library:
  `buildPairsRound(photos, pairs)` and `buildWhoRound(photos, choices, count)`.
  Rules: a pair uses the same photo twice (recognizing the same picture is
  the task, not matching two different photos of one person); Who Is This
  never repeats a photo in a round and never offers two buttons with the
  same name.

### Renderer (launcher)

- `GamesOverlay.tsx` → `GamesMenu`, `MatchingPairs.tsx`, `WhoIsThis.tsx`,
  `RoundDone.tsx`, `BuddyLine.tsx` (small speech chip anchored toward the
  Buddy canvas).
- Card flip is a CSS `rotateY` on two stacked faces; `prefers-reduced-motion`
  swaps it for a cross-fade.
- Round state is local React state driven by the pure deck helpers; the
  adaptive-ease counters live in a `useRef` scoped to the overlay's mount.
- Images load from `grammie-media://photos/<fileName>`.
- Reports with `window.launcher.reportGame({ event, game, rounds, hits, misses })`.

### Renderer (admin)

- `PhotosTab.tsx` with `PhotoGrid`, `PhotoEditor` (side panel), `BulkTag`,
  and `GamesSettings`.

## Config

```ts
games: z.object({
  enabled: z.object({
    matchingPairs: z.boolean().default(true),
    whoIsThis: z.boolean().default(true)
  }),
  matchingPairs: z.union([z.literal(3), z.literal(4)]).default(3),
  whoIsThisChoices: z.union([z.literal(2), z.literal(3)]).default(2),
  sounds: z.boolean().default(false)
})
```

Schema bump +1, migration `NNN-games.ts`. `builtinKey` enum gains
`'games'`. Photo metadata is library data, not config.

## IPC

`IpcApi`:
- `photos:list: { request: void; response: Photo[] }` (launcher gets only `useInGames` photos; admin gets all: two channels, `photos:listForGames` and `photos:listAll`, the latter admin-gated)
- `photos:import: { request: void; response: { imported: number; failed: number } }` (admin)
- `photos:update: { request: { id: string; patch: Partial<Pick<Photo,'person'|'relation'|'caption'|'useInGames'>> }; response: Photo }` (admin)
- `photos:bulkSetPerson: { request: { ids: string[]; person: string; relation?: string }; response: void }` (admin)
- `photos:remove: { request: { id: string }; response: void }` (admin)
- `games:report: { request: { event: 'started' | 'finished' | 'abandoned'; game: 'pairs' | 'who'; rounds?: number; hits?: number; misses?: number }; response: void }`

`IpcEvents`:
- `photos:libraryChanged: void`

## Tests

Unit (`tests/unit/gameDeck.test.ts`, `src/shared/games/deck.ts`):
- pairs round has exactly `pairs * 2` cards, each photo appears twice,
  order is shuffled (seeded RNG injected for determinism).
- who round never repeats a photo, never duplicates a name among choices,
  correct answer position is uniformly distributed over many seeds.
- with too few people, `buildWhoRound` returns `null` and the menu greys
  the card; with fewer than `pairs` photos, `buildPairsRound` falls back to
  the largest possible even size.
- adaptive-ease reducer: 6 misses → 2 pairs; 3 misses → 2 choices; resets
  on remount.
- `buddyLines.pick(event, ctx)` fills slots and cycles variants without
  immediate repeats.

E2E (`tests/e2e/games.spec.ts`):
- seed the photo library with 4 generated PNGs tagged as 3 people via
  `__e2e__.seedPhotos`, tap the Games tile, play a full Matching Pairs
  round by reading `data-photo-id` attributes to find pairs, assert the
  "You found them all!" panel.
- play one Who Is This question, tap a wrong name, assert the caption
  reveal text.

## Out of scope

- Slideshow / "remember when" viewing (future Photos tile, same library).
- API-generated Buddy commentary about the photo content.
- Any scoring visible to her, leaderboards, difficulty labels.
- Face detection to auto-tag people. Tagging is manual and caregiver-owned.
