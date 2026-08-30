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
  // Trunk
  ctx.fillStyle = '#422817'
  ctx.fillRect(x - 1, y - 4, 3, 5)
  ctx.fillStyle = '#2d1a0e'
  ctx.fillRect(x + 1, y - 4, 1, 5)

  // Foliage cluster (3 tiers of lush pixel art green)
  const r = 4 + Math.floor(rng() * 2)
  // Base dark foliage
  ctx.fillStyle = '#174a1e'
  ctx.beginPath()
  ctx.arc(x, y - 7, r + 1.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x - 3, y - 6, r - 0.5, 0, Math.PI * 2)
  ctx.arc(x + 3, y - 6, r - 0.5, 0, Math.PI * 2)
  ctx.fill()

  // Midtone lush green
  ctx.fillStyle = '#2f8737'
  ctx.beginPath()
  ctx.arc(x - 0.5, y - 8, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x - 2.5, y - 7.5, r - 1, 0, Math.PI * 2)
  ctx.arc(x + 2, y - 7.5, r - 1, 0, Math.PI * 2)
  ctx.fill()

  // Light green highlights on top
  ctx.fillStyle = '#52b75a'
  ctx.beginPath()
  ctx.arc(x - 1, y - 9.5, r - 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - 2, y - 11, 2, 2)
}

function drawBush(ctx: Ctx, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = '#174a1e'
  ctx.beginPath()
  ctx.arc(x, y - 1, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rng() > 0.5 ? '#2f8737' : '#26732e'
  ctx.beginPath()
  ctx.arc(x - 0.5, y - 2, 2.2, 0, Math.PI * 2)
  ctx.fill()
  if (rng() > 0.4) {
    ctx.fillStyle = '#ff8f24'
    ctx.fillRect(x - 1, y - 2, 1, 1)
    ctx.fillRect(x + 1, y - 1, 1, 1)
  }
}

function drawRock(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#4c525a'
  ctx.fillRect(x - 3, y - 1, 6, 3)
  ctx.fillStyle = '#727985'
  ctx.fillRect(x - 2, y - 3, 4, 3)
  ctx.fillStyle = '#9ca4b0'
  ctx.fillRect(x - 1, y - 3, 2, 1)
  ctx.fillRect(x - 2, y - 2, 1, 1)
}

function drawMountain(ctx: Ctx, x: number, y: number, s: number): void {
  // Mountain base shadow / body
  ctx.fillStyle = '#454c56'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 1.1, y)
  ctx.lineTo(x - s * 1.1, y)
  ctx.closePath()
  ctx.fill()

  // Left lighted face
  ctx.fillStyle = '#7a8391'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x, y)
  ctx.lineTo(x - s * 1.1, y)
  ctx.closePath()
  ctx.fill()

  // Right shaded face
  ctx.fillStyle = '#565d68'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 1.1, y)
  ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()

  // Snowcap
  ctx.fillStyle = '#f0f4f8'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 0.35, y - s * 0.55)
  ctx.lineTo(x + s * 0.1, y - s * 0.48)
  ctx.lineTo(x - s * 0.05, y - s * 0.56)
  ctx.lineTo(x - s * 0.35, y - s * 0.55)
  ctx.closePath()
  ctx.fill()

  // Snowcap shaded side
  ctx.fillStyle = '#ccd5e0'
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.lineTo(x + s * 0.35, y - s * 0.55)
  ctx.lineTo(x, y - s * 0.5)
  ctx.closePath()
  ctx.fill()
}

