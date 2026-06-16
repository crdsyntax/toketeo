import { X, Shield, Loader2, Database, Globe, Check, AlertTriangle, Terminal, RefreshCw, Server, Cpu, Lock, Key } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment, SshAuthType } from '@/types/database'
import type { Connection, CreateConnectionDto, SshConfig } from '@/types/database'
import { useState, useEffect } from 'react'

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
  authSource: '',
  replicaSet: '',
  ssl: 'false',
}

export function ConnectionModal({
  isOpen, onClose, onSave, onTest, editingConnection, isSaving, isTesting, testMessage
}: ConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'ssh'>('general')
  const [form, setForm] = useState<CreateConnectionDto>(INITIAL_FORM)

  useEffect(() => {
    if (!isOpen) return;

    if (editingConnection) {
      const editData: CreateConnectionDto = {
        name: editingConnection.name,
        type: editingConnection.type,
        environment: editingConnection.environment,
        host: editingConnection.host,
        port: editingConnection.port,
        user: editingConnection.user,
        password: editingConnection.password || '',
        database: editingConnection.database || '',
        authSource: editingConnection.authSource || '',
        replicaSet: editingConnection.replicaSet || '',
        ssl: editingConnection.ssl || 'false',
        ssh: editingConnection.ssh ? {
          ...editingConnection.ssh,
          authType: editingConnection.ssh.authType || (editingConnection.ssh.privateKey ? SshAuthType.KEY : SshAuthType.PASSWORD)
        } : undefined,
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(editData);
    } else {
      setForm(INITIAL_FORM);
    }
    setActiveTab('general');
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
              { id: 'ssh', label: 'SSH Tunnel', icon: Lock }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'ssh')}
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
          {activeTab === 'general' ? (
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
                      type="password"
                      className="w-full bg-background border border-border pl-10 pr-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
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
                </div>
              )}
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
                        <input 
                          type="password"
                          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                          value={form.ssh.password || ''}
                          onChange={(e) => updateSsh({ password: e.target.value })}
                          placeholder="••••••••"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Passphrase (Optional)</label>
                        <input 
                          type="password"
                          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                          value={form.ssh.passphrase || ''}
                          onChange={(e) => updateSsh({ passphrase: e.target.value })}
                          placeholder="••••••••"
                        />
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
            onClick={() => onTest(form)}
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
              onClick={() => onSave(form)}
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
    </div>
  )
}
