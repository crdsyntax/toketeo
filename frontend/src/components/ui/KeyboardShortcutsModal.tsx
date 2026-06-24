import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], desc: 'Execute query' },
  { keys: ['Ctrl', 'S'], desc: 'Save query as script' },
  { keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Execute selected query' },
  { keys: ['Ctrl', 'Tab'], desc: 'Switch query tab' },
  { keys: ['Ctrl', 'W'], desc: 'Close query tab' },
  { keys: ['Ctrl', 'N'], desc: 'New query tab' },
  { keys: ['Ctrl', 'F'], desc: 'Find in editor' },
  { keys: ['Ctrl', 'H'], desc: 'Find and replace' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo' },
  { keys: ['Ctrl', 'D'], desc: 'Duplicate line' },
  { keys: ['Ctrl', '/'], desc: 'Toggle comment' },
  { keys: ['Ctrl', 'L'], desc: 'Toggle layout (History)' },
  { keys: ['Ctrl', 'I'], desc: 'Toggle AI Assistant' },
  { keys: ['Ctrl', 'M'], desc: 'Toggle Maximize results' },
]

interface KeyboardShortcutsModalProps {
  onClose: () => void
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-auto space-y-1">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <span key={j}>
                    <kbd className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                      {k}
                    </kbd>
                    {j < s.keys.length - 1 && <span className="text-[10px] text-muted-foreground mx-0.5">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
