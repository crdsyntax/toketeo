import { useEffect, useRef } from 'react'
import { ButcherArtwork } from './ButcherArtwork'
import type { NpcKey } from './types'

type Ctx = CanvasRenderingContext2D

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function ditherRect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, phase = 0): void {
  ctx.fillStyle = c
  for (let yy = 0; yy < h; yy++) {
    for (let xx = (yy + phase) % 2; xx < w; xx += 2) {
      ctx.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1)
    }
  }
}

function vgrad(ctx: Ctx, w: number, h: number, stops: Array<[number, string]>): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  stops.forEach(([p, c]) => g.addColorStop(p, c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function vignette(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2 - 10, h * 0.3, w / 2, h / 2, h)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

const W = 132
const H = 156

type Painter = (ctx: Ctx, t: number) => void

const coroner: Painter = (ctx, t) => {
  vgrad(ctx, W, H, [
    [0, '#0f1a20'],
    [0.6, '#15232b'],
    [1, '#090f13'],
  ])
  ctx.fillStyle = '#0b1319'
  ctx.beginPath()
  ctx.arc(W / 2, H + 30, 95, Math.PI, 0)
  ctx.fill()

  const flicker = 0.5 + 0.5 * Math.sin(t / 300)
  px(ctx, 108, 78, 4, 48, '#101820')
  px(ctx, 102, 72, 16, 6, '#101820')
  ctx.fillStyle = `rgba(140,200,230,${0.35 + 0.3 * flicker})`
  ctx.beginPath()
  ctx.arc(110, 66, 12 + flicker * 4, 0, Math.PI * 2)
  ctx.fill()
  px(ctx, 107, 63, 6, 6, '#bcdcec')

  ctx.fillStyle = '#16131f'
  ctx.beginPath()
  ctx.moveTo(6, H)
  ctx.quadraticCurveTo(20, 100, 66, 94)
  ctx.quadraticCurveTo(112, 100, 126, H)
  ctx.closePath()
  ctx.fill()
  px(ctx, 30, 96, 72, 12, '#211d2e')
  px(ctx, 60, 96, 12, 44, '#191524')
  for (let i = 0; i < 3; i++) px(ctx, 58, 104 + i * 12, 16, 4, '#2c2438')

  ctx.fillStyle = '#1d1926'
  ctx.beginPath()
  ctx.moveTo(38, 46)
  ctx.quadraticCurveTo(66, 38, 94, 46)
  ctx.lineTo(92, 68)
  ctx.quadraticCurveTo(66, 76, 40, 68)
  ctx.closePath()
  ctx.fill()

  const goggle = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = '#4a4550'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#221d29'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    const glow = 0.5 + 0.5 * Math.sin(t / 500)
    ctx.fillStyle = `rgba(224,38,38,${0.55 + 0.4 * glow})`
    ctx.beginPath()
    ctx.arc(cx, cy, r - 3.5, 0, Math.PI * 2)
    ctx.fill()
    px(ctx, cx - 2, cy - 2, 2, 2, '#ffd9d9')
  }
  goggle(53, 56, 9)
  goggle(79, 56, 9)
  px(ctx, 61, 55, 10, 3, '#4a4550')

  ctx.fillStyle = '#d8d0c0'
  ctx.beginPath()
  ctx.moveTo(56, 64)
  ctx.quadraticCurveTo(44, 84, 30, 96)
  ctx.lineTo(36, 101)
  ctx.quadraticCurveTo(56, 92, 76, 68)
  ctx.closePath()
  ctx.fill()
  ditherRect(ctx, 34, 88, 30, 10, '#b8ae9c')
  px(ctx, 33, 95, 4, 2, '#8f8574')
  px(ctx, 40, 82, 3, 2, '#8f8574')
  ctx.strokeStyle = '#a89e88'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(44, 80)
  ctx.lineTo(37, 90)
  ctx.stroke()

  px(ctx, 20, 30, 92, 11, '#14121a')
  px(ctx, 18, 32, 96, 5, '#1d1a26')
  px(ctx, 22, 27, 88, 3, '#2c2737')
  px(ctx, 44, 4, 44, 26, '#14121a')
  px(ctx, 48, 0, 36, 6, '#1d1a26')
  px(ctx, 44, 24, 44, 4, '#3a3048')
  px(ctx, 60, 22, 12, 8, '#3a3048')
  px(ctx, 63, 23, 6, 6, '#c9a227')
  ditherRect(ctx, 40, 41, 52, 7, '#0c0a12')

  vignette(ctx, W, H)
}

const witness: Painter = (ctx, t) => {
  vgrad(ctx, W, H, [
    [0, '#1c1210'],
    [0.6, '#291811'],
    [1, '#140c09'],
  ])
  const fl = 0.5 + 0.5 * Math.sin(t / 130)
  ctx.fillStyle = `rgba(255,176,58,${0.10 + 0.08 * fl})`
  ctx.beginPath()
  ctx.arc(26, 84, 30 + fl * 5, 0, Math.PI * 2)
  ctx.fill()
  px(ctx, 24, 92, 5, 26, '#d8d0c0')
  px(ctx, 23, 116, 7, 4, '#8f8a80')
  ctx.fillStyle = '#ffd27a'
  ctx.beginPath()
  ctx.ellipse(26.5, 84, 3.5, 7 + fl * 3, 0, 0, Math.PI * 2)
  ctx.fill()
  px(ctx, 25, 82, 2, 3, '#fff2cc')

  ctx.fillStyle = '#4a1818'
  ctx.beginPath()
  ctx.moveTo(24, 58)
  ctx.quadraticCurveTo(66, 18, 108, 58)
  ctx.lineTo(108, 74)
  ctx.quadraticCurveTo(66, 48, 24, 74)
  ctx.closePath()
  ctx.fill()
  ditherRect(ctx, 30, 34, 70, 12, '#3a1212')
  px(ctx, 96, 52, 12, 10, '#4a1818')

  ctx.fillStyle = '#c9b4a0'
  ctx.beginPath()
  ctx.ellipse(66, 66, 27, 32, 0, 0, Math.PI * 2)
  ctx.fill()
  ditherRect(ctx, 44, 62, 14, 20, '#a8967f')
  ditherRect(ctx, 76, 62, 14, 20, '#a8967f')
  px(ctx, 62, 46, 8, 6, '#a8967f')

  px(ctx, 50, 64, 12, 2, '#4a3a30')
  px(ctx, 71, 64, 12, 2, '#4a3a30')
  px(ctx, 54, 67, 3, 2, '#241a14')
  px(ctx, 75, 67, 3, 2, '#241a14')
  px(ctx, 63, 74, 6, 3, '#a8967f')
  px(ctx, 60, 84, 13, 2, '#6e5a4a')

  ctx.fillStyle = '#39404b'
  ctx.beginPath()
  ctx.moveTo(6, H)
  ctx.quadraticCurveTo(20, 100, 66, 97)
  ctx.quadraticCurveTo(112, 100, 126, H)
  ctx.closePath()
  ctx.fill()
  px(ctx, 40, 112, 4, 4, '#4d5663')
  px(ctx, 66, 118, 4, 4, '#4d5663')
  px(ctx, 92, 111, 4, 4, '#4d5663')
  px(ctx, 58, 100, 17, 8, '#c9b4a0')
  px(ctx, 60, 99, 13, 2, '#a8967f')
  vignette(ctx, W, H)
}

const scribe: Painter = (ctx, t) => {
  vgrad(ctx, W, H, [
    [0, '#150f22'],
    [0.6, '#221436'],
    [1, '#0d0817'],
  ])
  for (let i = 0; i < 12; i++) {
    const dx = (i * 53 + ((t * 0.006) % 40)) % W
    const dy = (i * 37 + ((t * 0.01) % 60)) % H
    ctx.fillStyle = `rgba(200,180,240,${0.15 + 0.15 * Math.sin(t / 400 + i)})`
    ctx.fillRect(dx, dy, 2, 2)
  }

  ctx.fillStyle = '#2e2140'
  ctx.beginPath()
  ctx.moveTo(66, 2)
  ctx.quadraticCurveTo(20, 40, 24, 78)
  ctx.lineTo(108, 78)
  ctx.quadraticCurveTo(112, 40, 66, 2)
  ctx.closePath()
  ctx.fill()
  ditherRect(ctx, 30, 40, 72, 30, '#241a33')
  ctx.fillStyle = '#170f26'
  ctx.beginPath()
  ctx.ellipse(66, 66, 25, 30, 0, 0, Math.PI * 2)
  ctx.fill()

  const stitch = (cx: number, cy: number) => {
    ctx.strokeStyle = '#8f8fa0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 7, cy - 4)
    ctx.lineTo(cx + 7, cy + 4)
    ctx.moveTo(cx - 7, cy + 4)
    ctx.lineTo(cx + 7, cy - 4)
    ctx.stroke()
    ctx.strokeStyle = '#241a33'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 8, cy)
    ctx.lineTo(cx + 8, cy)
    ctx.stroke()
  }
  stitch(54, 62)
  stitch(79, 62)

  const tear = 0.4 + 0.4 * Math.sin(t / 600)
  px(ctx, 54, 70, 2, 16, `rgba(161,48,48,${0.5 + tear * 0.4})`)
  px(ctx, 78, 70, 2, 12, `rgba(161,48,48,${0.45 + tear * 0.4})`)
  px(ctx, 61, 88, 12, 2, '#8f8fa0')
  for (let i = 0; i < 3; i++) px(ctx, 63 + i * 4, 85, 2, 6, '#8f8fa0')

  ctx.fillStyle = '#241a38'
  ctx.beginPath()
  ctx.moveTo(8, H)
  ctx.quadraticCurveTo(22, 102, 66, 98)
  ctx.quadraticCurveTo(110, 102, 124, H)
  ctx.closePath()
  ctx.fill()
  px(ctx, 12, 118, 3, 3, '#c9a227')

  ctx.save()
  ctx.translate(96, 128)
  ctx.rotate(-0.6)
  px(ctx, 0, -2, 44, 5, '#d8d0c0')
  px(ctx, 40, -6, 10, 12, '#eceaf0')
  px(ctx, 0, 3, 44, 2, '#a8967f')
  ctx.restore()
  px(ctx, 88, 138, 3, 10, '#a13030')
  px(ctx, 94, 142, 2, 7, '#8f1d1d')
  vignette(ctx, W, H)
}

