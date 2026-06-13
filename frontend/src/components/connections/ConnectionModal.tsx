import { X, Shield, Loader2, Database, Globe, Check, AlertTriangle, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment } from '@/types/database'
import type { Connection, CreateConnectionDto, SshConfig } from '@/types/database'
import { useState } from 'react'

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
  const [form, setForm] = useState<CreateConnectionDto>(() => {
    if (editingConnection) {
      return {
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
        ssh: editingConnection.ssh,
      }
    }
    return INITIAL_FORM
  })

  // We still need to reset if the modal opens for "New Connection" after being closed
  // But wait, if we use a key, we don't need this.
  // However, "isOpen" changing might not trigger a remount if key is same.
  // Actually, if we use key={editingConnection?.id || 'new'}, then switching from one edit to another, 
  // or from edit to new, WILL remount.
  // Only closing and reopening for the SAME thing (e.g. edit same connection) won't remount.
  // But usually closing a modal and reopening it should reset it.
  
  if (!isOpen) return null

  const updateSsh = (updates: Partial<SshConfig>) => {
    setForm(prev => ({
      ...prev,
      ssh: {
        ...(prev.ssh || { host: '', port: 22, user: '' }),
        ...updates
      }
    }))
  }

  const toggleSsh = (enabled: boolean) => {
    setForm(prev => ({
      ...prev,
      ssh: enabled ? (prev.ssh || { host: '', port: 22, user: '' }) : undefined
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] rounded-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-left text-foreground">
              <Database className="w-5 h-5 text-primary" />
              {editingConnection ? 'Edit Connection' : 'New Connection'}
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mt-1 text-left">Configure your database access</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border bg-muted/10">
          <button 
            onClick={() => setActiveTab('general')}
            className={cn(
              "flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2",
              activeTab === 'general' ? "border-primary text-primary bg-background" : "border-transparent text-muted-foreground hover:bg-muted/50"
            )}
          >
            General Settings
          </button>
          <button 
            onClick={() => setActiveTab('ssh')}
            className={cn(
              "flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2",
              activeTab === 'ssh' ? "border-primary text-primary bg-background" : "border-transparent text-muted-foreground hover:bg-muted/50"
            )}
          >
            SSH Tunnel {form.ssh && <span className="ml-2 w-2 h-2 bg-primary rounded-full inline-block"></span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          {activeTab === 'general' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</label>
                  <input 
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Production Cluster"
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Environment</label>
                  <select
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value as Environment })}
                  >
                    {Object.values(Environment).map(env => (
                      <option key={env} value={env}>{env.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Database Engine</label>
                <select
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all appearance-none"
                  value={form.type}
                  onChange={(e) => {
                    const type = e.target.value as DatabaseType
                    const defaultPort = 
                      type === DatabaseType.POSTGRES ? 5432 : 
                      type === DatabaseType.MONGODB ? 27017 : 
                      type === DatabaseType.SQLSERVER ? 1433 : 3306
                    setForm({ ...form, type, port: defaultPort })
                  }}
                >
                  <option value={DatabaseType.MARIADB}>MariaDB / MySQL</option>
                  <option value={DatabaseType.POSTGRES}>PostgreSQL</option>
                  <option value={DatabaseType.MONGODB}>MongoDB</option>
                  <option value={DatabaseType.SQLSERVER}>SQL Server (MSSQL)</option>
                </select>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Host / URI</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      className="w-full bg-muted/50 border border-border rounded-md pl-10 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                      value={form.host}
                      onChange={(e) => setForm({ ...form, host: e.target.value })}
                      placeholder="localhost"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
                  <input 
                    type="number"
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                  <input 
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      type="password"
                      className="w-full bg-muted/50 border border-border rounded-md pl-10 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Database / Schema</label>
                <input 
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  value={form.database}
                  onChange={(e) => setForm({ ...form, database: e.target.value })}
                  placeholder="my_app_db"
                />
              </div>

              {form.type === DatabaseType.MONGODB && (
                <div className="p-4 border border-primary/20 bg-primary/5 space-y-4 animate-in fade-in duration-300 rounded-md">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    MongoDB Specific Options
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Auth Source</label>
                      <input 
                        className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.authSource}
                        onChange={(e) => setForm({ ...form, authSource: e.target.value })}
                        placeholder="admin"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Replica Set</label>
                      <input 
                        className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.replicaSet}
                        onChange={(e) => setForm({ ...form, replicaSet: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1 text-left">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">SSL / TLS</label>
                    <select
                      className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none appearance-none"
                      value={form.ssl}
                      onChange={(e) => setForm({ ...form, ssl: e.target.value })}
                    >
                      <option value="false">Disabled</option>
                      <option value="true">Enabled</option>
                      <option value="prefer">Prefer</option>
                      <option value="require">Require</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-md">
                <div className="flex items-center gap-3">
                  <Terminal className="w-5 h-5 text-primary" />
                  <div>
                    <h4 className="text-sm font-bold">Enable SSH Tunnel</h4>
                    <p className="text-[10px] text-muted-foreground uppercase">Connect through a bastion/jump host</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleSsh(!form.ssh)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    form.ssh ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-transform",
                    form.ssh ? "left-7 bg-background" : "left-1 bg-white"
                  )} />
                </button>
              </div>

              {form.ssh && (
                <div className="space-y-6 opacity-100 transition-opacity">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Host</label>
                      <input 
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.host}
                        onChange={(e) => updateSsh({ host: e.target.value })}
                        placeholder="jump.example.com"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Port</label>
                      <input 
                        type="number"
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.port}
                        onChange={(e) => updateSsh({ port: parseInt(e.target.value) || 22 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH User</label>
                      <input 
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.user}
                        onChange={(e) => updateSsh({ user: e.target.value })}
                        placeholder="ubuntu"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Password (Optional)</label>
                      <input 
                        type="password"
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.password || ''}
                        onChange={(e) => updateSsh({ password: e.target.value })}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Private Key (Optional)</label>
                    <textarea 
                      className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-xs font-mono h-32 focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                      value={form.ssh.privateKey || ''}
                      onChange={(e) => updateSsh({ privateKey: e.target.value })}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Passphrase (Optional)</label>
                      <input 
                        type="password"
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.passphrase || ''}
                        onChange={(e) => updateSsh({ passphrase: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Path (Optional)</label>
                      <input 
                        className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={form.ssh.keyPath || ''}
                        onChange={(e) => updateSsh({ keyPath: e.target.value })}
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between">
          <button 
            onClick={() => onTest(form)}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Test Connection
          </button>
          
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button 
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingConnection ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </div>

        {testMessage && (
          <div className={cn(
            "mx-6 mb-6 p-3 border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-md",
            testMessage.type === 'success' ? "bg-green-500/10 border-green-500/20 text-green-600" : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {testMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <p className="text-xs font-medium">{testMessage.text}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RefreshCw(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
