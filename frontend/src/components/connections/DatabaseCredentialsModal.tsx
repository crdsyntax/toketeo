import { useEffect, useState } from 'react'
import { KeyRound, X, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { schemaService } from '@/services/schema.service'
import toast from 'react-hot-toast'

interface DatabaseCredentialsModalProps {
  connId: string
  connName: string
  database: string
  onClose: () => void
  onSaved?: () => void
}

const REDACTED = '********'

export function DatabaseCredentialsModal({ connId, connName, database, onClose, onSaved }: DatabaseCredentialsModalProps) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [authSource, setAuthSource] = useState('')
  const [hasExisting, setHasExisting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cred = await schemaService.getDatabaseCredential(connId, database)
        if (cancelled) return
        if (cred) {
          setHasExisting(true)
          setUser(cred.user)
          setPassword(cred.password === REDACTED ? '' : (cred.password ?? ''))
          setAuthSource(cred.authSource ?? '')
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(`Failed to load credentials: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [connId, database])

  const handleSave = async () => {
    setSaving(true)
    try {
      await schemaService.saveDatabaseCredential(connId, database, user, password, authSource)
      toast.success(`Credentials saved for "${database}"`)
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(`Failed to save credentials: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await schemaService.deleteDatabaseCredential(connId, database)
      toast.success(`Credentials removed for "${database}"`)
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(`Failed to remove credentials: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed z-[120] inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] max-w-[90vw] bg-muted border border-border rounded-xl shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold text-foreground">Database Credentials</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-[var(--ch-text-10)] text-muted-foreground">
            Credentials for <span className="font-semibold text-foreground">{database}</span> on{' '}
            <span className="font-semibold text-foreground">{connName}</span>. When set, these override
            the connection-level credentials for this MongoDB database.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[var(--ch-text-9)] font-semibold text-muted-foreground">
                  Username
                </label>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="mongodb user"
                  className="w-full px-3 py-1.5 text-[var(--ch-text-10)] bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[var(--ch-text-9)] font-semibold text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasExisting ? 'Leave blank to keep current password' : 'mongodb password'}
                  className="w-full px-3 py-1.5 text-[var(--ch-text-10)] bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {hasExisting && (
                  <p className="text-[var(--ch-text-9)] text-muted-foreground/60">
                    A password is already stored. Leave blank to keep it.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[var(--ch-text-9)] font-semibold text-muted-foreground">
                  Auth Source
                </label>
                <input
                  value={authSource}
                  onChange={(e) => setAuthSource(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full px-3 py-1.5 text-[var(--ch-text-10)] bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[var(--ch-text-9)] text-muted-foreground/60">
                  Optional. The authentication database (defaults to the connection's auth source).
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          <button
            onClick={handleDelete}
            disabled={deleting || loading || !hasExisting}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[var(--ch-text-10)] font-bold rounded-lg transition-all',
              'text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Remove
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[var(--ch-text-10)] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-background transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[var(--ch-text-10)] font-bold rounded-lg transition-all',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}