import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, CheckCheck, CheckCircle2, XCircle, Info, AlertTriangle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificationStore, type AppNotification, type NotificationType } from '@/store/notificationStore'

const TYPE_META: Record<NotificationType, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-500' },
  error: { icon: XCircle, className: 'text-red-500' },
  info: { icon: Info, className: 'text-blue-500' },
  warning: { icon: AlertTriangle, className: 'text-amber-500' },
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, remove, clear } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) {
      markAllRead()
    }
  }

  const renderItem = (n: AppNotification) => {
    const meta = TYPE_META[n.type]
    const Icon = meta.icon
    return (
      <div
        key={n.id}
        onClick={() => markRead(n.id)}
        className={cn(
          'group flex items-start gap-2.5 px-3 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-muted/40',
          !n.read && 'bg-muted/20',
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', meta.className)} />
        <div className="flex-1 min-w-0">
          {n.title && (
            <div className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground truncate">
              {n.title}
            </div>
          )}
          <div className="text-[var(--ch-text-11)] text-foreground break-words leading-snug">{n.message}</div>
          <div className="text-[var(--ch-text-9)] text-muted-foreground/60 mt-0.5">{timeAgo(n.timestamp)}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); remove(n.id) }}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          title="Dismiss"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className={cn(
          'relative p-2 rounded-lg text-muted-foreground hover:bg-accent-muted hover:text-accent transition-all duration-200',
          open && 'bg-accent-muted text-accent',
        )}
        title="Notifications"
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[var(--ch-text-8)] font-bold flex items-center justify-center shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-elevated border border-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60 bg-muted/20">
            <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-foreground">
              Notifications
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={clear}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={markAllRead}
                className="p-1.5 rounded-md text-muted-foreground hover:text-accent hover:bg-muted transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Bell className="w-6 h-6 opacity-40" />
                <span className="text-[var(--ch-text-11)]">No notifications yet</span>
              </div>
            ) : (
              notifications.map(renderItem)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
