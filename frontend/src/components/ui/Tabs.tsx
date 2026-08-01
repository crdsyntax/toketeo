import { cn } from '@/lib/utils'

export interface Tab {
  id: string
  label: string
  badge?: string | number
  disabled?: boolean
}

export interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex border-b border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-2.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
            tab.disabled && 'opacity-50 cursor-not-allowed',
            activeTab === tab.id
              ? 'text-accent'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.badge !== undefined && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent/10 text-[var(--ch-text-10)] font-semibold text-accent">
                {tab.badge}
              </span>
            )}
          </span>
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ active, children, className, ...props }: { active: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  if (!active) return null
  return (
    <div className={cn('pt-4', className)} role="tabpanel" {...props}>
      {children}
    </div>
  )
}
