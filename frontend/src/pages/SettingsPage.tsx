import { Palette, Sun, Moon, Type, Minus, Plus, Monitor, Table2, ToggleLeft, ToggleRight, Ruler } from 'lucide-react'
import { useAppStore, DEFAULT_EDITOR_FONT } from '@/store/useAppStore'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { ProviderSettings } from '@/components/assistant/ProviderSettings'
import { useState, useCallback } from 'react'

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

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function SettingsPage() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const customColors = useAppStore((s) => s.customColors)
  const setCustomColors = useAppStore((s) => s.setCustomColors)
  const editorFontFamily = useAppStore((s) => s.editorFontFamily)
  const setEditorFontFamily = useAppStore((s) => s.setEditorFontFamily)
  const editorFontSize = useAppStore((s) => s.editorFontSize)
  const setEditorFontSize = useAppStore((s) => s.setEditorFontSize)
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
  const resultsFontSize = useAppStore((s) => s.resultsFontSize)
  const setResultsFontSize = useAppStore((s) => s.setResultsFontSize)
  const [copied, setCopied] = useState(false)

  const resolvedColors = customColors ?? {
    primary: getCSSVar('--ch-primary'),
    secondary: getCSSVar('--ch-secondary'),
    accent: getCSSVar('--ch-accent'),
    background: getCSSVar('--ch-background'),
  }

  const isDefault = customColors === null

  const handleReset = () => {
    setCustomColors(null)
  }

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
        setCustomColors(parsed)
      }
    } catch { /* invalid JSON, silently ignore */ }
  }

  const updateColor = useCallback((key: string, value: string) => {
    setCustomColors({ ...resolvedColors, [key]: value })
  }, [resolvedColors, setCustomColors])

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

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            UI Font
          </h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Font Family</label>
              <div className="flex flex-wrap gap-1.5">
                {UI_FONT_OPTIONS.map(opt => {
                  const active = uiFontFamily === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setUiFontFamily(opt.value)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      style={{ fontFamily: opt.value }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setUiFontFamily("Inter, 'Segoe UI', system-ui, -apple-system, sans-serif")}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    uiFontFamily.includes('Inter')
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Default
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">UI Size: {uiFontSize}px</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUiFontSize(Math.max(10, uiFontSize - 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={uiFontSize <= 10}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={10}
                  max={20}
                  step={1}
                  value={uiFontSize}
                  onChange={(e) => setUiFontSize(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setUiFontSize(Math.min(20, uiFontSize + 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={uiFontSize >= 20}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
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
              <button
                onClick={() => setBorderRadius(Math.max(0, borderRadius - 1))}
                className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                disabled={borderRadius <= 0}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={0}
                max={16}
                step={1}
                value={borderRadius}
                onChange={(e) => setBorderRadius(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <button
                onClick={() => setBorderRadius(Math.min(16, borderRadius + 1))}
                className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                disabled={borderRadius >= 16}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Type className="w-4 h-4" />
            Editor
          </h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Font Family</label>
              <div className="flex flex-wrap gap-1.5">
                {FONT_OPTIONS.map(opt => {
                  const active = editorFontFamily.startsWith(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setEditorFontFamily(opt.value)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      style={{ fontFamily: opt.value }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setEditorFontFamily(DEFAULT_EDITOR_FONT)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    editorFontFamily === DEFAULT_EDITOR_FONT
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Default Stack
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Font Size: {editorFontSize}px</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditorFontSize(Math.max(10, editorFontSize - 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorFontSize <= 10}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={10}
                  max={28}
                  step={1}
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setEditorFontSize(Math.min(28, editorFontSize + 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorFontSize >= 28}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Line Height: {editorLineHeight.toFixed(1)}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditorLineHeight(Math.max(1.0, +(editorLineHeight - 0.1).toFixed(1)))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorLineHeight <= 1.0}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={1.0}
                  max={2.5}
                  step={0.1}
                  value={editorLineHeight}
                  onChange={(e) => setEditorLineHeight(+e.target.value)}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setEditorLineHeight(Math.min(2.5, +(editorLineHeight + 0.1).toFixed(1)))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorLineHeight >= 2.5}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Tab Size: {editorTabSize} spaces</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditorTabSize(Math.max(1, editorTabSize - 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorTabSize <= 1}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={editorTabSize}
                  onChange={(e) => setEditorTabSize(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setEditorTabSize(Math.min(8, editorTabSize + 1))}
                  className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={editorTabSize >= 8}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Minimap</label>
              <button
                onClick={() => setEditorMinimap(!editorMinimap)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  editorMinimap
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {editorMinimap ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                {editorMinimap ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Table2 className="w-4 h-4" />
            Results Table
          </h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Font Size: {resultsFontSize}px</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setResultsFontSize(Math.max(10, resultsFontSize - 1))}
                className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                disabled={resultsFontSize <= 10}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={10}
                max={20}
                step={1}
                value={resultsFontSize}
                onChange={(e) => setResultsFontSize(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <button
                onClick={() => setResultsFontSize(Math.min(20, resultsFontSize + 1))}
                className="p-1 rounded border border-border hover:bg-muted transition-colors disabled:opacity-30"
                disabled={resultsFontSize >= 20}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        <FeatureGate perkId="ai_assistant">
          <section className="space-y-4">
            <ProviderSettings />
          </section>
        </FeatureGate>

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
                      value={resolvedColors[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={resolvedColors[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
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
