import { useEffect, useRef } from 'react'

const W = 232
const H = 244

const C = {
  wall: '#37323f',
  wallDark: '#2b2733',
  wallLine: '#211d29',
  rail: '#4d4757',
  railDark: '#38333f',
  hook: '#625c6c',
  clothA: '#5e2121',
  clothB: '#742929',
  clothC: '#4a1818',
  blood: '#8f1d1d',
  bloodBright: '#b02424',
  bloodDark: '#5c1111',
  shelfPost: '#26202b',
  shelfBoard: '#332a38',
  meat: '#94403c',
  meatLight: '#ad5650',
  skin: '#b3a49b',
  skinShade: '#8d7d74',
  skinDark: '#6e6058',
  shirt: '#17161b',
  shirtLight: '#222127',
  letter: '#eceaf0',
  apron: '#5f3327',
  apronShade: '#4a261d',
  gore: '#a13030',
  goreDark: '#30090b',
  tusk: '#e8d07f',
  pig: '#c69a97',
  pigShade: '#a1746f',
  pigLight: '#dcB4AE'.toLowerCase(),
  snout: '#dcb2aa',
  steel: '#b9bec8',
  steelLight: '#e4e8ee',
  handle: '#4a2f1d',
  ember: '#ff6a2a',
}

type Ctx = CanvasRenderingContext2D

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ditherRect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, phase = 0): void {
  ctx.fillStyle = c
  for (let yy = 0; yy < h; yy++) {
    for (let xx = (yy + phase) % 2; xx < w; xx += 2) {
      ctx.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1)
    }
  }
}

function splatter(ctx: Ctx, rng: () => number, cx: number, cy: number, rw: number, rh: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const d = rng()
    const x = Math.round(cx + Math.cos(a) * rw * d)
    const y = Math.round(cy + Math.sin(a) * rh * d)
    const s = rng() > 0.82 ? 2 : 1
    px(ctx, x, y, s, s, rng() > 0.6 ? C.bloodBright : C.blood)
  }
}

const FONT: Record<string, string[]> = {
  P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
  A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
  N: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  R: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
}

function drawText(ctx: Ctx, text: string, x: number, y: number, scale: number, color: string, outline?: string): void {
  let cx = x
  for (const ch of text) {
    const glyph = FONT[ch]
    if (!glyph) { cx += 4 * scale; continue }
    if (outline) {
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++)
          if (glyph[gy][gx] === 'X') px(ctx, cx - scale, gy * scale + y - scale, scale * 3, scale * 3, outline)
    }
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (glyph[gy][gx] === 'X') px(ctx, cx + gx * scale, y + gy * scale, scale, scale, color)
    cx += 4 * scale
  }
}

