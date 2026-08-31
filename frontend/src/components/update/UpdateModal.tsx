import { useEffect } from 'react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import { X, Download, RefreshCw, ArrowUpRight } from 'lucide-react'
import { useUpdateStore } from '@/store/updateStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const HOURLY_CHECK_MS = 60 * 60 * 1000

export function UpdateModal() {
  const { update, modalOpen, downloading, progress, error, checkNow, dismiss, installNow, clearError } =
    useUpdateStore()

  useEffect(() => {
    checkNow(true)
    const interval = setInterval(() => checkNow(false), HOURLY_CHECK_MS)
    return () => clearInterval(interval)
  }, [checkNow])

  useEffect(() => {
    if (error) {
      toast.error(error)
      clearError()
    }
  }, [error, clearError])

  if (!modalOpen || !update) return null

  const percentage =
    progress && progress.totalBytes && progress.totalBytes > 0
      ? Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100)
      : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-[520px] max-w-[90vw] max-h-[85vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">

        <div className="relative p-6 bg-gradient-to-br from-accent/10 via-background to-background border-b border-border">
          <button
            onClick={dismiss}
            disabled={downloading}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Not now"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-muted text-accent flex items-center justify-center shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <Badge variant="default" size="sm" className="mb-1.5 uppercase tracking-wider">
                New version
              </Badge>
              <h2 className="text-xl font-black">Toketeo has an update</h2>
            </div>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto p-6 bg-muted/10 space-y-4">

          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">
                Current version
              </p>
              <p className="text-lg font-black text-muted-foreground">v{update.currentVersion}</p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-accent shrink-0" />
            <div className="flex-1 rounded-xl border border-accent/30 bg-accent-muted/40 p-4 text-center">
              <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-accent/70 mb-1">
                New version
              </p>
              <p className="text-lg font-black text-accent">v{update.version}</p>
            </div>
          </div>

          {update.date && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Published on {dayjs(update.date).format('MM/DD/YYYY')}
            </p>
          )}


          {update.body && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Release notes
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{update.body}</p>
            </div>
          )}


          {downloading && (
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full bg-accent transition-all duration-300', percentage === null && 'w-1/3 animate-pulse')}
                  style={percentage !== null ? { width: `${percentage}%` } : undefined}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {percentage !== null
                  ? `Downloading… ${percentage.toFixed(0)}%`
                  : 'Downloading update…'}
              </p>
            </div>
          )}
        </div>


        <div className="border-t border-border bg-card p-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={dismiss} disabled={downloading}>
            Not now
          </Button>
          <Button onClick={installNow} disabled={downloading} loading={downloading}>
            <Download className="w-4 h-4" />
            Update now
          </Button>
        </div>
      </div>
    </div>
  )
}
