# V2 feature specs: overview and shared infrastructure

These five features were chosen as genuinely new capabilities, not ports of
anything in `grandmas-launcher`. Each has its own spec in this folder. This
file covers the decisions and plumbing they share, so the individual specs
can stay focused on behavior.

| # | Feature | Spec | Depends on |
|---|---------|------|------------|
| 1 | Scam shield | [01-scam-shield.md](01-scam-shield.md) | nothing new |
| 2 | Presence-aware Home | [02-presence-aware-home.md](02-presence-aware-home.md) | nothing new |
| 3 | Music tile | [03-music-tile.md](03-music-tile.md) | media protocol, media library |
| 4 | Photo games | [04-photo-games.md](04-photo-games.md) | media protocol, media library |
| 5 | News tile with reader mode | [05-news-tile-reader-mode.md](05-news-tile-reader-mode.md) | tile sizes, ad blocker |

## Assumptions made without asking

The specs were written to be built without a further scoping round, so these
calls were made up front. Change any of them before the matching feature is
started; none is hard to reverse at spec stage.

- **Build order:** 1 → 5 → 4 → 3 → 2. Scam shield first because it hardens
  the embedded browser that News depends on. Presence last because it is the
  only one that needs hardware on the real device to verify.
- **No new cloud accounts.** Music is local files plus internet radio in its
  first phase (Spotify is a phase 2 option). News uses public RSS feeds and
  the site itself. Nothing needs a caregiver to sign into a third-party
  service to ship.
- **No new caregiver alert channel.** Presence and Scam shield both produce
  events a caregiver would want pushed to their phone. Neither spec builds
  that channel; both write to the activity log and leave a clearly named hook
  for a future alerting service.
- **Buddy stays canned where latency matters.** Greetings, game commentary
  and shield explanations come from local phrase lists, not the API. The API
  is for open conversation only.

## Shared infrastructure

### 1. `grammie-media://` protocol

Music files, photos and news thumbnails live under `userData`. Renderers
must never get `file://` access (sandbox stays on for the browser view, and
`webSecurity` stays on everywhere), so a custom protocol serves them:

- `src/main/services/media/mediaProtocol.ts` registers `grammie-media` with
  `protocol.handle()` in `app.whenReady()`. It must be registered before the
  launcher window loads.
- URL shape: `grammie-media://<library>/<fileName>`, where `<library>` is one
  of `music`, `photos`, `news-cache`. Anything else is a 404.
- `<fileName>` is validated against `^[A-Za-z0-9._-]+$` and resolved inside
  the library folder only. Any `..`, slash or non-matching name is rejected
  before touching the filesystem.
- Responses set `Content-Type` from the extension and support `Range`
  requests, which `<audio>` needs for seeking.
- Registered as privileged (`protocol.registerSchemesAsPrivileged`, with
  `stream: true`, `supportFetchAPI: true`) so `<audio>` and `<img>` work.

### 2. Media library store

`src/main/services/media/mediaLibrary.ts` owns an index JSON per library
(`music-library.json`, `photo-library.json`) in `userData`, separate from
the config store. Reasons: these can hold hundreds of entries, they must not
be pushed to renderers on every config change, and they are not caregiver
"settings" so they do not belong in migrations.

- Import copies files into the library folder with a generated name
  (`<uuid>.<ext>`); the original path is never stored.
- Photos are downscaled on import to a 1600px long edge with Electron's
  `nativeImage` (no new native dependency).
- Music metadata (title, artist, duration, embedded art) is read with
  `music-metadata` (pure JS, new dependency).
- Each library exposes `list()`, `import(paths)`, `remove(id)`,
  `update(id, patch)`. Admin IPC wraps these behind `requireAdminUnlocked()`.

### 3. Tile sizes

`tileSchema` gains `size: z.enum(['normal', 'wide']).default('normal')`.
A wide tile spans two grid columns. `columnsFor()` in `TileGrid.tsx`
becomes `columnsFor(cellCount)` where a wide tile counts as two cells, and
the grid uses `gridColumn: 'span 2'` for wide tiles. The News tile is the
first user of this. It stays generic so any tile can be made wide from the
admin Tiles tab. This is a schema change, so it follows the migration rule
below.

### 4. Builtin tile keys

`builtinKey` is currently a free string with `'weather'` the only value.
Introduce `BUILTIN_TILE_KEYS = ['weather', 'music', 'games', 'news'] as const`
in `src/shared/configSchema.ts` and narrow the schema to `z.enum(...)`.
`TilesTab.tsx` offers each as an "Add built-in" option. `App.tsx`
`activateTile()` switches on the key.

### 5. New z-layers

Add to `src/shared/zLayers.ts`, keeping the existing scale:

```
newsShelf: 15        // full-screen view like Home, below Buddy
readerView: 16
musicOverlay: 210
gamesOverlay: 220
nowPlayingChip: 25
presenceDim: 290     // dim veil sits under confusion/help, above content
scamShieldOverlay: 320  // above confusion, below Buddy chat and Help
```

### 6. Config schema and migrations

Each feature adds one block to `configSchema` and bumps
`CURRENT_SCHEMA_VERSION` by one, with one migration file per feature named
`NNN-<feature>.ts` (for example `001-tile-sizes-and-builtins.ts`,
`002-scam-shield.ts`). Every migration is pure: `(old: unknown) => unknown`
that fills the new block with defaults and leaves everything else alone.
`mergeAdminPatch()` needs no change unless a block holds a secret; none of
these do.

### 7. Activity log event names

All five features log to the existing activity log. Names are kebab-case,
prefixed by feature: `scam-shield-blocked`, `presence-arrived`,
`music-play`, `game-finished`, `news-article-opened`. Detail strings hold
identifiers (domain, track id, source id), never page text, chat text or
image data.

### 8. Testing rules that apply to all five

- Pure logic goes in `src/shared/<feature>/` and gets a Vitest file under
  `tests/unit/`. Nothing in `src/shared` imports Electron.
- Each feature adds one Playwright spec under `tests/e2e/` that drives the
  built app through the primary happy path, using `__e2e__` hooks where a
  kiosk window blocks real input.
- Anything that talks to the network (feeds, radio streams) must have a
  fixture served from a local HTTP server inside the test, never a live
  site.

## New dependencies (all pure JS unless noted)

| Package | Used by | Why |
|---------|---------|-----|
| `music-metadata` | Music | tags and embedded art at import |
| `fast-xml-parser` | News | RSS and Atom parsing in main |
| `@mozilla/readability` | News | article extraction inside the page |
| `dompurify` | News | sanitize extracted HTML before render |
| `@ghostery/adblocker-electron` | News, Scam shield | already installed, unused |
| `xstate` | Presence | already installed, unused |

No new native modules. Presence detection is plain frame differencing on a
canvas, not a machine-learning model.
