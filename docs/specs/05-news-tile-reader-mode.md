# Spec 5: News tile with previews and reader mode

## Goal

One Home tile, "News", that opens a shelf of tall cards, one per news or
article site the caregiver has chosen. Each card shows a live preview of
that site so she recognizes it before tapping. Tapping a card leads to the
site's stories rendered in **reader mode**: the article's text and pictures
in the clay style at her font size, with none of the site's layout, ads,
pop-ups or autoplay video.

Three pieces, in build order: tile sizes (shared infrastructure), the
shelf with previews, and reader mode. Reader mode is also available for
ordinary web tiles once built.

## What she experiences

### Home

A "News" tile. By default it is a **wide** tile (spans two columns) so it
reads as a doorway rather than a link, but that is just the default value
of the new `size` field and the caregiver can set it back to normal. The
well shows a folded-newspaper icon; the tile can optionally show the top
headline from the first source in small text under the label
(`showHeadlineOnTile`, default off to keep Home calm).

### News shelf

Tapping News replaces Home with the shelf (`view === 'news'`, z-layer
`newsShelf`), the same way the browser view does. Buddy stays visible.

```
┌────────────────────────────────────────────────────────────┐
│  [ Home ]                    News                          │
│                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ BBC News     │ │ Local Herald │ │ Gardening    │        │
│  │ ┌──────────┐ │ │ ┌──────────┐ │ │   Monthly    │        │
│  │ │  hero    │ │ │ │  hero    │ │ │ ┌──────────┐ │        │
│  │ │  image   │ │ │ │  image   │ │ │ │ screenshot│ │        │
│  │ └──────────┘ │ │ └──────────┘ │ │ │ thumbnail │ │        │
│  │ Top story    │ │ Top story    │ │ └──────────┘ │        │
│  │ headline in  │ │ headline in  │ │              │        │
│  │ big text     │ │ big text     │ │ (no feed)    │        │
│  │              │ │              │ │              │        │
│  │ Updated 9:10 │ │ Updated 9:05 │ │ Updated 8:40 │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└────────────────────────────────────────────────────────────┘
```

- Cards are portrait, roughly 2:3, with the site name on top, a preview in
  the middle, and an "Updated 9:10" line at the bottom.
- **Preview** is the source's top story when it has a feed: the hero image
  (`og:image`, `media:content` or `enclosure`) and the headline. When it
  has no feed, the preview is a screenshot thumbnail of the site's front
  page, captured off-screen by the app every `refreshMinutes`.
- Up to 6 cards fit at the default font step (3 per row, 2 rows). More
  sources scroll vertically with a large scroll hint; the admin tab warns
  past 6.
- A card whose preview failed shows the site name and icon only, never an
  error message. Tapping still works.

### Stories list (sources with a feed)

Tapping a card shows a list of the source's latest stories (up to 12):
each row is a thumbnail, a headline in large text, and the age
("2 hours ago"). Back returns to the shelf. Tapping a row opens the story
in reader mode.

### Reader mode

- The article renders in a clay panel (z-layer `readerView`): title,
  byline and date in a header, then paragraphs, headings, block quotes and
  images at their natural order, in `--font-scale` typography with ~70
  character measure. No links are tappable inside the body (they render as
  plain text), so she cannot wander off the article.
- The existing `NavBar` stays at the top with **Home**, **Back**, and a new
  **Show page / Show article** toggle. "Show page" reveals the real site in
  the browser view for the rare article the extractor cannot parse.
- While the extractor is working (typically under two seconds) the panel
  shows the headline from the feed and a soft "Getting the story…" line.
- If extraction fails (paywall, video-only page), the panel says "This one
  is easier on the page" and switches to Show page automatically.
- A **Read aloud** button is placed but disabled until speech-out exists;
  the reader state exposes `plainText` for it.

### Sources without a feed

Tapping the card opens the site in the browser view with the reader toggle
available on every page: when a page looks like an article (Readability's
`isProbablyReaderable`), the NavBar shows **Show article** and tapping it
extracts and renders as above.

## What the caregiver experiences

New **News** admin tab:

- **Sources** list with drag-to-reorder. "Add source" takes a URL; the app
  fetches the page, auto-discovers a feed via
  `<link rel="alternate" type="application/rss+xml|atom+xml">` (or common
  paths `/feed`, `/rss`, `/rss.xml`), pulls the site name and icon, and
  shows the caregiver what it found before saving. The feed URL can be
  edited by hand.
