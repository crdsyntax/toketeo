import { useEffect, useRef } from 'react'
import { ChevronRight, Undo2 } from 'lucide-react'
import { PortraitArtwork } from './Portraits'
import { drawScene } from './sprites'
import type { Lang, MapNode } from './types'

const W = 960
const H = 260

interface NodeBriefProps {
  node: MapNode
  lang: Lang
  onStart: () => void
  onBack: () => void
}

export function NodeBrief({ node, lang, onStart, onBack }: NodeBriefProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const loop = (now: number) => {
      drawScene(ctx, node.scene, W, H, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [node.scene])

  const t = (o: { en: string; es: string }) => o[lang]

  return (
    <div className="select-none overflow-hidden rounded-lg border-4 border-black">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="block h-auto w-full" style={{ imageRendering: 'pixelated' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30" />
        <div className="absolute bottom-4 left-8 flex items-end gap-6">
          <PortraitArtwork
            npc={node.npc}
            className={node.npc === 'butcher' ? 'w-[240px] border-4 border-black shadow-[6px_6px_0_rgba(0,0,0,0.8)]' : 'h-[190px] border-4 border-black shadow-[6px_6px_0_rgba(0,0,0,0.8)]'}
          />
          <div>
            <div className="text-3xl font-black uppercase tracking-[0.15em] text-[#e7e0d0] drop-shadow-[2px_2px_0_#000]">
              {t(node.name)}
            </div>
            <div className="mt-1 max-w-xl text-base font-semibold italic leading-snug text-[#c5c5cf]">
              “{t(node.subtitle)}”
            </div>
          </div>
        </div>
        {node.isBoss && (
          <div className="absolute right-4 top-4 animate-pulse border-2 border-black bg-[#8f1d1d] px-3 py-1 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[2px_2px_0_#000]">
            {lang === 'en' ? 'Final boss · 10 phases' : 'Jefe final · 10 fases'}
          </div>
        )}
      </div>

      <div className="bg-[#101014] p-6">
        <div className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#c9a227]">
          {lang === 'en' ? 'What you will learn here' : 'Lo que aprenderás aquí'}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {node.learn.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-base leading-relaxed text-[#d8d8e2]">
              <span className="mt-0.5 shrink-0 font-black text-[#e02626]">▸</span>
              {t(item)}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onStart}
            className="flex items-center gap-2 border-2 border-black bg-[#8f1d1d] px-8 py-3 text-base font-black uppercase tracking-widest text-[#e7e0d0] shadow-[3px_3px_0_#000] hover:bg-[#a52525]"
          >
            {lang === 'en' ? 'Begin district ▸' : 'Comenzar distrito ▸'} <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 border-2 border-black bg-[#232329] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#8a8a94] shadow-[3px_3px_0_#000] hover:text-[#e7e0d0]"
          >
            <Undo2 className="h-3.5 w-3.5" /> {lang === 'en' ? 'Map' : 'Mapa'}
          </button>
          <span className="ml-auto text-xs font-bold uppercase tracking-widest text-[#55555e]">
            {node.puzzles.length} {lang === 'en' ? 'puzzles await' : 'acertijos esperan'}
          </span>
        </div>
      </div>
    </div>
  )
}