function drawCastle(ctx: Ctx, x: number, y: number): void {
  // Castle Base & Twin Towers (Deadlock Fortress)
  const tw = 8
  const th = 26
  const cw = 20
  const ch = 18

  // Shadow behind castle
  ctx.fillStyle = 'rgba(15,25,18,0.35)'
  ctx.fillRect(x - cw - 4, y - 2, cw * 2 + 8, 4)

  // Left Tower
  ctx.fillStyle = '#545b66'
  ctx.fillRect(x - cw, y - th, tw, th)
  ctx.fillStyle = '#7a8391'
  ctx.fillRect(x - cw, y - th, 2, th)
  // Left Tower battlements
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#7a8391'
    ctx.fillRect(x - cw + i * 3, y - th - 3, 2, 3)
  }

  // Right Tower
  ctx.fillStyle = '#444a54'
  ctx.fillRect(x + cw - tw, y - th, tw, th)
  ctx.fillStyle = '#6a727f'
  ctx.fillRect(x + cw - tw, y - th, 2, th)
  // Right Tower battlements
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#6a727f'
    ctx.fillRect(x + cw - tw + i * 3, y - th - 3, 2, 3)
  }

  // Center Fortress Wall & Gatehouse
  ctx.fillStyle = '#5c6370'
  ctx.fillRect(x - cw + tw, y - ch, (cw - tw) * 2, ch)
  ctx.fillStyle = '#7a8391'
  ctx.fillRect(x - cw + tw, y - ch, 2, ch)
  // Center battlements
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#7a8391'
    ctx.fillRect(x - cw + tw + i * 4.5, y - ch - 3, 2.5, 3)
  }

  // Brick horizontal mortar lines
  ctx.fillStyle = '#3a3f48'
  for (let by = y - ch + 4; by < y; by += 4) {
    ctx.fillRect(x - cw + tw, by, (cw - tw) * 2, 1)
  }
  for (let by = y - th + 4; by < y; by += 4) {
    ctx.fillRect(x - cw, by, tw, 1)
    ctx.fillRect(x + cw - tw, by, tw, 1)
  }

  // Arched Entrance Portcullis
  ctx.fillStyle = '#14161b'
  ctx.beginPath()
  ctx.arc(x, y - 8, 4.5, Math.PI, 0)
  ctx.lineTo(x + 4.5, y)
  ctx.lineTo(x - 4.5, y)
  ctx.closePath()
  ctx.fill()

  // Gate iron bars
  ctx.strokeStyle = '#444952'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - 2, y - 8)
  ctx.lineTo(x - 2, y)
  ctx.moveTo(x + 2, y - 8)
  ctx.lineTo(x + 2, y)
  ctx.moveTo(x - 4, y - 4)
  ctx.lineTo(x + 4, y - 4)
  ctx.stroke()

  // Red Banners / Flags on towers
  // Left Flag
  ctx.fillStyle = '#1a1a20'
  ctx.fillRect(x - cw + 2, y - th - 10, 1, 10)
  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.moveTo(x - cw + 3, y - th - 10)
  ctx.lineTo(x - cw + 10, y - th - 7.5)
  ctx.lineTo(x - cw + 3, y - th - 5)
  ctx.closePath()
  ctx.fill()

  // Right Flag
  ctx.fillStyle = '#1a1a20'
  ctx.fillRect(x + cw - 3, y - th - 10, 1, 10)
  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.moveTo(x + cw - 2, y - th - 10)
  ctx.lineTo(x + cw + 5, y - th - 7.5)
  ctx.lineTo(x + cw - 2, y - th - 5)
  ctx.closePath()
  ctx.fill()
}

