import { Link, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Terminal, FileText, PanelLeftClose, PanelLeftOpen,
  GitBranch, Palette, CalendarClock, Sparkles, Flame, Shield, Star, Gauge
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType } from '@/types/database'
import { useAppStore } from '@/store/useAppStore'
import { useAssistantStore } from '@/store/assistantStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { APP_PERKS } from '@/lib/gamification'
import { getEngineConfig } from '@/lib/engine-icons'
import { NotificationBell } from './NotificationBell'

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
    { name: 'Monitor', icon: Gauge, path: '/monitor', perkId: null },
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
  onOpenGamification: () => void
}

export function AppHeader({ onOpenGamification }: AppHeaderProps) {
  const location = useLocation()
  const { activeConnection, isSidebarOpen, toggleSidebar } = useAppStore()
  const unlockedPerks = useGamificationStore((s) => s.unlockedPerks)
  const { level, streak } = useGamificationStore()
  const showAssistant = useAssistantStore((s) => s.showAssistant)
  const activeEngineType = activeConnection?.type ?? null

  const enginePills: DatabaseType[] = [
    DatabaseType.POSTGRES,
    DatabaseType.MARIADB,
    DatabaseType.MYSQL,
    DatabaseType.MONGODB,
    DatabaseType.SQLSERVER,
    DatabaseType.SQLITE,
    DatabaseType.REDIS,
  ]

  return (
    <header className="h-12 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-3 shrink-0 relative z-40">
      {/* Left: Sidebar toggle + Logo + Name */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-accent-muted rounded-lg text-muted-foreground hover:text-accent transition-all duration-200"
          title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </button>

        <Link to="/" className="flex items-center gap-2 select-none group">
          <img
            src="./principal.png"
            alt="Toketeo"
            className="h-[52px] w-auto max-w-[160px] object-contain"
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
                      "relative flex items-center justify-center w-9 h-9 transition-all duration-200 rounded-lg group/nav",
                      active
                        ? "bg-accent-muted text-accent"
                        : isLocked
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-accent-muted hover:text-accent"
                    )}
                    title={
                      isLocked
                        ? `${item.name} — Unlock at Level ${requiredLevel}`
                        : item.name
                    }
                  >
                    <item.icon className={cn(
                      "w-[16px] h-[16px] transition-transform duration-200",
                      !isLocked && "group-hover/nav:scale-110",
                      isLocked && "opacity-40"
                    )} />
                    {active && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-accent" />
                    )}

                    {/* Tooltip */}
                    <span className={cn(
                      "absolute top-full mt-1.5 px-2 py-1 rounded-md bg-surface-elevated border border-border text-foreground text-[length:var(--ch-text-11)] font-medium whitespace-nowrap",
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

      {/* Right: Engine pills + Gamification */}
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-0.5 p-0.5 bg-surface border border-border rounded-lg">
          {enginePills.map((type) => {
            const config = getEngineConfig(type)
            const isActive = activeEngineType === type
            return (
              <span
                key={type}
                title={config.label}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider select-none transition-all duration-200',
                  isActive
                    ? cn(config.bgClass, config.textClass, config.borderClass, 'border')
                    : 'text-muted-foreground/60'
                )}
              >
                {type.toUpperCase()}
              </span>
            )
          })}
        </div>

        <button
          onClick={() => useAssistantStore.getState().setShowAssistant(!showAssistant)}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200',
            showAssistant
              ? 'bg-accent-muted text-accent'
              : 'text-muted-foreground hover:bg-accent-muted hover:text-accent'
          )}
          title="AI Assistant (Ctrl+I)"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <NotificationBell />

        <div
          className="flex items-center gap-1.5 cursor-pointer hover:text-accent transition-colors select-none px-2 py-1 rounded-md hover:bg-accent-muted"
          onClick={onOpenGamification}
          title={`Level ${level} — ${streak} day streak`}
        >
          <span className="text-xs font-bold text-foreground/80">Lvl {level}</span>
          <span className="flex items-center gap-0.5 text-[var(--ch-text-11)] font-bold text-amber-500">
            <Flame className="w-3 h-3" />
            {streak}
          </span>
        </div>
      </div>
    </header>
  )
}
