import { Outlet, Link, useLocation } from 'react-router-dom'
import { Database, LayoutGrid, Terminal, Settings, Activity, FileText, Globe, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { Environment } from '@/types/database'
import { SchemaSelector } from '@/components/layout/SchemaSelector'

export default function MainLayout() {
  const location = useLocation()
  const activeConnection = useAppStore((state) => state.activeConnection)

  const navItems = [
    { name: 'Connections', icon: Database, path: '/' },
    { name: 'Explorer', icon: LayoutGrid, path: '/explorer' },
    { name: 'Query Editor', icon: Terminal, path: '/query' },
    { name: 'Logs', icon: Activity, path: '/logs' },
    { name: 'Audit', icon: FileText, path: '/audit' },
  ]

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-border bg-muted/20 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">Toketeo</span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md transition-all text-sm font-medium",
                  location.pathname === item.path 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          {activeConnection && (
            <div className="flex items-center gap-4 border-r border-border pr-4 mr-2">
              <SchemaSelector />
              <div className={cn(
                "flex items-center gap-3 px-4 py-1.5 rounded-full border shadow-sm transition-all duration-300",
                activeConnection.environment === Environment.PRODUCTION 
                  ? "bg-red-500/10 border-red-500/20 text-red-600 shadow-red-500/5" 
                  : activeConnection.environment === Environment.STAGING
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-600"
                  : "bg-primary/5 border-primary/10 text-primary"
              )}>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black uppercase tracking-tighter leading-none opacity-80">
                    {activeConnection.environment}
                  </span>
                  <span className="text-sm font-bold leading-tight truncate max-w-[180px]">
                    {activeConnection.name}
                  </span>
                </div>
                <div className={cn(
                  "p-1.5 rounded-lg shadow-sm",
                  activeConnection.environment === Environment.PRODUCTION ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
                )}>
                  {activeConnection.ssh ? <Shield className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                </div>
              </div>
            </div>
          )}

          <Link
            to="/settings"
            className={cn(
              "p-2 rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground",
              location.pathname === '/settings' && "bg-muted text-foreground"
            )}
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
