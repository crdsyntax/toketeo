import { useState } from 'react'
import { Check, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RedisWizardStepProps {
  onConfigChange: (config: {
    host: string
    port: string
    password: string
    database: string
  }) => void
  config: {
    host: string
    port: string
    password: string
    database: string
  }
}

export function RedisWizardStep({ onConfigChange, config }: RedisWizardStepProps) {
  const handleChange = (field: string, value: string) => {
    onConfigChange({ ...config, [field]: value })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-amber-500" />
        <p className="text-xs text-muted-foreground">Redis connection details:</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Host</label>
          <input
            value={config.host}
            onChange={(e) => handleChange('host', e.target.value)}
            className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Port</label>
          <input
            value={config.port}
            onChange={(e) => handleChange('port', e.target.value)}
            className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Database (0-15)</label>
          <input
            value={config.database}
            onChange={(e) => handleChange('database', e.target.value)}
            placeholder="0"
            className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Password (optional)</label>
          <input
            type="password"
            value={config.password}
            onChange={(e) => handleChange('password', e.target.value)}
            placeholder="(none)"
            className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </div>
  )
}
