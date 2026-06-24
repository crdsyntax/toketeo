import { useEffect, useMemo } from 'react'
import { useAppStore, DEFAULT_COLORS } from '@/store/useAppStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const customColors = useAppStore((s) => s.customColors)

  const cssVars = useMemo(() => {
    const base = customColors ?? DEFAULT_COLORS
    return {
      '--ch-primary': base.primary,
      '--ch-secondary': base.secondary,
      '--ch-accent': base.accent,
      '--ch-background': base.background,
    } as React.CSSProperties
  }, [customColors])

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark' : ''
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (customColors) {
      root.style.setProperty('--ch-primary', customColors.primary)
      root.style.setProperty('--ch-secondary', customColors.secondary)
      root.style.setProperty('--ch-accent', customColors.accent)
      root.style.setProperty('--ch-background', customColors.background)
    }
  }, [customColors])

  return <div style={cssVars}>{children}</div>
}