const keeper: Painter = (ctx, t) => {
  vgrad(ctx, W, H, [
    [0, '#101a12'],
    [0.6, '#172414'],
    [1, '#0a100a'],
  ])
  ctx.fillStyle = '#0d140c'
  for (let i = 0; i < 4; i++) {
    const jx = 14 + i * 30
    ctx.fillRect(jx, 30, 18, 26)
    ctx.fillRect(jx - 3, 26, 24, 4)
  }
  const pulse = 0.5 + 0.5 * Math.sin(t / 450)
  ctx.fillStyle = `rgba(109,143,75,${0.12 + 0.1 * pulse})`
  ctx.fillRect(0, 0, W, H)

  px(ctx, 30, 40, 72, 12, '#20281c')
  px(ctx, 34, 30, 64, 12, '#262f20')

  ctx.fillStyle = '#b3a49b'
  ctx.beginPath()
  ctx.ellipse(66, 64, 26, 28, 0, 0, Math.PI * 2)
  ctx.fill()
  ditherRect(ctx, 44, 60, 13, 18, '#8d7d74')
  ditherRect(ctx, 76, 60, 13, 18, '#8d7d74')

  px(ctx, 40, 44, 52, 8, '#3a3f36')
  ctx.fillStyle = '#22261f'
  ctx.beginPath()
  ctx.arc(52, 40, 10, 0, Math.PI * 2)
  ctx.arc(80, 40, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgba(109,143,75,${0.6 + 0.3 * pulse})`
  ctx.beginPath()
  ctx.arc(52, 40, 6, 0, Math.PI * 2)
  ctx.arc(80, 40, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#2a3028'
  ctx.beginPath()
  ctx.moveTo(48, 76)
  ctx.quadraticCurveTo(66, 96, 84, 76)
  ctx.lineTo(84, 92)
  ctx.quadraticCurveTo(66, 102, 48, 92)
  ctx.closePath()
  ctx.fill()
  px(ctx, 56, 82, 8, 8, '#1a1f16')
  px(ctx, 69, 82, 8, 8, '#1a1f16')
  ctx.strokeStyle = '#2a3028'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(84, 86)
  ctx.quadraticCurveTo(104, 90, 106, 108)
  ctx.stroke()

  ctx.fillStyle = '#1c2418'
  ctx.beginPath()
  ctx.moveTo(8, H)
  ctx.quadraticCurveTo(22, 104, 66, 100)
  ctx.quadraticCurveTo(110, 104, 124, H)
  ctx.closePath()
  ctx.fill()
  px(ctx, 62, 102, 4, 44, '#2a3028')
  for (let i = 0; i < 3; i++) px(ctx, 58, 110 + i * 12, 12, 3, '#39412f')
  vignette(ctx, W, H)
}

const ghost: Painter = (ctx, t) => {
  vgrad(ctx, W, H, [
    [0, '#0a0e18'],
    [0.55, '#101626'],
    [1, '#070a12'],
  ])
  const halo = 0.5 + 0.5 * Math.sin(t / 700)
  ctx.fillStyle = `rgba(127,212,255,${0.06 + 0.05 * halo})`
  ctx.beginPath()
  ctx.arc(W * 0.7, 40, 44, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#dde4ee'
  ctx.beginPath()
  ctx.arc(W * 0.7, 40, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#aab6c6'
  ctx.beginPath()
  ctx.arc(W * 0.66, 36, 6, 0, Math.PI * 2)
  ctx.fill()

  const bob = Math.sin(t / 800) * 5
  ctx.fillStyle = 'rgba(207,214,221,0.78)'
  ctx.beginPath()
  ctx.moveTo(38, 148 + bob)
  ctx.quadraticCurveTo(34, 70, 66, 52)
  ctx.quadraticCurveTo(98, 70, 94, 148 + bob)
  for (let i = 0; i < 4; i++) {
    ctx.quadraticCurveTo(94 - 14 * (i + 0.5), 148 + bob - 14 - (i % 2) * 12, 94 - 14 * (i + 1), 148 + bob)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(160,175,195,0.5)'
  ditherRect(ctx, 42, 96, 46, 44, 'rgba(160,175,195,0.5)')

  ctx.fillStyle = '#0c1018'
  ctx.beginPath()
  ctx.ellipse(56, 84 + bob, 6, 9, 0, 0, Math.PI * 2)
  ctx.ellipse(78, 84 + bob, 6, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(127,212,255,0.35)'
  ctx.beginPath()
  ctx.arc(56, 86 + bob, 2, 0, Math.PI * 2)
  ctx.arc(78, 86 + bob, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0c1018'
  ctx.beginPath()
  ctx.ellipse(67, 104 + bob, 7, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(220,230,245,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(38, 120 + bob)
  ctx.quadraticCurveTo(20, 128 + bob, 24, 146 + bob)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(94, 118 + bob)
  ctx.quadraticCurveTo(112, 126 + bob, 108, 144 + bob)
  ctx.stroke()
  vignette(ctx, W, H)
}

const boss: Painter = (ctx, t) => {
  const pulse = 0.5 + 0.5 * Math.sin(t / 380)
  vgrad(ctx, W, H, [
    [0, '#1a0c0e'],
    [0.6, `rgba(60,16,20,${0.8 + pulse * 0.2})`],
    [1, '#100708'],
  ])
  ctx.fillStyle = `rgba(224,38,38,${0.05 + pulse * 0.06})`
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0d0709'
  for (let i = 0; i < 5; i++) px(ctx, 6 + i * 30, 20, 14, H - 20, '#0d0709')

  ctx.fillStyle = '#120d16'
  ctx.beginPath()
  ctx.moveTo(2, H)
  ctx.lineTo(20, 96)
  ctx.lineTo(40, 108)
  ctx.lineTo(52, 92)
  ctx.lineTo(66, 104)
  ctx.lineTo(80, 92)
  ctx.lineTo(92, 108)
  ctx.lineTo(112, 96)
  ctx.lineTo(130, H)
  ctx.closePath()
  ctx.fill()
  ditherRect(ctx, 20, 110, 92, 30, '#0a0710')

  px(ctx, 44, 26, 44, 10, '#c9a227')
  px(ctx, 40, 12, 8, 16, '#c9a227')
  px(ctx, 62, 4, 8, 24, '#c9a227')
  px(ctx, 84, 12, 8, 16, '#c9a227')
  px(ctx, 43, 28, 6, 6, `rgba(224,38,38,${0.5 + pulse * 0.5})`)
  px(ctx, 83, 28, 6, 6, '#7a5a1d')

  ctx.fillStyle = '#ded6c4'
  ctx.beginPath()
  ctx.ellipse(66, 62, 30, 28, 0, 0, Math.PI * 2)
  ctx.fill()
  px(ctx, 42, 58, 10, 16, '#b8ac94')
  px(ctx, 80, 58, 10, 16, '#b8ac94')
  ditherRect(ctx, 46, 44, 40, 10, '#cabfa8')
  ctx.fillStyle = '#17141c'
  ctx.beginPath()
  ctx.ellipse(54, 60, 9, 11, 0, 0, Math.PI * 2)
  ctx.ellipse(78, 60, 9, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  const eye = 0.5 + 0.5 * Math.sin(t / 300)
  ctx.fillStyle = `rgba(201,162,39,${0.6 + 0.4 * eye})`
  ctx.beginPath()
  ctx.arc(54, 61, 3.5, 0, Math.PI * 2)
  ctx.arc(78, 61, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#17141c'
  ctx.beginPath()
  ctx.moveTo(66, 66)
  ctx.lineTo(60, 78)
  ctx.lineTo(72, 78)
  ctx.closePath()
  ctx.fill()
  for (let i = 0; i < 6; i++) {
    px(ctx, 46 + i * 7, 84, 5, i % 2 ? 8 : 5, '#ded6c4')
  }
  px(ctx, 46, 92, 40, 3, '#b8ac94')

  ctx.fillStyle = 'rgba(224,38,38,0.5)'
  ctx.fillRect(30, 100, 4, 40)
  ctx.fillRect(98, 104, 4, 36)
  splatterLike(ctx, t)
  vignette(ctx, W, H)
}

function splatterLike(ctx: Ctx, t: number): void {
  for (let i = 0; i < 8; i++) {
    const a = 0.15 + 0.15 * Math.sin(t / 500 + i * 2)
    ctx.fillStyle = `rgba(143,29,29,${a})`
    ctx.fillRect((i * 47) % (W - 10) + 6, 120 + ((i * 23) % 30), 2, 2)
  }
}

const PAINTERS: Record<NpcKey, Painter> = { coroner, witness, scribe, keeper, ghost, boss, butcher: () => {} }

export function PortraitArtwork({ npc, className }: { npc: NpcKey; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (npc === 'butcher') return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const loop = (now: number) => {
      PAINTERS[npc](ctx, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [npc])

  if (npc === 'butcher') {
    return <ButcherArtwork className={className} />
  }

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
