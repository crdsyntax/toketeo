import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { themePalettes, type AccentPalette } from '@/lib/themes'

const THEME_VARS = ['--ch-primary', '--ch-secondary', '--ch-accent', '--ch-background'] as const

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

  const modeColors = theme === 'dark' ? darkColors : lightColors

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark' : ''
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (modeColors) {
      root.style.setProperty('--ch-primary', modeColors.primary)
      root.style.setProperty('--ch-secondary', modeColors.secondary)
      root.style.setProperty('--ch-accent', modeColors.accent)
      root.style.setProperty('--ch-background', modeColors.background)
    } else {
      THEME_VARS.forEach(v => root.style.removeProperty(v))
    }
  }, [modeColors])

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark'
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
