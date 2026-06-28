import { useEffect, useRef, useState } from 'react'
import { useGamificationStore } from '@/store/gamificationStore'
import { getWizardType, type WizardType } from '@/lib/gamification'
import { cn } from '@/lib/utils'

const P = 2

export function WizardPixelArt() {
  const level = useGamificationStore(s => s.level)
  const completedMissions = useGamificationStore(s => s.completedMissions)
  const prevCount = useRef(completedMissions.length)
  const [jumping, setJumping] = useState(false)

  const wizardType = getWizardType(level)

  useEffect(() => {
    if (completedMissions.length > prevCount.current) {
      setJumping(true)
      const timer = setTimeout(() => setJumping(false), 600)
      prevCount.current = completedMissions.length
      return () => clearTimeout(timer)
    }
    prevCount.current = completedMissions.length
  }, [completedMissions.length])

  const cols = wizardType.pixels[0]?.length ?? 18
  const rows = wizardType.pixels.length
  const svgW = cols * P
  const svgH = rows * P

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={cn('shrink-0', jumping && 'animate-bounce')}
      style={{ imageRendering: 'pixelated' }}
    >
      {wizardType.pixels.map((row, y) =>
        row.split('').map((ch, x) => {
          const color = wizardType.palette[ch]
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

export function WizardPixelArtByType({ type }: { type: WizardType }) {
  const cols = type.pixels[0]?.length ?? 18
  const rows = type.pixels.length
  const svgW = cols * P
  const svgH = rows * P

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ imageRendering: 'pixelated' }}
    >
      {type.pixels.map((row, y) =>
        row.split('').map((ch, x) => {
          const color = type.palette[ch]
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
