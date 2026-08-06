import { useState, useRef, useCallback, useEffect } from 'react'

interface Position {
  x: number
  y: number
}

export function useDraggablePanel(initialX: number, initialY: number) {
  const [pos, setPos] = useState<Position>({ x: initialX, y: initialY })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-drag-handle]')) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }, [pos])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    setPos({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return { pos, handleMouseDown }
}