export function drawOverworld(ctx: Ctx, w: number, h: number, nodes: Pt[]): void {
  const rng = mulberry32(20260102)

  // Base grass terrain in vibrant rich green palette
  ctx.fillStyle = '#54a648'
  ctx.fillRect(0, 0, w, h)

  // Grass variation textures and patches
  for (let i = 0; i < 90; i++) {
    const r = rng()
    ctx.fillStyle =
      r > 0.66 ? 'rgba(74, 160, 64, 0.65)' : r > 0.33 ? 'rgba(98, 185, 87, 0.45)' : 'rgba(56, 126, 48, 0.55)'
    ctx.beginPath()
    ctx.ellipse(rng() * w, rng() * h, 4 + rng() * 12, 2 + rng() * 6, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Dirt Road Polylines (Smooth, textured path connecting districts)
  const drawRoadSegment = (color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    nodes.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }

  // Outer darker earth border
  drawRoadSegment('#855d36', 10)
  // Inner warm dirt/sand road
  drawRoadSegment('#deb87a', 7)
  // Road center highlight
  drawRoadSegment('#edd19d', 3.5)

  // Road entry from left edge
  ctx.strokeStyle = '#855d36'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-6, nodes[0][1])
  ctx.lineTo(nodes[0][0], nodes[0][1])
  ctx.stroke()

  ctx.strokeStyle = '#deb87a'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(-6, nodes[0][1])
  ctx.lineTo(nodes[0][0], nodes[0][1])
  ctx.stroke()

  ctx.strokeStyle = '#edd19d'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(-6, nodes[0][1])
  ctx.lineTo(nodes[0][0], nodes[0][1])
  ctx.stroke()

  // Road pebbles & dirt flecks
  const dtl = mulberry32(918273)
  for (let i = 0; i < nodes.length - 1; i++) {
    const [ax, ay] = nodes[i]
    const [bx, by] = nodes[i + 1]
    const len = Math.hypot(bx - ax, by - ay) || 1
    const nx = -(by - ay) / len
    const ny = (bx - ax) / len
    for (let s = 0; s < len; s += 2.2) {
      const t = s / len
      const cx = ax + (bx - ax) * t
      const cy = ay + (by - ay) * t
      const off = (dtl() - 0.5) * 4.8
      const px2 = Math.round(cx + nx * off)
      const py2 = Math.round(cy + ny * off)
      const r = dtl()
      if (r < 0.25) {
        ctx.fillStyle = '#6b4526'
        ctx.fillRect(px2, py2, 1.5, 1)
      } else if (r < 0.45) {
        ctx.fillStyle = '#f2e2be'
        ctx.fillRect(px2, py2, 1, 1)
      }
    }
  }

  const nearPath = (x: number, y: number) =>
    nodes.some((pt) => Math.hypot(pt[0] - x, pt[1] - y) < 14) ||
    nodes.some((pt, i) => i < nodes.length - 1 && distToSegment([x, y] as Pt, pt, nodes[i + 1]) < 10)

  // Scatter lush trees, bushes and rocks around the terrain
  let trees = 0
  let bushes = 0
  let rocks = 0
  for (let attempt = 0; attempt < 900 && (trees < 36 || bushes < 18 || rocks < 8); attempt++) {
    const x = 10 + rng() * (w - 18)
    const y = 6 + rng() * (h - 10)
    if (nearPath(x, y)) continue
    // Leave room for mountains and castle
    if (x > 50 && x < 100 && y > h * 0.7) continue
    if (x > w - 40 && y < h * 0.45) continue

    const roll = rng()
    if (roll < 0.55 && trees < 36) {
      drawTree(ctx, x, y, rng)
      trees++
    } else if (roll < 0.82 && bushes < 18) {
      drawBush(ctx, x, y, rng)
      bushes++
    } else if (rocks < 8) {
      drawRock(ctx, x, y)
      rocks++
    }
  }

  // Mountain range at bottom-center (as in reference Image 1)
  drawMountain(ctx, 58, 126, 14)
  drawMountain(ctx, 74, 122, 18)
  drawMountain(ctx, 89, 125, 12)

  // Deadlock Castle Fortress at final node
  drawCastle(ctx, nodes[nodes.length - 1][0], nodes[nodes.length - 1][1] - 4)

  // Subtle atmospheric lighting
  const mapAtmosphere = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.3, w / 2, h * 0.5, h * 0.9)
  mapAtmosphere.addColorStop(0, 'rgba(255,255,255,0.03)')
  mapAtmosphere.addColorStop(1, 'rgba(10,25,12,0.18)')
  ctx.fillStyle = mapAtmosphere
  ctx.fillRect(0, 0, w, h)
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
  for (let i = 0; i < 65; i++) {
    const x = ((i * 197) % w)
    const y = ((i * 89) % maxY)
    const s = (i % 5 === 0) ? 2 : 1
    ctx.fillStyle = i % 4 === 0 ? '#ffffff' : i % 3 === 0 ? '#ffd9a8' : '#d2dcf5'
    ctx.globalAlpha = 0.4 + ((i * 17) % 60) / 100
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 1
}

function bigMoon(ctx: Ctx, cx: number, cy: number, r: number, color: string, glow: string): void {
  // Soft outer celestial glows
  const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r + 26)
  glowGrad.addColorStop(0, glow)
  glowGrad.addColorStop(0.5, 'rgba(190, 205, 240, 0.08)')
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(cx, cy, r + 26, 0, Math.PI * 2)
  ctx.fill()

  // Moon base disc
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Detailed Lunar Maria & Craters (matching Image 2)
  ctx.fillStyle = 'rgba(100, 115, 148, 0.28)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.38, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.35, cy - r * 0.3, r * 0.24, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.15, cy + r * 0.25, r * 0.42, 0, Math.PI * 2)
  ctx.arc(cx - r * 0.4, cy + r * 0.35, r * 0.25, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(65, 78, 105, 0.22)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.2, cy - r * 0.15, r * 0.2, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.22, cy + r * 0.15, r * 0.22, 0, Math.PI * 2)
  ctx.fill()

  // Moon crater rim highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.45, cy - r * 0.45, 1.5, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.5, cy + r * 0.1, 2, 0, Math.PI * 2)
  ctx.arc(cx - r * 0.1, cy + r * 0.55, 1.5, 0, Math.PI * 2)
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
  let x = -12
  let i = 0
  while (x < w + 20) {
    const bh = minH + ((i * 41 + 17) % (maxH - minH))
    const bw = step - 6
    ctx.fillStyle = color
    ctx.fillRect(x, baseY - bh, bw, bh)

    // Roof & Antenna Mast
    ctx.fillStyle = roofColor
    ctx.fillRect(x - 1, baseY - bh - 4, bw + 2, 4)

    // Antenna on taller buildings with blinking red light
    if (i % 2 === 0) {
      const antX = Math.round(x + bw * 0.5)
      ctx.fillStyle = '#221a30'
      ctx.fillRect(antX, baseY - bh - 16, 2, 12)
      ctx.fillStyle = '#ff2b2b'
      ctx.fillRect(antX - 1, baseY - bh - 18, 4, 3)
      ctx.fillStyle = 'rgba(255, 43, 43, 0.35)'
      ctx.fillRect(antX - 3, baseY - bh - 20, 8, 7)
    }

    // Windows Grid
    for (let wy = baseY - bh + 10; wy <= baseY - 16; wy += 20) {
      for (let wx = x + 6; wx <= x + bw - 12; wx += 16) {
        const lit = ((wx * 37 + wy * 19 + i * 11) % 100) / 100 < litChance
        if (lit) {
          ctx.fillStyle = winColor
          ctx.fillRect(wx, wy, 8, 10)
          ctx.fillStyle = 'rgba(255, 198, 80, 0.22)'
          ctx.fillRect(wx - 2, wy - 2, 12, 14)
        } else {
          ctx.fillStyle = 'rgba(14, 10, 22, 0.85)'
          ctx.fillRect(wx, wy, 8, 10)
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
  ctx.fillRect(0, y, w, 4)
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
  g.addColorStop(1, 'rgba(0,0,0,0.58)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function lampPost(ctx: Ctx, x: number, groundY: number, t: number): void {
  const flicker = 0.92 + 0.08 * Math.sin(t / 220 + x)
  const lx = x + 34
  const ly = groundY - 110

  // Volumetric Triangular Light Cone (Soft glowing warm beam down to street)
  const cone = ctx.createLinearGradient(0, ly, 0, groundY + 10)
  cone.addColorStop(0, `rgba(255, 215, 110, ${0.48 * flicker})`)
  cone.addColorStop(0.35, `rgba(255, 205, 95, ${0.28 * flicker})`)
  cone.addColorStop(0.75, `rgba(255, 195, 80, ${0.12 * flicker})`)
  cone.addColorStop(1, 'rgba(255, 190, 70, 0.01)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(lx - 4, ly)
  ctx.lineTo(lx + 4, ly)
  ctx.lineTo(lx + 46, groundY + 6)
  ctx.lineTo(lx - 44, groundY + 6)
  ctx.closePath()
  ctx.fill()

  // Ground Illuminated Light Pool
  const groundGlow = ctx.createRadialGradient(lx, groundY + 2, 4, lx, groundY + 2, 48)
  groundGlow.addColorStop(0, `rgba(255, 220, 120, ${0.36 * flicker})`)
  groundGlow.addColorStop(0.5, `rgba(255, 205, 90, ${0.18 * flicker})`)
  groundGlow.addColorStop(1, 'rgba(255, 190, 70, 0)')
  ctx.fillStyle = groundGlow
  ctx.beginPath()
  ctx.ellipse(lx, groundY + 2, 46, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // Metallic Lamp Post Stem & Base
  ctx.fillStyle = '#1c1b26'
  ctx.fillRect(x - 1, groundY - 96, 4, 96)
  ctx.fillStyle = '#2d2b3d'
  ctx.fillRect(x - 1, groundY - 96, 1.5, 96)
  ctx.fillStyle = '#14131c'
  ctx.fillRect(x - 4, groundY - 3, 10, 4)

  // Curved Curved Lamp Neck
  ctx.strokeStyle = '#1c1b26'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x + 1, groundY - 94)
  ctx.quadraticCurveTo(x + 1, ly - 6, lx, ly - 4)
  ctx.stroke()

  ctx.strokeStyle = '#2d2b3d'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, groundY - 94)
  ctx.quadraticCurveTo(x, ly - 7, lx, ly - 5)
  ctx.stroke()

  // Lamp Fixture Head
  ctx.fillStyle = '#181722'
  ctx.fillRect(lx - 7, ly - 6, 14, 6)
  ctx.fillStyle = '#2d2b3d'
  ctx.fillRect(lx - 5, ly - 7, 10, 2)

  // Glowing Bulb / Lantern Glow
  ctx.fillStyle = `rgba(255, 235, 160, ${0.95 * flicker})`
  ctx.fillRect(lx - 4, ly - 1, 8, 4)
  ctx.fillStyle = `rgba(255, 210, 110, ${0.5 * flicker})`
  ctx.beginPath()
  ctx.arc(lx, ly, 16, 0, Math.PI * 2)
  ctx.fill()
}

export function drawScene(ctx: Ctx, scene: SceneKey, w: number, h: number, t: number): void {
  const gy = h * 0.74

  switch (scene) {
    case 'street': {
      // 1. Night Sky (Deep violet to purple gradient)
      vgrad(ctx, w, h, [
        [0, '#150d24'],
        [0.35, '#231438'],
        [0.65, '#341b4e'],
        [1, '#1b1228'],
      ])

      // 2. Stars & Celestial Full Moon (Image 2)
      stars(ctx, w, h, h * 0.42)
      bigMoon(ctx, w * 0.82, h * 0.22, 34, '#f0f3fa', 'rgba(215, 226, 250, 0.18)')

      // 3. Layered Skyline (Back & Front City Skyline)
      buildingRow(ctx, w, gy + 8, '#211535', '#160c24', 'rgba(180, 140, 220, 0.35)', 110, 210, 104, 0.38)
      buildingRow(ctx, w, gy + 4, '#170f26', '#0f081c', 'rgba(255, 195, 75, 0.88)', 75, 165, 88, 0.65)

      // 4. Asphalt Road & Sidewalk Curb
      streetBase(ctx, w, h, gy, '#201d2a', '#403850')

      // Sidewalk Paving
      ctx.fillStyle = '#2f273d'
      ctx.fillRect(0, gy, w, 12)
      ctx.fillStyle = '#423755'
      ctx.fillRect(0, gy + 11, w, 2)

      // Road Lane Dashes
      ctx.fillStyle = 'rgba(240, 235, 250, 0.75)'
      for (let x = 16; x < w; x += 54) {
        ctx.fillRect(x, gy + 32, 28, 3)
      }

      // 5. Volumetric Streetlamps with Soft Cones of Light
      for (const fx of [w * 0.06, w * 0.31, w * 0.56, w * 0.81]) lampPost(ctx, fx, gy, t)

      // 6. Lush Shrubs & Berry Bushes along the road border (Image 2)
      ctx.fillStyle = '#122617'
      for (let x = 2; x < w; x += 22) {
        const bh = 10 + ((x * 13) % 9)
        ctx.beginPath()
        ctx.arc(x + 10, gy - 2, bh * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#1f4829'
      for (let x = 6; x < w; x += 26) {
        ctx.beginPath()
        ctx.arc(x + 8, gy - 5 - ((x * 7) % 4), 6.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#ff9436'
      for (let x = 8; x < w; x += 18) {
        ctx.fillRect(x + 4, gy - 6 - ((x * 11) % 6), 2, 2)
      }

      // 7. Atmospheric Fog & Vignette
      fogBand(ctx, w, h, t, gy - 24, 0.05, 0.01)
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
