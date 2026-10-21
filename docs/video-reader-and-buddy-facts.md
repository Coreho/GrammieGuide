# Video controls, reader mode and Buddy facts

## Large video controls (TASK-50)

Individual YouTube watch, Shorts and embed pages offer Play/Pause, Back 10
seconds and Full screen when a playable video is present. Search results and
other sites keep their normal page controls. The toolbar occupies its own row
below Home and Back, rather than covering the site's player. It follows the
actual player state; missing players hide the toolbar and non-seekable streams
disable rewind. Buttons work with Tab and Enter/Space.

Full screen expands the video inside the embedded page area. Home, Back and the
large transport controls stay reachable. It uses the browser's top layer,
without granting a fullscreen permission or changing the kiosk window. Home,
inactivity closure and recovery still destroy the page through the existing
close path. Local music continues to follow the shared audio policy.

Automated verification uses a generated 15-second VP8/Vorbis fixture
(`tests/fixtures/video.webm`): playback, seeking, expansion/restore, fixed Home
position, all five text sizes, missing-player behavior and complete page closure.
The fixture was generated from a solid-color frame and sine tone with FFmpeg;
it contains no third-party media.

A live YouTube smoke check on the development PC passed on 2026-10-20 using
“Me at the zoo”: actual Play/Pause states, expansion and restore, reachable Home,
complete page closure and clean app shutdown. This does not substitute for her
physical kiosk's touch, layout and sound checks.

Real-device check still to perform:

- On her kiosk, open an approved YouTube video and wait for it to load. Check
  Play/Pause, Back 10 seconds, Full screen and Smaller video against what the
  video actually does. Repeat after YouTube navigates to another video.
- At all five text sizes, confirm Home is easy to reach, the toolbar fits and
  the page's controls remain below it. Test Tab, Enter and Space.
- Remove/unplug the network and try a restricted or unavailable video. Controls
  must not claim playback succeeded. Home must remain usable.
- Start local music, then play video; confirm music pauses under the existing
  audio policy. Tap Home and confirm the video ends. Repeat by leaving the page
  idle and by triggering the caregiver recovery check.

## Reader mode (TASK-04)

Feed stories initially show their headline and “Getting the story…”, then a
clay article with title, byline, publication date and readable content. Ordinary
web pages that look like articles offer Show article. Show page/Show article
uses the same loaded page and preserves Back history; Back from a News story's
first page returns to its News tile. Failed extraction quietly reveals the real
page. Initial loading and extraction have separate timeouts.

Readability runs on a clone in the isolated sandbox preload. DOMPurify applies
a small allow-list, then converts the result to a data tree. Main rebuilds that
tree and Home renders React elements, never publisher HTML. Links become text;
scripts, frames, event handlers and non-HTTP(S) source images are excluded.
Up to 12 raster images use the same public-address, redirect, size and timeout
guards as News thumbnails, and arrive as data URLs without broadening Home's
CSP. Unavailable images retain their alternative text. Extraction is bounded
to 50,000 DOM elements and 3,000 output nodes. Page audio/video is paused while
hidden behind the reader, including later autoplay attempts.

Read aloud uses the existing Edge voice with Windows fallback. It splits the
whole extracted article into chunks of at most 1,100 characters. Stop reading,
Show page, Back, Home, navigation and recovery cancel reading immediately and
prevent subsequent chunks from starting. Story-open logs contain the News tile
ID, never its article URL or content.

Fixture checks cover extraction, safe markup, metadata, silent fallback,
page/article switching, Back to News, ordinary web articles, all five text sizes
and private logs. Unit tests cover the sanitizer, complete speech chunking and
cancellation between chunks. Reader screenshots are emitted under test-results.

## Caregiver facts (TASK-24)

Admin → Buddy → Personal facts and plans supports up to 50 entries, each up to
500 characters: Family, Home, Routine, Favorite things, or Plan/appointment.
Plans require a real calendar date and can be cancelled. They remain available
through that date in the kiosk computer's local time zone, then expire at local
midnight. Check Windows' date/time/time-zone settings on her computer.

These details are sent to the configured chat provider during a chat and are
included in settings backups. They are never written to the activity log.
Schema migration 017 adds an empty list without replacing existing Buddy
settings or secrets.

Each API request receives only current caregiver-approved entries as separate
conversation context. The frozen system prompt does not change. Missing details
are explicitly unknown; a saved plan is not a guarantee. Edits, deletion,
cancellation and expiry invalidate earlier API history so an old assistant reply
cannot reintroduce removed facts. The on-screen conversation stays visible.
If facts change while the provider is answering, its stale result is discarded
and Buddy gives a calm, noncommittal reply.

Tests verify local-midnight/DST boundaries, cancellation, deletion during chat,
in-flight changes, unchanged system prompt, log privacy, migration and caregiver
CRUD. An expiry-condition mutation was detected by the boundary test. These
checks establish request construction and data handling; they do not guarantee
that every possible model reply will follow instructions. Check real replies
with her chosen model before relying on personalization in daily use.
