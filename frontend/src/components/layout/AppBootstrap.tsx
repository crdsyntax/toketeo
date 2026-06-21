import { useEffect, useState } from 'react'
import { SplashScreen } from './SplashScreen'

interface AppBootstrapProps {
  children: React.ReactNode
}

// Tiempo mínimo que el splash es visible (ms)
const MIN_SPLASH_DURATION = 1800

export function AppBootstrap({ children }: AppBootstrapProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const startTime = Date.now()

    // Esperamos el tiempo mínimo para que el splash sea perceptible
    // independientemente de qué tan rápido cargue la app
    const minDelay = new Promise<void>((resolve) => {
      setTimeout(resolve, MIN_SPLASH_DURATION)
    })

    // Aquí podríamos añadir otras promesas de inicialización en el futuro
    Promise.all([minDelay]).then(() => {
      const elapsed = Date.now() - startTime
      // Si por algún motivo ya pasó más tiempo, mostramos directamente
      const remaining = Math.max(0, MIN_SPLASH_DURATION - elapsed)
      setTimeout(() => setIsReady(true), remaining)
    })
  }, [])

  if (!isReady) {
    return <SplashScreen />
  }

  return <>{children}</>
}
