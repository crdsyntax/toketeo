import { Table, Layout, Code, RefreshCw, Search, RefreshCw as RefreshIcon, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  sidebarTab: 'tables' | 'views' | 'procedures' | 'triggers'
  setSidebarTab: (tab: 'tables' | 'views' | 'procedures' | 'triggers') => void
  currentSchema: string
  handleRefetch: () => void
  isLoadingSidebar: boolean
  search: string
  setSearch: (s: string) => void
  filteredItems: any[]
  selectedItem: any
  setSelectedItem: (item: any) => void
  setPage: (page: number) => void
  setSocketResults: (res: any) => void
  setExecutionStatus: (status: any) => void
  setExecutionError: (err: any) => void
  setParamsValues: (v: any) => void
  setActiveTab: (tab: any) => void
}

export function Sidebar({
  sidebarTab, setSidebarTab, currentSchema, handleRefetch, isLoadingSidebar,
  search, setSearch, filteredItems, selectedItem, setSelectedItem,
  setPage, setSocketResults, setExecutionStatus, setExecutionError,
  setParamsValues, setActiveTab
}: SidebarProps) {
  return (
    <div className="w-80 flex border border-border rounded-xl bg-card overflow-hidden shrink-0">
      <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-border bg-muted/20">
        <button onClick={() => setSidebarTab('tables')} title="Tables" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'tables' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Table className="w-5 h-5" />
        </button>
        <button onClick={() => setSidebarTab('views')} title="Views" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'views' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Layout className="w-5 h-5" />
        </button>
        <button onClick={() => setSidebarTab('procedures')} title="Procedures" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'procedures' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <Code className="w-5 h-5" />
        </button>
        <button onClick={() => setSidebarTab('triggers')} title="Triggers" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'triggers' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex flex-col gap-0.5 text-xs text-left">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest truncate max-w-[140px]">{currentSchema}</span>
              <div className="flex items-center gap-2">
                {sidebarTab === 'tables' && <Table className="w-3 h-3 text-primary" />}
                {sidebarTab === 'views' && <Layout className="w-3 h-3 text-primary" />}
                {sidebarTab === 'procedures' && <Code className="w-3 h-3 text-primary" />}
                {sidebarTab === 'triggers' && <RefreshCw className="w-3 h-3 text-primary" />}
                <span className="capitalize">{sidebarTab}</span>
              </div>
            </h3>
            <button onClick={handleRefetch} className="p-1.5 hover:bg-muted rounded-md transition-colors">
              <RefreshIcon className={cn("w-3.5 h-3.5", isLoadingSidebar && "animate-spin")} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${sidebarTab}...`} className="w-full bg-muted/50 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 text-left">
          {isLoadingSidebar ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Results ({filteredItems?.length || 0})</div>
              {filteredItems?.map((item) => (
                <button key={item.name} onClick={() => {
                  const type = sidebarTab === 'tables' ? 'table' : sidebarTab === 'views' ? 'view' : sidebarTab === 'procedures' ? 'procedure' : 'trigger';
                  setSelectedItem({ name: item.name, type })
                  setPage(0)
                  setSocketResults(null)
                  setExecutionStatus('idle')
                  setExecutionError(null)
                  setParamsValues({})
                  setActiveTab(type === 'table' ? 'columns' : 'ddl')
                }} className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors group text-left", 
                  (selectedItem?.name === item.name) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                )}>
                  {sidebarTab === 'tables' && <Table className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === 'views' && <Layout className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === 'procedures' && <Code className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                  {sidebarTab === 'triggers' && <RefreshCw className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
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
