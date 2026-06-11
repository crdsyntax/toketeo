import { X, Shield, Loader2, Save, Database, Globe, ChevronDown, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment } from '@/types/database'
import type { Connection, CreateConnectionDto } from '@/types/database'
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

export function ConnectionModal({
  isOpen, onClose, onSave, onTest, editingConnection, isSaving, isTesting, testMessage
}: ConnectionModalProps) {
  const [showSsh, setShowSsh] = useState(false)
  const [form, setForm] = useState<CreateConnectionDto>({
    name: '',
    type: DatabaseType.MARIADB,
    environment: Environment.DEVELOPMENT,
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: '',
  })

  useEffect(() => {
    if (editingConnection) {
      setForm({
        name: editingConnection.name,
        type: editingConnection.type,
        environment: editingConnection.environment,
        host: editingConnection.host,
        port: editingConnection.port,
        user: editingConnection.user,
        password: editingConnection.password || '',
        database: editingConnection.database || '',
        ssh: editingConnection.ssh,
      })
      setShowSsh(!!editingConnection.ssh)
    } else {
      setForm({
        name: '',
        type: DatabaseType.MARIADB,
        environment: Environment.DEVELOPMENT,
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: '',
      })
      setShowSsh(false)
    }
  }, [editingConnection, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] rounded-none overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-left">
              <Database className="w-5 h-5 text-primary" />
              {editingConnection ? 'Edit Connection' : 'New Connection'}
            </h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mt-1 text-left">Configure your database access</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-none transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Production Cluster"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Environment</label>
              <div className="grid grid-cols-2 gap-1 bg-muted/50 p-1 rounded-none border border-border">
                {['production', 'staging', 'development', 'local'].map((env) => (
                  <button
                    key={env}
                    onClick={() => setForm({ ...form, environment: env as any })}
                    className={cn(
                      "px-2 py-1.5 text-[10px] font-bold uppercase rounded-none transition-all",
                      form.environment === env ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Database Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'mariadb', label: 'MariaDB / MySQL', icon: Database },
                { id: 'postgres', label: 'PostgreSQL', icon: Database },
                { id: 'mongodb', label: 'MongoDB', icon: Database },
              ].map((engine) => (
                <button
                  key={engine.id}
                  onClick={() => setForm({ ...form, type: engine.id as any, port: engine.id === 'postgres' ? 5432 : engine.id === 'mongodb' ? 27017 : 3306 })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 border transition-all rounded-none",
                    form.type === engine.id ? "bg-primary/5 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <engine.icon className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{engine.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Host / URI</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  className="w-full bg-muted/50 border border-border rounded-none pl-10 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
              <input 
                type="number"
                className="w-full bg-muted/50 border border-border rounded-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
                placeholder="root"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  type="password"
                  className="w-full bg-muted/50 border border-border rounded-none pl-10 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Database / Schema</label>
            <input 
              className="w-full bg-muted/50 border border-border rounded-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              value={form.database}
              onChange={(e) => setForm({ ...form, database: e.target.value })}
              placeholder="my_app_db"
            />
          </div>

          <div className="border border-border rounded-none overflow-hidden">
            <button 
              onClick={() => setShowSsh(!showSsh)}
              className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <div className={cn("p-2 rounded-none", form.ssh ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">SSH Tunnel</h4>
                  <p className="text-[10px] text-muted-foreground">Connect via a jump host</p>
                </div>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", showSsh && "rotate-180")} />
            </button>

            {showSsh && (
              <div className="p-4 bg-muted/10 border-t border-border space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3 space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">SSH Host</label>
                    <input 
                      className="w-full bg-background border border-border rounded-none px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                      value={form.ssh?.host || ''}
                      onChange={(e) => setForm({ ...form, ssh: { ...(form.ssh || { port: 22, user: '' }), host: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
                    <input 
                      type="number"
                      className="w-full bg-background border border-border rounded-none px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                      value={form.ssh?.port || 22}
                      onChange={(e) => setForm({ ...form, ssh: { ...(form.ssh || { host: '', user: '' }), port: parseInt(e.target.value) || 22 } })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">SSH User</label>
                  <input 
                    className="w-full bg-background border border-border rounded-none px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                    value={form.ssh?.user || ''}
                    onChange={(e) => setForm({ ...form, ssh: { ...(form.ssh || { host: '', port: 22 }), user: e.target.value } })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between bg-muted/20">
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
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-none text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingConnection ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </div>

        {testMessage && (
          <div className={cn(
            "mx-6 mb-6 p-3 border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-none",
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

function RefreshCw(props: any) {
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
