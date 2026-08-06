import { Zap, Keyboard, Trophy, Target } from 'lucide-react'
import { useGamificationStore } from '@/store/gamificationStore'

const TIPS = [
  { id: 'shortcuts', icon: Keyboard, title: 'Keyboard Shortcuts', desc: 'Ctrl+Enter to execute, Ctrl+S to save, Ctrl+Tab to switch tabs.' },
  { id: 'explorer', icon: Target, title: 'Object Explorer', desc: 'Browse tables, views, indexes, and more from the left sidebar.' },
  { id: 'diagrams', icon: Zap, title: 'ERD Diagrams', desc: 'Visualize table relationships with the Diagram tool in the navigation bar.' },
  { id: 'gamification', icon: Trophy, title: 'Level Up!', desc: 'Execute queries, edit rows, and export data to earn XP and unlock features.' },
]

export function UsagePanel() {
  const level = useGamificationStore((s) => s.level)
  const xp = useGamificationStore((s) => s.xp)
  const streak = useGamificationStore((s) => s.streak)
  const progress = useGamificationStore((s) => s.progress)
  const totalQueries = progress.EXECUTE_QUERY ?? 0

  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-primary" />
          App Usage Tips
        </h3>
        <p className="text-xs text-muted-foreground">Get the most out of Toketeo.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-primary">{level}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">Level</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-foreground">{xp}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">Total XP</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-amber-500">{streak}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">Day Streak</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-emerald-500">{totalQueries}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">Queries Run</p>
        </div>
      </div>

      <section>
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <LightbulbIcon className="w-3.5 h-3.5 text-muted-foreground" />
          Quick Tips
        </h4>
        <div className="space-y-2">
          {TIPS.map((tip) => (
            <div key={tip.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/20 border border-border">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <tip.icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{tip.title}</p>
                <p className="text-[var(--ch-text-10)] text-muted-foreground leading-relaxed">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function LightbulbIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5C7.7 12.8 8 14.5 8 16" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}
