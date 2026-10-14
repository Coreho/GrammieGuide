# Home cards: shipped Clay extension

## Overview

This note records the finished Home-card extension and the later reference-matching pass: the user asked for Games and Websites cards, requested “I want it to look exactly like that”, and selected “Match the cream background too”. It inherits incumbent Clay controls, saved slots, colors and activation behavior. The added `clayCards` palette is opt-in for general users; it has been applied to this user’s development configuration and startup was verified by the coordinating agent. Root `DESIGN.md` and `.impeccable/design.json` record the extracted tokens; this note records the scoped implementation and review limits.

The build is the authority for the measurements below. Sources checked: `src/renderer/launcher/src/components/Tile.tsx`, `Tile.css`, `BuiltinArtwork.tsx`, `TileGrid.tsx`, `useLabelFit.ts`, `Stage.tsx`; `src/renderer/launcher/src/clay.ts`, `index.css`, `tiles/builtins.tsx`; `src/shared/theme.ts` and `homeLayout.ts`.

## Colors

Cards retain the six existing themes: Tiles Bold, Tiles, Mint, Butter, Sky and Evening, plus the opt-in Clay cards palette. `tileBackground(colorIndex)` cycles saved color indices through four theme tile gradients, falling back to the theme surface gradient. `tileInk(colorIndex)` resolves the matching per-slot ink, then theme tile ink, then inherited ink. Rearranging tiles does not assign colors from their new positions.

The matching `clayCards` palette sets page and all three Stage stops to a stable cream `#FDF9EF`. Yellow is `linear-gradient(180deg,#FFC82C,#FFC227)` with `#331D05` ink; green is `linear-gradient(180deg,#1D7844,#18733F)` with white ink. Blue and violet remain additional saved slots. Faces use narrow tonal variation with localized edge shading, rather than exaggerated full-face ramps. Other palettes keep their own source tokens. Artwork material colors remain in transparent atlases while live surfaces and text follow the selected theme.

## Typography

Labels remain live text, using the incumbent Figtree family with `system-ui, sans-serif` fallback. The button's accessible name is the current saved label; illustrations and pictures are decorative.

Card labels use line-height 1.1. Matching-palette illustrated labels use 72px and weight 800; incumbent palettes retain the 42px/700 illustrated fallback. Ordinary photo/icon labels use 34px/700 and dense labels use 29px/700. Each multiplies the selected font scale (1, 1.15, 1.3, 1.45 or 1.6) and the measured label-fit factor. Matching-palette illustrated labels therefore start at 72–115.2px before fitting; incumbent illustrated labels start at 42–67.2px. Whole words wrap without mid-word breaks; `useLabelFit` reduces the factor in 0.04 steps to a 0.6 minimum when the label or its parent overflows. That minimum is a fitting limit, not a guarantee for arbitrary long text.

Compact non-dense labels align left; dense labels align center. Illustrated compact labels flex into the remaining row width. The stored label limits remain 28 characters for Simple four and 18 for More choices.

## Layout

The Stage remains a centered 1440×900 design space scaled uniformly by `min(availableWidth / 1440, availableHeight / 900)`. Measurements in this note are Stage CSS pixels before that scale.

Simple four is a two-column, two-row grid with 24px gaps. More choices is four columns and two rows with 20px gaps. The grid uses equal `minmax(0, 1fr)` tracks and padding of 4px 4px 8px. Saved slots determine placement; wide cards span two adjacent columns without crossing a row boundary. Invalid, overlapping and overflow slots retain the existing handling rather than being filled automatically.

Home passes `compact` for every card, so artwork and labels sit side by side. Default illustrated cards have a 24px gap and 14px 24px padding. Ordinary illustrated artwork has height `min(calc(var(--card-art-size, 192px) - 32px * var(--font-scale, 1)), 100%)`. Clay cards sets the base to 240px, yielding 208px at the first step and 188.8px at the largest, subject to available height; other palettes retain the 192px base. Games and Websites use measured object-aspect frames instead of square viewports. In the matching palette these category cards have 4:1 aspect, auto height bounded to 100% of the existing grid slot, centered alignment, `8px 8%` padding and 10% gap. Games object height is `calc(100% - 16px * (var(--font-scale, 1) - 1))`; Websites is `calc(92% - 16px * (var(--font-scale, 1) - 1))`. This preserves the reference’s large object/label proportions while making objects slightly smaller at larger font steps. Other themes retain their category-layout defaults.

Normal-width More choices cards are dense: no sculpted artwork or icon well is shown unless a photo is selected. They retain the compact padding and a label-only treatment. A selected dense photo uses a 48×48px well, 16px corners, 12px gap and 10px 12px padding. Wide More choices cards retain the non-dense artwork or photo/icon treatment.

Non-illustrated compact wells use a square height of `min(calc(112px - 24px * var(--font-scale, 1)), 100%)` and 28px corners. The component's non-compact branch retains its 18px gap, 18px 12px padding and square photo/icon size of `calc(152px - 40px * var(--font-scale, 1))` with 34px corners; Home currently uses the compact branch.

## Elevation & Depth

The six incumbent palettes keep `TILE_SHADOW`: inner top highlight, inner bottom shade, diffuse lift and contact shadow. Clay cards overrides the resting recipe with `inset 0 7px 12px rgba(255,255,255,.36), inset 0 -8px 12px rgba(55,31,5,.22), 0 10px 16px rgba(80,57,27,.23), 0 3px 5px rgba(80,57,27,.16)`. Pointer down switches to `TILE_SHADOW_ACTIVE`; pointer up, leave and cancel restore the selected palette’s resting shadow. Photo/icon wells keep `WELL_SHADOW` and the theme well/accent gradient. Sculpted artwork has no additional well gradient or well shadow: its own transparent object and local shading sit directly on the live card surface.

