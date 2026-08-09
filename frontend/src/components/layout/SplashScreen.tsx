import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'

export function SplashScreen() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    let active = true
    getVersion()
      .then((v) => {
        if (active) setVersion(v)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="splash-screen">
      <div className="splash-backdrop" />

      {/* Rings decorativos pulsantes */}
      <div className="splash-ring splash-ring--outer" />
      <div className="splash-ring splash-ring--middle" />
      <div className="splash-ring splash-ring--inner" />

      {/* Logo container con efecto pulsante */}
      <div className="splash-logo-wrapper">
        <div className="splash-logo-glow" />
        <div className="splash-logo-pulse">
          <img
              src="./principal.png"
            alt="Toketeo"
            className="splash-logo"
          />
        </div>
      </div>

      {/* Texto de estado */}
      <div className="splash-status">
        <p className="splash-label">Initializing session</p>
        {version && <p className="splash-version">v{version}</p>}
        <div className="splash-dots">
          <span className="splash-dot" style={{ animationDelay: '0ms' }} />
          <span className="splash-dot" style={{ animationDelay: '200ms' }} />
          <span className="splash-dot" style={{ animationDelay: '400ms' }} />
        </div>
      </div>
    </div>
  )
}
