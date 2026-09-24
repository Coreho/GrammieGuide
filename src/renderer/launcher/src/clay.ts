/**
 * The "clay" shadow recipe, ported verbatim from the Clay Launcher design
 * (GrammieGuide Home.dc.html): every raised surface stacks an inner top
 * highlight, an inner bottom shadow, and two outer shadows (a soft wide one
 * for lift, a tighter one for contact). Four layers, not one - that's what
 * makes it read as a real pillowy 3D object rather than a flat card with a
 * drop shadow.
 */

export const CLAY_UP =
  'inset 0 3px 1px var(--hl,#fff), 0 8px 14px rgba(var(--sh,60,55,45),.2), 0 2px 3px rgba(var(--sh,60,55,45),.14)'
export const CLAY_DISABLED = 'inset 0 2px 4px rgba(0,0,0,.12)'

export const TILE_SHADOW =
  'inset 0 3px 1px var(--hl,#fff), inset 0 -6px 12px rgba(0,0,0,.05), 0 16px 30px rgba(var(--sh,60,55,45),.16), 0 3px 5px rgba(var(--sh,60,55,45),.12)'
export const TILE_SHADOW_ACTIVE = 'inset 0 3px 1px var(--hl,#fff), 0 4px 10px rgba(var(--sh,60,55,45),.14)'

export const WELL_SHADOW =
  'inset 0 3px 1px rgba(255,255,255,.75), inset 0 -5px 10px rgba(0,0,0,.08), 0 10px 18px rgba(var(--ag,63,162,126),.28)'

export const CHIP_SHADOW =
  'inset 0 3px 1px var(--hl,#fff), inset 0 -4px 8px rgba(0,0,0,.05), 0 12px 24px rgba(var(--sh,60,55,45),.14), 0 2px 4px rgba(var(--sh,60,55,45),.1)'

export const TRACK_SHADOW = 'inset 0 4px 8px rgba(0,0,0,.16), 0 2px 1px rgba(255,255,255,.9)'

export function tileBackground(index: number): string {
  return `var(--tile${(index % 4) + 1}, linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5)))`
}

export function tileInk(index: number): string {
  return `var(--tInk${(index % 4) + 1}, var(--tInk, inherit))`
}
