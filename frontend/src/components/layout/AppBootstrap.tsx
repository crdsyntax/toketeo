import { useEffect, useState } from 'react'
import { SplashScreen } from './SplashScreen'
import { OnboardingTour } from '@/components/layout/OnboardingTour'
import { useAssistantStore } from '@/store/assistantStore'

interface AppBootstrapProps {
  children: React.ReactNode
}

const MIN_SPLASH_DURATION = 1800

export function AppBootstrap({ children }: AppBootstrapProps) {
  const [isReady, setIsReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const onboardingCompleted = useAssistantStore((s) => s.onboardingCompleted)

  useEffect(() => {
    const startTime = Date.now()

    const minDelay = new Promise<void>((resolve) => {
      setTimeout(resolve, MIN_SPLASH_DURATION)
    })

    Promise.all([minDelay]).then(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, MIN_SPLASH_DURATION - elapsed)
      setTimeout(() => {
        setIsReady(true)
        if (!onboardingCompleted) {
          setTimeout(() => setShowOnboarding(true), 500)
        }
      }, remaining)
    })
  }, [onboardingCompleted])

  if (!isReady) {
    return <SplashScreen />
  }

  return (
    <>
      {children}
      {showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}
    </>
  )
}
