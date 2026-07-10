import { Lock, Fingerprint, Smartphone, ArrowLeft } from 'lucide-react'
import { connectionService } from '@/services/connection.service'
import { useState, useEffect } from 'react'

interface UnlockPromptProps {
  onUnlocked: () => void
  onCancel: () => void
}

export function UnlockPrompt({ onUnlocked, onCancel }: UnlockPromptProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [windowsHelloAvailable, setWindowsHelloAvailable] = useState(false)
  const [totpAvailable, setTotpAvailable] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [showTotp, setShowTotp] = useState(false)

  useEffect(() => {
    Promise.all([
      connectionService.isWindowsHelloAvailable().then(setWindowsHelloAvailable).catch(() => {}),
      connectionService.isTotpEnabled().then(setTotpAvailable).catch(() => {}),
    ])
  }, [])

  async function handleUnlock() {
    setError('')
    setLoading(true)
    try {
      const ok = await connectionService.unlockSession(password)
      if (ok) {
        onUnlocked()
      } else {
        setError('Incorrect password')
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleWindowsHello() {
    setError('')
    setLoading(true)
    try {
      const ok = await connectionService.unlockWithWindowsHello()
      if (ok) {
        onUnlocked()
      } else {
        setError('Windows Hello verification failed or no credential stored')
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpUnlock() {
    setError('')
    setLoading(true)
    try {
      const ok = await connectionService.unlockWithTotp(totpCode)
      if (ok) {
        onUnlocked()
      } else {
        setError('Invalid code. Make sure the time on your device is synchronized.')
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  if (showTotp) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-background rounded-xl border border-border shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Authenticator Code</h3>
              <p className="text-xs text-muted-foreground">Enter the code from your authenticator app</p>
            </div>
          </div>

          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full text-lg bg-muted border border-border rounded-md px-3 py-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center tracking-[0.5em]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleTotpUnlock()}
            />
            {error && (
              <p className="text-xs text-destructive mt-1.5 text-center">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setShowTotp(false); setTotpCode(''); setError('') }}
              className="flex-1 text-sm px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
              Back
            </button>
            <button
              onClick={handleTotpUnlock}
              disabled={loading || totpCode.length !== 6}
              className="flex-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-background rounded-xl border border-border shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Session Locked</h3>
            <p className="text-xs text-muted-foreground">Enter your master password to continue</p>
          </div>
        </div>

        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          />
          {error && (
            <p className="text-xs text-destructive mt-1.5">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 text-sm px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUnlock}
            disabled={loading || !password}
            className="flex-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </div>

        {windowsHelloAvailable && (
          <button
            onClick={handleWindowsHello}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Fingerprint className="w-4 h-4" />
            Unlock with Windows Hello
          </button>
        )}

        {totpAvailable && (
          <button
            onClick={() => { setShowTotp(true); setError('') }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Smartphone className="w-4 h-4" />
            Use authenticator app
          </button>
        )}
      </div>
    </div>
  )
}
