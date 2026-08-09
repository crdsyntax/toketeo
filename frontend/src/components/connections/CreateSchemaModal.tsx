import { useState } from 'react'
import { Database, Plus, X, Cpu, Lock, Info, Minimize2, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection } from '@/types/database'
import { schemaService } from '@/services/schema.service'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'
import toast from 'react-hot-toast'

type TabId = 'general' | 'security'

interface PrivilegeRow {
  grantee: string
  usage: boolean
  create: boolean
}

interface CreateSchemaModalProps {
  conn: Connection
  onClose: () => void
  onCreated: () => void
}

const TABS: { id: TabId; label: string; icon: typeof Cpu }[] = [
  { id: 'general', label: 'General', icon: Cpu },
  { id: 'security', label: 'Security', icon: Lock },
]

export function CreateSchemaModal({ conn, onClose, onCreated }: CreateSchemaModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [comment, setComment] = useState('')
  const [privileges, setPrivileges] = useState<PrivilegeRow[]>([
    { grantee: '', usage: false, create: false },
  ])
  const [creating, setCreating] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const { pos, handleMouseDown } = useDraggablePanel(320, 80)

  const addPrivilegeRow = () => {
    setPrivileges([...privileges, { grantee: '', usage: false, create: false }])
  }

  const removePrivilegeRow = (idx: number) => {
    setPrivileges(privileges.filter((_, i) => i !== idx))
  }

  const updatePrivilege = (idx: number, field: keyof PrivilegeRow, value: string | boolean) => {
    setPrivileges(privileges.map((row, i) =>
      i === idx ? { ...row, [field]: value } : row
    ))
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Schema name is required')
      return
    }

    setCreating(true)
    try {
      const privs = privileges
        .filter(p => p.grantee.trim())
        .map(p => {
          const perms: string[] = []
          if (p.usage) perms.push('USAGE')
          if (p.create) perms.push('CREATE')
          return { grantee: p.grantee.trim(), privileges: perms }
        })

      await schemaService.createSchema(
        conn.id,
        trimmed,
        owner.trim() || undefined,
        comment.trim() || undefined,
        privs.length > 0 ? privs : undefined,
      )
      toast.success(`Schema "${trimmed}" created`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(`Failed to create schema: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setCreating(false)
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-muted border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[220px]" data-drag-handle>
          <Database className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">Create Schema</p>
            <p className="text-[var(--ch-text-10)] text-muted-foreground truncate">{conn.name}</p>
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
    <div className="fixed z-50 w-[480px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="bg-muted border border-border rounded-xl shadow-2xl max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border cursor-grab active:cursor-grabbing" data-drag-handle>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold">Create Schema</h2>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 py-2 bg-background border-b border-border">
          <div className="flex gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[var(--ch-text-9)] font-bold uppercase tracking-widest border transition-all',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
                )}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'general' && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-[var(--ch-text-10)] font-semibold text-foreground mb-1">
                  Schema Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my_schema"
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="block text-[var(--ch-text-10)] font-semibold text-foreground mb-1">
                  Owner
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="postgres (default)"
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="block text-[var(--ch-text-10)] font-semibold text-foreground mb-1">
                  Comment
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional description for this schema"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-1.5 text-[var(--ch-text-10)] text-muted-foreground mb-1">
                <Info className="w-3 h-3" />
                Grant privileges on this schema to roles or users.
              </div>

              {privileges.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 p-2 bg-background border border-border rounded-md"
                >
                  <input
                    type="text"
                    value={row.grantee}
                    onChange={(e) => updatePrivilege(idx, 'grantee', e.target.value)}
                    placeholder="role_or_user"
                    className="flex-1 min-w-0 px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  />
                  <label className="flex items-center gap-1 text-[var(--ch-text-9)] text-muted-foreground cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={row.usage}
                      onChange={(e) => updatePrivilege(idx, 'usage', e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/30"
                    />
                    USAGE
                  </label>
                  <label className="flex items-center gap-1 text-[var(--ch-text-9)] text-muted-foreground cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={row.create}
                      onChange={(e) => updatePrivilege(idx, 'create', e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/30"
                    />
                    CREATE
                  </label>
                  <button
                    onClick={() => removePrivilegeRow(idx)}
                    className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <button
                onClick={addPrivilegeRow}
                className="flex items-center gap-1 px-2.5 py-1 text-[var(--ch-text-9)] font-bold text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add Privilege
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-1.5 px-4 py-2.5 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[var(--ch-text-10)] font-semibold text-muted-foreground bg-background rounded-md hover:bg-background/80 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className={cn(
              'px-3 py-1.5 text-[var(--ch-text-10)] font-semibold rounded-md transition-all flex items-center gap-1',
              creating || !name.trim()
                ? 'bg-primary/50 text-primary-foreground/50 cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            <Database className="w-3 h-3" />
            {creating ? 'Creating...' : 'Create Schema'}
          </button>
        </div>
      </div>
    </div>
  )
}
