/** Pixel body (torso + head). Legs are drawn separately and animate. */
export const BODY_IDLE = [
  '...hh...',
  '..hhhh..',
  '..hhhh..',
  '..ffff..',
  '.pppppp.',
  'pppppppp',
  '..pppp..',
  '..pppp..',
]

export const BODY_JUMP = [
  '...hh...',
  '..hhhh..',
  '..hhhh..',
  '..ffff..',
  '.pppppp.',
  'pppppppp',
  '.pppppp.',
  '..pppp..',
]

export const BODY_ATTACK = [
  '...hh...',
  '..hhhh..',
  '..hhhh..',
  '..ffff..',
  '.pppppp.',
  'pppppppp',
  '..pppp..',
  '..pppp..',
]

/** Leg frames — 4-frame walk cycle (cols match body width = 8) */
export const LEGS_IDLE = [
  '..l..r..',
  '..l..r..',
]

export const LEGS_WALK: string[][] = [
  [
    '.ll.rr..',
    '.l...r..',
  ],
  [
    '..l.r...',
    '..l.rr..',
  ],
  [
    '..ll.rr.',
    '..l...r.',
  ],
  [
    '...l.r..',
    '..ll.r..',
  ],
]

export const LEGS_JUMP = [
  '.ll.rr..',
  '.l...r..',
]

export const BODY_PALETTE: Record<string, string> = {
  h: '#8b5cf6',
  f: '#fcd9b8',
  p: '#6d28d9',
}

export const LEG_PALETTE: Record<string, string> = {
  l: '#5b21b6',
  r: '#4c1d95',
}

export const CRAWLER = [
  '...gggg...',
  '..gggggg..',
  '.gggggggg.',
  '.gkgggkg..',
  '.gggggggg.',
  'gggggggggg',
  'g..g..g..g',
  '.g..g..g..',
]

export const CRAWLER_PALETTE: Record<string, string> = {
  g: '#5c6b58',
  k: '#ef4444',
}

/** Sword blade pixels relative to hand (facing right). Drawn with rotation. */
export const SWORD_PIXELS: [number, number, string][] = [
  [0, 0, '#9ca3af'],
  [1, 0, '#d1d5db'],
  [2, 0, '#e5e7eb'],
  [3, 0, '#f3f4f6'],
  [4, 0, '#f9fafb'],
  [5, 0, '#e5e7eb'],
  [6, -1, '#c4b5fd'],
  [6, 0, '#c4b5fd'],
  [6, 1, '#c4b5fd'],
  [-1, 0, '#78716c'],
  [-2, 0, '#57534e'],
  [-1, -1, '#a8a29e'],
  [-1, 1, '#a8a29e'],
]

/** Staff pixels relative to hand (facing right). */
export const STAFF_PIXELS: [number, number, string][] = [
  [0, 2, '#78350f'],
  [0, 1, '#92400e'],
  [0, 0, '#a16207'],
  [0, -1, '#a16207'],
  [0, -2, '#92400e'],
  [0, -3, '#78350f'],
  [0, -4, '#6d28d9'],
  [-1, -5, '#8b5cf6'],
  [0, -5, '#c4b5fd'],
  [1, -5, '#8b5cf6'],
  [0, -6, '#a78bfa'],
]
