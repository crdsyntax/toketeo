import { useEffect, useRef, useState } from 'react'
import { useGamificationStore } from '@/store/gamificationStore'
import { cn } from '@/lib/utils'

const P = 2

const PALETTE: Record<string, string> = {
  '.': 'transparent',
  h: '#4A7DB4',
  H: '#6A9DD4',
  t: '#3D6F99',
  g: '#C8A84E',
  G: '#E8C86E',
  s: '#E8B88A',
  e: '#1A1A1A',
  r: '#3D6F99',
  R: '#5B8DB8',
  L: '#7DB0D6',
  d: '#2D5A8A',
  b: '#8B6F47',
  B: '#A88B5F',
  y: '#F0D060',
  Y: '#FFE880',
  f: '#6B4226',
  w: '#B8D8F0',
}

const PIXELS = [
  '....ttt.........b.',
  '...ttttt.......Bb.',
  '...thhht.......b..',
  '..thhhht......Y...',
  '..thhhht......y...',
  '.thhhhht......b...',
  '.thhhhht......b...',
  '.thHHHht......b...',
  '.tGGGGGt......b...',
  '..sssss......b....',
  '..s.e.s......b....',
  '..sssss......b....',
  '.rrrrrrr.....b....',
  '.rLLLLLr.....b....',
  'rrrrrrrrr....b....',
  'rLLLLLLLr....b....',
  '.rrrrrrr.....b....',
  '.rRRRRRr.....b....',
  '..rrrrr......b....',
  '..ff.ff.....b.....',
  '..ff.ff.....b.....',
  '...................',
]

export function WizardPixelArt() {
  const completedMissions = useGamificationStore(s => s.completedMissions)
  const prevCount = useRef(completedMissions.length)
  const [jumping, setJumping] = useState(false)

  useEffect(() => {
    if (completedMissions.length > prevCount.current) {
      setJumping(true)
      const timer = setTimeout(() => setJumping(false), 600)
      prevCount.current = completedMissions.length
      return () => clearTimeout(timer)
    }
    prevCount.current = completedMissions.length
  }, [completedMissions.length])

  const svgW = 16 * P
  const svgH = 22 * P

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={cn('shrink-0', jumping && 'animate-bounce')}
      style={{ imageRendering: 'pixelated' }}
    >
      {PIXELS.map((row, y) =>
        row.split('').map((ch, x) => {
          const color = PALETTE[ch]
          if (!color || color === 'transparent') return null
          return (
            <rect
              key={`${x}-${y}`}
              x={x * P}
              y={y * P}
              width={P}
              height={P}
              fill={color}
            />
          )
        })
      )}
    </svg>
  )
}
