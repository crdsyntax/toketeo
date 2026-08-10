import { X, Shield, Loader2, Database, Globe, Check, AlertTriangle, Terminal, RefreshCw, Server, Cpu, Lock, Key, Eye, EyeOff, Copy, Clock, Minimize2, Maximize2, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment, SshAuthType } from '@/types/database'
import type { Connection, CreateConnectionDto, SshConfig } from '@/types/database'
import { useState, useEffect, useRef } from 'react'
import { connectionService } from '@/services/connection.service'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'
import { UnlockPrompt } from '@/components/security/UnlockPrompt'

interface ConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: CreateConnectionDto) => void
  onTest: (payload: CreateConnectionDto) => void
  editingConnection: Connection | null
  isSaving: boolean
  isTesting: boolean
  testMessage: { type: 'success' | 'error', text: string } | null
}

const INITIAL_FORM: CreateConnectionDto = {
  name: '',
  type: DatabaseType.MARIADB,
  environment: Environment.DEVELOPMENT,
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: '',
  authEnabled: true,
  authSource: '',
  replicaSet: '',
  directConnection: true,
  ssl: 'false',
  readOnly: false,
  maxPoolSize: 5,
  idleTimeout: 600,
  acquireTimeout: 30,
  maxLifetime: 28800,
  keepAlive: 0,
  metadataCacheTtl: 300,
}

// Sentinel used by the backend to mask stored secrets. A value equal to this
// sentinel means "the real secret is stored server-side", so the eye button
// must fetch it from the backend instead of revealing this placeholder.
const REDACTED = '********'

type SecretField = 'password' | 'ssh_password' | 'ssh_passphrase'