function paintScene(ctx: Ctx, t: number): void {
  const rng = mulberry32(18870102)

  px(ctx, 0, 0, W, H, C.wall)
  for (let x = 8; x < W; x += 22) px(ctx, x, 0, 2, H, C.wallLine)
  ditherRect(ctx, 0, 0, W, 40, C.wallDark)
  px(ctx, 0, H - 14, W, 14, '#211c17')
  px(ctx, 0, H - 14, W, 2, '#2c2620')

  px(ctx, 0, 8, W, 7, C.rail)
  px(ctx, 0, 13, W, 2, C.railDark)
  for (let x = 14; x < W - 10; x += 26) {
    px(ctx, x, 15, 3, 6, C.hook)
    px(ctx, x - 2, 19, 3, 3, C.hook)
  }

  const meatSlab = (x: number, y: number, w: number, hgt: number) => {
    for (let r = 0; r < hgt; r++) {
      const shrink = Math.round(r * 0.18)
      const wob = Math.round(Math.sin(r * 0.55) * 1.5)
      const rx = x + shrink + wob
      const rw = w - shrink * 2
      px(ctx, rx, y + r, rw, 1, r % 6 === 0 ? '#6e1414' : '#8f1d1d')
      if (r % 4 === 1) px(ctx, rx + 2, y + r, Math.max(2, rw - 6), 1, '#b95454')
      if (r % 7 === 3) px(ctx, rx + Math.floor(rw / 2), y + r, 3, 1, '#e8d8d0')
      if (r % 9 === 5) px(ctx, rx, y + r, 2, 2, '#4a0e0e')
    }
    px(ctx, x + Math.floor(w / 2) - 1, y - 4, 2, 4, C.hook)
    for (let i = 0; i < 3; i++) px(ctx, x + 3 + Math.floor((i * (w - 6)) / 2), y + hgt, 1, 2 + i, C.blood)
  }
  meatSlab(16, 21, 26, 62)
  meatSlab(196, 21, 30, 78)
  meatSlab(158, 21, 20, 44)

  px(ctx, 4, 64, 3, 152, C.shelfPost)
  px(ctx, 46, 64, 3, 152, C.shelfPost)
  for (const by of [76, 118, 160]) {
    px(ctx, 2, by, 50, 5, C.shelfBoard)
    const meatBlob = (mx: number, my: number, mw: number, mh: number) => {
      px(ctx, mx, my, mw, mh, '#8f1d1d')
      px(ctx, mx + 1, my + 1, mw - 3, 2, '#c04a42')
      px(ctx, mx + 3, my + 2, Math.max(3, mw - 8), 1, '#e0c8c0')
      px(ctx, mx + mw - 3, my + 2, 2, mh - 3, C.blood)
      px(ctx, mx + 2, my + mh - 2, mw - 5, 2, C.bloodDark)
      px(ctx, mx + 2, my + 3, 2, 2, '#5c0f0f')
      if (rng() > 0.4) px(ctx, mx + mw / 2, my + mh, 1, 3 + Math.floor(rng() * 3), C.blood)
    }
    meatBlob(8, by - 9, 16, 9)
    meatBlob(27, by - 8, 13, 8)
    splatter(ctx, rng, 26, by - 4, 20, 6, 8)
  }

  const hx = 126
  const headRows: Array<[number, number]> = [
    [-8, 14], [-10, 18], [-11, 20], [-12, 22], [-12, 23], [-12, 23], [-12, 22], [-11, 21],
  ]
  headRows.forEach(([off, wd], i) => {
    px(ctx, hx + off, 20 + i * 3, wd, 3, i < 2 ? C.skinShade : C.skin)
  })
  px(ctx, hx - 12, 24, 3, 12, C.skinShade)
  ditherRect(ctx, hx + 6, 26, 7, 12, C.skinShade)
  px(ctx, hx + 9, 22, 4, 10, C.skinShade)
  px(ctx, hx - 13, 30, 3, 7, C.skinDark)

  px(ctx, hx - 10, 38, 8, 2, C.skinDark)
  px(ctx, hx + 3, 37, 9, 2, C.skinDark)
  px(ctx, hx - 9, 40, 4, 3, '#d8d4da')
  px(ctx, hx - 8, 41, 2, 2, '#1a1a20')
  px(ctx, hx + 5, 40, 4, 3, '#d8d4da')
  px(ctx, hx + 6, 41, 2, 2, '#1a1a20')
  px(ctx, hx - 3, 44, 5, 4, C.skinShade)
  px(ctx, hx - 6, 49, 11, 2, C.skinDark)
  const cigY = 51
  px(ctx, hx + 4, cigY, 12, 2, '#d8d4da')
  px(ctx, hx + 14, cigY, 2, 2, '#f2ede4')

  px(ctx, hx - 6, 53, 12, 8, C.skin)
  px(ctx, hx - 8, 59, 16, 6, C.skinShade)
  ditherRect(ctx, hx - 8, 61, 16, 4, C.skinDark)

  px(ctx, hx - 22, 66, 44, 10, C.skin)
  ditherRect(ctx, hx - 24, 68, 8, 8, C.skinShade)
  ditherRect(ctx, hx + 16, 68, 8, 8, C.skinShade)

  px(ctx, 84, 84, 64, 26, C.shirt)
  px(ctx, 76, 94, 12, 30, C.shirt)
  px(ctx, 144, 94, 12, 30, C.shirt)
  px(ctx, 76, 94, 12, 3, C.shirtLight)
  px(ctx, 144, 94, 12, 3, C.shirtLight)
  px(ctx, 108, 74, 16, 12, C.shirt)
  px(ctx, 84, 106, 72, 46, C.shirt)
  ditherRect(ctx, 84, 142, 72, 12, '#101014')

  px(ctx, 102, 84, 4, 24, C.apron)
  px(ctx, 126, 84, 4, 24, C.apron)
  px(ctx, 98, 106, 40, 96, C.apron)
  px(ctx, 98, 106, 40, 3, C.apronShade)
  px(ctx, 98, 196, 40, 6, C.apronShade)
  px(ctx, 104, 168, 30, 12, C.apronShade)

  for (let i = 0; i < 12; i++) {
    const sx = 99 + Math.floor(rng() * 33)
    const sy = 108 + Math.floor(rng() * 86)
    const sw = 4 + Math.floor(rng() * 9)
    const sh = 3 + Math.floor(rng() * 7)
    px(ctx, sx, sy, sw, sh, rng() > 0.45 ? C.blood : C.bloodBright)
    px(ctx, sx + sw, sy + 1, 1, Math.max(1, sh - 2), C.bloodDark)
    if (rng() > 0.5) px(ctx, sx - 1, sy + 2, 1, 2, C.bloodDark)
  }
  for (let i = 0; i < 150; i++) {
    const sx = 100 + Math.floor(rng() * 36)
    const sy = 110 + Math.floor(rng() * 88)
    const s = rng() > 0.85 ? 2 : 1
    const col = rng() > 0.55 ? C.blood : rng() > 0.4 ? C.gore : C.bloodDark
    px(ctx, sx, sy, s, s, col)
  }

  px(ctx, 112, 132, 16, 26, C.goreDark)
  px(ctx, 113, 134, 14, 22, '#180507')
  for (let i = 0; i < 6; i++) {
    px(ctx, 111 + (i % 3) * 6, 131 + i * 4, 3, 3, C.gore)
    px(ctx, 125 - (i % 2) * 5, 133 + i * 4, 2, 4, C.blood)
  }
  splatter(ctx, rng, 118, 145, 26, 34, 26)
  for (let i = 0; i < 6; i++) px(ctx, 102 + i * 6, 202, 1, 2 + (i % 3), C.blood)
  drawText(ctx, 'PANTERA', 93, 114, 2, C.letter, '#000')

  const armSeg = (x1: number, y1: number, x2: number, y2: number, th: number) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
    for (let i = 0; i <= steps; i++) {
      const ix = x1 + ((x2 - x1) * i) / steps
      const iy = y1 + ((y2 - y1) * i) / steps
      px(ctx, ix, iy, th, th, C.skin)
      if (i % 3 === 0) px(ctx, ix, iy, 2, th, C.skinShade)
    }
  }

  armSeg(92, 92, 74, 66, 11)
  armSeg(74, 66, 62, 48, 11)
  px(ctx, 54, 40, 16, 12, C.skin)
  ditherRect(ctx, 54, 48, 16, 4, C.skinShade)

  px(ctx, 26, 22, 40, 30, C.pig)
  px(ctx, 22, 30, 46, 18, C.pig)
  ditherRect(ctx, 26, 44, 42, 6, C.pigShade)
  px(ctx, 24, 24, 10, 12, C.pigShade)
  px(ctx, 30, 18, 14, 8, C.pigShade)
  px(ctx, 58, 26, 10, 14, C.snout)
  px(ctx, 62, 31, 2, 3, '#5c3a38')
  px(ctx, 66, 31, 2, 3, '#5c3a38')
  px(ctx, 20, 34, 8, 6, C.pigLight || C.pig)
  px(ctx, 34, 30, 5, 3, '#2a2226')
  px(ctx, 35, 31, 3, 2, '#efe9df')
  px(ctx, 40, 50, 10, 4, '#d8ccb8')
  px(ctx, 44, 47, 3, 5, C.tusk)
  px(ctx, 46, 45, 2, 4, C.tusk)
  px(ctx, 30, 25, 12, 1, C.pigShade)
  px(ctx, 31, 27, 14, 1, C.pigShade)
  px(ctx, 40, 29, 8, 1, '#8d5f5a')
  px(ctx, 51, 35, 2, 8, C.pigShade)
  px(ctx, 55, 42, 2, 6, '#8d5f5a')
  px(ctx, 27, 36, 2, 6, C.pigShade)
  px(ctx, 29, 42, 3, 1, '#8d5f5a')
  splatter(ctx, rng, 46, 34, 24, 13, 36)
  px(ctx, 46, 50, 1, 7, C.bloodBright)
  px(ctx, 61, 41, 2, 2, C.blood)
  splatter(ctx, rng, 44, 52, 22, 8, 22)
  px(ctx, 40, 56, 1, 8, C.blood)
  px(ctx, 50, 56, 1, 6, C.bloodBright)

  armSeg(148, 96, 162, 122, 12)
  armSeg(162, 122, 166, 154, 13)
  px(ctx, 160, 152, 14, 14, C.skin)
  ditherRect(ctx, 160, 162, 14, 4, C.skinShade)
  for (let i = 0; i < 4; i++) px(ctx, 161, 153 + i * 3, 12, 1, C.skinDark)

  px(ctx, 165, 164, 5, 18, C.handle)
  for (let i = 0; i < 5; i++) px(ctx, 165, 165 + i * 3, 5, 1, i % 2 ? '#301d10' : '#5c3a22')
  px(ctx, 165, 164, 5, 1, '#7a5230')
  px(ctx, 163, 163, 9, 4, '#6b4a2f')
  px(ctx, 163, 163, 9, 1, '#8a5c36')
  px(ctx, 164, 181, 7, 2, '#8a8f96')
  px(ctx, 165, 183, 5, 1, '#55595f')
  px(ctx, 146, 166, 18, 24, C.steel)
  px(ctx, 146, 166, 18, 3, C.steelLight)
  px(ctx, 146, 186, 18, 3, C.steelLight)
  px(ctx, 146, 172, 18, 3, C.blood)
  px(ctx, 149, 175, 2, 9, C.blood)
  px(ctx, 158, 174, 3, 12, C.bloodDark)
  splatter(ctx, rng, 155, 190, 20, 10, 14)

  const smoke = (ox: number, oy: number) => {
    for (let i = 0; i < 16; i++) {
      const prog = i / 16
      const sy = oy - i * 5 - ((t * 0.012) % 5)
      const sx = ox + Math.sin(t * 0.0012 + i * 0.7) * (3 + prog * 9)
      const s = 2 + prog * 4
      ctx.fillStyle = `rgba(200,196,208,${0.5 - prog * 0.42})`
      ctx.beginPath()
      ctx.arc(sx, sy, s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  smoke(hx + 16, cigY)

  const ember = 0.55 + 0.45 * Math.sin(t / 180)
  px(ctx, hx + 14, cigY - 1, 3, 3, `rgba(255,106,42,${ember})`)
  px(ctx, hx + 15, cigY, 1, 1, '#ffd27a')
}

export function ButcherArtwork({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const loop = (now: number) => {
      paintScene(ctx, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

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
