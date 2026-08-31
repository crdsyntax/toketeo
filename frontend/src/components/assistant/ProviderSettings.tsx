import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, Trash2, Check, X, Loader2, Network, Key, Zap, ChevronDown } from 'lucide-react'
import { assistantService } from '@/services/assistant.service'
import type { ProviderConfig, ModelInfo } from '@/types/assistant'
import { cn } from '@/lib/utils'

const OPENCODE = {
  id: 'opencode',
  name: 'OpenCode',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  model: 'opencode/DeepSeek-V4-Flash',
}

export function ProviderSettings() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ model: string; apiKey: string; baseUrl: string }>({
    model: OPENCODE.model, apiKey: '', baseUrl: OPENCODE.baseUrl,
  })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConfigs()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const resetForm = () => {
    setForm({ model: OPENCODE.model, apiKey: '', baseUrl: OPENCODE.baseUrl })
    setModels([])
    setModelError(null)
    setTestResult(null)
    setShowModelDropdown(false)
  }

  async function loadConfigs() {
    try {
      const list = await assistantService.getProviderConfigs()
      setConfigs(list)
    } catch {  }
  }

  const fetchModels = useCallback(async (apiKey: string, baseUrl: string) => {
    if (!apiKey) return
    setFetchingModels(true)
    setModelError(null)
    try {
      const config: ProviderConfig = { providerId: OPENCODE.id, apiKey, baseUrl }
      const list = await assistantService.getModels(OPENCODE.id, config)
      setModels(list)
    } catch (e) {
      setModelError(String(e))
      setModels([])
    }
    setFetchingModels(false)
  }, [])

  const handleApiKeyChange = (val: string) => {
    setForm((f) => ({ ...f, apiKey: val }))
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    if (val.length >= 4) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchModels(val, form.baseUrl)
      }, 600)
    }
  }

  const handleBaseUrlChange = (val: string) => {
    setForm((f) => ({ ...f, baseUrl: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const config: ProviderConfig = {
        providerId: OPENCODE.id,
        model: form.model || null,
        apiKey: form.apiKey || null,
        baseUrl: form.baseUrl || null,
      }
      if (editingId) config.id = editingId
      await assistantService.saveProviderConfig(config)
      setEditingId(null)
      resetForm()
      await loadConfigs()
    } catch {  }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await assistantService.deleteProviderConfig(id)
      await loadConfigs()
    } catch {  }
  }

  const handleTest = async (config: ProviderConfig) => {
    setTesting(config.id ?? OPENCODE.id)
    setTestResult(null)
    try {
      const result = await assistantService.testProvider({
        providerId: OPENCODE.id,
        apiKey: config.apiKey || form.apiKey || null,
        model: config.model || form.model || null,
        baseUrl: config.baseUrl || form.baseUrl || null,
      })
      setTestResult({ id: config.id ?? OPENCODE.id, ...result })
    } catch (e) {
      setTestResult({ id: config.id ?? OPENCODE.id, ok: false, message: String(e) })
    }
    setTesting(null)
  }

  const startEdit = (cfg: ProviderConfig) => {
    setEditingId(cfg.id ?? null)
    setForm({
      model: cfg.model ?? '',
      apiKey: cfg.apiKey ?? '',
      baseUrl: cfg.baseUrl ?? '',
    })
    setModels([])
    setModelError(null)
    if (cfg.apiKey) {
      fetchModels(cfg.apiKey ?? '', cfg.baseUrl ?? '')
    }
  }

  const displayModel = models.find((m) => m.id === form.model)?.name ?? form.model

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        AI Providers
      </h2>


      <div className="space-y-2">
        {configs.length === 0 && !editingId && (
          <p className="text-xs text-muted-foreground/60 italic px-1">
            No AI provider configured. Add OpenCode to use the assistant.
          </p>
        )}

        {configs.map((cfg) => (
          <div key={cfg.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center border text-yellow-500 bg-yellow-500/10 border-yellow-500/20">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  {OPENCODE.name}
                </div>
                {cfg.model && (
                  <div className="text-[var(--ch-text-10)] text-muted-foreground/60 truncate">{cfg.model}</div>
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
        ))}
      </div>


      {testResult && (
        <div className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border',
          testResult.ok ? 'text-green-600 bg-green-500/8 border-green-500/15' : 'text-red-600 bg-red-500/8 border-red-500/15',
        )}>
          {testResult.ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}


      {editingId !== null && (
        <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Zap className="w-3 h-3 text-yellow-500" />
            {OPENCODE.name}
          </div>


          <div className="space-y-2.5">

            <div>
              <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={`${OPENCODE.name} API key`}
                  className="flex-1 text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  onClick={() => fetchModels(form.apiKey, form.baseUrl)}
                  disabled={fetchingModels || !form.apiKey}
                  className="flex items-center gap-1 text-[var(--ch-text-11)] px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
                  title="Validate and fetch models"
                >
                  {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Network className="w-3 h-3" />}
                  Fetch
                </button>
              </div>
              {modelError && (
                <p className="text-[var(--ch-text-10)] text-red-500 mt-1">{modelError}</p>
              )}
            </div>


            <div>
              <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground uppercase tracking-wider">Base URL</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder="https://..."
                className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
              />
            </div>


            <div>
              <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
              <div className="relative mt-1" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => models.length > 0 && setShowModelDropdown(!showModelDropdown)}
                  disabled={models.length === 0}
                  className="w-full flex items-center gap-2 text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <span className="flex-1 text-left truncate">
                    {displayModel || (fetchingModels ? 'Fetching models...' : modelError ? 'Model fetch failed' : 'No models — enter API key and click Fetch')}
                  </span>
                  {models.length > 0 && <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
                </button>

                {showModelDropdown && models.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, model: m.id })); setShowModelDropdown(false) }}
                        className={cn(
                          'w-full flex items-center gap-2 text-xs px-3 py-2 text-left hover:bg-muted transition-colors',
                          form.model === m.id ? 'bg-primary/5 text-primary font-medium' : 'text-foreground',
                        )}
                      >
                        <span className="flex-1 truncate">{m.name}</span>
                        <span className="text-[var(--ch-text-9)] text-muted-foreground/30 font-mono truncate max-w-[120px]">{m.id}</span>
                        {m.supportsTools && (
                          <span className="text-[var(--ch-text-9)] text-muted-foreground/50 px-1 py-0.5 rounded border border-border shrink-0">tools</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>


            <div>
              <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground uppercase tracking-wider">Or type model ID manually</label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder={OPENCODE.model}
                className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 mt-1"
              />
            </div>
          </div>


          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setEditingId(null); resetForm() }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!editingId && !form.apiKey)}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-colors flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingId ? 'Update' : 'Add Provider'}
            </button>
          </div>
        </div>
      )}

      {editingId === null && !configs.some((c) => c.providerId === OPENCODE.id) && (
        <button
          onClick={() => { setEditingId(''); resetForm() }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-1"
        >
          <Zap className="w-3 h-3" />
          Add OpenCode provider
        </button>
      )}
    </section>
  )
}
