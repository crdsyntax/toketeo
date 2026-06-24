import { CalendarClock } from 'lucide-react'
import { FeatureGate } from '@/components/gamification/FeatureGate'

export function SchedulerPage() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Query Scheduler
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Schedule queries to run on a recurring basis</p>
        </div>

        <FeatureGate perkId="query_scheduler">
          <div className="flex flex-col items-center justify-center text-muted-foreground p-12 text-center border border-dashed border-border rounded-xl bg-muted/20">
            <CalendarClock className="w-12 h-12 mb-4 opacity-30" />
            <h3 className="text-base font-semibold text-foreground mb-1">Scheduled Queries</h3>
            <p className="text-sm max-w-md">
              Create, manage, and monitor recurring query executions. Get notified when results are ready.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border text-left">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CalendarClock className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Daily Sales Report</p>
                  <p className="text-[10px] text-muted-foreground">Every day at 08:00 — coming soon</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border text-left">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CalendarClock className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Weekly Health Check</p>
                  <p className="text-[10px] text-muted-foreground">Every Monday at 06:00 — coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </FeatureGate>
      </div>
    </div>
  )
}
