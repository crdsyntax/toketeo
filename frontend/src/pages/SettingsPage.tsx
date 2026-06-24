import { Palette, Sun, Moon } from 'lucide-react'
import { useAppStore, DEFAULT_COLORS } from '@/store/useAppStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { useState } from 'react'

export function SettingsPage() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const customColors = useAppStore((s) => s.customColors)
  const setCustomColors = useAppStore((s) => s.setCustomColors)
  const [copied, setCopied] = useState(false)

  const isDefault =
    customColors.primary === DEFAULT_COLORS.primary &&
    customColors.secondary === DEFAULT_COLORS.secondary &&
    customColors.accent === DEFAULT_COLORS.accent &&
    customColors.background === DEFAULT_COLORS.background

  const handleReset = () => {
    setCustomColors(DEFAULT_COLORS)
  }

  const handleCopy = async () => {
    const json = JSON.stringify(customColors, null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      if (parsed.primary && parsed.secondary && parsed.accent && parsed.background) {
        setCustomColors(parsed)
      }
    } catch { /* invalid JSON, silently ignore */ }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Appearance and preferences</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Theme</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Moon className="w-4 h-4" />
              Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Sun className="w-4 h-4" />
              Light
            </button>
          </div>
        </section>

        <FeatureGate perkId="theme_customizer">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Advanced Theming</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  onClick={handlePaste}
                  className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Paste JSON
                </button>
                {!isDefault && (
                  <button
                    onClick={handleReset}
                    className="text-[10px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Customize primary, secondary, accent, and background colors. These override the default palette.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {(['primary', 'secondary', 'accent', 'background'] as const).map((key) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground capitalize">{key}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors[key]}
                      onChange={(e) => setCustomColors({ [key]: e.target.value })}
                      className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={customColors[key]}
                      onChange={(e) => setCustomColors({ [key]: e.target.value })}
                      className="flex-1 text-xs font-mono bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </FeatureGate>
      </div>
    </div>
  )
}
