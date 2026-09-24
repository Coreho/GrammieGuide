/**
 * Theme tokens ported from the "Clay Launcher" design (GrammieGuide Home.dc.html).
 * Six palettes: four soft "clay" themes share one tile surface color per
 * theme (differentiated only by the icon-well accent), while the two
 * "Tiles" themes give each tile its own distinct hue - tile1..tile4 cycle
 * by index so this still works with more than 4 real tiles.
 */

export const THEME_NAMES = ['tilesBold', 'tiles', 'mint', 'butter', 'sky', 'evening'] as const
export type ThemeName = (typeof THEME_NAMES)[number]

export const THEME_LABELS: Record<ThemeName, string> = {
  tilesBold: 'Tiles Bold',
  tiles: 'Tiles',
  mint: 'Mint',
  butter: 'Butter',
  sky: 'Sky',
  evening: 'Evening'
}

export type ThemeTokens = Record<string, string>

export const THEMES: Record<ThemeName, ThemeTokens> = {
  mint: {
    page: '#E4E2DD', bgA: '#F4F3EF', bgB: '#ECEAE5', bgC: '#E6E4DF',
    s1: '#FBFAF7', s2: '#ECEAE5', s3: '#E8E6E1', hl: '#fff', sh: '60,55,45',
    ink: '#2E2E2C', ink2: '#4A4945', a1: '#A6EBD0', a2: '#7FD6B4', ai: '#1F5A45',
    ag: '63,162,126', dot: '#2F7F62', dotOff: '#EDEBE6', dis: '#9C9A95',
    track: '#C9C7C1', g1: '#D3D1CB', g2: '#BAB8B2', c1: '#FFFFFF', c2: '#E3E1DC'
  },
  butter: {
    page: '#E6DFD0', bgA: '#F8F3E8', bgB: '#EFE8DA', bgC: '#E8E0D0',
    s1: '#FDFAF3', s2: '#EFE8DA', s3: '#EAE2D2', hl: '#fff', sh: '70,58,35',
    ink: '#2E2A22', ink2: '#4E473A', a1: '#F6E39A', a2: '#EDD376', ai: '#5C4B12',
    ag: '170,140,40', dot: '#8A6D12', dotOff: '#F3EEE2', dis: '#A39A86',
    track: '#CFC6B3', g1: '#DCD3C0', g2: '#C4BAA5', c1: '#FFFFFF', c2: '#E6DFD0'
  },
  sky: {
    page: '#DFE3E8', bgA: '#F3F5F7', bgB: '#E9ECEF', bgC: '#E1E5EA',
    s1: '#FBFCFD', s2: '#E9ECEF', s3: '#E4E8EC', hl: '#fff', sh: '40,50,65',
    ink: '#262B31', ink2: '#454C55', a1: '#BFDDF5', a2: '#93C1E8', ai: '#173F63',
    ag: '60,120,180', dot: '#2F6A9E', dotOff: '#EEF1F4', dis: '#949BA4',
    track: '#C3CAD2', g1: '#D0D6DD', g2: '#B6BEC8', c1: '#FFFFFF', c2: '#DDE2E8'
  },
  tiles: {
    page: '#132A33', bgA: '#24444F', bgB: '#1E3B45', bgC: '#183239',
    s1: '#2E4E59', s2: '#23414B', s3: '#203C46', hl: 'rgba(255,255,255,.16)', sh: '0,0,0',
    ink: '#F2F5F6', ink2: '#C7D3D8', a1: '#8FD0AE', a2: '#6DBB93', ai: '#0F3325',
    ag: '0,0,0', dot: '#8FD0AE', dotOff: '#3A5963', dis: '#6F8790',
    track: '#0F2228', g1: '#4A6670', g2: '#3B5761', c1: '#F2F5F6', c2: '#BFCBD0',
    tile1: 'linear-gradient(180deg,#3782BD,#2A6FA6)', tile2: 'linear-gradient(180deg,#44A077,#358A63)',
    tile3: 'linear-gradient(180deg,#6B7887,#5A6675)', tile4: 'linear-gradient(180deg,#34506B,#27415A)',
    tInk: '#FFFFFF', wi: '#FFFFFF', well: 'linear-gradient(180deg,rgba(255,255,255,.26),rgba(255,255,255,.12))'
  },
  tilesBold: {
    page: '#060F13', bgA: '#12252D', bgB: '#0B1A20', bgC: '#071216',
    s1: '#1D3642', s2: '#132833', s3: '#10232C', hl: 'rgba(255,255,255,.18)', sh: '0,0,0',
    ink: '#FFFFFF', ink2: '#DDE6EA', a1: '#3FE0A0', a2: '#1FC486', ai: '#04291A',
    ag: '0,0,0', dot: '#3FE0A0', dotOff: '#2C4652', dis: '#6F8790',
    track: '#02080A', g1: '#3A5663', g2: '#2C4652', c1: '#FFFFFF', c2: '#C9D4D9',
    tile1: 'linear-gradient(180deg,#FFCD33,#FFB800)', tile2: 'linear-gradient(180deg,#10A36D,#08855A)',
    tile3: 'linear-gradient(180deg,#2F7FF0,#1463D6)', tile4: 'linear-gradient(180deg,#8A52F0,#6D34DB)',
    tInk: '#FFFFFF', tInk1: '#1A1405', wi: 'currentColor',
    well: 'linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,.12))'
  },
  evening: {
    page: '#1C1B19', bgA: '#34332F', bgB: '#2A2926', bgC: '#232220',
    s1: '#42413D', s2: '#34332F', s3: '#302F2B', hl: 'rgba(255,255,255,.14)', sh: '0,0,0',
    ink: '#F3F1EC', ink2: '#D2CFC8', a1: '#9FE3C8', a2: '#6FC7A5', ai: '#123D2E',
    ag: '0,0,0', dot: '#7FD6B4', dotOff: '#4A4945', dis: '#7A7873',
    track: '#191816', g1: '#57554F', g2: '#474642', c1: '#E8E6E1', c2: '#B9B6AF'
  }
}

/** Which tile-color var (if any) a theme defines for tile index i (0-based), cycling every 4. */
export function tileColorVar(index: number): string {
  return `--tile${(index % 4) + 1}`
}

export function tileInkVar(index: number): string {
  return `--tInk${(index % 4) + 1}`
}

/**
 * Discrete font-scale steps, ported directly from the design (STEPS array)
 * so the on-screen A-/A+ control and its 5-dot indicator match exactly -
 * replaces the old continuous 0.8-1.6 slider model.
 */
export const FONT_STEPS = [1, 1.15, 1.3, 1.45, 1.6] as const
export const FONT_STEP_COUNT = FONT_STEPS.length
export const DEFAULT_FONT_STEP = 0

export function fontScaleForStep(step: number): number {
  const clamped = Math.min(FONT_STEP_COUNT - 1, Math.max(0, step))
  return FONT_STEPS[clamped] ?? 1
}
