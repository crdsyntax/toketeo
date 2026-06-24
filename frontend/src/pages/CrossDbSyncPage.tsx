import { GitBranch } from 'lucide-react'
import { FeatureGate } from '@/components/gamification/FeatureGate'

export function CrossDbSyncPage() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            Cross-DB Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Synchronize data across multiple database engines</p>
        </div>

        <FeatureGate perkId="multi_connection">
          <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border rounded-xl bg-muted/20">
            <GitBranch className="w-12 h-12 mb-4 opacity-30" />
            <h3 className="text-base font-semibold text-foreground mb-1">Cross-Database Sync</h3>
            <p className="text-sm max-w-md">
              Connect multiple database types and sync data between them with configurable pipelines.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border text-left">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">PostgreSQL → ClickHouse</p>
                  <p className="text-[10px] text-muted-foreground">OLTP to analytics — coming soon</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border text-left">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">MySQL → MongoDB</p>
                  <p className="text-[10px] text-muted-foreground">Relational to document — coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </FeatureGate>
      </div>
    </div>
  )
}
