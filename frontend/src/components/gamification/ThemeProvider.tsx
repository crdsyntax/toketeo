import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

const THEME_VARS = ['--ch-primary', '--ch-secondary', '--ch-accent', '--ch-background'] as const

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const customColors = useAppStore((s) => s.customColors)
  const uiFontFamily = useAppStore((s) => s.uiFontFamily)
  const uiFontSize = useAppStore((s) => s.uiFontSize)
  const borderRadius = useAppStore((s) => s.borderRadius)

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
    } else {
      THEME_VARS.forEach(v => root.style.removeProperty(v))
    }
  }, [customColors])

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
