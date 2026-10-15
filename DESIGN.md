---
name: GrammieGuide
description: Dementia-friendly kiosk controls in the incumbent Clay visual system.
colors:
  cream-ground: "#FDF9EF"
  cream-surface: "#FFFCF5"
  surface-shade: "#ECE6DA"
  surface-deep: "#E6E0D4"
  warm-ink: "#30291F"
  secondary-ink: "#504738"
  yellow-face: "#FFC82C"
  yellow-edge: "#FFC227"
  yellow-ink: "#331D05"
  green-face: "#1D7844"
  green-edge: "#18733F"
  blue-face: "#348CCB"
  blue-edge: "#1C71B6"
  violet-face: "#7857CD"
  violet-edge: "#603EB2"
  white-ink: "#FFFFFF"
  mint-accent: "#BCE5CB"
  mint-accent-deep: "#89CBA7"
  accent-ink: "#174B32"
typography:
  illustrated-label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "calc(72px * var(--font-scale, 1) * var(--label-fit, 1))"
    fontWeight: 800
    lineHeight: 1.1
  incumbent-illustrated-label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "calc(42px * var(--font-scale, 1) * var(--label-fit, 1))"
    fontWeight: 700
    lineHeight: 1.1
  ordinary-label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "calc(34px * var(--font-scale, 1) * var(--label-fit, 1))"
    fontWeight: 700
    lineHeight: 1.1
  dense-label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "calc(29px * var(--font-scale, 1) * var(--label-fit, 1))"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  card: "40px"
  compact-well: "28px"
  dense-well: "16px"
  stacked-well: "34px"
  pill: "999px"
spacing:
  illustrated-gap: "24px"
  simple-grid-gap: "24px"
  dense-grid-gap: "20px"
  stage-gap: "32px"
components:
  illustrated-card:
    typography: "{typography.illustrated-label}"
    rounded: "{rounded.card}"
    padding: "14px 24px"
    height: "100%"
    width: "100%"
  games-card:
    backgroundColor: "linear-gradient(180deg,#FFC82C,#FFC227)"
    textColor: "{colors.yellow-ink}"
    typography: "{typography.illustrated-label}"
    rounded: "{rounded.card}"
    padding: "8px 8%"
    width: "100%"
    height: "auto"
  websites-card:
    backgroundColor: "linear-gradient(180deg,#1D7844,#18733F)"
    textColor: "{colors.white-ink}"
    typography: "{typography.illustrated-label}"
    rounded: "{rounded.card}"
    padding: "8px 8%"
    width: "100%"
    height: "auto"
  dense-card:
    typography: "{typography.dense-label}"
    rounded: "{rounded.card}"
    padding: "14px 24px"
  navigation-button:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.dense-well}"
    padding: "12px 24px"
---

# Design System: GrammieGuide

## Overview

**Creative North Star: "Clay Launcher"**

This records the shipped launcher’s incumbent Clay language: pillowy controls, large live labels and familiar recognition objects. The visual reference remains `UI Screenshots/clay-launcher-design/GrammieGuide Home.dc.html`. The approved card extension adds bundled illustrations and an opt-in matching palette without replacing saved placement or destinations.

The user selected the cream background with the reference appearance. Frontmatter color primitives describe `clayCards`; the other six palettes remain independently authoritative in `src/shared/theme.ts`. This record covers launcher controls and cards, not a redesign of the caregiver admin panel. `PRODUCT.md` is absent; existing kiosk requirements and approved card choices supply the scoped context, without inventing a new product identity.

**Key Characteristics:**
- Tactile rounded Clay controls with local edge light and contact shadows.
- Large live labels that scale in five discrete steps.
- Decorative offline artwork with caregiver overrides.
- Stable saved slots and opt-in theme changes.

## Colors

The matching palette uses a steady cream ground and colorful card faces with narrow surface variation.

### Primary
- **Golden yellow face / edge:** first saved palette slot; dark yellow ink supports its label.
- **Deep green face / edge:** second saved palette slot with white ink.

### Secondary
- **Blue face / edge** and **violet face / edge:** remaining saved palette slots with white ink.
- **Mint accent / deep** with **accent ink:** controls and non-illustrated wells.

### Neutral
- **Cream ground:** page and all three Stage background stops share this value in `clayCards`.
- **Cream surface / surface shade / surface deep:** raised ancillary controls and surface layering.
- **Warm ink / secondary ink / white ink:** primary, supporting and colored-card labels.

**The Stable Ground Rule.** Keep the matching palette’s page and Stage background stops equal; its ground does not darken toward the bottom.

**The Saved Palette Rule.** Colors follow saved `colorIndex`, cycling four slots; rearrangement does not recolor a tile. `clayCards` is opt-in. Tiles Bold, Tiles, Mint, Butter, Sky and Evening retain their source tokens and typography fallbacks.

## Typography

**Display and label font:** Figtree with system-ui and sans-serif fallbacks. Local imports supply weights 400, 500, 600, 700 and 800. Figtree is the display face; the fallback is for font availability.