- Per source: label, icon URL, feed URL (optional), "Open in: reader /
  page".
- **Preview** for each source as the kiosk will show it, with a "Refresh
  now" button.
- Settings: `refreshMinutes` (15–180, default 30), `showHeadlineOnTile`,
  `maxStories` (6–20, default 12).
- Tiles tab gains a **Size** control (Normal / Wide) for every tile, which
  is the shared infrastructure landing here.

Activity: `news-shelf-opened`, `news-source-opened` (source id),
`news-article-opened` (source id), `news-reader-fallback` (source id) and
`news-refresh-failed` (source id) go to the activity log; feed fetch
failures also go to the reliability log so a dead feed shows up next to
Wi-Fi events.

## Architecture

### Main: `src/main/services/news/`

- `feedFetcher.ts`: fetches the feed URL with a 10s timeout and a
  desktop-like UA, parses RSS 2.0 and Atom with `fast-xml-parser`, returns
  `Story[]`:

```ts
type Story = { id: string; title: string; url: string; publishedAt?: string; imageUrl?: string; summary?: string }
```

  Image discovery order: `media:content`/`media:thumbnail`, `enclosure`
  with image type, first `<img>` in `content:encoded`/`description`. As a
  last resort for the top story only, fetch the article page and read
  `og:image`. Pure parsing is in `src/shared/news/parseFeed.ts` for tests;
  the fetch wrapper stays in main.
- `feedDiscovery.ts`: `discoverFeed(siteUrl)` for the admin "Add source"
  flow (link tags, then common paths).
- `previewCapture.ts`: for sources without a feed, an off-screen
  `BrowserWindow` (`show: false`, `webPreferences: { offscreen: true, sandbox: true, partition: 'persist:browser' }`)
  at 1200×1800 loads the site, waits for `did-finish-load` plus 3s, calls
  `capturePage()`, resizes to 400px wide with `nativeImage`, writes
  `userData/media/news-cache/<sourceId>.jpg`. One capture at a time, 30s
  hard timeout, the window is destroyed after each capture. The ad blocker
  runs in this partition too so the screenshot is not an ad.
- `newsCache.ts`: in-memory shelf state plus `news-cache/shelf.json` so the
  shelf shows the last known cards immediately on boot, before the first
  refresh. Cache folder is capped: thumbnails are overwritten in place, and
  the JSON is bounded by `maxStories × sources`.
- `newsScheduler.ts`: refresh loop every `refreshMinutes`, staggered 5s per
  source, paused while presence says away (if that feature is enabled) and
  during quiet hours, since nobody is reading. Pushes `news:shelfChanged`
  after each source completes.
- `adBlocker.ts` (in `services/browser/`): initializes
  `@ghostery/adblocker-electron` with the bundled prebuilt lists
  (`ElectronBlocker.fromPrebuiltAdsAndTracking`) and
  `enableBlockingInSession(session.fromPartition('persist:browser'))`. Lists
  ship with the package; no network needed at startup, with a weekly
  background update attempt that is allowed to fail silently.

### Reader extraction

Runs **inside the page**, in the browser view preload, so it sees the same
DOM she would (JS-rendered articles included) and needs no server-side DOM
library:

- `src/preload/browserView.ts` bundles `@mozilla/readability`. On
  `browserView:extractArticle` it clones `document`, runs
  `new Readability(clone).parse()`, and replies with
  `{ title, byline, publishedTime, contentHtml, textContent, excerpt, siteName }`
  or `null`. It also reports `isProbablyReaderable(document)` on each
  `load` via `browserView:readerable` so the NavBar can show the toggle.
- Main relays: `news:openArticle({ url, sourceId })` loads the URL in the
  browser view with bounds set to zero height (hidden but rendering), waits
  for `did-finish-load`, requests the extraction, and pushes
  `news:articleReady` to the launcher with the article or `null`.
  "Show page" restores the normal bounds; "Show article" hides them again.
  The browser view is never destroyed during the toggle so Back keeps
  working.
- The renderer sanitizes `contentHtml` with `dompurify` (allow `p, h1–h4,
  blockquote, ul, ol, li, figure, figcaption, img, strong, em, br`; strip
  every attribute except `src` and `alt` on `img`), then renders it with a
  scoped stylesheet. Images with `src` outside http/https are dropped.
  Links are flattened to text by the allow-list.

