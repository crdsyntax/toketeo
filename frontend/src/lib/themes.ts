export interface AccentTheme {
  accent: string
  accentHover: string
  accentMuted: string
}

export interface Palette {
  light: AccentTheme
  dark: AccentTheme
}

export const themePalettes: Record<string, Palette> = {
  toketeo: {
    light: { accent: '#0891b2', accentHover: '#0e7490', accentMuted: 'color-mix(in srgb, #0891b2 15%, transparent)' },
    dark: { accent: '#00d4ff', accentHover: '#33ddff', accentMuted: 'color-mix(in srgb, #00d4ff 15%, transparent)' },
  },
  cyan: {
    light: { accent: '#06b6d4', accentHover: '#0891b2', accentMuted: 'color-mix(in srgb, #06b6d4 15%, transparent)' },
    dark: { accent: '#22d3ee', accentHover: '#67e8f9', accentMuted: 'color-mix(in srgb, #22d3ee 15%, transparent)' },
  },
  violet: {
    light: { accent: '#8b5cf6', accentHover: '#7c3aed', accentMuted: 'color-mix(in srgb, #8b5cf6 15%, transparent)' },
    dark: { accent: '#a78bfa', accentHover: '#c4b5fd', accentMuted: 'color-mix(in srgb, #a78bfa 15%, transparent)' },
  },
  amber: {
    light: { accent: '#f59e0b', accentHover: '#d97706', accentMuted: 'color-mix(in srgb, #f59e0b 15%, transparent)' },
    dark: { accent: '#fbbf24', accentHover: '#fcd34d', accentMuted: 'color-mix(in srgb, #fbbf24 15%, transparent)' },
  },
  rose: {
    light: { accent: '#f43f5e', accentHover: '#e11d48', accentMuted: 'color-mix(in srgb, #f43f5e 15%, transparent)' },
    dark: { accent: '#fb7185', accentHover: '#fda4af', accentMuted: 'color-mix(in srgb, #fb7185 15%, transparent)' },
  },
  emerald: {
    light: { accent: '#10b981', accentHover: '#059669', accentMuted: 'color-mix(in srgb, #10b981 15%, transparent)' },
    dark: { accent: '#34d399', accentHover: '#6ee7b7', accentMuted: 'color-mix(in srgb, #34d399 15%, transparent)' },
  },
}

export type AccentPalette = keyof typeof themePalettes

export const ACCENT_PALETTE_NAMES: AccentPalette[] = Object.keys(themePalettes) as AccentPalette[]

export function getAccentPalette(name: AccentPalette, isDark: boolean): AccentTheme {
  return isDark ? themePalettes[name].dark : themePalettes[name].light
}
