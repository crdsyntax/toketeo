import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssistantStore } from '@/store/assistantStore'
import { useGamificationStore } from '@/store/gamificationStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface OnboardingStep {
  title: string
  description: string
  target: string // route or element selector
  icon: string
}

const STEPS: OnboardingStep[] = [
  { title: 'Connect a Database', description: 'First, add a database connection. Click the + button in the sidebar or go to the Connections page.', target: '/', icon: '🔌' },
  { title: 'Explore Your Schema', description: 'Once connected, browse tables, views, columns, and indexes in the Explorer sidebar.', target: '/explorer', icon: '🔍' },
  { title: 'Write Queries', description: 'Open the Query Editor to write and execute SQL. Press Ctrl+Enter to run your query.', target: '/query', icon: '💻' },
  { title: 'View Results', description: 'Results appear below the editor. You can paginate, export as CSV/JSON, and edit rows inline.', target: '/query', icon: '📊' },
  { title: 'Visualize with Diagrams', description: 'Create ERD diagrams to understand table relationships visually.', target: '/diagram', icon: '📐' },
  { title: 'Level Up!', description: 'Every action earns XP. Complete missions and unlock perks like theming, AI assistant, and more.', target: '/query', icon: '⭐' },
  { title: 'Get Help Here', description: 'The Assistant hub is always available. Ask questions, check performance, and learn tips.', target: '/assistant', icon: '🤖' },
]

interface OnboardingTourProps {
  onClose: () => void
}

export function OnboardingTour({ onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()
  const completeOnboarding = useAssistantStore((s) => s.completeOnboarding)
  const addXP = useGamificationStore((s) => s.addXP)

  const step = STEPS[currentStep]

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      addXP(10)
      navigate(STEPS[nextStep].target)
    } else {
      completeOnboarding()
      addXP(100)
      onClose()
    }
  }, [currentStep, navigate, completeOnboarding, addXP, onClose])

  const handleSkip = () => {
    completeOnboarding()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="text-center mb-4">
            <span className="text-3xl mb-2 block">{step.icon}</span>
            <h3 className="text-base font-bold text-foreground">{step.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
          </div>

          <div className="flex justify-center gap-1.5 my-4">
            {STEPS.map((_, i) => (
              <div key={i} className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                i === currentStep ? 'bg-primary' : i < currentStep ? 'bg-primary/40' : 'bg-muted',
              )} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <button onClick={handleSkip} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip tour
            </button>
            <Button size="sm" onClick={handleNext}>
              {currentStep < STEPS.length - 1 ? 'Next' : 'Done!'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
