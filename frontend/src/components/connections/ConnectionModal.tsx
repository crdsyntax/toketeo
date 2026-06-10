import { X, Shield, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment } from '@/types/database'
import type { Connection, CreateConnectionDto } from '@/types/database'
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

export function ConnectionModal({
  isOpen, onClose, onSave, onTest, editingConnection, isSaving, isTesting, testMessage
}: ConnectionModalProps) {
  const [modalTab, setModalTab] = useState<'general' | 'ssh'>('general')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries()) as Record<string, string | undefined>
    
    const payload: CreateConnectionDto = {
      name: (data.name as string) || '',
      type: (data.type as DatabaseType) || DatabaseType.MARIADB,
      environment: (data.environment as Environment) || Environment.DEVELOPMENT,
      host: (data.host as string) || '',
      port: Number(data.port) || 0,
      user: (data.user as string) || '',
      password: data.savePassword === 'on' ? (data.password as string) : undefined,
      database: (data.database as string) || '',
    }

    if (data.useSsh === 'on') {
      payload.ssh = {
        host: (data.sshHost as string) || '',
        port: Number(data.sshPort) || 22,
        user: (data.sshUser as string) || '',
        password: data.savePassword === 'on' ? (data.sshPassword as string) : undefined,
        privateKey: (data.sshPrivateKey as string) || '',
      }
    }

    onSave(payload)
  }

  const handleTriggerTest = (e: React.MouseEvent) => {
    const form = (e.target as HTMLElement).closest('form')
    if (!form) return
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries()) as Record<string, string | undefined>
    
    const payload: CreateConnectionDto = {
      name: (data.name as string) || '',
      type: (data.type as DatabaseType) || DatabaseType.MARIADB,
      environment: (data.environment as Environment) || Environment.DEVELOPMENT,
      host: (data.host as string) || '',
      port: Number(data.port) || 0,
      user: (data.user as string) || '',
      password: (data.password as string) || '',
      database: (data.database as string) || '',
    }

    if (data.useSsh === 'on') {
      payload.ssh = {
        host: (data.sshHost as string) || '',
        port: Number(data.sshPort) || 22,
        user: (data.sshUser as string) || '',
        password: (data.sshPassword as string) || '',
        privateKey: (data.sshPrivateKey as string) || '',
      }
    }

    onTest(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-left">
      <div className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{editingConnection ? 'Edit Connection' : 'New Connection'}</h2>
            <p className="text-sm text-muted-foreground">Database & Security Configuration</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
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
            <button type="button" onClick={handleTriggerTest} disabled={isTesting} className="flex-1 px-4 py-2 border border-primary/50 text-primary rounded-md text-sm font-bold hover:bg-primary/5 transition-colors disabled:opacity-50">
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test Connection'}
            </button>
            <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Connection
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
