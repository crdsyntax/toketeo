import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Terminal, Trash2, Pause, Play } from 'lucide-react'
import { LogEntryItem } from '@/components/logs/LogEntryItem'

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Logs</h1>
          <p className="text-muted-foreground mt-1">Real-time server events Monitoring.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-none border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button 
            onClick={() => setLogs([])}
            className="flex items-center gap-2 px-3 py-1.5 rounded-none border border-border hover:bg-muted transition-colors text-sm font-medium text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#09090b] border border-border rounded-none overflow-hidden flex flex-col font-mono text-xs">
        <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2 text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span>Console Output</span>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 space-y-1"
        >
          {logs.length === 0 && (
            <div className="text-muted-foreground italic h-full flex items-center justify-center">
              Processing...
            </div>
          )}
          {logs.map((log, i) => (
            <LogEntryItem key={i} log={log} />
          ))}
        </div>
      </div>
    </div>
  )
}