### Hierarchy
- **Illustrated label:** matching-palette token; incumbent themes use the separate illustrated fallback token.
- **Ordinary label:** non-illustrated photo/icon cards.
- **Dense label:** normal-width More choices cards.
- **Help title:** 40px times font scale, weight 800, line-height 1; supporting copy is 22px times font scale, weight 600, line-height 1.2.

**The Whole Word Rule.** Labels remain live text and do not break within words. Font steps are 1, 1.15, 1.3, 1.45 and 1.6. Measured fitting decreases in 0.04 steps to 0.6 when text or its button overflows; that minimum is a limit, not a promise for arbitrarily long text.

## Layout

The launcher centers a fixed 1440×900 Stage, uniformly scaled by the smaller available width/1440 or height/900 ratio. Stage padding is 40px 64px 32px. This is kiosk scaling, not breakpoint-driven reflow. Shared `zLayers` owns stacking order.

Simple four has two columns and two rows; More choices has four columns and two rows. Tracks use `minmax(0, 1fr)`, with grid padding 4px 4px 8px. Wide tiles span two adjacent columns and never cross a row boundary. Invalid, overlapping and overflow entries do not cause holes to be filled or remaining tiles to move. Label limits are 28 and 18 characters respectively.

Home uses horizontal compact cards. In `clayCards`, illustrated Games and Websites cards use a 4:1 aspect, center vertically in their existing saved slot and stay bounded by its height. Their side padding is 8% and object-to-label gap is 10%. This category treatment does not impose a six-card Home layout. Other illustrated objects use `min(calc(240px - 32px * font-scale), 100%)` height in this palette; incumbent themes retain the 192px base. Games uses `100% - 16px * (font-scale - 1)` object height; Websites uses a 92% base with the same reduction.

## Elevation & Depth

Clay depth combines inset top light, inset lower shade, diffuse lift and contact shadow. Matching-palette cards keep stable faces with localized edge shading. Transparent illustrations sit directly on the face without a second well background or shadow. Non-illustrated wells retain their Clay accent treatment. Exact shadow recipes and movement values are in `.impeccable/design.json` and `clay.ts`.

**The Local Depth Rule.** Card edge shading supplies shape; the matching cream ground stays steady. Pointer press temporarily uses the incumbent active shadow, then restores the selected palette shadow.

## Shapes

Cards have generous rounded corners and clip content. Compact photo/icon wells, dense wells and stacked wells use their recorded corner tokens. Help remains a pill with a round phone well. These established shapes coexist; the illustrated object does not gain a nested panel.

## Components

### Home cards

Native buttons keep the saved label as their accessible name and the existing activation callback. Focus is a 4px currentColor outline inset by 8px, visible inside clipped grid-edge slots. Card transitions use 140ms translate/scale and 120ms shadow; reduced motion removes them. Shared button movement applies only on hover-capable fine pointers; press moves down and slightly reduces scale.

### Recognition artwork

The first transparent atlas supplies Photos, Music, Weather and News quadrants. The second supplies Games and Websites. All six are named artwork choices; `tileArtworkFor` never guesses from labels or URLs. Built-in Photos/Music/Weather/News default to their corresponding object. A saved icon or photo takes precedence over named artwork. An image error falls back to the built-in SVG or generic link icon. Labels remain separate from image pixels.

Games and Websites fit measured visible alpha bounds, not transparent production margins: Games frame is left 88, top 176, width 756, height 636; Websites is left 92, top 1055, width 712, height 548 on the 887×1774 atlas. Frames use an alpha threshold of 128 with 8px breathing room. Frame aspect follows these bounds. This is a source-specific framing rule, not a template for unrelated assets.

### Dense and photo cards

Normal-width More choices cards remain label-only unless a photo is selected. Wide cards retain illustration/photo/icon treatment. Dense photos use 48px wells, 12px gaps and 10px 12px padding. Other compact photo/icon wells shrink from the 112px base by 24px times font scale. URL changes remount photos so later valid selections can recover.

### Navigation and help

Embedded-browser navigation occupies a 72px bar. Its buttons have a 56px minimum height and 1.1rem times font scale. Help retains its incumbent red gradient and surrounding surface/red halo, distinct from activity cards. Admin fields retain their own implementation and are not generalized into this launcher system.

## Do's and Don'ts

### Do:
- **Do** preserve saved labels, slots, color indices, destinations and caregiver photo/icon choices.
- **Do** use named bundled artwork as a presentation choice and keep live text separate.
- **Do** keep the matching cream ground stable and category cards bounded by saved slots.
- **Do** check dense and wide cards at all five font steps.

### Don't:
- **Don't** switch an existing saved palette merely because the application updates.
- **Don't** infer destination behavior from Games or Websites artwork.
- **Don't** treat a card reference as approval of the entire Home surface or proof of pixel identity.

Not canonized or repaired: incumbent glyph icons in custom tile icons and browser navigation remain source defects under the Impeccable craft floor; they are not prescribed for new controls. Real kiosk hardware, collection menus and a six-card Home layout are outside this recorded review. Product context remains undocumented in PRODUCT.md.
