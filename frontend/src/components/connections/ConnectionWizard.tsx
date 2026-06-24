import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

const ENGINES = [
  { id: 'mysql', name: 'MySQL', icon: '🐬', color: 'text-blue-500' },
  { id: 'postgresql', name: 'PostgreSQL', icon: '🐘', color: 'text-blue-400' },
  { id: 'mongodb', name: 'MongoDB', icon: '🍃', color: 'text-green-500' },
  { id: 'mssql', name: 'SQL Server', icon: '🗄️', color: 'text-red-500' },
]

interface ConnectionWizardProps {
  onClose: () => void
}

export function ConnectionWizard({ onClose }: ConnectionWizardProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [engine, setEngine] = useState<string | null>(null)
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [tested, setTested] = useState(false)

  const defaultPorts: Record<string, string> = {
    mysql: '3306',
    postgresql: '5432',
    mongodb: '27017',
    mssql: '1433',
  }

  const handleFinish = () => {
    navigate('/')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plug className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">New Connection</h2>
          </div>

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
                    onClick={() => { setEngine(e.id); setPort(defaultPorts[e.id]) }}
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
                      <p className="text-[10px] text-muted-foreground">Port {defaultPorts[e.id]}</p>
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
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Host</label>
                  <input value={host} onChange={(e) => setHost(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Port</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Database</label>
                  <input value={database} onChange={(e) => setDatabase(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Username</label>
                  <input value={user} onChange={(e) => setUser(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
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
                  { label: 'Engine', value: engine },
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
              <button
                onClick={() => setTested(true)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors',
                  tested
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                    : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20',
                )}
              >
                {tested ? <><Check className="w-4 h-4" /> Connection Successful</> : 'Test Connection'}
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
              disabled={step === 0 && !engine}
              className="flex items-center gap-1 text-xs font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {step < 2 ? 'Next' : 'Finish'}
              {step < 2 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
