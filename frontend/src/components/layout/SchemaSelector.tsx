import { Database, ChevronDown, Loader2, Check } from 'lucide-react'
import { useSchemas } from '@/hooks/useSchemas'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function SchemaSelector() {
  const { schemas, currentSchema, switchSchema, isSwitching, isLoading } = useSchemas()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (isLoading && !schemas.length) return null

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md hover:bg-muted transition-colors text-sm font-medium"
      >
        <Database className="w-3.5 h-3.5 text-primary" />
        <span className="truncate max-w-[120px]">{currentSchema || 'Select Schema'}</span>
        {isSwitching ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-md shadow-lg z-50 py-1 max-h-64 overflow-auto">
          <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 mb-1">
            Available Schemas
          </div>
          {schemas.map((schema) => (
            <button
              key={schema}
              onClick={() => {
                switchSchema(schema)
                setIsOpen(false)
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left",
                currentSchema === schema ? "text-primary bg-primary/5 font-bold" : "text-muted-foreground"
              )}
            >
              <span className="truncate">{schema}</span>
              {currentSchema === schema && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
