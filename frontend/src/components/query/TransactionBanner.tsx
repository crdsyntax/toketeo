import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface TransactionBannerProps {
  connectionId: string
  startedAt: number
  onCommit: () => void
  onRollback: () => void
}

function useElapsed(startedAt: number): string {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  if (elapsed < 60) return `${elapsed}s`
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return `${m}m ${s}s`
}

export function TransactionBanner({
  onCommit,
  onRollback,
  startedAt,
}: TransactionBannerProps) {
  const elapsed = useElapsed(startedAt)
  const [pulse, setPulse] = useState(false)


  useEffect(() => {
    const id = setInterval(() => {
      setPulse(true)
      setTimeout(() => setPulse(false), 1200)
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-2 text-xs border-b transition-all duration-300',
        'bg-amber-950/60 border-amber-500/40 text-amber-200',
        pulse ? 'ring-2 ring-amber-400/60 ring-inset' : '',
      ].join(' ')}
      role="alert"
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span className="font-semibold text-amber-300">Open Transaction</span>
      <span className="text-amber-200/70">—</span>
      <span className="text-amber-200/80">
        Changes are pending and <strong className="text-amber-100">not yet visible</strong> to other sessions.
      </span>

      <span className="flex items-center gap-1 ml-auto text-amber-300/80 shrink-0">
        <Clock className="w-3 h-3" />
        {elapsed}
      </span>

      <button
        id="transaction-banner-rollback"
        onClick={onRollback}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-900/60 hover:bg-red-800/80 border border-red-500/50 text-red-300 hover:text-red-100 font-semibold transition-all duration-150 shrink-0"
        title="Execute ROLLBACK"
      >
        <XCircle className="w-3.5 h-3.5" />
        Rollback
      </button>

      <button
        id="transaction-banner-commit"
        onClick={onCommit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-500/50 text-emerald-300 hover:text-emerald-100 font-semibold transition-all duration-150 shrink-0"
        title="Execute COMMIT"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Commit
      </button>
    </div>
  )
}
