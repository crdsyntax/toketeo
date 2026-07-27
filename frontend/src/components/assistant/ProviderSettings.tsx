import { useState, useEffect } from 'react'
import { Sparkles, Trash2, Check, X, Loader2, Network, Key, Cpu } from 'lucide-react'
import { assistantService } from '@/services/assistant.service'
import type { ProviderInfo, ProviderConfig } from '@/types/assistant'
import { cn } from '@/lib/utils'

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  openai: Sparkles,
  ollama: Cpu,
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'text-green-500 bg-green-500/10 border-green-500/20',
  ollama: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
}

export function ProviderSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ providerId: string; model: string; apiKey: string; baseUrl: string }>({
    providerId: 'openai', model: '', apiKey: '', baseUrl: '',
  })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    assistantService.getProviders().then(setProviders)
    loadConfigs()
  }, [])

  async function loadConfigs() {
    try {
      const list = await assistantService.getProviderConfigs()
      setConfigs(list)
    } catch { /* silent */ }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const config: ProviderConfig = {
        providerId: form.providerId,
        model: form.model || null,
        apiKey: form.apiKey || null,
        baseUrl: form.baseUrl || null,
      }
      if (editingId) config.id = editingId
      await assistantService.saveProviderConfig(config)
      setEditingId(null)
      setForm({ providerId: 'openai', model: '', apiKey: '', baseUrl: '' })
      await loadConfigs()
    } catch { /* silent */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await assistantService.deleteProviderConfig(id)
      await loadConfigs()
    } catch { /* silent */ }
  }

  const handleTest = async (config: ProviderConfig) => {
    setTesting(config.id ?? config.providerId)
    setTestResult(null)
    try {
      const result = await assistantService.testProvider({
        providerId: config.providerId,
        apiKey: config.apiKey || form.apiKey || null,
        model: config.model || form.model || null,
        baseUrl: config.baseUrl || form.baseUrl || null,
      })
      setTestResult({ id: config.id ?? config.providerId, ...result })
    } catch (e) {
      setTestResult({ id: config.id ?? config.providerId, ok: false, message: String(e) })
    }
    setTesting(null)
  }

  const startEdit = (cfg: ProviderConfig) => {
    setEditingId(cfg.id ?? null)
    setForm({
      providerId: cfg.providerId,
      model: cfg.model ?? '',
      apiKey: cfg.apiKey ?? '',
      baseUrl: cfg.baseUrl ?? '',
    })
  }

  const providerMeta = (id: string) => providers.find((p) => p.id === id)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        AI Providers
      </h2>

      {/* Configured providers */}
      <div className="space-y-2">
        {configs.length === 0 && !editingId && (
          <p className="text-xs text-muted-foreground/60 italic px-1">
            No AI providers configured. Add one to use the assistant.
          </p>
        )}

        {configs.map((cfg) => {
          const Icon = PROVIDER_ICONS[cfg.providerId] ?? Sparkles
          return (
            <div key={cfg.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', PROVIDER_COLORS[cfg.providerId] ?? '')}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {providerMeta(cfg.providerId)?.name ?? cfg.providerId}
                  </div>
                  {cfg.model && (
                    <div className="text-[10px] text-muted-foreground/60 truncate">{cfg.model}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleTest(cfg)}
                  disabled={testing === cfg.id}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Test connection"
                >
                  {testing === cfg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => startEdit(cfg)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Key className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => cfg.id && handleDelete(cfg.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border',
          testResult.ok ? 'text-green-600 bg-green-500/8 border-green-500/15' : 'text-red-600 bg-red-500/8 border-red-500/15',
        )}>
          {testResult.ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Add / Edit form */}
      {editingId !== null && (
        <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-2.5">
          <div className="flex gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setForm((f) => ({ ...f, providerId: p.id }))}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all',
                  form.providerId === p.id
                    ? 'border-primary/40 bg-primary/5 text-foreground font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                {(() => { const Icon = PROVIDER_ICONS[p.id] ?? Sparkles; return <Icon className="w-3 h-3" /> })()}
                {p.name}
              </button>
            ))}
          </div>

          {form.providerId === 'openai' && (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="gpt-4o"
                    className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Base URL</label>
                  <input
                    type="text"
                    value={form.baseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {form.providerId === 'ollama' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="llama3.2"
                    className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Base URL</label>
                  <input
                    type="text"
                    value={form.baseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="http://localhost:11434"
                    className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setEditingId(null); setForm({ providerId: 'openai', model: '', apiKey: '', baseUrl: '' }) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!editingId && form.providerId === 'openai' && !form.apiKey)}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-colors flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingId ? 'Update' : 'Add Provider'}
            </button>
          </div>
        </div>
      )}

      {editingId === null && configs.length < providers.length && (
        <button
          onClick={() => setEditingId('')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-1"
        >
          <Sparkles className="w-3 h-3" />
          Add provider
        </button>
      )}
    </section>
  )
}
