import type { DatabaseObject, QueryResult } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseObjectType } from '@/types/database'
import { Table2, Eye, Terminal, Zap, Search, RefreshCw as RefreshIcon, ChevronRight, Binary } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void
  currentSchema: string
  handleRefetch: () => void
  isLoadingSidebar: boolean
  search: string
  setSearch: (s: string) => void
  filteredItems: { name: string }[]
  selectedItem: DatabaseObject | null
  setSelectedItem: (item: DatabaseObject) => void
  setPage: (page: number) => void
  setSocketResults: (res: QueryResult | null) => void
  setExecutionStatus: (status: ExecutionStatus) => void
  setExecutionError: (err: string | null) => void
  setParamsValues: (v: Record<string, string>) => void
  setActiveTab: (tab: ExplorerTab) => void
  isCollapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({
  sidebarTab, setSidebarTab, currentSchema, handleRefetch, isLoadingSidebar,
  search, setSearch, filteredItems, selectedItem, setSelectedItem,
  setPage, setSocketResults, setExecutionStatus, setExecutionError,
  setParamsValues, setActiveTab, isCollapsed, onToggle
}: SidebarProps) {
  return (
    <div className={cn(
      "flex border border-border rounded-none bg-card overflow-hidden shrink-0 transition-all duration-300",
      isCollapsed ? "w-12" : "w-80"
    )}>
      <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-border bg-muted/20">
        <button 
          onClick={onToggle}
          className="p-2 hover:bg-muted text-muted-foreground mb-2 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <ChevronRight className={cn("w-5 h-5 transition-transform", !isCollapsed && "rotate-180")} />
        </button>
        <div className="w-full h-px bg-border/50 mb-2" />
        <button onClick={() => { setSidebarTab(SidebarTab.TABLES); if(isCollapsed && onToggle) onToggle(); }} title="Tables" className={cn("p-2 rounded-none transition-colors", sidebarTab === SidebarTab.TABLES ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Table2 className="w-5 h-5" />
        </button>
        <button onClick={() => { setSidebarTab(SidebarTab.VIEWS); if(isCollapsed && onToggle) onToggle(); }} title="Views" className={cn("p-2 rounded-none transition-colors", sidebarTab === SidebarTab.VIEWS ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Eye className="w-5 h-5" />
        </button>
        <button onClick={() => { setSidebarTab(SidebarTab.PROCEDURES); if(isCollapsed && onToggle) onToggle(); }} title="Procedures" className={cn("p-2 rounded-none transition-colors", sidebarTab === SidebarTab.PROCEDURES ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Terminal className="w-5 h-5" />
        </button>
        <button onClick={() => { setSidebarTab(SidebarTab.TRIGGERS); if(isCollapsed && onToggle) onToggle(); }} title="Triggers" className={cn("p-2 rounded-none transition-colors", sidebarTab === SidebarTab.TRIGGERS ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Zap className="w-5 h-5" />
        </button>
        <button onClick={() => { setSidebarTab(SidebarTab.FUNCTIONS); if(isCollapsed && onToggle) onToggle(); }} title="Functions" className={cn("p-2 rounded-none transition-colors", sidebarTab === SidebarTab.FUNCTIONS ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Binary className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex flex-col gap-0.5 text-xs text-left overflow-hidden">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">{currentSchema || 'No Database'}</span>
              <div className="flex items-center gap-2">
                {sidebarTab === SidebarTab.TABLES && <Table2 className="w-3 h-3 text-primary" />}
                {sidebarTab === SidebarTab.VIEWS && <Eye className="w-3 h-3 text-primary" />}
                {sidebarTab === SidebarTab.PROCEDURES && <Terminal className="w-3 h-3 text-primary" />}
                {sidebarTab === SidebarTab.TRIGGERS && <Zap className="w-3 h-3 text-primary" />}
                {sidebarTab === SidebarTab.FUNCTIONS && <Binary className="w-3 h-3 text-primary" />}
                <span className="capitalize">{sidebarTab}</span>
              </div>
            </h3>
            <button onClick={handleRefetch} className="p-1.5 hover:bg-muted rounded-none transition-colors shrink-0">
              <RefreshIcon className={cn("w-3.5 h-3.5", isLoadingSidebar && "animate-spin")} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${sidebarTab}...`} className="w-full bg-muted/50 border border-border rounded-none pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 text-left">
          {isLoadingSidebar ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded-none" />)}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Results ({filteredItems?.length || 0})</div>
              {filteredItems?.map((item) => (
                <button key={item.name} onClick={() => {
                  let type: DatabaseObjectType;
                  switch (sidebarTab) {
                    case SidebarTab.TABLES: type = DatabaseObjectType.TABLE; break;
                    case SidebarTab.VIEWS: type = DatabaseObjectType.VIEW; break;
                    case SidebarTab.PROCEDURES: type = DatabaseObjectType.PROCEDURE; break;
                    case SidebarTab.TRIGGERS: type = DatabaseObjectType.TRIGGER; break;
                    case SidebarTab.FUNCTIONS: type = DatabaseObjectType.FUNCTION; break;
                  }
                  
                  setSelectedItem({ name: item.name, type })
                  setPage(0)
                  setSocketResults(null)
                  setExecutionStatus(ExecutionStatus.IDLE)
                  setExecutionError(null)
                  setParamsValues({})
                  setActiveTab((type === DatabaseObjectType.TABLE || type === DatabaseObjectType.VIEW) ? ExplorerTab.DATA : ExplorerTab.DDL)
                }} className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-none transition-colors group text-left", 
                  (selectedItem?.name === item.name) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                )}>
                  {sidebarTab === SidebarTab.TABLES && <Table2 className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === SidebarTab.VIEWS && <Eye className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === SidebarTab.PROCEDURES && <Terminal className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === SidebarTab.TRIGGERS && <Zap className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === SidebarTab.FUNCTIONS && <Binary className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  <span className="truncate flex-1">{item.name}</span>
                  <ChevronRight className={cn("w-3 h-3 transition-opacity", (selectedItem?.name === item.name) ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
