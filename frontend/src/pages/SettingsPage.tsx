import { Palette, Sun, Moon, Type, Minus, Plus, Monitor, Table2, ToggleLeft, ToggleRight, Ruler, Sparkles, Check, Notebook, Newspaper, Terminal } from 'lucide-react'
import { useAppStore, DEFAULT_EDITOR_FONT } from '@/store/useAppStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { ProviderSettings } from '@/components/assistant/ProviderSettings'
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { themePalettes, ACCENT_PALETTE_NAMES } from '@/lib/themes'
import type { AccentPalette } from '@/lib/themes'

type SettingsTab = 'appearance' | 'editor' | 'results' | 'ai'

interface TabDef {
  id: SettingsTab
  label: string
  icon: React.ElementType
  perkId: string | null
}

const TABS: TabDef[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, perkId: null },
  { id: 'editor', label: 'Editor', icon: Type, perkId: null },
  { id: 'results', label: 'Results', icon: Table2, perkId: null },
  { id: 'ai', label: 'AI Providers', icon: Sparkles, perkId: 'ai_assistant' },
]

const FONT_OPTIONS = [
  { label: 'Cascadia Code', value: "'Cascadia Code'" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono'" },
  { label: 'Fira Code', value: "'Fira Code'" },
  { label: 'Source Code Pro', value: "'Source Code Pro'" },
  { label: 'Consolas', value: 'Consolas' },
  { label: 'Courier New', value: "'Courier New'" },
  { label: 'monospace', value: 'monospace' },
]

const UI_FONT_OPTIONS = [
  { label: 'Inter', value: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif" },
  { label: 'Segoe UI', value: "'Segoe UI', system-ui, -apple-system, sans-serif" },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Roboto', value: "Roboto, system-ui, -apple-system, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, -apple-system, sans-serif" },
]

function getDefaultColors(theme: 'light' | 'dark', palette: AccentPalette): { primary: string; secondary: string; accent: string; background: string } {
  const p = themePalettes[palette]
  const accentColor = theme === 'dark' ? p.dark.accent : p.light.accent
  if (theme === 'dark') {
    return { primary: '#f8fafc', secondary: '#1e293b', accent: accentColor, background: '#0f172a' }
  }
  return { primary: '#0f172a', secondary: '#f1f5f9', accent: accentColor, background: '#ffffff' }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [copied, setCopied] = useState(false)

  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const lightColors = useAppStore((s) => s.lightColors)
  const setLightColors = useAppStore((s) => s.setLightColors)
  const darkColors = useAppStore((s) => s.darkColors)
  const setDarkColors = useAppStore((s) => s.setDarkColors)
  const editorFontFamily = useAppStore((s) => s.editorFontFamily)
  const setEditorFontFamily = useAppStore((s) => s.setEditorFontFamily)
  const inlineEditReview = useAppStore((s) => s.inlineEditReview)
  const setInlineEditReview = useAppStore((s) => s.setInlineEditReview)
  const resultsFontSize = useAppStore((s) => s.resultsFontSize)
  const setResultsFontSize = useAppStore((s) => s.setResultsFontSize)

  const editorLineHeight = useAppStore((s) => s.editorLineHeight)
  const setEditorLineHeight = useAppStore((s) => s.setEditorLineHeight)
  const editorTabSize = useAppStore((s) => s.editorTabSize)
  const setEditorTabSize = useAppStore((s) => s.setEditorTabSize)
  const editorMinimap = useAppStore((s) => s.editorMinimap)
  const setEditorMinimap = useAppStore((s) => s.setEditorMinimap)
  const uiFontFamily = useAppStore((s) => s.uiFontFamily)
  const setUiFontFamily = useAppStore((s) => s.setUiFontFamily)
  const uiFontSize = useAppStore((s) => s.uiFontSize)
  const setUiFontSize = useAppStore((s) => s.setUiFontSize)
  const borderRadius = useAppStore((s) => s.borderRadius)
  const setBorderRadius = useAppStore((s) => s.setBorderRadius)
  const accentPalette = useAppStore((s) => s.accentPalette)
  const setAccentPalette = useAppStore((s) => s.setAccentPalette)


  const modeColors = theme === 'dark' ? darkColors : lightColors
  const setModeColors = theme === 'dark' ? setDarkColors : setLightColors

  const resolvedColors = modeColors ?? getDefaultColors(theme === 'dark' ? 'dark' : 'light', accentPalette)

  const isDefault = modeColors === null

  const handleReset = () => setModeColors(null)

  const handleCopy = async () => {
    const json = JSON.stringify(resolvedColors, null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      if (parsed.primary && parsed.secondary && parsed.accent && parsed.background) {
        setModeColors(parsed)
      }
    } catch {  }
  }

  const updateColor = useCallback((key: string, value: string) => {
    setModeColors({ ...resolvedColors, [key]: value })
  }, [resolvedColors, setModeColors])

  const currentDef = TABS.find((t) => t.id === activeTab)

  return (
    <div className="h-full flex bg-card overflow-hidden">

      <div className="w-10 shrink-0 flex flex-col items-center gap-0.5 pt-2 border-r border-border bg-card">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const btn = (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative w-9 h-9 flex items-center justify-center rounded-lg transition-all',
                isActive
                  ? 'bg-accent-muted text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
              title={tab.label}
            >
              <tab.icon className="w-4 h-4" />
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-full" />
              )}
            </button>
          )
          if (tab.perkId) {
            return (
              <FeatureGate key={tab.id} perkId={tab.perkId} showLocked={false}>
                {btn}
              </FeatureGate>
            )
          }
          return btn
        })}
      </div>


      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-11 flex items-center gap-2 px-4 shrink-0 border-b border-border bg-card">
          {currentDef && (
            <>
              <currentDef.icon className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">{currentDef.label}</span>
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-8">

            {activeTab === 'appearance' && (
              <>
                <section className="space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Theme</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme('dark')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        theme === 'dark'
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Moon className="w-4 h-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme('light')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        theme === 'light'
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Sun className="w-4 h-4" />
                      Light
                    </button>
                    <button
                      onClick={() => setTheme('paper')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        theme === 'paper'
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Notebook className="w-4 h-4" />
                      Paper
                    </button>
                    <button
                      onClick={() => setTheme('editorial')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        theme === 'editorial'
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Newspaper className="w-4 h-4" />
                      Editorial
                    </button>
                    <button
                      onClick={() => setTheme('terminal')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        theme === 'terminal'
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Terminal className="w-4 h-4" />
                      Terminal
                    </button>
                  </div>
                  {(theme === 'paper' || theme === 'editorial' || theme === 'terminal') && (
                    <p className="text-xs text-muted-foreground">
                      {theme === 'paper'
                        ? 'Brutalist paper look from the landing page: warm background, black hairlines, ink accents.'
                        : theme === 'editorial'
                          ? 'Editorial noir: serif type on warm charcoal, high contrast, no pastels.'
                          : 'Terminal dev-tool look from the landing: dark, monospace, green accent.'}{' '}
                      The accent palette below works in every theme; full custom colors apply to Dark / Light only.
                    </p>
                  )}
                </section>

                <section className="space-y-4">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Accent Color
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {ACCENT_PALETTE_NAMES.map((name) => {
                      const p = themePalettes[name]
                      const accentColor = theme === 'dark' || theme === 'editorial' || theme === 'terminal' ? p.dark.accent : p.light.accent
                      const isActive = accentPalette === name
                      return (
                        <button
                          key={name}
                          onClick={() => {
                            setAccentPalette(name)
                            if (!isDefault) { updateColor('accent', accentColor) }
                          }}
                          className={cn(
                            'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all min-w-[80px]',
                            isActive
                              ? 'border-accent bg-accent-muted'
                              : 'border-border hover:border-accent/50 hover:bg-surface-hover',
                          )}
                        >
                          <div
                            className="w-8 h-8 rounded-full ring-2 ring-border flex items-center justify-center"
                            style={{ backgroundColor: accentColor }}
                          >
                            {isActive && <Check className="w-4 h-4 text-white" />}
                          </div>
                          <span className={cn(
                            'text-[var(--ch-text-10)] font-semibold capitalize',
                            isActive ? 'text-accent' : 'text-muted-foreground',
                          )}>
                            {name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    UI Font
                  </h2>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">Font Family</label>
                      <div className="flex flex-wrap gap-1.5">
                        {UI_FONT_OPTIONS.map((opt) => {
                          const active = uiFontFamily === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setUiFontFamily(opt.value)}
                              className={cn(
                                'text-xs px-3 py-1.5 rounded-md border transition-colors',
                                active
                                  ? 'border-accent bg-accent-muted text-accent'
                                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                              )}
                              style={{ fontFamily: opt.value }}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setUiFontFamily("Inter, 'Segoe UI', system-ui, -apple-system, sans-serif")}
                          className={cn(
                            'text-xs px-3 py-1.5 rounded-md border transition-colors',
                            uiFontFamily.includes('Inter')
                              ? 'border-accent bg-accent-muted text-accent'
                              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                          )}
                        >
                          Default
                        </button>
                      </div>
                      <div className="mt-2">
                        <label className="text-[var(--ch-text-10)] text-muted-foreground mb-1 block">Custom font</label>
                        <input
                          type="text"
                          value={uiFontFamily}
                          onChange={(e) => setUiFontFamily(e.target.value)}
                          placeholder="e.g. 'Custom Font', sans-serif"
                          className="w-full text-xs font-mono bg-muted border border-border rounded-md px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground/40"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">Font Size: {uiFontSize}px</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setUiFontSize(Math.max(10, uiFontSize - 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={uiFontSize <= 10}><Minus className="w-3.5 h-3.5" /></button>
                        <input type="range" min={10} max={24} step={1} value={uiFontSize} onChange={(e) => setUiFontSize(Number(e.target.value))} className="flex-1 accent-primary" />
                        <button onClick={() => setUiFontSize(Math.min(24, uiFontSize + 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={uiFontSize >= 24}><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Ruler className="w-4 h-4" />
                    Appearance
                  </h2>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Border Radius: {borderRadius}px</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setBorderRadius(Math.max(0, borderRadius - 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={borderRadius <= 0}><Minus className="w-3.5 h-3.5" /></button>
                      <input type="range" min={0} max={16} step={1} value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))} className="flex-1 accent-primary" />
                      <button onClick={() => setBorderRadius(Math.min(16, borderRadius + 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={borderRadius >= 16}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </section>

                  {theme !== 'paper' && theme !== 'editorial' && theme !== 'terminal' && (
                    <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        {theme === 'dark' ? 'Dark Mode Colors' : 'Light Mode Colors'}
                      </h2>
                      <div className="flex gap-2">
                        <button onClick={handleCopy} className="text-[var(--ch-text-10)] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors">{copied ? 'Copied!' : 'Copy JSON'}</button>
                        <button onClick={handlePaste} className="text-[var(--ch-text-10)] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors">Paste JSON</button>
                        {!isDefault && <button onClick={handleReset} className="text-[var(--ch-text-10)] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">Reset</button>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Customize colors for {theme === 'dark' ? 'dark' : 'light'} mode. Switch themes above to edit the other mode.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {(['primary', 'secondary', 'accent', 'background'] as const).map((key) => (
                        <div key={key} className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground capitalize">{key}</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={resolvedColors[key]} onChange={(e) => updateColor(key, e.target.value)} className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent" />
                            <input type="text" value={resolvedColors[key]} onChange={(e) => updateColor(key, e.target.value)} className="flex-1 text-xs font-mono bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  )}
              </>
            )}


            {activeTab === 'editor' && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Editor
                </h2>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Font Family</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FONT_OPTIONS.map((opt) => {
                        const active = editorFontFamily.startsWith(opt.value)
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setEditorFontFamily(opt.value)}
                            className={cn(
                              'text-xs px-3 py-1.5 rounded-md border transition-colors',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                            )}
                            style={{ fontFamily: opt.value }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setEditorFontFamily(DEFAULT_EDITOR_FONT)}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-md border transition-colors',
                          editorFontFamily === DEFAULT_EDITOR_FONT
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                        )}
                      >
                        Default Stack
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Line Height: {editorLineHeight.toFixed(1)}</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditorLineHeight(Math.max(1.0, +(editorLineHeight - 0.1).toFixed(1)))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={editorLineHeight <= 1.0}><Minus className="w-3.5 h-3.5" /></button>
                      <input type="range" min={1.0} max={2.5} step={0.1} value={editorLineHeight} onChange={(e) => setEditorLineHeight(+e.target.value)} className="flex-1 accent-primary" />
                      <button onClick={() => setEditorLineHeight(Math.min(2.5, +(editorLineHeight + 0.1).toFixed(1)))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={editorLineHeight >= 2.5}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Tab Size: {editorTabSize} spaces</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditorTabSize(Math.max(1, editorTabSize - 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={editorTabSize <= 1}><Minus className="w-3.5 h-3.5" /></button>
                      <input type="range" min={1} max={8} step={1} value={editorTabSize} onChange={(e) => setEditorTabSize(Number(e.target.value))} className="flex-1 accent-primary" />
                      <button onClick={() => setEditorTabSize(Math.min(8, editorTabSize + 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={editorTabSize >= 8}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Results Font Size: {resultsFontSize}px</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setResultsFontSize(Math.max(10, resultsFontSize - 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={resultsFontSize <= 10}><Minus className="w-3.5 h-3.5" /></button>
                      <input type="range" min={10} max={24} step={1} value={resultsFontSize} onChange={(e) => setResultsFontSize(Number(e.target.value))} className="flex-1 accent-primary" />
                      <button onClick={() => setResultsFontSize(Math.min(24, resultsFontSize + 1))} className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30" disabled={resultsFontSize >= 24}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Minimap</label>
                    <button
                      onClick={() => setEditorMinimap(!editorMinimap)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
                        editorMinimap
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      {editorMinimap ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {editorMinimap ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>


                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 pt-4 border-t border-border">
                  <Table2 className="w-4 h-4" />
                  Query Editor
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs text-muted-foreground">Inline edition</label>
                      <p className="text-[var(--ch-text-10)] text-muted-foreground/70 mt-0.5">
                        Show the Review Change panel when editing a cell directly in the data explorer
                      </p>
                    </div>
                    <button
                      onClick={() => setInlineEditReview(!inlineEditReview)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
                        inlineEditReview
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                    >
                      {inlineEditReview ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {inlineEditReview ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </section>
            )}




            {activeTab === 'ai' && (
              <FeatureGate perkId="ai_assistant">
                <section className="space-y-4">
                  <ProviderSettings />
                </section>
              </FeatureGate>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
