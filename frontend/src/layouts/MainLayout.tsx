import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutGrid, Terminal, FileText, PanelLeftClose, PanelLeftOpen, CheckCircle, RotateCcw, AlertTriangle, GitBranch, Palette, CalendarClock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { ConnectionsSidebar } from '@/components/connections/ConnectionsSidebar'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import type { Connection, CreateConnectionDto } from '@/types/database'
import { useState, useEffect } from 'react'
import { ConnectionModal } from '@/components/connections/ConnectionModal'
import { LevelBadge } from '@/components/gamification/LevelBadge'
import { GamificationModal } from '@/components/gamification/GamificationModal'
import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS } from '@/lib/gamification'

export default function MainLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeConnection, setActiveConnection, isSidebarOpen, toggleSidebar } = useAppStore()
  const setMiniToast = useAppStore((state) => state.setMiniToast)

  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const isProduction = activeConnection?.environment?.toLowerCase() === 'production'

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const checkStreak = useGamificationStore(state => state.checkStreak)
  
  useEffect(() => {
    checkStreak()
  }, [checkStreak])

  const handleDisconnect = async (id: string) => {
    try {
      await connectionService.disconnect(id)
      if (activeConnection?.id === id) {
        setActiveConnection(null)
        const { setExplorerState } = useAppStore.getState()
        setExplorerState({ activeExplorerTabId: null })
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setMiniToast(id, { type: 'success', text: 'Disconnected' })
    } catch (error) {
      console.error('Failed to disconnect:', error)
      setMiniToast(id, { type: 'error', text: 'Failed to disconnect' })
    }
  }

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [isTransacting, setIsTransacting] = useState(false)

  const handleCommit = async () => {
    if (!activeConnection?.id) return
    setIsTransacting(true)
    try {
      await connectionService.commit(activeConnection.id)
      setMiniToast('tx', { type: 'success', text: 'Transaction Committed' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Commit failed'
      setMiniToast('tx', { type: 'error', text: message })
    } finally {
      setIsTransacting(false)
    }
  }

  const handleRollback = async () => {
    if (!activeConnection?.id) return
    setIsTransacting(true)
    try {
      await connectionService.rollback(activeConnection.id)
      setMiniToast('tx', { type: 'success', text: 'Transaction Rolled Back' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Rollback failed'
      setMiniToast('tx', { type: 'error', text: message })
    } finally {
      setIsTransacting(false)
    }
  }

  const { trackAction, addXP } = useGamificationStore();

  const saveMutation = useMutation({
    mutationFn: (payload: CreateConnectionDto) => {
      if (editingConnection?.id) {
        return connectionService.update(editingConnection.id, payload)
      }
      return connectionService.create(payload)
    },
    onSuccess: () => {
      if (!editingConnection?.id) {
        addXP(50); // XP for connection
        trackAction('CREATE_CONNECTION')
      }
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setIsModalOpen(false)
      setTestMessage(null)
    },
  })

  const handleTest = (payload: CreateConnectionDto) => {
    setIsTesting(true)
    setTestMessage(null)
    connectionService.test(payload).then(() => {
      setTestMessage({ type: 'success', text: 'Connection established successfully' })
    }).catch((err: Error) => {
      setTestMessage({ type: 'error', text: err.message || 'Operation failed' })
    }).finally(() => {
      setIsTesting(false)
    })
  }

  const handleConnect = async (conn: Connection) => {
    try {
      await connectionService.connect(conn)
      setActiveConnection(conn)
    } catch (error: unknown) {
      console.error('Failed to connect to database:', error)
    }
  }

  const handleEdit = (conn: Connection) => {
    setEditingConnection(conn)
    setIsModalOpen(true)
  }

  const navItems = [
    { name: 'Explorer', icon: LayoutGrid, path: '/explorer', perkId: null },
    { name: 'Diagram', icon: GitBranch, path: '/diagram', perkId: 'schema_diagram' },
    { name: 'Query Editor', icon: Terminal, path: '/query', perkId: null },
    { name: 'Audit', icon: FileText, path: '/audit', perkId: null },
    { name: 'Assistant', icon: Sparkles, path: '/assistant', perkId: 'ai_assistant' },
    { name: 'Settings', icon: Palette, path: '/settings', perkId: null },
    { name: 'Scheduler', icon: CalendarClock, path: '/scheduler', perkId: 'query_scheduler' },
    { name: 'Cross-DB Sync', icon: Sparkles, path: '/cross-db-sync', perkId: 'multi_connection' },
  ]

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <header className="h-20 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={toggleSidebar} className="p-2 hover:bg-muted rounded-md text-muted-foreground">
            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <div className="flex flex-col items-center justify-center select-none group cursor-default pt-2">
            <div className="relative mb-[-16px] z-10">
              <div className="absolute inset-0 bg-white/10 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <img 
                src="./logoOriginal.svg" 
                alt="Toketeo Logo" 
                className="relative w-12 h-12 object-contain brightness-0 invert transition-all duration-300 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.6)] drop-shadow-[0_0_10px_rgba(255,255,255,0.25)] group-hover:scale-110" 
              />
            </div>
            <div className="flex items-end justify-center leading-none mt-2">
              <span className="text-sm font-black tracking-[0.2em] text-foreground/80 mb-[3px] mx-[1px] transition-all duration-300 group-hover:text-foreground group-hover:tracking-[0.3em]">
                TOKETEO
              </span>

            </div>
          </div>
          <nav className="flex items-center ml-4 gap-0.5">
            {navItems.map((item) => {
              const isUnlocked = item.perkId ? unlockedPerks.includes(item.perkId) : true
              const isLocked = item.perkId !== null && !isUnlocked
              const perk = item.perkId ? APP_PERKS.find((p) => p.id === item.perkId) : null
              const requiredLevel = perk?.requiredLevel ?? 0
              const active = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={isLocked ? location.pathname : item.path}
                  onClick={(e) => { if (isLocked) e.preventDefault() }}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 transition-all rounded-xl relative group",
                    active
                      ? "bg-primary/10 text-primary"
                      : isLocked
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  title={
                    isLocked
                      ? `${item.name} — Unlock at Level ${requiredLevel}`
                      : item.name
                  }
                >
                  <item.icon className={cn("w-5 h-5", isLocked && "opacity-40")} />
                  {active && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <LevelBadge 
            className="mr-2" 
            onClick={() => setIsGamificationModalOpen(true)} 
          />
          
          {isProduction && (
            <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Production Mode</span>
            </div>
          )}
          
          {isProduction && activeConnection && (
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border">
              <button
                onClick={handleRollback}
                disabled={isTransacting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all disabled:opacity-50"
                title="Rollback Transaction"
              >
                <RotateCcw className={cn("w-3.5 h-3.5", isTransacting && "animate-spin")} />
                Rollback
              </button>
              <div className="w-[1px] h-4 bg-border mx-1" />
              <button
                onClick={handleCommit}
                disabled={isTransacting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 rounded-md transition-all disabled:opacity-50"
                title="Commit Transaction"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Commit
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <ConnectionsSidebar 
            connections={connections} 
            activeConnection={activeConnection} 
            onConnect={handleConnect} 
            onEdit={handleEdit}
            onNew={() => { setEditingConnection(null); setIsModalOpen(true); }}
            onDisconnect={handleDisconnect}
          />
        )}
        <main className="flex-1 overflow-auto p-2">
          <Outlet />
        </main>
      </div>

      <ConnectionModal 
        key={editingConnection?.id || 'new'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveMutation.mutate}
        onTest={handleTest}
        editingConnection={editingConnection}
        isSaving={saveMutation.isPending}
        isTesting={isTesting}
        testMessage={testMessage}
      />

      <GamificationModal 
        isOpen={isGamificationModalOpen} 
        onClose={() => setIsGamificationModalOpen(false)} 
      />
    </div>
  )
}
