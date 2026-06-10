import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Link as LinkIcon, Database, Server, Globe, Edit2, Shield, Settings, Save, Loader2, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { Connection } from '@/types/database'
import { DatabaseType, Environment } from '@/types/database'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'

export default function Connections() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setActiveConnection = useAppStore((state) => state.setActiveConnection)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [modalTab, setModalTab] = useState<'general' | 'ssh'>('general')

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<Connection[]>('/connections'),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      const isEditing = !!editingConnection?.id
      const url = isEditing ? `/connections/${editingConnection.id}` : '/connections'
      return apiFetch<Connection>(url, {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const getEnvColor = (env: Environment) => {
    switch (env) {
      case Environment.PRODUCTION: return 'bg-red-500/10 text-red-600 border-red-500/20'
      case Environment.STAGING: return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
      case Environment.DEVELOPMENT: return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingConnection(null)
    setTestMessage(null)
    setModalTab('general')
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries())
    
    const payload: any = {
      name: data.name,
      type: data.type,
      environment: data.environment,
      host: data.host,
      port: Number(data.port),
      user: data.user,
      password: data.savePassword === 'on' ? data.password : undefined,
      database: data.database,
    }

    if (data.useSsh === 'on') {
      payload.ssh = {
        host: data.sshHost,
        port: Number(data.sshPort),
        user: data.sshUser,
        password: data.savePassword === 'on' ? data.sshPassword : undefined,
        privateKey: data.sshPrivateKey,
      }
    }

    saveMutation.mutate(payload)
  }

  const handleTest = (e: React.MouseEvent) => {
    const form = (e.target as HTMLElement).closest('form')
    if (!form) return
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries())
    
    const payload: any = {
      type: data.type,
      host: data.host,
      port: Number(data.port),
      user: data.user,
      password: data.password,
      database: data.database,
    }

    if (data.useSsh === 'on') {
      payload.ssh = {
        host: data.sshHost,
        port: Number(data.sshPort),
        user: data.sshUser,
        password: data.sshPassword,
        privateKey: data.sshPrivateKey,
      }
    }

    setIsTesting(true)
    setTestMessage(null)
    apiFetch('/connections/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(() => {
      setTestMessage({ type: 'success', text: 'Connection successful!' })
    }).catch((err) => {
      setTestMessage({ type: 'error', text: err.message || 'Connection failed' })
    }).finally(() => {
      setIsTesting(false)
    })
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground mt-1">Manage your database access configurations.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Connection
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connections?.map((conn) => (
            <div key={conn.id} className={cn(
              "group relative border border-border bg-card p-5 rounded-xl hover:shadow-md transition-shadow overflow-hidden",
              conn.environment === Environment.PRODUCTION && "border-l-4 border-l-red-500"
            )}>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Database className="w-6 h-6 text-primary" />
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setEditingConnection(conn); setIsModalOpen(true); }}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate(conn.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg truncate">{conn.name}</h3>
                <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border", getEnvColor(conn.environment))}>
                  {conn.environment}
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5" />
                  <span>{conn.host}:{conn.port}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5" />
                  <span className="truncate">{conn.database}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="uppercase font-semibold text-[10px] tracking-wider bg-muted px-2 py-0.5 rounded">
                    {conn.type}
                  </div>
                  {conn.ssh && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      <Shield className="w-2.5 h-2.5" /> SSH
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex justify-end">
                <button 
                  onClick={() => {
                    setActiveConnection(conn)
                    navigate('/explorer')
                  }}
                  className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                >
                  Connect <LinkIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">{editingConnection ? 'Edit Connection' : 'New Connection'}</h2>
                <p className="text-sm text-muted-foreground">Database & Security Configuration</p>
              </div>
              <button onClick={handleCloseModal} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex border-b border-border">
              <button onClick={() => setModalTab('general')} className={cn("px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2", modalTab === 'general' ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:bg-muted")}>General</button>
              <button onClick={() => setModalTab('ssh')} className={cn("px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2", modalTab === 'ssh' ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:bg-muted")}><Shield className="w-3.5 h-3.5" /> SSH Tunnel</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-auto">
              {modalTab === 'general' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                      <input required name="name" defaultValue={editingConnection?.name} placeholder="Production MariaDB" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Environment</label>
                      <select name="environment" defaultValue={editingConnection?.environment || Environment.DEVELOPMENT} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50">
                        {Object.values(Environment).map(env => <option key={env} value={env}>{env.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Database Type</label>
                      <select name="type" defaultValue={editingConnection?.type || DatabaseType.MARIADB} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50">
                        <option value={DatabaseType.MARIADB}>MariaDB / MySQL</option>
                        <option value={DatabaseType.POSTGRES}>PostgreSQL</option>
                        <option value={DatabaseType.MONGODB}>MongoDB</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Database Name</label>
                      <input required name="database" defaultValue={editingConnection?.database} placeholder="main_db" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Host</label>
                      <input required name="host" defaultValue={editingConnection?.host} placeholder="127.0.0.1" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
                      <input required name="port" type="number" defaultValue={editingConnection?.port || "3306"} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">User</label>
                      <input required name="user" defaultValue={editingConnection?.user} placeholder="root" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                      <input name="password" type="password" placeholder="••••••••" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-2">
                    <input type="checkbox" name="savePassword" id="savePassword" defaultChecked={true} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    <label htmlFor="savePassword" className="text-sm font-bold">Remember credentials (Persistence)</label>
                  </div>
                </>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" name="useSsh" id="useSsh" defaultChecked={!!editingConnection?.ssh} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    <label htmlFor="useSsh" className="text-sm font-bold">Use SSH Tunnel</label>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Host</label>
                      <input name="sshHost" defaultValue={editingConnection?.ssh?.host} placeholder="ssh.server.com" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Port</label>
                      <input name="sshPort" type="number" defaultValue={editingConnection?.ssh?.port || "22"} className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH User</label>
                    <input name="sshUser" defaultValue={editingConnection?.ssh?.user} placeholder="ubuntu" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Password / Passphrase</label>
                    <input name="sshPassword" type="password" placeholder="••••••••" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Private Key (OpenSSH)</label>
                    <textarea name="sshPrivateKey" defaultValue={editingConnection?.ssh?.privateKey} rows={3} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                </div>
              )}

              {testMessage && (
                <div className={cn("p-3 rounded-md text-xs font-medium border animate-in zoom-in-95", testMessage.type === 'success' ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-destructive/10 text-destructive border-destructive/20")}>
                  {testMessage.text}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={handleTest} disabled={isTesting} className="flex-1 px-4 py-2 border border-primary/50 text-primary rounded-md text-sm font-bold hover:bg-primary/5 transition-colors disabled:opacity-50">
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test Connection'}
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

