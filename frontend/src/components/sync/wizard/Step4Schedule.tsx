import { Clock, Play, Repeat, Terminal } from 'lucide-react'

interface Step4ScheduleProps {
  schedule: 'once' | 'recurring' | 'cron'
  onScheduleChange: (v: 'once' | 'recurring' | 'cron') => void
  cronExpression: string
  onCronExpressionChange: (v: string) => void
}

export function Step4Schedule({
  schedule,
  onScheduleChange,
  cronExpression,
  onCronExpressionChange,
}: Step4ScheduleProps) {
  return (
    <div className="space-y-6">
      <p className="text-[10px] text-muted-foreground">
        Define cuándo se ejecutará esta sincronización. Puedes ejecutarla una vez ahora o programarla para que se repita automáticamente.
      </p>

      <div className="space-y-3">
        <label className={`flex items-center gap-4 p-4 border cursor-pointer transition-all ${schedule === 'once' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
          <input
            type="radio"
            name="schedule"
            value="once"
            checked={schedule === 'once'}
            onChange={() => onScheduleChange('once')}
            className="sr-only"
          />
          <div className={`w-10 h-10 flex items-center justify-center ${schedule === 'once' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <Play className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold">Ejecutar una vez ahora</p>
            <p className="text-[10px] text-muted-foreground">La sincronización se ejecutará inmediatamente después de crearla.</p>
          </div>
        </label>

        <label className={`flex items-center gap-4 p-4 border cursor-pointer transition-all ${schedule === 'recurring' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
          <input
            type="radio"
            name="schedule"
            value="recurring"
            checked={schedule === 'recurring'}
            onChange={() => onScheduleChange('recurring')}
            className="sr-only"
          />
          <div className={`w-10 h-10 flex items-center justify-center ${schedule === 'recurring' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold">Repetir automáticamente</p>
            <p className="text-[10px] text-muted-foreground">Ejecutar cada: 1h · 6h · 12h · 24h · semanal</p>
          </div>
        </label>

        {schedule === 'recurring' && (
          <div className="flex gap-2 pl-14">
            {['1h', '6h', '12h', '24h', 'semanal'].map((opt) => (
              <button
                key={opt}
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-border bg-background hover:border-primary transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <label className={`flex items-center gap-4 p-4 border cursor-pointer transition-all ${schedule === 'cron' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
          <input
            type="radio"
            name="schedule"
            value="cron"
            checked={schedule === 'cron'}
            onChange={() => onScheduleChange('cron')}
            className="sr-only"
          />
          <div className={`w-10 h-10 flex items-center justify-center ${schedule === 'cron' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold">Programación personalizada (CRON)</p>
            <p className="text-[10px] text-muted-foreground">Para usuarios avanzados — define una expresión cron.</p>
          </div>
        </label>

        {schedule === 'cron' && (
          <div className="pl-14">
            <input
              className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
              value={cronExpression}
              onChange={(e) => onCronExpressionChange(e.target.value)}
              placeholder="0 */6 * * * (cada 6 horas)"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        Esta opción se puede configurar más adelante desde los ajustes de la sincronización.
      </div>
    </div>
  )
}
