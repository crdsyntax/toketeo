import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutGrid, Terminal, FileText, PanelLeftClose, PanelLeftOpen,
  CheckCircle, Loader2, RotateCcw, AlertTriangle, GitBranch, Palette,
  CalendarClock, Sparkles, Flame, Shield, Star
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS } from '@/lib/gamification'

interface NavItem {
  name: string
  icon: typeof LayoutGrid
  path: string
  perkId: string | null
}

const navGroups: NavItem[][] = [
  [
    { name: 'Explorer', icon: LayoutGrid, path: '/explorer', perkId: null },
    { name: 'Diagram', icon: GitBranch, path: '/diagram', perkId: 'schema_diagram' },
  ],
  [
    { name: 'Query Editor', icon: Terminal, path: '/query', perkId: null },
    { name: 'Audit', icon: FileText, path: '/audit', perkId: null },
    { name: 'Scheduler', icon: CalendarClock, path: '/scheduler', perkId: 'query_scheduler' },
    { name: 'DB Compare', icon: GitBranch, path: '/compare', perkId: 'multi_connection' },
  ],
  [
    { name: 'Assistant', icon: Sparkles, path: '/assistant', perkId: 'ai_assistant' },
    { name: 'Cross-DB Sync', icon: Star, path: '/cross-db-sync', perkId: 'multi_connection' },
  ],
  [
    { name: 'Settings', icon: Palette, path: '/settings', perkId: null },
    { name: 'Security', icon: Shield, path: '/security', perkId: null },
  ],
]

interface AppHeaderProps {
  onCommit: () => void
  onRollback: () => void
  isTransacting: boolean
  onOpenGamification: () => void
}

export function AppHeader({ onCommit, onRollback, isTransacting, onOpenGamification }: AppHeaderProps) {
  const location = useLocation()
  const { activeConnection, isSidebarOpen, toggleSidebar } = useAppStore()
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const { level, streak } = useGamificationStore()
  const isProduction = activeConnection?.environment?.toLowerCase() === 'production'

  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
      {/* Left: Sidebar toggle + Logo + Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-all duration-200"
          title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeftOpen className="w-5 h-5" />
          )}
        </button>

        <Link to="/" className="flex items-center gap-3 select-none group">
          <img
            src="./principal.png"
            alt="Toketeo"
            className="h-[70px] w-auto max-w-[220px] object-contain"
          />

        </Link>
      </div>

      {/* Center: Grouped nav with dividers */}
      <nav className="flex items-center gap-0">
        {navGroups.map((group, gi) => (
          <div key={gi} className="flex items-center">
            {gi > 0 && <div className="w-px h-5 bg-border/60 mx-2" />}
            <div className="flex items-center gap-0.5">
              {group.map((item) => {
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
                      "relative flex items-center justify-center w-10 h-10 transition-all duration-200 rounded-xl group/nav",
                      active
                        ? "bg-primary/10 text-primary"
                        : isLocked
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={
                      isLocked
                        ? `${item.name} — Unlock at Level ${requiredLevel}`
                        : item.name
                    }
                  >
                    <item.icon className={cn(
                      "w-[18px] h-[18px] transition-transform duration-200",
                      !isLocked && "group-hover/nav:scale-110",
                      isLocked && "opacity-40"
                    )} />
                    {active && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
                    )}

                    {/* Tooltip */}
                    <span className={cn(
                      "absolute top-full mt-2 px-2.5 py-1 rounded-md bg-zinc-800 text-white text-[11px] font-medium whitespace-nowrap",
                      "opacity-0 pointer-events-none transition-opacity duration-150 group-hover/nav:opacity-100",
                      "shadow-lg shadow-black/20 z-50"
                    )}>
                      {item.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Right: Production status + Commit/Rollback + Gamification */}
      <div className="flex items-center gap-3">
        {isProduction && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-full">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Production Mode</span>
          </div>
        )}

        {isProduction && activeConnection && (
          <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border">
            <button
              onClick={onRollback}
              disabled={isTransacting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all duration-200 disabled:opacity-50"
              title="Rollback Transaction"
            >
              <RotateCcw className={cn("w-3.5 h-3.5", isTransacting && "animate-spin")} />
              Rollback
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={onCommit}
              disabled={isTransacting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 rounded-md transition-all duration-200 disabled:opacity-50"
              title="Commit Transaction"
            >
              {isTransacting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {isTransacting ? 'Committing...' : 'Commit'}
            </button>
          </div>
        )}

        <div
          className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity select-none"
          onClick={onOpenGamification}
          title={`Level ${level} — ${streak} day streak`}
        >
          <span className="text-sm font-bold text-foreground/80">Lvl {level}</span>
          <span className="flex items-center gap-0.5 text-xs font-bold text-orange-400">
            <Flame className="w-3.5 h-3.5" />
            {streak}
          </span>
        </div>
      </div>
    </header>
  )
}
