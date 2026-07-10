import { X, Shield, Loader2, Database, Globe, Check, AlertTriangle, Terminal, RefreshCw, Server, Cpu, Lock, Key, Eye, EyeOff, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment, SshAuthType } from '@/types/database'
import type { Connection, CreateConnectionDto, SshConfig } from '@/types/database'
import { useState, useEffect } from 'react'
import { connectionService } from '@/services/connection.service'
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

export function ConnectionModal({
  isOpen, onClose, onSave, onTest, editingConnection, isSaving, isTesting, testMessage
}: ConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'ssh' | 'pool'>('general')
  const [form, setForm] = useState<CreateConnectionDto>(INITIAL_FORM)
  const [storePassword, setStorePassword] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoadingConnection, setIsLoadingConnection] = useState(false)
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false)
  const [pendingReveal, setPendingReveal] = useState<'password' | 'ssh_password' | 'ssh_passphrase' | null>(null)
  const [showSshPassword, setShowSshPassword] = useState(false)
  const [showSshPassphrase, setShowSshPassphrase] = useState(false)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-secondary/95 border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] rounded-none overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-background/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground uppercase">
                {editingConnection ? 'Edit Connection' : 'New Connection'}
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Database Configuration</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 py-4 bg-muted/30 border-b border-border">
          <div className="flex gap-2">
            {[
              { id: 'general', label: 'General', icon: Cpu },
              { id: 'pool', label: 'Pool & Timeout', icon: Clock },
              { id: 'ssh', label: 'SSH Tunnel', icon: Lock }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'ssh' | 'pool')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all",
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
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Display Name</label>
                  <input 
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all placeholder:text-muted-foreground/30"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Production Cluster"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Environment</label>
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
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Database Engine</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: DatabaseType.MARIADB, label: 'MySQL' },
                    { id: DatabaseType.POSTGRES, label: 'Postgres' },
                    { id: DatabaseType.MONGODB, label: 'MongoDB' },
                    { id: DatabaseType.SQLSERVER, label: 'MSSQL' }
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      onClick={() => {
                        const defaultPort = 
                          engine.id === DatabaseType.POSTGRES ? 5432 : 
                          engine.id === DatabaseType.MONGODB ? 27017 : 
                          engine.id === DatabaseType.SQLSERVER ? 1433 : 3306
                        setForm({ ...form, type: engine.id as DatabaseType, port: defaultPort })
                      }}
                      className={cn(
                        "py-2 border text-[9px] font-bold uppercase tracking-widest transition-all",
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
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Host / URI</label>
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
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Port</label>
                  <input 
                    type="number"
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Username</label>
                  <input 
                    className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Password</label>
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
                      onClick={async () => {
                        if (showPassword) {
                          setShowPassword(false)
                          return
                        }
                        const unlocked = await connectionService.isSessionUnlocked()
                        if (unlocked) {
                          setShowPassword(true)
                        } else {
                          setPendingReveal('password')
                          setShowUnlockPrompt(true)
                        }
                      }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {editingConnection && (
                    <label className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Default Schema</label>
                <div className="relative">
                  <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input 
                    className="w-full bg-background border border-border pl-10 pr-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                    value={form.database}
                    onChange={(e) => setForm({ ...form, database: e.target.value })}
                    placeholder="database_name"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-background border border-border">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">SSL / TLS</h4>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Encrypt database connection</p>
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

              {form.type === DatabaseType.MONGODB && (
                <div className="p-4 border border-primary/20 bg-primary/5 space-y-4 animate-in fade-in duration-300">
                  <h4 className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    MongoDB Advanced
                  </h4>

                  <div className="flex items-center justify-between p-3 bg-background/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest">Authentication Required</h4>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Requires username &amp; password</p>
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

                  <div className={cn("space-y-4", !form.authEnabled && "opacity-40 pointer-events-none")}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Auth Source</label>
                        <input 
                          className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                          value={form.authSource}
                          onChange={(e) => setForm({ ...form, authSource: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Replica Set</label>
                        <input 
                          className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                          value={form.replicaSet}
                          onChange={(e) => setForm({ ...form, replicaSet: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-background/50 border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest">Direct Connection</h4>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Force single node connection</p>
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
                <h4 className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <Server className="w-3 h-3" />
                  Connection Pool
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Max Pool Size</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                      value={form.maxPoolSize ?? 5}
                      onChange={(e) => setForm({ ...form, maxPoolSize: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Acquire Timeout (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                      value={form.acquireTimeout ?? 5}
                      onChange={(e) => setForm({ ...form, acquireTimeout: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 border border-border bg-muted/20 space-y-6">
                <h4 className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Timeouts &amp; TTL
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Idle Timeout (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                      value={form.idleTimeout ?? 600}
                      onChange={(e) => setForm({ ...form, idleTimeout: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Max Lifetime (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                      value={form.maxLifetime ?? 28800}
                      onChange={(e) => setForm({ ...form, maxLifetime: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Keep Alive (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
                      value={form.keepAlive ?? 0}
                      onChange={(e) => setForm({ ...form, keepAlive: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Metadata Cache TTL (s)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-background/50 border border-border px-3 py-2 text-[11px] font-mono focus:border-primary focus:outline-none"
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Secure bastion host access</p>
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
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Host</label>
                      <input 
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.host}
                        onChange={(e) => updateSsh({ host: e.target.value })}
                        placeholder="jump.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Port</label>
                      <input 
                        type="number"
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.port}
                        onChange={(e) => updateSsh({ port: parseInt(e.target.value) || 22 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Authentication Method</label>
                    <div className="flex gap-2">
                      {[
                        { id: SshAuthType.PASSWORD, label: 'Password', icon: Lock },
                        { id: SshAuthType.KEY, label: 'Private Key', icon: Key }
                      ].map((auth) => (
                        <button
                          key={auth.id}
                          onClick={() => updateSsh({ authType: auth.id })}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 border text-[9px] font-bold uppercase tracking-widest transition-all",
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
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH User</label>
                      <input 
                        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                        value={form.ssh.user}
                        onChange={(e) => updateSsh({ user: e.target.value })}
                      />
                    </div>
                    {form.ssh.authType === SshAuthType.PASSWORD ? (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">SSH Password</label>
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
                            onClick={() => setShowSshPassword((prev) => !prev)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            {showSshPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Passphrase (Optional)</label>
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
                            onClick={() => setShowSshPassphrase((prev) => !prev)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            {showSshPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {form.ssh.authType === SshAuthType.KEY && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Private Key</label>
                      <textarea 
                        className="w-full bg-background border border-border px-4 py-3 text-[11px] font-mono h-32 focus:border-primary focus:outline-none resize-none leading-relaxed"
                        value={form.ssh.privateKey || ''}
                        onChange={(e) => updateSsh({ privateKey: e.target.value })}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-muted/30 border-t border-border flex items-center justify-between gap-4">
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
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-muted-foreground hover:text-primary transition-all uppercase tracking-widest disabled:opacity-50"
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
              className="px-4 py-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
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
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
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
            <p className="text-[11px] font-bold uppercase tracking-wider">{testMessage.text}</p>
          </div>
        )}
      </div>

      {showUnlockPrompt && (
        <UnlockPrompt
          onUnlocked={() => {
            setShowUnlockPrompt(false)
            if (pendingReveal === 'password') setShowPassword(true)
            if (pendingReveal === 'ssh_password') setShowSshPassword(true)
            if (pendingReveal === 'ssh_passphrase') setShowSshPassphrase(true)
            setPendingReveal(null)
          }}
          onCancel={() => {
            setShowUnlockPrompt(false)
            setPendingReveal(null)
          }}
        />
      )}
    </div>
  )
}
