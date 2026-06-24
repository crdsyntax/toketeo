import { useNavigate } from 'react-router-dom'
import { Database, Table2, ExternalLink, Hash, AlertTriangle } from 'lucide-react'

export function StructuresPanel() {
  const navigate = useNavigate()
  // We don't have a connection store imported, but we can show guidance
  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-primary" />
          Database Structures
        </h3>
        <p className="text-xs text-muted-foreground">Explore and analyze your database schema.</p>
      </div>

      <button
        onClick={() => navigate('/explorer')}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Table2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">Open Schema Explorer</p>
          <p className="text-[10px] text-muted-foreground">Browse tables, columns, indexes, and more</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <section>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
          Quick Tips
        </h4>
        <div className="space-y-2">
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border">
            <p className="text-xs font-medium text-foreground">Missing Primary Keys</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Tables without a primary key can cause performance issues and make row-level operations unsafe.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border">
            <p className="text-xs font-medium text-foreground">Foreign Key Relationships</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Use the Diagram tool to visualize table relationships and detect missing indexes on foreign keys.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border">
            <p className="text-xs font-medium text-foreground">Index Suggestions</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Columns used in WHERE, JOIN, and ORDER BY clauses are good candidates for indexing.</p>
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Schema Checklist
        </h4>
        <div className="space-y-1.5">
          {[
            { label: 'Tables have primary keys', done: null },
            { label: 'Foreign keys are indexed', done: null },
            { label: 'No duplicate indexes', done: null },
            { label: 'Column types are appropriate', done: null },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border">
              <div className="w-4 h-4 rounded border border-muted-foreground/30 flex items-center justify-center">
                <span className="text-[8px] text-muted-foreground">?</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
