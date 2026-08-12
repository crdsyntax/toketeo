import { useState } from 'react'
import { ChevronRight, ChevronLeft, Check, Plug, Loader2, AlertCircle, Minimize2, Maximize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment, type CreateConnectionDto } from '@/types/database'
import { connectionService } from '@/services/connection.service'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'

const ENGINES = [
  { id: 'mysql', name: 'MySQL', icon: '🐬', color: 'text-blue-500', dbType: DatabaseType.MARIADB },
  { id: 'postgresql', name: 'PostgreSQL', icon: '🐘', color: 'text-blue-400', dbType: DatabaseType.POSTGRES },
  { id: 'mongodb', name: 'MongoDB', icon: '🍃', color: 'text-green-500', dbType: DatabaseType.MONGODB },
  { id: 'mssql', name: 'SQL Server', icon: '🗄️', color: 'text-red-500', dbType: DatabaseType.SQLSERVER },
  { id: 'redis', name: 'Redis', icon: '⚡', color: 'text-amber-500', dbType: DatabaseType.REDIS },
]

const ENGINE_MAP = Object.fromEntries(ENGINES.map(e => [e.id, e]))

interface ConnectionWizardProps {
  onClose: () => void
  onSave?: (payload: CreateConnectionDto) => void
}

export function ConnectionWizard({ onClose, onSave }: ConnectionWizardProps) {
  const [step, setStep] = useState(0)
  const [engine, setEngine] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const { pos, handleMouseDown } = useDraggablePanel(320, 80)

  const defaultPorts: Record<string, string> = {
    mysql: '3306',
    postgresql: '5432',
    mongodb: '27017',
    mssql: '1433',
    redis: '6379',
  }

  const buildPayload = (): CreateConnectionDto => {
    const engineDef = ENGINE_MAP[engine!]
    return {
      name: name || `${engineDef.name} - ${host}`,
      type: engineDef.dbType,
      environment: Environment.DEVELOPMENT,
      host,
      port: parseInt(port || defaultPorts[engine!], 10),
      user: engine === DatabaseType.REDIS ? '' : user,
      password,
      database,
      authEnabled: true,
      authSource: '',
      replicaSet: '',
      directConnection: true,
      ssl: 'false',
      readOnly: false,
      maxPoolSize: 2,
      idleTimeout: 600,
      acquireTimeout: 30,
      maxLifetime: 28800,
      keepAlive: 0,
      metadataCacheTtl: 300,
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    setTestError('')
    try {
      const payload = buildPayload()
      await connectionService.test(payload)
      setTestResult('success')
    } catch (err: unknown) {
      setTestResult('error')
      setTestError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsTesting(false)
    }
  }

  const handleFinish = async () => {
    setIsSaving(true)
    try {
      const payload = buildPayload()
      if (onSave) {
        onSave(payload)
      } else {
        await connectionService.create(payload)
      }
      onClose()
    } catch (err: unknown) {
      setTestResult('error')
      setTestError(err instanceof Error ? err.message : 'Failed to save connection')
    } finally {
      setIsSaving(false)
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-muted border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[200px]" data-drag-handle>
          <Plug className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">New Connection</p>
            <p className="text-[var(--ch-text-10)] text-muted-foreground truncate">{name || 'Quick Setup'}</p>
          </div>
          <button onClick={() => setIsMinimized(false)} className="p-1 hover:bg-background rounded shrink-0" title="Expand">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-background rounded shrink-0" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed z-[200] w-[480px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="bg-muted border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between cursor-grab active:cursor-grabbing" data-drag-handle>
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">New Connection</h2>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setIsMinimized(true)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all" title="Minimize">
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="p-4">

          {/* Step indicator */}
          <div className="flex gap-1 mb-5">
            {[0, 1, 2].map((s) => (
              <div key={s} className={cn(
                'flex-1 h-1 rounded-full transition-colors',
                s <= step ? 'bg-primary' : 'bg-muted',
              )} />
            ))}
          </div>

          {/* Step 1: Choose Engine */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Select your database engine:</p>
              <div className="grid grid-cols-2 gap-2">
                {ENGINES.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setEngine(e.id)
                      setPort(defaultPorts[e.id])
                      setTestResult(null)
                    }}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                      engine === e.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    <span className="text-xl">{e.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{e.name}</p>
                      <p className="text-[var(--ch-text-10)] text-muted-foreground">Port {defaultPorts[e.id]}</p>
                    </div>
                    {engine === e.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Credentials */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Enter your connection details:</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Connection Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={`${ENGINE_MAP[engine!]?.name || 'Database'} - ${host}`}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="col-span-2">
                  <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Host</label>
                  <input value={host} onChange={(e) => setHost(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Port</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                {engine === DatabaseType.REDIS ? (
                  <div>
                    <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Database (0-15)</label>
                    <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="0"
                      className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                ) : (
                  <div>
                    <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Database</label>
                    <input value={database} onChange={(e) => setDatabase(e.target.value)}
                      className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}
                {engine !== DatabaseType.REDIS && (
                  <div>
                    <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Username</label>
                    <input value={user} onChange={(e) => setUser(e.target.value)}
                      className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}
                <div className={engine === DatabaseType.REDIS ? 'col-span-2' : ''}>
                  <label className="text-[var(--ch-text-10)] font-medium text-muted-foreground mb-1 block">Password {engine === DatabaseType.REDIS ? '(optional)' : ''}</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={engine === DatabaseType.REDIS ? '(none)' : ''}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Test & Confirm */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground mb-2">Review and test your connection:</p>
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1.5">
                {[
                  { label: 'Name', value: name || `${ENGINE_MAP[engine!]?.name || ''} - ${host}` },
                  { label: 'Engine', value: ENGINE_MAP[engine!]?.name || engine },
                  { label: 'Host', value: host },
                  { label: 'Port', value: port },
                  { label: 'Database', value: database || '(default)' },
                  { label: 'Username', value: user || '(none)' },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-medium">{item.value}</span>
                  </div>
                ))}
              </div>

              {testResult === 'error' && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="text-xs">{testError}</p>
                </div>
              )}

              <button
                onClick={handleTest}
                disabled={isTesting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors',
                  testResult === 'success'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                    : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20',
                )}
              >
                {isTesting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</>
                ) : testResult === 'success' ? (
                  <><Check className="w-4 h-4" /> Connection Successful</>
                ) : (
                  'Test Connection'
                )}
              </button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <button
              onClick={() => step === 0 ? onClose() : setStep(step - 1)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={() => step < 2 ? setStep(step + 1) : handleFinish()}
              disabled={step === 0 && !engine || isSaving}
              className="flex items-center gap-1 text-xs font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <>
                  {step < 2 ? 'Next' : 'Save & Connect'}
                  {step < 2 && <ChevronRight className="w-4 h-4" />}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
