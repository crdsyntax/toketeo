import { useEffect, useRef } from 'react'
import { drawHero, NPC_SPRITES } from './sprites'
import type { NpcKey } from './types'

interface HeroSpriteProps {
  kind: 'hero'
  scale?: number
  moving?: boolean
  level?: number
  className?: string
}

interface NpcSpriteProps {
  kind: 'npc'
  npc: NpcKey
  scale?: number
  className?: string
}

export type PixelSpriteProps = HeroSpriteProps | NpcSpriteProps

export function PixelSprite(props: PixelSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const npcKey = props.kind === 'npc' ? props.npc : null
  const scale = props.scale ?? (props.kind === 'hero' ? 4 : 6)
  const moving = props.kind === 'hero' ? (props.moving ?? false) : false
  const level = props.kind === 'hero' ? (props.level ?? 1) : 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const loop = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (props.kind === 'hero') {
        drawHero(ctx, 0, 0, scale, now, moving, level)
      } else if (npcKey) {
        const def = NPC_SPRITES[npcKey]
        def.rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            const color = def.palette[row[x]]
            if (!color) continue
            ctx.fillStyle = color
            ctx.fillRect(x * scale, y * scale, scale, scale)
          }
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [props.kind, npcKey, scale, moving, level])

  const height = props.kind === 'hero' ? HERO_ROWS : NPC_SPRITES[npcKey ?? 'coroner'].rows.length
  return (
    <canvas
      ref={canvasRef}
      width={16 * scale}
      height={height * scale}
      className={props.className}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

const HERO_ROWS = 19
