import { Outlet, Link, useLocation } from 'react-router-dom'
import { Database, LayoutGrid, Terminal, Settings, ChevronRight, Activity, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MainLayout() {
  const location = useLocation()

  const navItems = [
    { name: 'Connections', icon: Database, path: '/' },
    { name: 'Explorer', icon: LayoutGrid, path: '/explorer' },
    { name: 'Query Editor', icon: Terminal, path: '/query' },
    { name: 'Logs', icon: Activity, path: '/logs' },
    { name: 'Audit', icon: FileText, path: '/audit' },
  ]

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-muted/30 flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <Database className="w-6 h-6 text-primary" />
          <span className="font-bold text-xl tracking-tight">Toketeo</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                location.pathname === item.path 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-muted",
              location.pathname === '/settings' && "bg-muted"
            )}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Home</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium">
              {navItems.find(n => n.path === location.pathname)?.name || 'Dashboard'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Future user profile / status */}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
