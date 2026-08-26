import type { NpcKey, SceneKey } from './types'

export const BRUTAL = {
  void: '#0b0b0d',
  ash: '#16161a',
  smoke: '#232329',
  bone: '#e7e0d0',
  blood: '#8f1d1d',
  bloodHot: '#e02626',
  rust: '#5c4033',
  bile: '#6d8f4b',
  gold: '#c9a227',
} as const

export interface HeroPalette {
  label: string
  colors: Record<string, string>
}

const OUTLINE = '#08080a'

const HERO_TIERS: Array<{ min: number; max: number; palette: HeroPalette }> = [
  {
    min: 1,
    max: 4,
    palette: {
      label: 'Data Novice',
      colors: { c: '#3f3f47', d: '#2b2b31', t: '#8a8a94', s: '#c9a17a', e: '#ff5b5b', b: '#141418', v: '#5ac8e8' },
    },
  },
  {
    min: 5,
    max: 9,
    palette: {
      label: 'Query Scrapper',
      colors: { c: '#5c4033', d: '#402c23', t: '#a9743a', s: '#c9a17a', e: '#ffb03a', b: '#181310', v: '#ffd27a' },
    },
  },
  {
    min: 10,
    max: 14,
    palette: {
      label: 'Schema Explorer',
      colors: { c: '#2f4a33', d: '#203320', t: '#6d8f4b', s: '#c9a17a', e: '#7fe066', b: '#10160f', v: '#9fff8a' },
    },
  },
  {
    min: 15,
    max: 19,
    palette: {
      label: 'Query Knight',
      colors: { c: '#39435c', d: '#272e40', t: '#aab4c8', s: '#c9a17a', e: '#66d9ff', b: '#0f1218', v: '#7fd4ff' },
    },
  },
  {
    min: 20,
    max: 29,
    palette: {
      label: 'Database Artisan',
      colors: { c: '#4a2f5c', d: '#332042', t: '#c9a227', s: '#c9a17a', e: '#e070ff', b: '#140f18', v: '#f09aff' },
    },
  },
  {
    min: 30,
    max: 9999,
    palette: {
      label: 'DBA Overlord',
      colors: { c: '#571c23', d: '#381217', t: '#c9a227', s: '#c9a17a', e: '#ffffff', b: '#0d0507', v: '#ff5b5b' },
    },
  },
]

export function getHeroTier(level: number): HeroPalette {
  return HERO_TIERS.find((t) => level >= t.min && level <= t.max)?.palette ?? HERO_TIERS[0].palette
}

type Ctx = CanvasRenderingContext2D

const HERO_A = [
  '......kkkk......',
  '.....kccccck....',
  '....kccccccck...',
  '....kcccccccck..',
  '....kksssssskk..',
  '....kkeeeeeekk..',
  '....kksssssskk..',
  '.....kkkkkkkk...',
  '....kcvcttcvck..',
  '...kccccccccck..',
  '..kccdtttdcck...',
  '.kdcccccccccck..',
  '.kdcccccccccck..',
  '.kkdcccccccdkk..',
  '.kdbbccvcbbdk...',
  '.kdbbk.kbbdk....',
  '.kdbbk.kbbdk....',
  '..kbbk.kbbk.....',
  '..kkkk.kkkk.....',
]

const HERO_B = [
  ...HERO_A.slice(0, 15),
  'kdbbkk..kkbbdk..',
  'kbbk......kbbk..',
  'kbbk......kbbk..',
  'kkkk......kkkk..',
]

function drawGrid(
  ctx: Ctx,
  grid: string[],
  palette: Record<string, string>,
  ox: number,
  oy: number,
  s: number,
): void {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      ctx.fillStyle = ch === 'k' ? OUTLINE : (palette[ch] ?? BRUTAL.smoke)
      ctx.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), Math.ceil(s), Math.ceil(s))
    }
  }
}

export function drawHero(
  ctx: Ctx,
  ox: number,
  oy: number,
  s: number,
  t: number,
  moving: boolean,
  level: number,
): void {
  const palette = getHeroTier(level).colors
  const frame = moving && Math.floor(t / 140) % 2 === 1 ? HERO_B : HERO_A
  const bob = !moving && Math.floor(t / 700) % 2 === 0 ? -1 : 0
  drawGrid(ctx, frame, palette, ox, oy + bob * s, s)
}

export interface PixelSpriteDef {
  palette: Record<string, string>
  rows: string[]
}

const npc = (palette: Record<string, string>, rows: string[]): PixelSpriteDef => ({ palette, rows })

