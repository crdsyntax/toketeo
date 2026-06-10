import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Terminal, Trash2, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogEntry {
  level: string
  message: string
  context?: string
  stack?: string
  timestamp: string
}

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000/logs'

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isPausedRef = useRef(isPaused)
  
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    const socket = io(SOCKET_URL)
    socketRef.current = socket

    socket.on('log', (log: LogEntry) => {
      if (!isPausedRef.current) {
        setLogs((prev) => [...prev.slice(-99), log])
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, isPaused])

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'debug': return 'text-blue-400'
      case 'verbose': return 'text-purple-400'
      default: return 'text-green-400'
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Logs</h1>
          <p className="text-muted-foreground mt-1">Real-time server events via WebSockets.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button 
            onClick={() => setLogs([])}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#09090b] border border-border rounded-xl overflow-hidden flex flex-col font-mono text-xs">
        <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2 text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span>server-stdout</span>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 space-y-1"
        >
          {logs.length === 0 && (
            <div className="text-muted-foreground italic h-full flex items-center justify-center">
              Waiting for logs...
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i} className="flex gap-3 hover:bg-white/5 transition-colors py-0.5 px-1 rounded">
              <span className="text-muted-foreground shrink-0 select-none">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className={cn("font-bold uppercase shrink-0 w-16 select-none", getLevelColor(log.level))}>
                [{log.level}]
              </span>
              {log.context && (
                <span className="text-blue-300 shrink-0 select-none">
                  [{log.context}]
                </span>
              )}
              <span className="text-zinc-300 break-all">
                {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
              </span>
              {log.stack && !isPaused && (
                <pre className="mt-1 ml-16 p-2 bg-red-950/20 rounded border border-red-500/20 text-[10px] text-red-300/80 overflow-x-auto">
                  {log.stack}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
