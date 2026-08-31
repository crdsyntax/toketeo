import { Shield, Lock, Unlock, Key, Copy, AlertTriangle, CheckCircle, ArrowLeft, Fingerprint, Smartphone } from 'lucide-react'
import { connectionService } from '@/services/connection.service'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function SecuritySettingsPage() {
  const navigate = useNavigate()
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [windowsHelloAvailable, setWindowsHelloAvailable] = useState(false)
  const [useWindowsHello, setUseWindowsHello] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string; qr_code_svg: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCodeSet, setRecoveryCodeSet] = useState(false)
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('')
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('')

  useEffect(() => {
    checkStatus()
    checkWindowsHello()
    checkTotp()
    checkRecoveryCode()
  }, [])

  useEffect(() => {
    if (hasPassword && isUnlocked) {
      connectionService.isMasterInKeyring().then((stored) => {
        setUseWindowsHello(stored)
      })
    }
  }, [hasPassword, isUnlocked])

  async function checkWindowsHello() {
    try {
      const avail = await connectionService.isWindowsHelloAvailable()
      setWindowsHelloAvailable(avail)
    } catch {
      setWindowsHelloAvailable(false)
    }
  }

  async function checkTotp() {
    try {
      const enabled = await connectionService.isTotpEnabled()
      setTotpEnabled(enabled)
    } catch {
      setTotpEnabled(false)
    }
  }

  async function checkRecoveryCode() {
    try {
      const set = await connectionService.isRecoveryCodeSet()
      setRecoveryCodeSet(set)
    } catch {
      setRecoveryCodeSet(false)
    }
  }

  async function checkStatus() {
    const exists = await connectionService.checkMasterPasswordExists()
    setHasPassword(exists)
    const unlocked = await connectionService.isSessionUnlocked()
    setIsUnlocked(unlocked)
  }

  async function handleCreate() {
    setError('')
    setSuccess('')
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await connectionService.createMasterPassword(newPassword)
      setSuccess('Master password created successfully')
      setNewPassword('')
      setConfirmPassword('')
      await checkStatus()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlock() {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const ok = await connectionService.unlockSession(password)
      if (ok) {
        setSuccess('Session unlocked')
        setPassword('')
        await checkStatus()
      } else {
        setError('Incorrect password')
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleLock() {
    await connectionService.lockSession()
    await checkStatus()
  }

  async function handleChange() {
    setError('')
    setSuccess('')
    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await connectionService.changeMasterPassword(oldPassword, newPassword)
      if (recoveryCodeSet) {
        setSuccess('Password changed successfully. Your previous recovery code was invalidated — generate a new one.')
      } else {
        setSuccess('Password changed successfully')
      }
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setGeneratedRecoveryCode(null)
      await checkStatus()
      await checkRecoveryCode()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateRecoveryCode() {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const code = await connectionService.generateRecoveryCode()
      setGeneratedRecoveryCode(code)
      setRecoveryCodeSet(true)
      setSuccess('Recovery code generated. Save it somewhere safe.')
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleRecover() {
    setError('')
    setSuccess('')
    if (recoveryNewPassword.length < 4) {
      setError('New password must be at least 4 characters')
      return
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await connectionService.recoverMasterPassword(recoveryCodeInput, recoveryNewPassword)
      setSuccess('Password reset successfully. Session unlocked.')
      setRecoveryCodeInput('')
      setRecoveryNewPassword('')
      setRecoveryConfirmPassword('')
      setShowRecovery(false)
      await checkStatus()
      await checkRecoveryCode()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Security Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set a master password to encrypt connection credentials and protect sensitive data.
          </p>
        </div>

        {hasPassword === null ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>

            <section className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/30">
              {isUnlocked ? (
                <>
                  <Unlock className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Session Unlocked</p>
                    <p className="text-xs text-muted-foreground">Credentials are accessible</p>
                  </div>
                  {windowsHelloAvailable && useWindowsHello && (
                    <button
                      onClick={async () => {
                        try { await connectionService.removeMasterFromKeyring() } catch {  }
                        setUseWindowsHello(false)
                        setSuccess('Windows Hello credential removed')
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                      title="Remove Windows Hello credential"
                    >
                      <Fingerprint className="w-3.5 h-3.5 inline mr-1" />
                      Forget
                    </button>
                  )}
                  <button
                    onClick={handleLock}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    Lock
                  </button>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Session Locked</p>
                    <p className="text-xs text-muted-foreground">Credentials are encrypted</p>
                  </div>
                  {windowsHelloAvailable && useWindowsHello && (
                    <button
                      onClick={async () => {
                        try { await connectionService.removeMasterFromKeyring() } catch {  }
                        setUseWindowsHello(false)
                        setSuccess('Windows Hello credential removed')
                      }}
                      className="ml-auto text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                      title="Remove Windows Hello credential"
                    >
                      <Fingerprint className="w-3.5 h-3.5 inline mr-1" />
                      Forget
                    </button>
                  )}
                </>
              )}
            </section>


            {!hasPassword && (
              <section className="space-y-4 p-6 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Create Master Password</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  This password will encrypt all stored connection credentials. You will need it to view passwords and export connections with credentials.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    />
                  </div>
                  {windowsHelloAvailable && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useWindowsHello}
                        onChange={(e) => setUseWindowsHello(e.target.checked)}
                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                      />
                      <Fingerprint className="w-3.5 h-3.5" />
                      Use Windows Hello for quick unlock
                    </label>
                  )}
                  <button
                    onClick={async () => {
                      if (useWindowsHello && windowsHelloAvailable) {
                        await connectionService.storeMasterInKeyring(newPassword)
                      }
                      await handleCreate()
                    }}
                    disabled={loading}
                    className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Set Master Password'}
                  </button>
                </div>
              </section>
            )}


            {hasPassword && !isUnlocked && (
              <section className="space-y-4 p-6 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Unlock Session</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your master password to unlock this session and access encrypted credentials.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground">Master Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  />
                </div>
                <button
                  onClick={handleUnlock}
                  disabled={loading}
                  className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Unlocking...' : 'Unlock'}
                </button>

                {windowsHelloAvailable && (
                  <button
                    onClick={async () => {
                      setError('')
                      setSuccess('')
                      try {
                        const ok = await connectionService.unlockWithWindowsHello()
                        if (ok) {
                          setSuccess('Session unlocked via Windows Hello')
                          await checkStatus()
                        } else {
                          setError('Windows Hello verification failed or no credential stored')
                        }
                      } catch (e: unknown) {
                        setError(String(e))
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 text-xs px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Fingerprint className="w-4 h-4" />
                    Unlock with Windows Hello
                  </button>
                )}

                <button
                  onClick={() => setShowRecovery(!showRecovery)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Forgot your password?
                </button>

                {showRecovery && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">
                      Enter your recovery code to set a new master password. All stored credentials will be re-encrypted.
                    </p>
                    <div>
                      <label className="text-xs text-muted-foreground">Recovery Code</label>
                      <input
                        type="text"
                        value={recoveryCodeInput}
                        onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                        className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">New Password</label>
                      <input
                        type="password"
                        value={recoveryNewPassword}
                        onChange={(e) => setRecoveryNewPassword(e.target.value)}
                        className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Confirm New Password</label>
                      <input
                        type="password"
                        value={recoveryConfirmPassword}
                        onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                        className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                      />
                    </div>
                    <button
                      onClick={handleRecover}
                      disabled={loading}
                      className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                  </div>
                )}
              </section>
            )}


            {hasPassword && isUnlocked && (
              <section className="space-y-4 p-6 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Change Master Password</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Changing the password will re-encrypt all stored credentials.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Current Password</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                    />
                  </div>
                  {windowsHelloAvailable && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useWindowsHello}
                        onChange={(e) => setUseWindowsHello(e.target.checked)}
                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                      />
                      <Fingerprint className="w-3.5 h-3.5" />
                      Update Windows Hello credential with new password
                    </label>
                  )}
                  <button
                    onClick={async () => {
                      if (windowsHelloAvailable && useWindowsHello) {
                        await connectionService.storeMasterInKeyring(newPassword)
                      } else if (windowsHelloAvailable) {
                        try { await connectionService.removeMasterFromKeyring() } catch {  }
                      }
                      await handleChange()
                    }}
                    disabled={loading}
                    className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loading ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </section>
            )}


            {hasPassword && isUnlocked && (
              <section className="space-y-4 p-6 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Recovery Code</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {recoveryCodeSet
                    ? 'A recovery code is set. Use it to change your master password if you ever forget it.'
                    : 'Generate a recovery code to change your master password if you ever forget it. Keep it in a safe place.'}
                </p>

                {!generatedRecoveryCode && (
                  <button
                    onClick={handleGenerateRecoveryCode}
                    disabled={loading}
                    className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {recoveryCodeSet ? 'Regenerate recovery code' : 'Generate recovery code'}
                  </button>
                )}

                {generatedRecoveryCode && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground text-center">
                      Save this code somewhere safe. It will only be shown once.
                    </p>
                    <div className="font-mono text-base tracking-widest text-center bg-muted p-3 rounded-md break-all select-all border border-yellow-500/40">
                      {generatedRecoveryCode}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedRecoveryCode)}
                      className="w-full flex items-center justify-center gap-2 text-xs px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy code
                    </button>
                  </div>
                )}
              </section>
            )}


            {hasPassword && isUnlocked && (
              <section className="space-y-4 p-6 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Authenticator App</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set up an authenticator app (like Microsoft Authenticator) to unlock your session without typing your master password.
                </p>

                {!totpSetup && !totpEnabled && (
                  <button
                    onClick={async () => {
                      setError('')
                      setSuccess('')
                      try {
                        const setup = await connectionService.generateTotpSetup()
                        setTotpSetup(setup)
                      } catch (e: unknown) {
                        setError(String(e))
                      }
                    }}
                    className="w-full text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                  >
                    Set up authenticator app
                  </button>
                )}

                {totpSetup && !totpEnabled && (
                  <div className="space-y-3">
                    <div className="flex justify-center bg-white rounded-lg p-4">
                      <div dangerouslySetInnerHTML={{ __html: totpSetup.qr_code_svg }} />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Scan this QR code with your authenticator app, or manually enter the key:
                    </p>
                    <div className="text-xs text-center font-mono bg-muted p-2 rounded-md break-all select-all">
                      {totpSetup.secret}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Enter the 6-digit code from the app</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1 text-center tracking-widest"
                        placeholder="000000"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setTotpSetup(null); setTotpCode('') }}
                        className="flex-1 text-sm px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setError('')
                          setSuccess('')
                          setLoading(true)
                          try {
                            const ok = await connectionService.verifyAndEnableTotp(totpSetup.secret, totpCode)
                            if (ok) {
                              setSuccess('Authenticator app configured successfully')
                              setTotpSetup(null)
                              setTotpCode('')
                              setTotpEnabled(true)
                            } else {
                              setError('Invalid code. Make sure the time on your device is synchronized.')
                            }
                          } catch (e: unknown) {
                            setError(String(e))
                          } finally {
                            setLoading(false)
                          }
                        }}
                        disabled={loading || totpCode.length !== 6}
                        className="flex-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {loading ? 'Verifying...' : 'Verify & Enable'}
                      </button>
                    </div>
                  </div>
                )}

                {totpEnabled && !totpSetup && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">Authenticator app is configured</span>
                    </div>
                    <button
                      onClick={async () => {
                        setError('')
                        setSuccess('')
                        try {
                          await connectionService.disableTotp()
                          setTotpEnabled(false)
                          setSuccess('Authenticator app removed')
                        } catch (e: unknown) {
                          setError(String(e))
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </section>
            )}


            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-xs text-green-600 bg-green-500/10 p-3 rounded-md border border-green-500/20">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {success}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
