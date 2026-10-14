# Home cards: shipped Clay extension

## Overview

This note records the finished Home-card extension approved with “I LOVE IT.” It inherits the incumbent Clay visual system and saved theme, color, slot and activation behavior. It is a scoped implementation record, not a new global design system or a replacement for the saved device configuration.

The build is the authority for the measurements below. Sources checked: `src/renderer/launcher/src/components/Tile.tsx`, `Tile.css`, `BuiltinArtwork.tsx`, `TileGrid.tsx`, `useLabelFit.ts`, `Stage.tsx`; `src/renderer/launcher/src/clay.ts`, `index.css`, `tiles/builtins.tsx`; `src/shared/theme.ts` and `homeLayout.ts`.

## Colors

Cards retain the six existing themes: Tiles Bold, Tiles, Mint, Butter, Sky and Evening. `tileBackground(colorIndex)` cycles saved color indices through four theme tile gradients, falling back to the theme surface gradient. `tileInk(colorIndex)` resolves the matching per-slot ink, then theme tile ink, then inherited ink. Rearranging tiles does not assign colors from their new positions.

The approved concept's yellow, green, blue and violet cards represent Tiles Bold; those colors are not imposed on other themes. The artwork's material colors remain in the transparent atlas, while live card surfaces and text continue to follow the theme.

## Typography

Labels remain live text, using the incumbent Figtree family with `system-ui, sans-serif` fallback. The button's accessible name is the current saved label; illustrations and pictures are decorative.

Card labels use weight 700 and line-height 1.1. Their base sizes are 42px with sculpted artwork, 34px for ordinary photo/icon cards, and 29px for dense cards. Each multiplies the selected font scale (1, 1.15, 1.3, 1.45 or 1.6) and the measured label-fit factor. Illustrated labels therefore start at 42–67.2px before fitting. Whole words wrap without mid-word breaks; `useLabelFit` reduces the factor in 0.04 steps to a 0.6 minimum when the label or its parent overflows. That minimum is a fitting limit, not a guarantee for arbitrary long text.

Compact non-dense labels align left; dense labels align center. Illustrated compact labels flex into the remaining row width. The stored label limits remain 28 characters for Simple four and 18 for More choices.

## Layout

The Stage remains a centered 1440×900 design space scaled uniformly by `min(availableWidth / 1440, availableHeight / 900)`. Measurements in this note are Stage CSS pixels before that scale.

Simple four is a two-column, two-row grid with 24px gaps. More choices is four columns and two rows with 20px gaps. The grid uses equal `minmax(0, 1fr)` tracks and padding of 4px 4px 8px. Saved slots determine placement; wide cards span two adjacent columns without crossing a row boundary. Invalid, overlapping and overflow slots retain the existing handling rather than being filled automatically.

Home passes `compact` for every card, so artwork and labels sit side by side. Default illustrated cards have a 24px gap and 14px 24px padding. Their square artwork viewport has height `min(calc(192px - 32px * var(--font-scale, 1)), 100%)`: 160px at font scale 1, decreasing to 140.8px at scale 1.6, subject to available height. This reserves room for larger live labels.

Normal-width More choices cards are dense: no sculpted artwork or icon well is shown unless a photo is selected. They retain the compact padding and a label-only treatment. A selected dense photo uses a 48×48px well, 16px corners, 12px gap and 10px 12px padding. Wide More choices cards retain the non-dense artwork or photo/icon treatment.

Non-illustrated compact wells use a square height of `min(calc(112px - 24px * var(--font-scale, 1)), 100%)` and 28px corners. The component's non-compact branch retains its 18px gap, 18px 12px padding and square photo/icon size of `calc(152px - 40px * var(--font-scale, 1))` with 34px corners; Home currently uses the compact branch.

## Elevation & Depth

The card keeps the existing `TILE_SHADOW`: inner top highlight, inner bottom shade, diffuse lift and contact shadow. Pointer down switches to `TILE_SHADOW_ACTIVE`; pointer up, leave and cancel restore the resting shadow. Photo/icon wells keep `WELL_SHADOW` and the theme well/accent gradient. Sculpted artwork has no additional well gradient or well shadow: its own transparent object and local shading sit directly on the live card surface.

## Shapes

Cards retain 40px corners and clip their contents. The atlas viewport is square and clips one quadrant of an image rendered at 200% width and height. It adds no nested rounded panel around the illustrated object.

## Components

### Built-in artwork and overrides

The local `src/renderer/launcher/src/assets/home-cards/clay-objects-v1.png` atlas serves four built-ins: Photos (top left, overlapping landscape prints), Music (top right, tabletop radio), Weather (bottom left, sun and cloud) and News (bottom right, folded newspaper). Weather is a recognition illustration, not a live conditions report; newspaper marks are decorative rather than readable headlines.

Artwork eligibility requires a recognized built-in key, no saved icon, no saved photo and a non-dense card. A selected photo takes the picture position; an explicit icon suppresses sculpted artwork. On photo load failure or missing photo URL, the existing explicit icon, built-in icon or generic link icon is displayed. Changing the photo URL remounts that picture so a new selection can recover. On atlas load failure, the built-in SVG icon appears in the existing artwork-sized region. Dense cards without a selected photo remain label-only even when an explicit icon exists.

The atlas is imported into the bundle and requires no remote image fetch or new runtime dependency. Its pixels contain objects, not labels or whole card surfaces. `BuiltinArtwork` exposes each quadrant with 0% or -100% offsets; its image ignores pointer events and is non-draggable.

### Input and motion

Cards remain native buttons with existing activation callbacks and saved labels. Keyboard focus uses a 4px `currentColor` outline inset by 8px, keeping focus visible inside clipped edge slots. Transitions are 140ms for translate and scale and 120ms for box-shadow; `prefers-reduced-motion: reduce` removes these transitions. No new card-specific motion or navigation model is introduced.

### Provenance and verification

The approved concept is `design/home-cards/home-cards-clay-v1.png` (1983×793), with generation prompt and limitations in adjacent `home-cards-clay-v1.json`. The shipped atlas is a separate 1254×1254 RGBA asset generated with ChatGPT built-in image generation; `design/home-cards/clay-objects-v1.json` records its full prompt, quadrant mapping, reference relationship and transparency checks on Mint, Evening and Tiles Bold. The concept is style and object authority, not a raster implementation of Home.

The coordinating build/review pass reports: build/typechecks and lint pass; 871/871 unit tests; 4/4 new artwork E2Es; 8/8 existing tile-photo/color E2Es; seven valid resting captures under `.impeccable/review/home-cards/`; ship disposition with no material card-scope fixes; once-only detector `[]`. These are reported session verification results, not checks rerun by this documentation pass. Real kiosk hardware has not been verified. No saved device tiles were replaced and no merge or publication was performed.

## Do's and Don'ts

- Do preserve saved labels, color indices, slots and caregiver photo/icon choices when extending these cards.
- Do keep recognition artwork decorative, local and separate from live labels and card surfaces.
- Do retain the dense label-only fallback and test both layouts across all five font steps.
- Don't promote the approved four-card concept's palette or composition into a global system requirement.

Pre-existing documentation drift: `PRODUCT.md`, root `DESIGN.md` and `.impeccable/design.json` were absent when checked. They remain absent because this approved extension inherits the existing visual system and the write boundary permits only this scoped note; global product/design documentation requires a separate task. No card-scope defect was canonized or repaired in this record.
