import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toAsciiTable } from './types'

export interface TableLike {
  name: string
  columns: string[]
  rows: string[][]
}

interface DraggableTableProps {
  table: TableLike
  initialX: number
  initialY: number
  zIndex: number
  onClose: () => void
}

export function DraggableTable({ table, initialX, initialY, zIndex, onClose }: DraggableTableProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragOffset.current) return
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragOffset.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 120, e.clientY - dragOffset.current.dy)),
    })
  }
  const onPointerUp = () => {
    dragOffset.current = null
  }

  return (
    <div
      className="fixed border-4 border-black bg-[#101014] shadow-[6px_6px_0_rgba(0,0,0,0.8)]"
      style={{ left: pos.x, top: pos.y, zIndex }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-move items-center justify-between gap-3 border-b-4 border-black bg-[#1c1c22] px-3 py-1.5 select-none"
      >
        <span className="font-mono text-xs font-bold text-[#e7e0d0]">▦ {table.name}</span>
        <button onClick={onClose} aria-label={`close ${table.name}`} className="text-[#8a8a94] hover:text-[#e02626]">
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>
      <pre className="max-h-[320px] max-w-[560px] overflow-auto p-3 font-mono text-[11px] leading-[1.35] text-[#c5c5cf]">
        {toAsciiTable(table.columns, table.rows)}
      </pre>
    </div>
  )
}
