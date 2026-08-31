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
    <div className="flex flex-col gap-2 font-mono">

      <div className="flex items-center justify-between border-4 border-black bg-[#101014] px-4 py-2 text-[#e7e0d0] select-none shadow-[4px_4px_0_#000]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-[#e7e0d0]">
            DATA DEFENDER
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a96]">
            COSTA: LOS ASESINATOS DE LA QUIEBRA
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="border border-[#444450] bg-[#1c1a24] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#ffd27a]">
            LEVEL 1 · {completed.length}/{nodes.length}
          </div>
        </div>
      </div>

      <div className="relative h-[380px] w-full select-none overflow-hidden rounded-lg border-4 border-black bg-[#54a648] shadow-[4px_4px_0_#000]">
        <canvas
          ref={mapCanvas}
          width={800}
          height={560}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
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
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
                unlocked && !walking ? 'hover:scale-110 active:scale-95' : ''
              } ${current ? 'z-20' : 'z-10'}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >

              <div
                className={`flex items-center justify-center rounded-sm border-2 border-[#121218] font-black shadow-[3px_3px_0_#000000] ${
                  node.isBoss ? 'h-13 w-13' : 'h-11 w-11'
                } ${
                  done
                    ? 'bg-[#e5dfd3] text-[#8f1d1d]'
                    : unlocked
                      ? `bg-[#8f1d1d] text-[#ffffff] ring-2 ring-[#e02626] ${!node.isBoss ? 'animate-pulse' : ''}`
                      : 'bg-[#282634] text-[#636175]'
                }`}
              >
                {done ? (
                  <Check className={node.isBoss ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={3.5} />
                ) : node.isBoss ? (
                  <Skull className={unlocked ? 'h-6 w-6' : 'h-6 w-6 text-[#58566a]'} strokeWidth={2.5} />
                ) : unlocked ? (
                  <span className="text-sm font-black">{i + 1}</span>
                ) : (
                  <Lock className="h-4 w-4 text-[#727084]" />
                )}
              </div>


              <div
                className={`mx-auto mt-1.5 w-max max-w-[130px] rounded-xs border-2 border-black bg-[#121218]/95 px-2 py-0.5 text-center text-[9px] font-black uppercase tracking-wider leading-tight shadow-[2px_2px_0_#000000] ${
                  unlocked ? 'text-[#f0ece1]' : 'text-[#7a7888]'
                }`}
              >
                {node.name[lang].replace(/·/g, '-')}
              </div>
            </button>
          )
        })}


        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full transition-all"
          style={{ left: `${hero[0]}%`, top: `${hero[1]}%` }}
        >

          <div className="flex justify-center -mb-1 animate-bounce">
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[9px] border-t-[#f5b820] drop-shadow-[0_2px_0_#000000]" />
          </div>

          <PixelSprite kind="hero" scale={3.2} moving={walking} level={level} />

          <div className="mt-0.5 rounded-xs bg-[#101014]/90 px-1.5 py-0.2 text-center text-[8px] font-black uppercase tracking-widest text-[#ffd27a] shadow-[1px_1px_0_#000]">
            {heroTier.label}
          </div>
        </div>
        <div className="absolute left-3 top-3 border-2 border-black bg-[#101014]/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#e7e0d0] shadow-[2px_2px_0_#8f1d1d]">
          ZONA 1 · nullville
        </div>
      </div>
    </div>
  )
}
