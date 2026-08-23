import { useEffect, useRef, useState } from 'react'
import { Lock, Check, Skull } from 'lucide-react'
import { PixelSprite } from './PixelSprite'
import { drawOverworld, getHeroTier } from './sprites'
import { useGamificationStore } from '@/store/gamificationStore'
import type { Lang, MapNode } from './types'

const NODE_XY: Array<[number, number]> = [
  [10, 72],
  [26, 48],
  [43, 70],
  [60, 44],
  [76, 66],
  [91, 30],
]

interface MapScreenProps {
  nodes: MapNode[]
  completed: string[]
  nodePos: number
  lang: Lang
  onArrive: (index: number) => void
}

export function MapScreen({ nodes, completed, nodePos, lang, onArrive }: MapScreenProps) {
  const level = useGamificationStore((s) => s.level)
  const heroTier = getHeroTier(level)
  const [hero, setHero] = useState<[number, number]>(NODE_XY[Math.min(nodePos, nodes.length - 1)])
  const [walking, setWalking] = useState(false)
  const rafRef = useRef(0)
  const targetRef = useRef<number | null>(null)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const mapCanvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = mapCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = 200
    const H = 140
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')
    if (!octx) return
    const pts: Array<[number, number]> = NODE_XY.map(([x, y]) => [(x * W) / 100, (y * H) / 100])
    drawOverworld(octx, W, H, pts)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
  }, [])

  const isUnlocked = (i: number) => i === 0 || completed.includes(nodes[i - 1].id)
  const isDone = (i: number) => completed.includes(nodes[i].id)

  const walkTo = (i: number) => {
    if (walking || !isUnlocked(i)) return
    if (i === nodePos) {
      onArrive(i)
      return
    }
    const from = NODE_XY[Math.min(nodePos, nodes.length - 1)]
    const to = NODE_XY[i]
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
    const duration = Math.max(500, dist * 18)
    let start: number | null = null
    setWalking(true)
    targetRef.current = i
    const step = (now: number) => {
      if (start === null) start = now
      const p = Math.min(1, (now - start) / duration)
      setHero([from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p])
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setWalking(false)
        if (targetRef.current !== null) onArrive(targetRef.current)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[340px] w-full select-none overflow-hidden rounded-lg border-4 border-black bg-[#58a84e]">
        <canvas
          ref={mapCanvas}
          width={800}
          height={560}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={NODE_XY.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="#8f1d1d"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeDasharray="2.4 1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {nodes.map((node, i) => {
          const [x, y] = NODE_XY[i]
          const done = isDone(i)
          const unlocked = isUnlocked(i)
          const current = i === nodePos
          return (
            <button
              key={node.id}
              onClick={() => walkTo(i)}
              disabled={walking || !unlocked}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform ${
                unlocked && !walking ? 'hover:scale-110' : ''
              } ${current ? 'z-10' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div
                className={`flex items-center justify-center border-4 border-black font-black shadow-[3px_3px_0_#000] ${
                  node.isBoss ? 'h-14 w-14' : 'h-10 w-10'
                } ${
                  done
                    ? 'bg-[#e7e0d0] text-[#8f1d1d]'
                    : unlocked
                      ? `bg-[#8f1d1d] text-[#e7e0d0] ${!node.isBoss ? 'animate-pulse' : ''}`
                      : 'bg-[#232329] text-[#3a3a40]'
                }`}
              >
                {done ? (
                  <Check className={node.isBoss ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={4} />
                ) : node.isBoss ? (
                  <Skull className={unlocked ? 'h-7 w-7' : 'h-7 w-7 text-[#3a3a40]'} strokeWidth={2.5} />
                ) : unlocked ? (
                  <span className="text-lg">{i + 1}</span>
                ) : (
                  <Lock className="h-4 w-4 text-[#3a3a40]" />
                )}
              </div>
              <div
                className={`mx-auto mt-1 w-max max-w-[110px] border-2 border-black bg-[#101014]/85 px-1.5 py-0.5 text-center text-[9px] font-black uppercase tracking-widest leading-tight ${
                  unlocked ? 'text-[#e7e0d0]' : 'text-[#6a6a74]'
                }`}
              >
                {node.name[lang]}
              </div>
            </button>
          )
        })}

        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
          style={{ left: `${hero[0]}%`, top: `${hero[1]}%` }}
        >
          <PixelSprite kind="hero" scale={3} moving={walking} level={level} />
          <div className="mt-1 text-center text-[9px] font-black uppercase tracking-widest text-[#c9a227]">
            {heroTier.label}
          </div>
        </div>

        <div className="absolute left-3 top-3 border-2 border-black bg-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#e7e0d0] shadow-[3px_3px_0_#8f1d1d]">
          Level 1 · {completed.length}/{nodes.length}
        </div>
      </div>
    </div>
  )
}
