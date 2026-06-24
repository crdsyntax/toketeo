import { BarChart3, Table2 } from 'lucide-react'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import type { DbRow } from '@/types/database'

interface VisualizePanelProps {
  sortedRows: DbRow[]
}

export function VisualizePanel({ sortedRows }: VisualizePanelProps) {
  if (!sortedRows.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none">
        <BarChart3 className="w-8 h-8 opacity-20" />
        <span className="text-xs italic">Run a query to visualize results</span>
      </div>
    )
  }

  return (
    <FeatureGate perkId="data_visualizer">
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">Data Visualizer</h3>
        <p className="text-sm max-w-xs">
          Interactive charts and graphs powered by your query results.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-md">
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Bar</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Table2 className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Line</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Table2 className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Pie</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-4">
          {sortedRows.length} rows available — chart library coming soon
        </p>
      </div>
    </FeatureGate>
  )
}