## Shapes

Cards retain 40px corners and clip their contents. The first atlas viewport is square and clips one quadrant of an image rendered at 200% width and height. Games/Websites use alpha-bounds frames on their separate 887×1774 atlas: Games `(88,176,756,636)` and Websites `(92,1055,712,548)`, measured at alpha threshold 128 with 8px breathing room. The renderer fits visible bounds and uses their aspect ratios; transparent production margins no longer make the objects too small. It adds no nested rounded panel around the illustrated object.

## Components

### Built-in artwork and overrides

The local `src/renderer/launcher/src/assets/home-cards/clay-objects-v1.png` atlas serves four built-ins: Photos (top left, overlapping landscape prints), Music (top right, tabletop radio), Weather (bottom left, sun and cloud) and News (bottom right, folded newspaper). Weather is a recognition illustration, not a live conditions report; newspaper marks are decorative rather than readable headlines.

The second bundled atlas `games-websites-objects-v1.png` supplies Games (top) and Websites (bottom). `tileArtworkFor` makes named artwork an explicit caregiver presentation choice; existing Photos/Music/Weather/News built-ins retain their defaults. Eligibility requires recognized named artwork or a matching built-in, no saved icon, no saved photo and a non-dense card. Labels and URLs are never used to infer artwork. Artwork never changes the destination. Schema 12 adds the optional artwork field and palette; migration 012 preserves saved tile and theme values. A selected photo takes the picture position; an explicit icon suppresses sculpted artwork. On photo load failure or missing photo URL, the existing explicit icon, built-in icon or generic link icon is displayed. Changing the photo URL remounts that picture so a new selection can recover. On atlas load failure, the built-in SVG icon appears in the existing artwork-sized region. Dense cards without a selected photo remain label-only even when an explicit icon exists.

The atlas is imported into the bundle and requires no remote image fetch or new runtime dependency. Its pixels contain objects, not labels or whole card surfaces. `BuiltinArtwork` exposes the original quadrants with 0% or -100% offsets and the new objects through measured alpha-frame offsets; its image ignores pointer events and is non-draggable.

### Input and motion

Cards remain native buttons with existing activation callbacks and saved labels. Keyboard focus uses a 4px `currentColor` outline inset by 8px, keeping focus visible inside clipped edge slots. Transitions are 140ms for translate and scale and 120ms for box-shadow; `prefers-reduced-motion: reduce` removes these transitions. No new card-specific motion or navigation model is introduced.

### Provenance and verification

The approved concept is `design/home-cards/home-cards-clay-v1.png` (1983×793), with generation prompt and limitations in adjacent `home-cards-clay-v1.json`. The shipped atlas is a separate 1254×1254 RGBA asset generated with ChatGPT built-in image generation; `design/home-cards/clay-objects-v1.json` records its full prompt, quadrant mapping, reference relationship and transparency checks on Mint, Evening and Tiles Bold. The concept is style and object authority, not a raster implementation of Home.

The Games/Websites reference and asset prompt are recorded in `games-websites-v1.json`; the bundled extra atlas also carries the exact original generation prompt. The original concept and both provenance manifests remain authority for artwork relationships, not claims of collection navigation.

The fresh finish reviewer initially requested fixes for undersized objects, undersized type, darkening ground and exaggerated surface ramps. One source-fix batch addressed all four with alpha fitting, reference proportions, larger live type, stable cream and localized edge shading. Re-review scored all four resolved and returned **ship AT FIX-LIST SCOPE**: a close visual match, with pixel identity not established. This is not whole-surface approval. `reference-match-review.json` persists the disposition and evidence.

The coordinating session reports build/typechecks and lint pass; 875 unit tests; 2 selection/persistence/theme/font E2Es; 4 existing artwork/layout/focus/fallback E2Es passing after the fix; and 8 earlier photo/color regressions passing before this matching pass. Five valid resting captures are under `.impeccable/review/card-reference/`: `home-cream.png`, `games.png`, `websites.png`, `simple4-largest.png`, and `more8-largest.png`. User-facing resting captures are `design/home-cards/home-cream-working-v2.png`, `games-working-v2.png` and `websites-working-v2.png`, with embedded capture provenance. The once-only detector returned `[]`; the two-raster provenance scan had zero missing records. This documentation pass did not rerun checks or the detector.

Real kiosk hardware has not been checked. Games/Websites collection menus and a six-card Home layout are not built; saved destinations remain independent. No merge or publication is implied by this card review.

## Do's and Don'ts

- Do preserve saved labels, color indices, slots and caregiver photo/icon choices when extending these cards.
- Do keep recognition artwork decorative, local and separate from live labels and card surfaces.
- Do retain the dense label-only fallback and test both layouts across all five font steps.
- Don't impose the matching palette on other saved themes or treat the concept’s composition as a six-card layout requirement.
- Don't report exact pixel identity or approval beyond the resolved card-reference fix list.

Documentation context: `PRODUCT.md` remains absent; the incumbent kiosk context and user-approved scoped palette supplied sufficient authority for this extension. Root `DESIGN.md` and `.impeccable/design.json` now document extracted shipped tokens without initiating a new identity. The older `review.json` is historical evidence for the first four-card pass; its former global-doc gap and test counts are superseded here. Incumbent glyph icons in custom icon and browser navigation paths are not canonized as new-system guidance; they remain outside this card-fix scope. No reviewed card-scope defect was recorded as a rule to excuse a finding.