### Renderer (launcher)

- `NewsShelf.tsx`, `SourceCard.tsx`, `StoryList.tsx`, `ReaderView.tsx`,
  `NewsTileHeadline.tsx` (optional tile subtitle).
- `App.tsx`: `view` gains `'news' | 'stories' | 'reader'`; `NavBar` grows a
  `readerState: 'none' | 'available' | 'article' | 'page'` prop and the
  toggle button.
- Images on cards load from `grammie-media://news-cache/<file>` for
  screenshots and from the feed's `imageUrl` directly for story art (http
  or https only; `referrerPolicy="no-referrer"`).

### Renderer (admin)

- `NewsTab.tsx` with `SourceList` (reorder), `AddSourceDialog` (URL →
  discovered details → confirm), `SourcePreview`, settings.
- `TilesTab.tsx` gets the Size radio.

## Config

Shared infrastructure (its own migration, `NNN-tile-sizes-and-builtins.ts`):

```ts
tileSchema: size: z.enum(['normal', 'wide']).default('normal')
builtinKey: z.enum(BUILTIN_TILE_KEYS).optional()
```

News block (migration `NNN-news.ts`):

```ts
news: z.object({
  sources: z.array(z.object({
    id: z.string(),
    label: z.string(),
    url: z.string(),
    feedUrl: z.string().optional(),
    iconUrl: z.string().optional(),
    openIn: z.enum(['reader', 'page']).default('reader')
  })).default([]),
  refreshMinutes: z.number().min(15).max(180).default(30),
  maxStories: z.number().min(6).max(20).default(12),
  showHeadlineOnTile: z.boolean().default(false)
})
```

## IPC

`IpcApi`:
- `news:getShelf: { request: void; response: ShelfCard[] }`
- `news:getStories: { request: { sourceId: string }; response: Story[] }`
- `news:openArticle: { request: { url: string; sourceId?: string }; response: { ok: boolean } }`
- `news:setReaderVisible: { request: { article: boolean }; response: void }` (Show page / Show article)
- `news:refresh: { request: { sourceId?: string }; response: void }` (admin)
- `news:discoverSource: { request: { url: string }; response: { label: string; feedUrl?: string; iconUrl?: string } | null }` (admin)

`IpcEvents`:
- `news:shelfChanged: ShelfCard[]`
- `news:articleReady: { url: string; article: ReaderArticle | null }`
- `browser:readerable: { readerable: boolean }`

```ts
type ShelfCard = { sourceId: string; label: string; iconUrl?: string; kind: 'feed' | 'screenshot'; headline?: string; imageUrl?: string; updatedAt?: string }
type ReaderArticle = { title: string; byline?: string; publishedTime?: string; siteName?: string; contentHtml: string; plainText: string }
```

## Tests

Unit:
- `tests/unit/parseFeed.test.ts`: RSS 2.0, Atom, RSS with `media:content`,
  feed with CDATA and HTML entities in titles, feed with no images, malformed
  XML returns `[]` not a throw. Dates normalize to ISO.
- `tests/unit/feedDiscovery.test.ts`: link-tag discovery on fixture HTML,
  fallback path ordering (pure candidate list builder).
- `tests/unit/tileGrid.test.ts` (extend): `columnsFor` with wide tiles
  counting as two cells; a single wide tile plus three normal ones lays out
  as 3 columns / 2 rows.
- `tests/unit/readerSanitize.test.ts`: script, iframe, `onerror`, `<a href>`
  and `javascript:` image sources are all stripped; allowed tags survive.

E2E (`tests/e2e/news.spec.ts`):
- local HTTP server serving a feed XML, an article page with real
  paragraphs, and a feedless front page.
- add both sources via the admin window; open News; assert two cards, one
  with the headline, one with a screenshot `<img>` whose `naturalWidth > 0`.
- tap the feed card, tap the story, assert reader shows the article title
  and first paragraph and that the body has no `<a>` elements.
- tap Show page, assert the browser view has bounds again
  (`__e2e__.browserBounds()`).

## Out of scope

- A general "Photos/Messages/Games" grid redesign; only the size field is
  added.
- Read-aloud (button is placed, wired later with speech-out).
- Offline article saving beyond the shelf cache.
- Comments, sharing, sign-in to paywalled sites.
