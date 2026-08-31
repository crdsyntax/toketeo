import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '@/store/useAppStore'
import { themePalettes, type AccentPalette } from '@/lib/themes'

const THEME_VARS = ['--ch-primary', '--ch-secondary', '--ch-accent', '--ch-background'] as const

const PRESET_THEMES = new Set(['paper', 'editorial', 'terminal'])

const THEME_CLASSES: Record<string, string> = {
  dark: 'dark',
  paper: 'paper',
  editorial: 'editorial',
  terminal: 'terminal',
}

interface SettingsChangePayload {
  kind: 'theme' | 'accent' | 'colors'
  mode?: 'light' | 'dark'
  value: string | { primary?: string | null; secondary?: string | null; accent?: string | null; background?: string | null }
}

function getAccentColors(palette: AccentPalette, isDark: boolean) {
  const p = themePalettes[palette]
  return isDark ? p.dark : p.light
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const lightColors = useAppStore((s) => s.lightColors)
  const darkColors = useAppStore((s) => s.darkColors)
  const accentPalette = useAppStore((s) => s.accentPalette)
  const uiFontFamily = useAppStore((s) => s.uiFontFamily)
  const uiFontSize = useAppStore((s) => s.uiFontSize)
  const borderRadius = useAppStore((s) => s.borderRadius)


  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<SettingsChangePayload>('app:settings-change', (event) => {
      const p = event.payload
      const store = useAppStore.getState()
      if (p.kind === 'theme' && (p.value === 'light' || p.value === 'dark' || p.value === 'paper' || p.value === 'editorial' || p.value === 'terminal')) {
        store.setTheme(p.value)
      } else if (p.kind === 'accent' && typeof p.value === 'string' && p.value in themePalettes) {
        store.setAccentPalette(p.value as AccentPalette)
      } else if (p.kind === 'colors' && p.value && typeof p.value === 'object') {
        const colors = p.value as { primary?: string | null; secondary?: string | null; accent?: string | null; background?: string | null }
        if (colors.primary || colors.secondary || colors.accent || colors.background) {
          if (p.mode === 'light') store.setLightColors(colors as Parameters<typeof store.setLightColors>[0])
          else store.setDarkColors(colors as Parameters<typeof store.setDarkColors>[0])
        }
      }
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  const modeColors = theme === 'dark' ? darkColors : lightColors

  useEffect(() => {
    document.documentElement.className = THEME_CLASSES[theme] ?? ''
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (PRESET_THEMES.has(theme)) {
      THEME_VARS.forEach(v => root.style.removeProperty(v))
      return
    }
    if (modeColors) {
      root.style.setProperty('--ch-primary', modeColors.primary)
      root.style.setProperty('--ch-secondary', modeColors.secondary)
      root.style.setProperty('--ch-accent', modeColors.accent)
      root.style.setProperty('--ch-background', modeColors.background)
    } else {
      THEME_VARS.forEach(v => root.style.removeProperty(v))
    }
  }, [theme, modeColors])

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark' || theme === 'editorial' || theme === 'terminal'
    const accent = getAccentColors(accentPalette, isDark)
    root.style.setProperty('--accent', accent.accent)
    root.style.setProperty('--accent-hover', accent.accentHover)
    root.style.setProperty('--accent-muted', accent.accentMuted)
  }, [theme, modeColors, accentPalette])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ch-ui-font-family', uiFontFamily)
  }, [uiFontFamily])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ch-ui-font-size', `${uiFontSize}px`)
  }, [uiFontSize])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ch-radius', `${borderRadius}px`)
  }, [borderRadius])

  return <>{children}</>
}