export function ConnectionModal({
  isOpen, onClose, onSave, onTest, editingConnection, isSaving, isTesting, testMessage
}: ConnectionModalProps) {  const [activeTab, setActiveTab] = useState<'general' | 'ssh' | 'pool'>('general')
  const [form, setForm] = useState<CreateConnectionDto>(INITIAL_FORM)
  const [storePassword, setStorePassword] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoadingConnection, setIsLoadingConnection] = useState(false)
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false)
  const [pendingReveal, setPendingReveal] = useState<'password' | 'ssh_password' | 'ssh_passphrase' | null>(null)
  const [pendingCopy, setPendingCopy] = useState(false)
  const [showSshPassword, setShowSshPassword] = useState(false)
  const [showSshPassphrase, setShowSshPassphrase] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const clipboardClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { pos, handleMouseDown } = useDraggablePanel(320, 60)

  const clearSecretTimers = () => {
    if (clipboardClearTimer.current) clearTimeout(clipboardClearTimer.current)
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current)
    clipboardClearTimer.current = null
    autoLockTimer.current = null
  }

  // Returns the real secret value for a field: the typed value if it is not the
  // REDACTED sentinel, otherwise it fetches the stored secret from the backend
  // (requires an unlocked session).
  const resolveSecret = async (field: SecretField): Promise<string | null> => {
    if (field === 'password' && form.password !== REDACTED) return form.password ?? null
    if (field === 'ssh_password' && form.ssh?.password !== REDACTED) return form.ssh?.password ?? null
    if (field === 'ssh_passphrase' && form.ssh?.passphrase !== REDACTED) return form.ssh?.passphrase ?? null
    if (!editingConnection) return null
    return connectionService.revealSecret(editingConnection.id, field)
  }

  // Toggles an eye button: hides when visible, otherwise prompts for unlock
  // (if needed) and fetches the real secret from the backend when the field
  // still holds the REDACTED sentinel.
  const toggleReveal = async (field: SecretField) => {
    if (field === 'password' && showPassword) return setShowPassword(false)
    if (field === 'ssh_password' && showSshPassword) return setShowSshPassword(false)
    if (field === 'ssh_passphrase' && showSshPassphrase) return setShowSshPassphrase(false)

    const unlocked = await connectionService.isSecretsUnlocked()
    if (!unlocked) {
      setPendingReveal(field)
      setPendingCopy(false)
      setShowUnlockPrompt(true)
      return
    }
    await applyReveal(field)
  }

  const applyReveal = async (field: SecretField) => {
    if (!editingConnection) {
      if (field === 'password') return setShowPassword(true)
      if (field === 'ssh_password') return setShowSshPassword(true)
      return setShowSshPassphrase(true)
    }

    try {
      const value = await resolveSecret(field)
      if (value === null) return
      if (field === 'password') {
        setForm((prev) => ({ ...prev, password: value }))
        setShowPassword(true)
      } else if (field === 'ssh_password') {
        setForm((prev) => ({ ...prev, ssh: { ...(prev.ssh as SshConfig), password: value } }))
        setShowSshPassword(true)
      } else {
        setForm((prev) => ({ ...prev, ssh: { ...(prev.ssh as SshConfig), passphrase: value } }))
        setShowSshPassphrase(true)
      }
    } catch {
      // tauriApi already surfaces the error; keep the field masked.
    }
  }

  const copySecret = async (field: SecretField) => {
    const unlocked = await connectionService.isSecretsUnlocked()
    if (!unlocked) {
      setPendingReveal(field)
      setPendingCopy(true)
      setShowUnlockPrompt(true)
      return
    }
    await doCopy(field)
  }

  const doCopy = async (field: SecretField) => {
    try {
      const value = await resolveSecret(field)
      if (value === null) return
      await navigator.clipboard.writeText(value)

      clearSecretTimers()

      // Auto-clean the clipboard 40s after copying so the secret does not linger
      // in a shared, OS-wide buffer. Only clears it if it still holds our value.
      clipboardClearTimer.current = setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText()
          if (current === value) await navigator.clipboard.writeText('')
        } catch {
          // Clipboard unreadable: never clobber unknown content.
        }
      }, 40_000)

      // Block only secret revelation 1min20s after copying so the credential
      // cannot be revealed or re-copied once the window is over. DB operations
      // (connect, queries) are NOT affected.
      autoLockTimer.current = setTimeout(async () => {
        try {
          await connectionService.lockSecrets()
          toast('Revelado de contraseñas bloqueado por seguridad')
        } catch {
          // Session may already be locked; nothing else to do.
        }
      }, 80_000)

      toast.success('Contraseña copiada al portapapeles')
    } catch {
      toast.error('No se pudo copiar la contraseña')
    }
  }

  useEffect(() => () => clearSecretTimers(), [])

  useEffect(() => {
    if (!isOpen) return;

    const resetForm = () => {
      setForm(INITIAL_FORM)
      setStorePassword(true)
      setIsLoadingConnection(false)
      setShowPassword(false)
      setShowSshPassword(false)
      setShowSshPassphrase(false)
      setActiveTab('general')
      setPendingCopy(false)
    }

    if (!editingConnection) {
      resetForm()
      return
    }

    let cancelled = false

    const loadConnection = async () => {
      setIsLoadingConnection(true)
      try {
        const fullConnection = await connectionService.getOne(editingConnection.id)
        if (cancelled) return

        const editData: CreateConnectionDto = {
          name: fullConnection.name,
          type: fullConnection.type,
          environment: fullConnection.environment,
          host: fullConnection.host,
          port: fullConnection.port,
          user: fullConnection.user,
          password: fullConnection.password || '',
          database: fullConnection.database || '',
          authEnabled: fullConnection.authEnabled ?? true,
          authSource: fullConnection.authSource || '',
          replicaSet: fullConnection.replicaSet || '',
          directConnection: fullConnection.directConnection ?? true,
          ssl: fullConnection.ssl || 'false',
          readOnly: fullConnection.readOnly ?? false,
          maxPoolSize: fullConnection.maxPoolSize ?? 5,
          idleTimeout: fullConnection.idleTimeout ?? 600,
          acquireTimeout: fullConnection.acquireTimeout ?? 30,
          maxLifetime: fullConnection.maxLifetime ?? 28800,
          keepAlive: fullConnection.keepAlive ?? 0,
          metadataCacheTtl: fullConnection.metadataCacheTtl ?? 300,
          ssh: fullConnection.ssh ? {
            ...fullConnection.ssh,
            authType: fullConnection.ssh.authType || (fullConnection.ssh.privateKey ? SshAuthType.KEY : SshAuthType.PASSWORD)
          } : undefined,
        }

        setForm(editData)
        setStorePassword(!!fullConnection.password)
      } catch {
        const editData: CreateConnectionDto = {
          name: editingConnection.name,
          type: editingConnection.type,
          environment: editingConnection.environment,
          host: editingConnection.host,
          port: editingConnection.port,
          user: editingConnection.user,
          password: editingConnection.password || '',
          database: editingConnection.database || '',
          authEnabled: editingConnection.authEnabled ?? true,
          authSource: editingConnection.authSource || '',
          replicaSet: editingConnection.replicaSet || '',
          directConnection: editingConnection.directConnection ?? true,
          ssl: editingConnection.ssl || 'false',
          readOnly: editingConnection.readOnly ?? false,
          maxPoolSize: editingConnection.maxPoolSize ?? 5,
          idleTimeout: editingConnection.idleTimeout ?? 600,
          acquireTimeout: editingConnection.acquireTimeout ?? 30,
          maxLifetime: editingConnection.maxLifetime ?? 28800,
          keepAlive: editingConnection.keepAlive ?? 0,
          metadataCacheTtl: editingConnection.metadataCacheTtl ?? 300,
          ssh: editingConnection.ssh ? {
            ...editingConnection.ssh,
            authType: editingConnection.ssh.authType || (editingConnection.ssh.privateKey ? SshAuthType.KEY : SshAuthType.PASSWORD)
          } : undefined,
        }

        setForm(editData)
        setStorePassword(false)
      } finally {
        if (!cancelled) {
          setIsLoadingConnection(false)
        }
      }
    }

    loadConnection()

    return () => {
      cancelled = true
    }
  }, [isOpen, editingConnection]);

  if (!isOpen) return null

  const updateSsh = (updates: Partial<SshConfig>) => {
    setForm(prev => ({
      ...prev,
      ssh: {
        ...(prev.ssh || { host: '', port: 22, user: '', authType: SshAuthType.PASSWORD }),
        ...updates
      }
    }))
  }

  const toggleSsh = (enabled: boolean) => {
    setForm(prev => ({
      ...prev,
      ssh: enabled ? (prev.ssh || { host: '', port: 22, user: '', authType: SshAuthType.PASSWORD }) : undefined
    }))
  }

  if (isMinimized) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-muted border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[220px]" data-drag-handle>
          <Database className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">
              {editingConnection ? 'Edit Connection' : 'New Connection'}
            </p>
            <p className="text-[var(--ch-text-10)] text-muted-foreground truncate">{form.name || 'Unnamed'}</p>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-background rounded shrink-0"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background rounded shrink-0"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed z-50 w-[560px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="bg-muted border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-background cursor-grab active:cursor-grabbing" data-drag-handle>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground uppercase">
                {editingConnection ? 'Edit Connection' : 'New Connection'}
              </h2>
              <p className="text-[var(--ch-text-9)] text-muted-foreground font-bold uppercase tracking-widest">Database Configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 py-3 bg-background border-b border-border">
          <div className="flex gap-2">
            {[
              { id: 'general', label: 'General', icon: Cpu },
              ...(form.type !== DatabaseType.REDIS ? [
                { id: 'pool', label: 'Pool & Timeout', icon: Clock },
                { id: 'ssh', label: 'SSH Tunnel', icon: Lock }
              ] : [])
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'ssh' | 'pool')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest border transition-all",
                  activeTab === tab.id 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'ssh' && form.ssh && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>}
              </button>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-thin">
          {isLoadingConnection ? (
            <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Cargando datos de conexión...
            </div>
          ) : activeTab === 'general' ? (
            <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Display Name</label>
                  <input 
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all placeholder:text-muted-foreground/30"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Production Cluster"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Environment</label>
                  <select
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all cursor-pointer appearance-none"
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value as Environment })}
                  >
                    {Object.values(Environment).map(env => (
                      <option key={env} value={env} className="bg-secondary text-foreground">{env.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 p-3 border border-border bg-muted/20">
                <input
                  type="checkbox"
                  id="readonly-toggle"
                  checked={form.readOnly}
                  onChange={(e) => setForm({ ...form, readOnly: e.target.checked })}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer"
                />
                <label
                  htmlFor="readonly-toggle"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer select-none"
                >
                  Read-Only Mode
                </label>
              </div>

              <div className="space-y-3">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Database Engine</label>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { id: DatabaseType.MARIADB, label: 'MySQL' },
                    { id: DatabaseType.POSTGRES, label: 'Postgres' },
                    { id: DatabaseType.MONGODB, label: 'MongoDB' },
                    { id: DatabaseType.SQLSERVER, label: 'MSSQL' },
                    { id: DatabaseType.REDIS, label: 'Redis' },
                    { id: DatabaseType.NEO4J, label: 'Neo4j' }
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      onClick={() => {
                        const defaultPort = 
                          engine.id === DatabaseType.POSTGRES ? 5432 : 
                          engine.id === DatabaseType.MONGODB ? 27017 : 
                          engine.id === DatabaseType.SQLSERVER ? 1433 :
                          engine.id === DatabaseType.REDIS ? 6379 :
                          engine.id === DatabaseType.NEO4J ? 7687 : 3306
                        setForm({ ...form, type: engine.id as DatabaseType, port: defaultPort })
                      }}
                      className={cn(
                        "py-2 border text-[var(--ch-text-9)] font-bold uppercase tracking-widest transition-all",
                        form.type === engine.id 
                          ? "bg-primary/10 border-primary text-primary" 
                          : "bg-background border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {engine.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Host / URI</label>
                  <div className="relative">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input 
                      className="w-full bg-background border border-border pl-10 pr-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                      value={form.host}
                      onChange={(e) => setForm({ ...form, host: e.target.value })}
                      placeholder="localhost"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Port</label>
                  <input 
                    type="number"
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {form.type !== DatabaseType.REDIS && (
                <div className="space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Username</label>
                  <input 
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    placeholder="root"
                  />
                </div>
                )}
                <div className="space-y-2">
                  <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Password {form.type === DatabaseType.REDIS ? '(optional)' : ''}</label>
                  <div className="relative">
                    <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      className={cn(
                        "w-full bg-background border border-border pl-10 pr-10 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all",
                        !storePassword && editingConnection ? 'opacity-60 cursor-not-allowed' : ''
                      )}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder={editingConnection ? '••••••••' : '••••••••'}
                      disabled={!storePassword && !!editingConnection}
                    />
                    <button
                      type="button"
                      onClick={() => toggleReveal('password')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copySecret('password')}
                      title="Copiar contraseña"
                      className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {editingConnection && (
                    <label className="inline-flex items-center gap-2 text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                        checked={storePassword}
                        onChange={(e) => {
                          setStorePassword(e.target.checked)
                          if (!e.target.checked) {
                            setForm((prev) => ({ ...prev, password: '' }))
                          }
                        }}
                      />
                      Guardar contraseña
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">{form.type === DatabaseType.REDIS ? 'Database (0-15)' : form.type === DatabaseType.NEO4J ? 'Database' : 'Default Schema'}</label>
                <div className="relative">
                  <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input 
                    className="w-full bg-background border border-border pl-10 pr-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.database}
                    onChange={(e) => setForm({ ...form, database: e.target.value })}
                    placeholder={form.type === DatabaseType.REDIS ? '0' : form.type === DatabaseType.NEO4J ? 'neo4j' : 'database_name'}
                  />
                </div>
              </div>

              {form.type !== DatabaseType.REDIS && (
              <div className="flex items-center justify-between p-4 bg-background border border-border">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">SSL / TLS</h4>
                    <p className="text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-tight">Encrypt database connection</p>
                  </div>
                </div>
                <button 
                  onClick={() => setForm({ ...form, ssl: form.ssl === 'true' ? 'false' : 'true' })}
                  className={cn(
                    "w-12 h-6 transition-all relative border p-1",
                    form.ssl === 'true' ? "bg-primary border-primary" : "bg-muted border-border"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 transition-all",
                    form.ssl === 'true' ? "translate-x-6 bg-background" : "translate-x-0 bg-muted-foreground"
                  )} />
                </button>
              </div>
              )}

              {form.type === DatabaseType.MONGODB && (
                <div className="p-4 border border-primary/20 bg-primary/5 space-y-4 animate-in fade-in duration-300">
                  <h4 className="text-[var(--ch-text-9)] font-bold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    MongoDB Advanced
                  </h4>

                  <div className="flex items-center justify-between p-3 bg-background border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-[var(--ch-text-10)] font-bold text-foreground uppercase tracking-widest">Authentication Required</h4>
                        <p className="text-[var(--ch-text-9)] text-muted-foreground uppercase tracking-tight">Requires username &amp; password</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setForm({ ...form, authEnabled: !form.authEnabled, password: !form.authEnabled ? '' : form.password })}
                      className={cn(
                        "w-10 h-5 transition-all relative border p-0.5",
                        form.authEnabled ? "bg-primary border-primary" : "bg-muted border-border"
                      )}
                    >
                      <div className={cn(
                        "w-3.5 h-3.5 transition-all",
                        form.authEnabled ? "translate-x-5 bg-background" : "translate-x-0 bg-muted-foreground"
                      )} />
                    </button>
                  </div>

                  {!form.authEnabled && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 text-amber-500 animate-in fade-in duration-200">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider">
                        Username and password will not be stored for this connection
                      </p>
                    </div>
                  )}

                  <div className={cn("space-y-4", !form.authEnabled && "opacity-40 pointer-events-none")}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Auth Source</label>
                        <input 
                          className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                          value={form.authSource}
                          onChange={(e) => setForm({ ...form, authSource: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Replica Set</label>
                        <input 
                          className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                          value={form.replicaSet}
                          onChange={(e) => setForm({ ...form, replicaSet: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-background border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-[var(--ch-text-10)] font-bold text-foreground uppercase tracking-widest">Direct Connection</h4>
                          <p className="text-[var(--ch-text-9)] text-muted-foreground uppercase tracking-tight">Force single node connection</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setForm({ ...form, directConnection: !form.directConnection })}
                        className={cn(
                          "w-10 h-5 transition-all relative border p-0.5",
                          form.directConnection ? "bg-primary border-primary" : "bg-muted border-border"
                        )}
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 transition-all",
                          form.directConnection ? "translate-x-5 bg-background" : "translate-x-0 bg-muted-foreground"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'pool' ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="p-4 border border-primary/20 bg-primary/5 space-y-6">
                <h4 className="text-[var(--ch-text-9)] font-bold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <Server className="w-3 h-3" />
                  Connection Pool
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Max Pool Size</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.maxPoolSize ?? 5}
                      onChange={(e) => setForm({ ...form, maxPoolSize: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Acquire Timeout (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.acquireTimeout ?? 5}
                      onChange={(e) => setForm({ ...form, acquireTimeout: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 border border-border bg-muted/20 space-y-6">
                <h4 className="text-[var(--ch-text-9)] font-bold uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Timeouts &amp; TTL
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Idle Timeout (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.idleTimeout ?? 600}
                      onChange={(e) => setForm({ ...form, idleTimeout: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Max Lifetime (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.maxLifetime ?? 28800}
                      onChange={(e) => setForm({ ...form, maxLifetime: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Keep Alive (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.keepAlive ?? 0}
                      onChange={(e) => setForm({ ...form, keepAlive: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground/70">Metadata Cache TTL (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background border border-border px-3 py-2 text-[var(--ch-text-11)] font-mono focus:border-primary focus:outline-none"
                      value={form.metadataCacheTtl ?? 300}
                      onChange={(e) => setForm({ ...form, metadataCacheTtl: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between p-4 bg-background border border-border">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">Enable SSH Tunnel</h4>
                    <p className="text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-tight">Secure bastion host access</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleSsh(!form.ssh)}
                  className={cn(
                    "w-12 h-6 transition-all relative border p-1",
                    form.ssh ? "bg-primary border-primary" : "bg-muted border-border"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 transition-all",
                    form.ssh ? "translate-x-6 bg-background" : "translate-x-0 bg-muted-foreground"
                  )} />
                </button>
              </div>

              {form.ssh && (
                <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-2">
                      <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Host</label>
                      <input 
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.host}
                        onChange={(e) => updateSsh({ host: e.target.value })}
                        placeholder="jump.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Port</label>
                      <input 
                        type="number"
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.port}
                        onChange={(e) => updateSsh({ port: parseInt(e.target.value) || 22 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Authentication Method</label>
                    <div className="flex gap-2">
                      {[
                        { id: SshAuthType.PASSWORD, label: 'Password', icon: Lock },
                        { id: SshAuthType.KEY, label: 'Private Key', icon: Key }
                      ].map((auth) => (
                        <button
                          key={auth.id}
                          onClick={() => updateSsh({ authType: auth.id })}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 border text-[var(--ch-text-9)] font-bold uppercase tracking-widest transition-all",
                            form.ssh?.authType === auth.id 
                              ? "bg-primary/10 border-primary text-primary" 
                              : "bg-background border-border text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          <auth.icon className="w-3 h-3" />
                          {auth.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH User</label>
                      <input 
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.user}
                        onChange={(e) => updateSsh({ user: e.target.value })}
                      />
                    </div>
                    {form.ssh.authType === SshAuthType.PASSWORD ? (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Password</label>
                        <div className="relative">
                          <input 
                            type={showSshPassword ? 'text' : 'password'}
                            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                            value={form.ssh.password || ''}
                            onChange={(e) => updateSsh({ password: e.target.value })}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => toggleReveal('ssh_password')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            {showSshPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copySecret('ssh_password')}
                            title="Copiar contraseña SSH"
                            className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Passphrase (required for encrypted keys)</label>
                        <div className="relative">
                          <input 
                            type={showSshPassphrase ? 'text' : 'password'}
                            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                            value={form.ssh.passphrase || ''}
                            onChange={(e) => updateSsh({ passphrase: e.target.value })}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => toggleReveal('ssh_passphrase')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            {showSshPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copySecret('ssh_passphrase')}
                            title="Copiar passphrase"
                            className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {form.ssh.authType === SshAuthType.KEY && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-1">
                        <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Private Key</label>
                        <div className="flex items-center gap-0.5 ml-2 bg-muted/30 p-0.5 rounded border border-border/40">
                          <button
                            type="button"
                            onClick={() => updateSsh({ keyPath: undefined })}
                            className={cn(
                              'px-2 py-0.5 text-[var(--ch-text-9)] font-medium rounded-sm transition-colors',
                              !form.ssh.keyPath ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            Paste
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSsh({ privateKey: undefined })}
                            className={cn(
                              'px-2 py-0.5 text-[var(--ch-text-9)] font-medium rounded-sm transition-colors',
                              form.ssh.keyPath ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            File Path
                          </button>
                        </div>
                      </div>
                      {!form.ssh.keyPath ? (
                        <textarea
                          className="w-full bg-background border border-border px-4 py-3 text-[var(--ch-text-11)] font-mono h-32 focus:border-primary focus:outline-none resize-none leading-relaxed"
                          value={form.ssh.privateKey || ''}
                          onChange={(e) => updateSsh({ privateKey: e.target.value })}
                          placeholder="-----BEGIN RSA PRIVATE KEY-----"
                        />
                      ) : (
                        <div className="flex items-center gap-2 bg-background border border-border px-4 py-2.5">
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-none placeholder:text-muted-foreground"
                            value={form.ssh.keyPath}
                            onChange={(e) => updateSsh({ keyPath: e.target.value })}
                            placeholder="C:\Users\you\.ssh\id_rsa"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-background border-t border-border flex items-center justify-between gap-4">
          <button 
            onClick={() => {
              const payload = { ...form };
              if (payload.ssh) {
                const cleanedSsh = { ...payload.ssh } as Record<string, unknown>;
                delete cleanedSsh.authMethod;
                payload.ssh = cleanedSsh as unknown as SshConfig;
              }
              onTest(payload);
            }}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 text-[var(--ch-text-10)] font-bold text-muted-foreground hover:text-primary transition-all uppercase tracking-widest disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Test
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-[var(--ch-text-10)] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                const payload = { ...form, password: form.authEnabled === false ? '' : (storePassword ? form.password : '') };
                // Cleanup legacy fields to avoid Serde duplicate errors
                if (payload.ssh) {
                  const cleanedSsh = { ...payload.ssh } as Record<string, unknown>;
                  delete cleanedSsh.authMethod;
                  payload.ssh = cleanedSsh as unknown as SshConfig;
                }
                if (payload.authEnabled === false) {
                  payload.user = '';
                  payload.authSource = undefined;
                }
                if (!payload.authSource) payload.authSource = undefined;
                onSave(payload);
              }}
              disabled={isSaving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingConnection ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </div>

        {testMessage && (
          <div className={cn(
            "mx-6 mb-6 p-3 border flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300",
            testMessage.type === 'success' 
              ? "bg-green-500/5 border-green-500/20 text-green-500" 
              : "bg-destructive/5 border-destructive/20 text-destructive"
          )}>
            {testMessage.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider">{testMessage.text}</p>
          </div>
        )}
      </div>

      {showUnlockPrompt && (
        <UnlockPrompt
          onUnlocked={() => {
            setShowUnlockPrompt(false)
            if (pendingReveal) {
              if (pendingCopy) doCopy(pendingReveal)
              else applyReveal(pendingReveal)
            }
            setPendingReveal(null)
            setPendingCopy(false)
          }}
          onCancel={() => {
            setShowUnlockPrompt(false)
            setPendingReveal(null)
            setPendingCopy(false)
          }}
        />
      )}
    </div>
  )
}