export const NPC_SPRITES: Record<NpcKey, PixelSpriteDef> = {
  coroner: npc(
    { k: BRUTAL.void, g: BRUTAL.smoke, m: BRUTAL.bile, e: BRUTAL.bloodHot, b: BRUTAL.bone },
    [
      '...kkkkkk...',
      '..kggggggk..',
      '.kggggggggk.',
      '.kgmmmmmmgk.',
      'kkmemeemkkk.',
      'kkmmmmmmkkkk',
      '.kggggggggk.',
      '.kggkkkkggk.',
      'kkggkbbkggkk',
      'kkggkbbkggkk',
      '.kggggggggk.',
      '..kkkkkkkk..',
    ],
  ),
  witness: npc(
    { k: BRUTAL.void, s: '#b98d64', h: '#3a2a20', e: BRUTAL.bone, w: '#4a4a52', t: BRUTAL.blood },
    [
      '...kkkkkk...',
      '..khhhhhhk..',
      '.khhhhhhhhk.',
      '.khsssssshk.',
      'kkseesseekkk',
      'kkssssssskkk',
      '.kwwwwwwwwk.',
      '.kwwwttwwwk.',
      'kkwwwttwwwkk',
      'kkwwwwwwwwkk',
      '.kwwwwwwwwk.',
      '..kkkkkkkk..',
    ],
  ),
  scribe: npc(
    { k: BRUTAL.void, v: '#2a1f33', x: '#d8d8e8', t: BRUTAL.bloodHot, b: BRUTAL.bone },
    [
      '...kkkkkk...',
      '..kvvvvvvk..',
      '.kvvvvvvvvk.',
      '.kvxxxxxxvk.',
      'kkvttttttvkk',
      'kkvxxxxxxvkk',
      '.kvvvvvvvvk.',
      '.kvvkbbkvvk.',
      'kkvvkbbkvvkk',
      'kkvvvbbvvvkk',
      '.kvvvvvvvvk.',
      '..kkkkkkkk..',
    ],
  ),
  keeper: npc(
    { k: BRUTAL.void, j: '#20302a', g: BRUTAL.gold, e: BRUTAL.bile, b: BRUTAL.bone },
    [
      '...kkkkkk...',
      '..kkkkkkkk..',
      '.kjjjjjjjjk.',
      '.kjeeeeeejk.',
      'kkjeeeeeekkk',
      'kkjggggggjkk',
      '.kjjjjjjjjk.',
      '.kjjkbbkjjk.',
      'kkjjkbbkjjkk',
      'kkjjjbbjjjkk',
      '.kjjjjjjjjk.',
      '..kkkkkkkk..',
    ],
  ),
  ghost: npc(
    { k: BRUTAL.void, w: '#cfd6dd', e: '#7fd4ff', t: BRUTAL.bloodHot },
    [
      '...kwwwwk...',
      '..kwwwwwwk..',
      '.kwwwwwwwwk.',
      '.kwewwwewwk.',
      'kwwwttwwwwk.',
      'kwwwwwwwwwkk',
      'kwwwwwwwwwkk',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '.kwkwwkwwwk.',
      '.kwwkwwkwwk.',
      '..k.kwwk.k..',
    ],
  ),
  boss: npc(
    { k: BRUTAL.void, c: '#101014', r: BRUTAL.bloodHot, e: BRUTAL.gold, b: BRUTAL.bone },
    [
      '..r......r..',
      '.rr.rrrr.rr.',
      '.rrrrrrrrrr.',
      '..rccccccr..',
      '..kcccccck..',
      '.kcceccecck.',
      'kcceeecceekk',
      'kcccccccccck',
      '.kcckkkkcck.',
      '.kckbbbbkck.',
      'kcckbbbbkcck',
      'kcckkkkkkcck',
      '.kcccccccck.',
      '..kkkkkkkk..',
    ],
  ),
  butcher: npc(
    {
      k: '#08080a',
      s: '#c9a17a',
      S: '#9c7752',
      e: '#1a1a1f',
      c: '#26262c',
      a: '#d8d3c8',
      A: '#8f1d1d',
      w: '#aab4c8',
    },
    [
      '...kkkkkk.....',
      '..kssssssk....',
      '.kssssssssk...',
      '.ksSSssSSsk...',
      '.kseksseksk...',
      '.kssskksssk...',
      '..kssssssk....',
      '.kckksskkckk..',
      '.kcaaaaaackww.',
      '.kcAaaaaAckww.',
      '.kaaAAAAaakww.',
      '.kaaaaaaaak.w.',
      '.kcAaaaaAck...',
      '..kkkkkkkk....',
    ],
  ),
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

type Pt = [number, number]

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function drawTree(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = '#4a3018'
  ctx.fillRect(x - 1, y - 3, 2, 4)
  const r = 3 + Math.floor(rng() * 2)
  ctx.fillStyle = '#14511f'
  ctx.beginPath()
  ctx.arc(x, y - 5, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2c7a36'
  ctx.beginPath()
  ctx.arc(x - 1, y - 6, r - 1.4, 0, Math.PI * 2)
  ctx.fill()
}

function drawDeadTree(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = '#38281c'
  ctx.fillRect(x - 1, y - 8, 2, 9)
  ctx.fillRect(x - 4, y - 6, 3, 1)
  ctx.fillRect(x - 5, y - 7, 2, 1)
  ctx.fillRect(x + 1, y - 5, 3, 1)
  ctx.fillRect(x + 3, y - 6, 1, 2)
  if (rng() > 0.5) {
    ctx.fillStyle = '#4c3626'
    ctx.fillRect(x - 1, y - 8, 1, 9)
  }
}

function drawCyberTree(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = '#2a1d14'
  ctx.fillRect(x - 1, y - 3, 2, 4)
  ctx.fillRect(x + 1, y - 1, 3, 1)
  const r = 3 + Math.floor(rng() * 2)
  ctx.fillStyle = '#0f3a18'
  ctx.beginPath()
  ctx.arc(x, y - 5, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c5c28'
  ctx.beginPath()
  ctx.arc(x - 1, y - 6, r - 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8f1d1d'
  ctx.fillRect(x + 1, y - 6, 1, 1)
  ctx.fillRect(x - 2, y - 4, 1, 1)
  ctx.fillStyle = '#35e0d8'
  ctx.fillRect(x, y - 7, 1, 1)
}

function drawGorePile(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = '#4e0c0c'
  ctx.fillRect(x - 2, y - 1, 5, 2)
  ctx.fillStyle = '#8f1d1d'
  ctx.fillRect(x - 1, y - 2, 3, 2)
  ctx.fillStyle = '#b02424'
  ctx.fillRect(x, y - 2, 1, 1)
  if (rng() > 0.5) {
    ctx.fillStyle = '#d8d0c0'
    ctx.fillRect(x + 2, y - 2, 2, 1)
  }
  ctx.fillStyle = '#3a3f46'
  ctx.fillRect(x - 3, y, 1, 1)
  ctx.fillStyle = '#35e0d8'
  ctx.fillRect(x + 3, y - 1, 1, 1)
}

function drawBush(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = rng() > 0.5 ? '#1f6b2c' : '#175426'
  ctx.beginPath()
  ctx.arc(x, y - 1, 2.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawRock(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#8d8d93'
  ctx.fillRect(x - 2, y - 2, 4, 3)
  ctx.fillRect(x - 1, y - 3, 2, 1)
  ctx.fillStyle = '#b9b9bf'
  ctx.fillRect(x - 1, y - 2, 1, 1)
}

function drawMountain(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#8d8d93'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 0.85, y)
  ctx.lineTo(x - s * 0.85, y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#6b6b70'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 0.85, y)
  ctx.lineTo(x + s * 0.15, y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e8ecef'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 0.22, y - s * 0.62)
  ctx.lineTo(x - s * 0.22, y - s * 0.62)
  ctx.closePath()
  ctx.fill()
}

function drawCastle(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#5c6066'
  ctx.fillRect(x - 24, y - 28, 10, 28)
  ctx.fillRect(x + 14, y - 28, 10, 28)
  ctx.fillStyle = '#4a4d53'
  ctx.fillRect(x - 24, y - 28, 3, 28)
  ctx.fillRect(x + 14, y - 28, 3, 28)
  ctx.fillStyle = '#6e7278'
  for (const tx of [x - 24, x + 14]) {
    for (let i = 0; i < 3; i++) ctx.fillRect(tx + i * 4, y - 31, 2, 3)
  }
  for (let ry = y - 26; ry < y; ry += 6) {
    ctx.fillStyle = '#4a4d53'
    ctx.fillRect(x - 24, ry, 10, 1)
    ctx.fillRect(x + 14, ry, 10, 1)
  }

  ctx.fillStyle = '#6a6e75'
  ctx.fillRect(x - 13, y - 22, 26, 22)
  ctx.fillStyle = '#54575e'
  ctx.fillRect(x - 13, y - 22, 4, 22)
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 13 + i * 6, y - 25, 3, 3)
  for (let ry = y - 20; ry < y; ry += 5) {
    ctx.fillStyle = '#54575e'
    ctx.fillRect(x - 13, ry, 26, 1)
  }
  ctx.fillStyle = '#8a8e95'
  ctx.fillRect(x - 10, y - 21, 2, 1)
  ctx.fillRect(x + 2, y - 14, 2, 1)
  ctx.fillRect(x - 22, y - 12, 2, 1)
  ctx.fillRect(x + 17, y - 18, 2, 1)

  ctx.fillStyle = '#8f1d1d'
  ctx.fillRect(x - 21, y - 41, 5, 4)
  ctx.fillRect(x + 17, y - 41, 5, 4)
  ctx.fillStyle = '#1c1c22'
  ctx.fillRect(x - 19, y - 41, 1, 13)
  ctx.fillRect(x + 19, y - 41, 1, 13)

  const glow = (gx: number, gy: number) => {
    ctx.fillStyle = 'rgba(160,20,20,0.22)'
    ctx.fillRect(gx - 1, gy - 1, 6, 8)
    ctx.fillStyle = '#e02626'
    ctx.fillRect(gx, gy, 3, 5)
    ctx.fillStyle = '#5c0f0f'
    ctx.fillRect(gx + 1, gy + 1, 1, 3)
  }
  glow(x - 9, y - 17)
  glow(x + 6, y - 17)
  glow(x - 21, y - 24)
  glow(x + 19, y - 24)
  glow(x - 2, y - 20)

  ctx.fillStyle = 'rgba(224,38,38,0.14)'
  ctx.beginPath()
  ctx.arc(x, y - 6, 9, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#141418'
  ctx.beginPath()
  ctx.arc(x, y - 6, 4, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(x - 4, y - 6, 8, 6)
  ctx.fillStyle = '#b02424'
  ctx.fillRect(x - 2, y - 5, 4, 5)
  ctx.fillStyle = '#5c0f0f'
  ctx.fillRect(x - 1, y - 4, 2, 3)
}

function drawMapLamp(ctx: Ctx, x: number, gy: number): void {
  ctx.fillStyle = '#241c14'
  ctx.fillRect(x, gy - 14, 2, 14)
  ctx.fillRect(x - 1, gy - 1, 4, 2)
  ctx.fillStyle = '#6b3a1e'
  ctx.fillRect(x, gy - 9, 1, 2)
  ctx.fillRect(x + 1, gy - 4, 1, 2)
  ctx.fillStyle = '#241c14'
  ctx.fillRect(x, gy - 16, 6, 2)
  const lx = x + 5

  const cone = ctx.createLinearGradient(0, gy - 14, 0, gy + 3)
  cone.addColorStop(0, 'rgba(255,198,88,0.5)')
  cone.addColorStop(1, 'rgba(255,198,88,0.04)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(lx - 1, gy - 14)
  ctx.lineTo(lx + 1, gy - 14)
  ctx.lineTo(lx + 8, gy + 3)
  ctx.lineTo(lx - 8, gy + 3)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'rgba(255,198,88,0.2)'
  ctx.beginPath()
  ctx.ellipse(lx, gy + 2, 8, 2, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffd27a'
  ctx.fillRect(lx - 1, gy - 14, 2, 2)
}

export function drawOverworld(ctx: Ctx, w: number, h: number, nodes: Pt[]): void {
  const rng = mulberry32(20260102)

  ctx.fillStyle = '#3e7a34'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 56; i++) {
    const r = rng()
    ctx.fillStyle =
      r > 0.66 ? 'rgba(56,118,48,0.55)' : r > 0.33 ? 'rgba(40,92,36,0.5)' : 'rgba(88,74,42,0.32)'
    ctx.beginPath()
    ctx.ellipse(rng() * w, rng() * h, 6 + rng() * 10, 3 + rng() * 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const polyline = (color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    nodes.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }

  ctx.save()
  ctx.globalAlpha = 0.35
  polyline('#3e7a34', 26)
  ctx.restore()

  polyline('#6b4a30', 8)
  polyline('#a8844e', 5)

  ctx.strokeStyle = '#6b4a30'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-4, nodes[0][1])
  ctx.lineTo(nodes[0][0], nodes[0][1])
  ctx.stroke()
  ctx.strokeStyle = '#a8844e'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(-4, nodes[0][1])
  ctx.lineTo(nodes[0][0], nodes[0][1])
  ctx.stroke()

  const dtl = mulberry32(918273)
  for (let i = 0; i < nodes.length - 1; i++) {
    const [ax, ay] = nodes[i]
    const [bx, by] = nodes[i + 1]
    const len = Math.hypot(bx - ax, by - ay) || 1
    const nx = -(by - ay) / len
    const ny = (bx - ax) / len
    for (let s = 0; s < len; s += 2.4) {
      const t = s / len
      const cx = ax + (bx - ax) * t
      const cy = ay + (by - ay) * t
      const off = (dtl() - 0.5) * 4.6
      const px2 = Math.round(cx + nx * off)
      const py2 = Math.round(cy + ny * off)
      const r = dtl()
      if (r < 0.14) {
        ctx.fillStyle = dtl() > 0.5 ? '#7a1414' : '#a12020'
        ctx.fillRect(px2, py2, 2, 1)
        ctx.fillRect(px2 + (dtl() > 0.5 ? 2 : -1), py2 + 1, 1, 1)
      } else if (r < 0.3) {
        ctx.fillStyle = '#4c3626'
        ctx.fillRect(px2, py2, 2, 1)
        ctx.fillRect(px2 + 1, py2 - 1, 1, 1)
      } else if (r < 0.36) {
        const ex = Math.round(cx + nx * (off > 0 ? 4.5 : -4.5))
        const ey = Math.round(cy + ny * (off > 0 ? 4.5 : -4.5))
        ctx.fillStyle = '#d8d0c0'
        ctx.fillRect(ex, ey, 2, 1)
        ctx.fillStyle = '#8a8578'
        ctx.fillRect(ex, ey, 1, 1)
      } else if (r < 0.42) {
        const ex = Math.round(cx + nx * (off > 0 ? 5 : -5))
        const ey = Math.round(cy + ny * (off > 0 ? 5 : -5))
        ctx.fillStyle = '#3f4a54'
        ctx.fillRect(ex, ey, 2, 1)
        ctx.fillStyle = '#35e0d8'
        ctx.fillRect(ex + 1, ey - 1, 1, 1)
      }
    }
  }

  const nearPath = (x: number, y: number) =>
    nodes.some((pt) => Math.hypot(pt[0] - x, pt[1] - y) < 13) ||
    nodes.some((pt, i) => i < nodes.length - 1 && distToSegment([x, y] as Pt, pt, nodes[i + 1]) < 9)

  let trees = 0
  let dead = 0
  let cyber = 0
  let bushes = 0
  let rocks = 0
  let piles = 0
  for (
    let attempt = 0;
    attempt < 800 && (trees < 30 || dead < 8 || cyber < 6 || bushes < 12 || rocks < 5 || piles < 7);
    attempt++
  ) {
    const x = 14 + rng() * (w - 20)
    const y = 6 + rng() * (h - 12)
    if (nearPath(x, y)) continue
    if (x > w - 36 && y < h * 0.46) continue
    const roll = rng()
    if (roll < 0.42 && trees < 30) {
      drawTree(ctx, x, y, rng)
      trees++
    } else if (roll < 0.52 && dead < 8) {
      drawDeadTree(ctx, x, y, rng)
      dead++
    } else if (roll < 0.6 && cyber < 6) {
      drawCyberTree(ctx, x, y, rng)
      cyber++
    } else if (roll < 0.78 && bushes < 12) {
      drawBush(ctx, x, y, rng)
      bushes++
    } else if (roll < 0.86 && rocks < 5) {
      drawRock(ctx, x, y)
      rocks++
    } else if (piles < 7) {
      drawGorePile(ctx, x, y, rng)
      piles++
    }
  }

  drawMountain(ctx, 96, 122, 13)
  drawMountain(ctx, 110, 126, 9)
  drawMountain(ctx, 88, 128, 7)

  drawCastle(ctx, nodes[nodes.length - 1][0] - 2, nodes[nodes.length - 1][1] - 4)

  const night = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.22, w / 2, h * 0.45, h * 0.85)
  night.addColorStop(0, 'rgba(22,14,40,0.18)')
  night.addColorStop(1, 'rgba(10,6,24,0.55)')
  ctx.fillStyle = night
  ctx.fillRect(0, 0, w, h)

  for (const [gx, gy] of [
    [w * 0.36, h * 0.6],
    [w * 0.62, h * 0.52],
    [w * 0.86, h * 0.34],
  ] as Array<[number, number]>) {
    const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 24)
    g.addColorStop(0, 'rgba(143,29,29,0.18)')
    g.addColorStop(1, 'rgba(143,29,29,0)')
    ctx.fillStyle = g
    ctx.fillRect(gx - 24, gy - 24, 48, 48)
  }

  drawMapLamp(ctx, 40, 88)
  drawMapLamp(ctx, 65, 87)
  drawMapLamp(ctx, 107, 84)
  drawMapLamp(ctx, 132, 81)
  drawMapLamp(ctx, 171, 71)
}





function drawCross(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(x - s * 0.15, y - s, s * 0.3, s)
  ctx.fillRect(x - s * 0.5, y - s * 0.72, s, s * 0.28)
}

function vgrad(ctx: Ctx, w: number, h: number, stops: Array<[number, string]>): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  stops.forEach(([p, c]) => g.addColorStop(p, c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function stars(ctx: Ctx, w: number, h: number, maxY: number): void {
  ctx.fillStyle = 'rgba(232,226,214,0.7)'
  for (let i = 0; i < 40; i++) {
    const x = ((i * 197) % w)
    const y = ((i * 89) % maxY)
    const s = (i % 4 === 0) ? 2 : 1
    ctx.globalAlpha = 0.3 + ((i * 13) % 60) / 100
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 1
}

function bigMoon(ctx: Ctx, cx: number, cy: number, r: number, color: string, glow: string): void {
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.14)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + r * 0.32, cy + r * 0.3, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
}

function buildingRow(
  ctx: Ctx,
  w: number,
  baseY: number,
  color: string,
  roofColor: string,
  winColor: string,
  minH: number,
  maxH: number,
  step: number,
  litChance: number,
): void {
  let x = -10
  let i = 0
  while (x < w + 10) {
    const bh = minH + ((i * 37) % (maxH - minH))
    const bw = step - 8
    ctx.fillStyle = color
    ctx.fillRect(x, baseY - bh, bw, bh)
    ctx.fillStyle = roofColor
    if (i % 3 === 0) {
      ctx.beginPath()
      ctx.moveTo(x - 3, baseY - bh)
      ctx.lineTo(x + bw / 2, baseY - bh - 12)
      ctx.lineTo(x + bw + 3, baseY - bh)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(x - 2, baseY - bh - 5, bw + 4, 5)
    }
    for (let wy = baseY - bh + 12; wy <= baseY - 16; wy += 24) {
      for (let wx = x + 8; wx <= x + bw - 14; wx += 20) {
        const lit = ((wx * 31 + wy * 17 + i * 7) % 100) / 100 < litChance
        ctx.fillStyle = lit ? winColor : 'rgba(10,8,14,0.85)'
        ctx.fillRect(wx, wy, 9, 11)
        if (lit) {
          ctx.fillStyle = 'rgba(255,176,58,0.18)'
          ctx.fillRect(wx - 3, wy - 3, 15, 17)
          ctx.fillStyle = 'rgba(10,8,14,0.85)'
        }
      }
    }
    x += step
    i++
  }
}

function streetBase(ctx: Ctx, w: number, h: number, y: number, color: string, lineColor: string): void {
  ctx.fillStyle = color
  ctx.fillRect(0, y, w, h - y)
  ctx.fillStyle = lineColor
  ctx.fillRect(0, y, w, 3)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let x = 6; x < w; x += 34) {
    ctx.fillRect(x, y + 14 + ((x * 7) % 20), 20, 3)
  }
}

function fogBand(ctx: Ctx, w: number, h: number, t: number, y: number, alpha: number, speed: number): void {
  ctx.fillStyle = `rgba(186,178,198,${alpha})`
  const fx = (t * speed) % (w + 400) - 200
  ctx.beginPath()
  ctx.ellipse(fx, y, 210, 22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(((fx + w / 1.6) % (w + 400)) - 100, y + 12, 170, 18, 0, 0, Math.PI * 2)
  ctx.fill()
}

function vignette(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function lampPost(ctx: Ctx, x: number, groundY: number, t: number): void {
  const flicker = 0.85 + 0.15 * Math.sin(t / 260 + x)
  const lx = x + 26
  const ly = groundY - 106

  const cone = ctx.createLinearGradient(0, ly, 0, groundY)
  cone.addColorStop(0, `rgba(255,196,92,${0.34 * flicker})`)
  cone.addColorStop(1, 'rgba(255,196,92,0.02)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(lx - 5, ly)
  ctx.lineTo(lx + 5, ly)
  ctx.lineTo(lx + 36, groundY + 2)
  ctx.lineTo(lx - 34, groundY + 2)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = `rgba(255,196,92,${0.16 * flicker})`
  ctx.beginPath()
  ctx.ellipse(lx, groundY + 1, 34, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#0d0a08'
  ctx.fillRect(x, groundY - 88, 4, 88)
  ctx.fillRect(x - 3, groundY - 2, 10, 3)
  ctx.strokeStyle = '#0d0a08'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x + 2, groundY - 86)
  ctx.quadraticCurveTo(x + 2, ly, lx, ly)
  ctx.stroke()

  ctx.fillStyle = '#0d0a08'
  ctx.fillRect(lx - 6, ly - 5, 12, 5)
  ctx.fillStyle = `rgba(255,214,130,${0.9 * flicker})`
  ctx.fillRect(lx - 4, ly - 2, 8, 3)
  ctx.fillStyle = `rgba(255,196,92,${0.3 * flicker})`
  ctx.beginPath()
  ctx.arc(lx, ly, 14, 0, Math.PI * 2)
  ctx.fill()
}

export function drawScene(ctx: Ctx, scene: SceneKey, w: number, h: number, t: number): void {
  const gy = h * 0.78

  switch (scene) {
    case 'street': {
      vgrad(ctx, w, h, [
        [0, '#241b3a'],
        [0.45, '#372752'],
        [0.75, '#2a1d42'],
        [1, '#1a1229'],
      ])
      stars(ctx, w, h, h * 0.38)
      bigMoon(ctx, w * 0.82, h * 0.2, 30, '#e9e4f4', 'rgba(222,212,244,0.12)')
      buildingRow(ctx, w, gy + 6, '#241c38', '#181126', 'rgba(150,110,190,0.4)', 100, 200, 96, 0.4)
      buildingRow(ctx, w, gy + 4, '#171126', '#100b1c', 'rgba(255,178,64,0.85)', 70, 150, 84, 0.62)

      streetBase(ctx, w, h, gy, '#231c30', '#3a3050')
      ctx.fillStyle = '#31283f'
      ctx.fillRect(0, gy, w, 5)
      ctx.fillStyle = 'rgba(232,226,242,0.22)'
      for (let x = 14; x < w; x += 56) {
        const row = Math.floor(x / (w * 0.5))
        const dw = 26 + row * 6
        ctx.fillRect(x, gy + 12 + row * 16, dw, 3)
        ctx.fillRect(x + 4, gy + 30 + row * 10, dw + 10, 3)
      }
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      for (let x = 6; x < w; x += 34) ctx.fillRect(x, gy + 14 + ((x * 7) % 20), 20, 3)

      for (const fx of [w * 0.08, w * 0.34, w * 0.6, w * 0.86]) lampPost(ctx, fx, gy, t)

      ctx.fillStyle = '#16281a'
      for (let x = 4; x < w; x += 30) {
        const bh = 8 + ((x * 13) % 7)
        ctx.fillRect(x, gy + 4 - bh, 22, bh)
      }
      ctx.fillStyle = '#1e3a24'
      for (let x = 10; x < w; x += 34) {
        ctx.beginPath()
        ctx.arc(x + 4, gy - 2 - ((x * 7) % 5), 4, 0, Math.PI * 2)
        ctx.fill()
      }

      fogBand(ctx, w, h, t, gy - 24, 0.06, 0.01)
      vignette(ctx, w, h)
      break
    }

    case 'cheeseShop': {
      vgrad(ctx, w, h, [
        [0, '#2a1218'],
        [0.55, '#401a20'],
        [0.85, '#20100f'],
      ])
      stars(ctx, w, h, h * 0.3)
      bigMoon(ctx, w * 0.14, h * 0.24, 28, '#f2cfc0', 'rgba(240,190,170,0.09)')
      buildingRow(ctx, w, gy + 6, '#2a151b', '#1c0e13', 'rgba(150,80,80,0.3)', 70, 140, 104, 0.3)

      const sx = w * 0.56
      ctx.fillStyle = '#3a1a1e'
      ctx.fillRect(sx, gy - 150, w * 0.36, 152)
      ctx.fillStyle = '#57272c'
      for (let i = 0; i < 5; i++) ctx.fillRect(sx + 4 + i * (w * 0.072), gy - 158, w * 0.05, 10)
      ctx.fillStyle = '#ffd27a'
      ctx.fillRect(sx + 18, gy - 116, 52, 42)
      ctx.fillStyle = 'rgba(255,210,122,0.15)'
      ctx.fillRect(sx + 8, gy - 128, 72, 66)
      ctx.fillStyle = '#241014'
      ctx.fillRect(sx + w * 0.22, gy - 78, 44, 78)
      ctx.fillStyle = '#c9a227'
      for (let i = 0; i < 4; i++) ctx.fillRect(sx + 90 + i * 26, gy - 34, 18, 10)
      ctx.strokeStyle = '#57272c'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(sx - 26, gy - 140)
      ctx.lineTo(sx - 26, gy - 108)
      ctx.stroke()
      ctx.fillStyle = '#8f1d1d'
      ctx.fillRect(sx - 44, gy - 108, 36, 24)

      streetBase(ctx, w, h, gy, '#241318', '#3c2026')
      fogBand(ctx, w, h, t, gy - 20, 0.05, 0.012)
      vignette(ctx, w, h)
      break
    }

    case 'morgue': {
      vgrad(ctx, w, h, [
        [0, '#101820'],
        [0.6, '#16232e'],
        [1, '#0b1116'],
      ])
      ctx.fillStyle = '#182631'
      ctx.fillRect(w * 0.04, h * 0.16, w * 0.92, h * 0.56)
      ctx.strokeStyle = '#20303d'
      ctx.lineWidth = 2
      for (let i = 0; i < 7; i++) {
        ctx.beginPath()
        ctx.moveTo(w * 0.04, h * (0.16 + i * 0.08))
        ctx.lineTo(w * 0.96, h * (0.16 + i * 0.08))
        ctx.stroke()
      }
      for (let i = 0; i < 4; i++) {
        const lx = w * (0.18 + i * 0.21)
        ctx.fillStyle = '#0d141a'
        ctx.fillRect(lx - 2, 0, 4, h * 0.2)
        const sway = Math.sin(t / 700 + i) * 6
        ctx.fillStyle = `rgba(140,200,230,${0.5 + 0.2 * Math.sin(t / 500 + i)})`
        ctx.beginPath()
        ctx.arc(lx + sway, h * 0.22, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(140,200,230,0.08)'
        ctx.beginPath()
        ctx.arc(lx + sway, h * 0.22, 26, 0, Math.PI * 2)
        ctx.fill()
      }
      for (let i = 0; i < 3; i++) {
        const bx = w * (0.1 + i * 0.3)
        ctx.fillStyle = '#0e161c'
        ctx.fillRect(bx, gy - 26, 120, 12)
        ctx.fillRect(bx + 8, gy - 14, 8, 14)
        ctx.fillRect(bx + 104, gy - 14, 8, 14)
        ctx.fillStyle = '#cdd6dd'
        ctx.beginPath()
        ctx.moveTo(bx + 4, gy - 26)
        ctx.quadraticCurveTo(bx + 60, gy - 58, bx + 116, gy - 26)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#8fa3ad'
        ctx.fillRect(bx + 104, gy - 30, 2, 10)
      }
      ctx.fillStyle = '#141d24'
      ctx.fillRect(0, gy, w, h - gy)
      ctx.fillStyle = '#1b2731'
      for (let x = 0; x < w; x += 40) ctx.fillRect(x, gy + 8, 26, 3)
      vignette(ctx, w, h)
      break
    }

    case 'warehouse': {
      vgrad(ctx, w, h, [
        [0, '#141a10'],
        [0.6, '#1d2614'],
        [1, '#0e120a'],
      ])
      for (let rowI = 0; rowI < 3; rowI++) {
        const sy = h * (0.3 + rowI * 0.17)
        ctx.fillStyle = '#242e1a'
        ctx.fillRect(w * 0.06, sy, w * 0.88, 10)
        ctx.fillStyle = '#1a2213'
        ctx.fillRect(w * 0.06, sy + 10, w * 0.88, 26)
        for (let jx = w * 0.09; jx < w * 0.92; jx += 54) {
          const jc = ['rgba(109,143,75,0.85)', 'rgba(160,180,90,0.8)', 'rgba(90,120,60,0.85)'][(rowI + jx) % 3]
          ctx.fillStyle = jc
          ctx.fillRect(jx, sy - 22, 20, 22)
          ctx.fillStyle = 'rgba(255,255,220,0.25)'
          ctx.fillRect(jx + 4, sy - 18, 5, 5)
        }
      }
      for (let i = 0; i < 5; i++) {
        const lx = w * (0.14 + i * 0.18)
        const sway = Math.sin(t / 800 + i * 2) * 4
        ctx.strokeStyle = '#2c3620'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(lx, 0)
        ctx.lineTo(lx + sway, h * 0.16)
        ctx.stroke()
        ctx.fillStyle = `rgba(160,220,120,${0.55 + 0.25 * Math.sin(t / 450 + i)})`
        ctx.beginPath()
        ctx.arc(lx + sway, h * 0.18, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(160,220,120,0.07)'
        ctx.beginPath()
        ctx.arc(lx + sway, h * 0.18, 30, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#131a0e'
      ctx.fillRect(0, gy, w, h - gy)
      ctx.strokeStyle = 'rgba(109,143,75,0.25)'
      ctx.lineWidth = 2
      for (let i = 0; i < 6; i++) {
        const cxp = w * (0.1 + i * 0.16)
        ctx.beginPath()
        ctx.moveTo(cxp, gy - 60)
        ctx.lineTo(cxp + 14, gy + 8)
        ctx.stroke()
      }
      fogBand(ctx, w, h, t, gy - 16, 0.05, 0.008)
      vignette(ctx, w, h)
      break
    }

    case 'graveyard': {
      vgrad(ctx, w, h, [
        [0, '#131a2c'],
        [0.55, '#1e2942'],
        [0.85, '#10141f'],
      ])
      stars(ctx, w, h, h * 0.4)
      bigMoon(ctx, w * 0.76, h * 0.24, 38, '#dde4f0', 'rgba(205,215,235,0.12)')

      ctx.fillStyle = '#0e1320'
      ctx.fillRect(w * 0.02, gy - 88, 5, 88)
      ctx.fillRect(w * 0.02, gy - 86, w * 0.96, 4)
      for (let x = w * 0.02; x < w * 0.97; x += 46) {
        ctx.fillStyle = '#0e1320'
        ctx.fillRect(x, gy - 84, 5, 26)
        ctx.fillRect(x + 3, gy - 76, 3, 3)
      }

      drawCross(ctx, w * 0.12, gy - 4, 44, '#232c40')
      drawCross(ctx, w * 0.3, gy - 2, 30, '#1d2536')
      drawCross(ctx, w * 0.52, gy - 5, 50, '#26304a')
      drawCross(ctx, w * 0.9, gy - 3, 34, '#1d2536')
      ctx.fillStyle = '#1a2133'
      for (const [tx, tw] of [[w * 0.42, 40], [w * 0.66, 34], [w * 0.78, 44]] as Array<[number, number]>) {
        ctx.beginPath()
        ctx.arc(tx, gy - tw * 0.4, tw / 2, Math.PI, 0)
        ctx.fill()
        ctx.fillRect(tx - tw / 2, gy - tw * 0.4, tw, tw * 0.4 + 6)
      }

      ctx.fillStyle = '#141a29'
      ctx.fillRect(0, gy, w, h - gy)
      ctx.fillStyle = '#1c2438'
      for (let x = 0; x < w; x += 26) ctx.fillRect(x, gy + 6 + ((x * 13) % 14), 3, 8)
      ctx.fillStyle = 'rgba(221,228,240,0.10)'
      ctx.fillRect(w * 0.7, gy + 8, 60, 3)

      fogBand(ctx, w, h, t, gy - 18, 0.08, 0.014)
      fogBand(ctx, w, h, t + 3000, gy - 48, 0.05, 0.009)
      vignette(ctx, w, h)
      break
    }

    case 'throne': {
      vgrad(ctx, w, h, [
        [0, '#1a0c0e'],
        [0.55, '#2a1214'],
        [1, '#120808'],
      ])
      for (let i = 0; i < 5; i++) {
        const px = w * (0.08 + i * 0.21)
        ctx.fillStyle = i % 2 ? '#241114' : '#2b161a'
        ctx.fillRect(px, h * 0.1, 34, gy - h * 0.1)
        ctx.fillStyle = '#170b0d'
        ctx.fillRect(px + 8, h * 0.14, 18, gy - h * 0.14 - 20)
        ctx.fillStyle = 'rgba(255,176,58,0.5)'
        ctx.fillRect(px + 13, h * 0.2 + (i % 2) * 30, 8, 12)
      }
      for (let i = 0; i < 4; i++) {
        const ax = w * (0.16 + i * 0.23)
        ctx.strokeStyle = '#1c0e10'
        ctx.lineWidth = 26
        ctx.beginPath()
        ctx.arc(ax, h * 0.42, 60, Math.PI, 0)
        ctx.stroke()
      }

      ctx.fillStyle = '#4a1015'
      ctx.beginPath()
      ctx.moveTo(w * 0.5 - 60, gy)
      ctx.lineTo(w * 0.5 - 26, h * 0.34)
      ctx.lineTo(w * 0.5 + 26, h * 0.34)
      ctx.lineTo(w * 0.5 + 60, gy)
      ctx.closePath()
      ctx.fill()

      const pulse = 0.4 + 0.25 * Math.sin(t / 380)
      ctx.fillStyle = `rgba(224,38,38,${pulse})`
      ctx.beginPath()
      ctx.arc(w * 0.5, h * 0.26, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(224,38,38,0.08)'
      ctx.beginPath()
      ctx.arc(w * 0.5, h * 0.26, 52, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 6; i++) {
        const cx2 = w * (0.3 + (i % 3) * 0.2)
        const cy2 = gy - 30 - Math.floor(i / 3) * 26
        const fl = 0.5 + 0.5 * Math.sin(t / 200 + i * 2)
        ctx.fillStyle = '#170b0d'
        ctx.fillRect(cx2, cy2 - 16, 4, 16)
        ctx.fillStyle = `rgba(255,176,58,${fl})`
        ctx.beginPath()
        ctx.arc(cx2 + 2, cy2 - 20, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#170d0f'
      ctx.fillRect(0, gy, w, h - gy)
      ctx.fillStyle = '#221114'
      for (let x = 0; x < w; x += 44) ctx.fillRect(x, gy + 10, 28, 3)
      vignette(ctx, w, h)
      break
    }
  }
}
