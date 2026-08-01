import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, BarChart3, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  title: string
  description: string
  icon: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Chart Type',
    description:
      'Choose the type of chart that best represents your data. Bar charts compare values across categories, line charts show trends over time, pie charts display proportions, scatter plots reveal correlations, and area charts emphasize magnitude of change.',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    title: 'Axis (X)',
    description:
      'Select the column to use as the category axis — usually text labels, dates, or IDs. Each unique value becomes a tick on the horizontal axis. For example, product names, months, or regions.',
    icon: <span className="text-sm font-bold">X</span>,
  },
  {
    title: 'Values (Y)',
    description:
      'Pick one or more numeric columns to plot as values. Each selected column appears as a separate series in the chart, distinguished by color. Click a column to toggle it on or off.',
    icon: <span className="text-sm font-bold">Y</span>,
  },
  {
    title: 'Color (Group)',
    description:
      'Split your data into colored groups by selecting a column with a few distinct values (up to 20). Each group gets its own color and is shown as separate bars, lines, or segments.',
    icon: <span className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400" />,
  },
  {
    title: 'Title & Options',
    description:
      'Add a chart title to describe what the chart shows. Toggle orientation between vertical and horizontal bars, stack multiple series on top of each other, or show data labels directly on the chart elements.',
    icon: <HelpCircle className="w-5 h-5" />,
  },
]

interface ChartTourProps {
  open: boolean
  onClose: () => void
}

export function ChartTour({ open, onClose }: ChartTourProps) {
  const [step, setStep] = useState(0)

  if (!open) return null

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              {current.icon}
            </div>
            <span className="text-sm font-semibold text-foreground">{current.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
        </div>

        {/* Steps indicator + navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  i === step
                    ? 'bg-primary w-5'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--ch-text-10)] text-muted-foreground">
              {step + 1} / {STEPS.length}
            </span>
            {!isFirst && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-all"
              >
                Got it
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-all"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
