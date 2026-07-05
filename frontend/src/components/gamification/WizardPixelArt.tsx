import { useEffect, useRef, useState } from 'react'
import { useGamificationStore } from '@/store/gamificationStore'
import { getWizardType, type WizardType } from '@/lib/gamification'
import { cn } from '@/lib/utils'

const P = 2

interface FlamePos {
  frame: (string | null)[][]
  left?: number
  right?: number
  bottom: number
  delay?: boolean
}

interface WizardAnimConfig {
  flameColors: { r: string; o: string; y: string }
  flames: FlamePos[]
  arm: { pixels: [number, number, string][]; originX: number; originY: number; speed: number; angle: number }
  float: { speed: number; distance: number }
  aura: { color: string; size: number }
}

const BASE_FLAME_A = [
  [null, null, 'r', 'r', null, null],
  [null, 'r', 'r', 'r', 'r', null],
  [null, 'r', 'o', 'y', 'r', null],
  [null, null, 'r', 'o', null, null],
  [null, null, null, 'o', null, null],
]

const BASE_FLAME_B = [
  [null, null, 'r', 'r', null, null],
  [null, 'r', 'r', 'r', 'r', null],
  [null, 'r', 'o', 'y', 'r', null],
  [null, null, 'r', 'o', 'r', null],
  [null, null, 'r', 'o', null, null],
  [null, null, null, 'o', null, null],
]

const BASE_FLAME_C = [
  [null, 'r', 'r', 'r', null],
  [null, 'r', 'o', 'r', null],
  [null, 'r', 'y', 'r', null],
  [null, null, 'o', null, null],
]

const SPARK = [
  [null, null, 'y', null],
  [null, 'y', 'o', null],
  [null, null, 'y', null],
]

function buildFrames(base: (string | null)[][], colors: { r: string; o: string; y: string }) {
  return base.map(row => row.map(ch => (ch ? colors[ch as keyof typeof colors] : null)))
}

function FlameSVG({ frame, className, style }: { frame: (string | null)[][]; className?: string; style?: React.CSSProperties }) {
  if (!frame.length) return null
  const fw = frame[0]?.length ?? 0
  const fh = frame.length
  return (
    <svg
      width={fw * P}
      height={fh * P}
      viewBox={`0 0 ${fw * P} ${fh * P}`}
      className={cn('absolute pointer-events-none', className)}
      style={{ imageRendering: 'pixelated' }}
    >
      {frame.map((row, y) =>
        row.map((ch, x) => {
          if (!ch) return null
          return <rect key={`${x}-${y}`} x={x * P} y={y * P} width={P} height={P} fill={ch} />
        })
      )}
    </svg>
  )
}

function ArmSVG({
  pixels,
  originX,
  originY,
  speed,
  angle,
  svgW,
  svgH,
}: {
  pixels: [number, number, string][]
  originX: number
  originY: number
  speed: number
  angle: number
  svgW: number
  svgH: number
}) {
  if (!pixels.length) return null
  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="absolute inset-0 pointer-events-none"
      style={{
        imageRendering: 'pixelated',
        transformOrigin: `${originX}px ${originY}px`,
        animation: `arm-wave ${speed}s ease-in-out infinite`,
        ['--arm-angle' as string]: `${angle}deg`,
      }}
    >
      {pixels.map(([x, y, color], i) => (
        <rect key={i} x={x} y={y} width={P} height={P} fill={color} />
      ))}
    </svg>
  )
}

function AuraSVG({ color, size, svgW, svgH }: { color: string; size: number; svgW: number; svgH: number }) {
  return (
    <svg
      width={svgW * 3}
      height={svgH * 1.6}
      viewBox={`0 0 ${svgW * 3} ${svgH * 1.6}`}
      className="absolute pointer-events-none"
      style={{
        imageRendering: 'pixelated',
        left: '-100%',
        bottom: '-10%',
      }}
    >
      {Array.from({ length: size }).map((_, i) => (
        <ellipse
          key={i}
          cx={svgW * 1.5}
          cy={svgH * 1.4}
          rx={svgW * 0.5 + i * 6}
          ry={svgH * 0.2 + i * 3}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.35 - i * 0.04}
          className="animate-ring-pulse"
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </svg>
  )
}

const WIZARD_ANIM: Record<string, WizardAnimConfig> = {
  novice: {
    flameColors: { r: '#88AA44', o: '#AACC66', y: '#CCEE88' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#88AA44', o: '#AACC66', y: '#CCEE88' }), left: -1, bottom: -2 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#88AA44', o: '#AACC66', y: '#CCEE88' }), right: -1, bottom: -1, delay: true },
    ],
    arm: { pixels: [], originX: 0, originY: 0, speed: 1, angle: 0 },
    float: { speed: 3, distance: 3 },
    aura: { color: '#88AA44', size: 2 },
  },
  wizard: {
    flameColors: { r: '#FF4400', o: '#FF8800', y: '#FFCC00' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#FF4400', o: '#FF8800', y: '#FFCC00' }), left: -1, bottom: -2 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#FF4400', o: '#FF8800', y: '#FFCC00' }), right: -1, bottom: -1, delay: true },
      { frame: buildFrames(BASE_FLAME_C, { r: '#FF4400', o: '#FF8800', y: '#FFCC00' }), left: 22, bottom: -4 },
    ],
    arm: {
      pixels: [
        [28, 36, '#F5D6C6'], [30, 36, '#F5D6C6'],
        [32, 38, '#F5D6C6'], [30, 38, '#F5D6C6'],
        [34, 40, '#F5D6C6'], [32, 40, '#F5D6C6'],
        [30, 42, '#374151'], [28, 42, '#374151'], [26, 42, '#374151'],
      ],
      originX: 24, originY: 44, speed: 1.2, angle: 15,
    },
    float: { speed: 2.5, distance: 4 },
    aura: { color: '#FF4400', size: 3 },
  },
  archmage: {
    flameColors: { r: '#CC44FF', o: '#EE66AA', y: '#FF88CC' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#CC44FF', o: '#EE66AA', y: '#FF88CC' }), left: -2, bottom: -2 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#CC44FF', o: '#EE66AA', y: '#FF88CC' }), right: -1, bottom: -1, delay: true },
      { frame: buildFrames(BASE_FLAME_C, { r: '#CC44FF', o: '#EE66AA', y: '#FF88CC' }), left: 24, bottom: -5 },
      { frame: buildFrames(BASE_FLAME_C, { r: '#CC44FF', o: '#EE66AA', y: '#FF88CC' }), left: 16, bottom: -4 },
    ],
    arm: {
      pixels: [
        [28, 36, '#F5D6C6'], [30, 36, '#F5D6C6'],
        [32, 38, '#F5D6C6'], [30, 38, '#F5D6C6'],
        [34, 40, '#F5D6C6'], [32, 40, '#F5D6C6'],
        [30, 42, '#6B3F8E'], [28, 42, '#6B3F8E'], [26, 42, '#6B3F8E'],
      ],
      originX: 24, originY: 44, speed: 1.5, angle: 12,
    },
    float: { speed: 2, distance: 5 },
    aura: { color: '#CC44FF', size: 4 },
  },
  grandmaster: {
    flameColors: { r: '#FF2200', o: '#FF6600', y: '#FFAA00' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#FF2200', o: '#FF6600', y: '#FFAA00' }), left: -2, bottom: -3 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#FF2200', o: '#FF6600', y: '#FFAA00' }), right: -2, bottom: -2, delay: true },
      { frame: buildFrames(BASE_FLAME_C, { r: '#FF2200', o: '#FF6600', y: '#FFAA00' }), left: 26, bottom: -5 },
      { frame: buildFrames(BASE_FLAME_C, { r: '#FF2200', o: '#FF6600', y: '#FFAA00' }), left: 14, bottom: -5 },
      { frame: buildFrames(SPARK, { r: '#FF2200', o: '#FF6600', y: '#FFAA00' }), left: 8, bottom: -1 },
    ],
    arm: {
      pixels: [
        [26, 34, '#F5D6C6'], [28, 34, '#F5D6C6'],
        [30, 36, '#F5D6C6'], [28, 36, '#F5D6C6'], [26, 36, '#F5D6C6'],
        [32, 38, '#F5D6C6'], [30, 38, '#F5D6C6'],
        [34, 40, '#F5D6C6'], [32, 40, '#F5D6C6'],
        [30, 42, '#A02020'], [28, 42, '#A02020'], [26, 42, '#A02020'], [24, 42, '#A02020'],
      ],
      originX: 22, originY: 42, speed: 0.8, angle: 20,
    },
    float: { speed: 1.8, distance: 6 },
    aura: { color: '#FF4400', size: 5 },
  },
  overlord: {
    flameColors: { r: '#00AA44', o: '#00CC66', y: '#44FF88' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), left: -2, bottom: -3 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), right: -2, bottom: -2, delay: true },
      { frame: buildFrames(BASE_FLAME_C, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), left: 28, bottom: -5 },
      { frame: buildFrames(BASE_FLAME_C, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), left: 12, bottom: -5 },
      { frame: buildFrames(SPARK, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), left: 6, bottom: -2 },
      { frame: buildFrames(SPARK, { r: '#00AA44', o: '#00CC66', y: '#44FF88' }), right: -2, bottom: -2 },
    ],
    arm: {
      pixels: [
        [26, 34, '#E8B88A'], [28, 34, '#E8B88A'],
        [30, 36, '#E8B88A'], [28, 36, '#E8B88A'], [26, 36, '#E8B88A'],
        [32, 38, '#E8B88A'], [30, 38, '#E8B88A'],
        [34, 40, '#E8B88A'], [32, 40, '#E8B88A'],
        [30, 42, '#3D1B5E'], [28, 42, '#3D1B5E'], [26, 42, '#3D1B5E'], [24, 42, '#3D1B5E'],
      ],
      originX: 22, originY: 42, speed: 0.6, angle: 25,
    },
    float: { speed: 1.5, distance: 7 },
    aura: { color: '#00CC66', size: 6 },
  },
  deity: {
    flameColors: { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' },
    flames: [
      { frame: buildFrames(BASE_FLAME_A, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), left: -3, bottom: -3 },
      { frame: buildFrames(BASE_FLAME_B, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), right: -2, bottom: -2, delay: true },
      { frame: buildFrames(BASE_FLAME_C, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), left: 30, bottom: -6 },
      { frame: buildFrames(BASE_FLAME_C, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), left: 10, bottom: -6 },
      { frame: buildFrames(SPARK, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), left: 4, bottom: -2 },
      { frame: buildFrames(SPARK, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), right: -2, bottom: -2 },
      { frame: buildFrames(SPARK, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), left: 18, bottom: -8 },
      { frame: buildFrames(SPARK, { r: '#FFD700', o: '#FFF8DC', y: '#FFFFFF' }), right: -8, bottom: -8 },
    ],
    arm: {
      pixels: [
        [28, 34, '#F5D6C6'], [30, 34, '#F5D6C6'],
        [32, 36, '#F5D6C6'], [30, 36, '#F5D6C6'],
        [34, 38, '#F5D6C6'], [32, 38, '#F5D6C6'],
        [30, 40, '#DAA520'], [28, 40, '#DAA520'],
      ],
      originX: 26, originY: 42, speed: 2, angle: 8,
    },
    float: { speed: 3.5, distance: 3 },
    aura: { color: '#FFD700', size: 8 },
  },
}

function getAnimConfig(wizardType: WizardType): WizardAnimConfig {
  return WIZARD_ANIM[wizardType.id] ?? WIZARD_ANIM.wizard
}

export function WizardPixelArt() {
  const level = useGamificationStore(s => s.level)
  const completedMissions = useGamificationStore(s => s.completedMissions)
  const prevCount = useRef(completedMissions.length)
  const [jumping, setJumping] = useState(false)
  const [flameFrame, setFlameFrame] = useState(0)

  const wizardType = getWizardType(level)
  const config = getAnimConfig(wizardType)

  useEffect(() => {
    if (completedMissions.length > prevCount.current) {
      setJumping(true)
      const timer = setTimeout(() => setJumping(false), 600)
      prevCount.current = completedMissions.length
      return () => clearTimeout(timer)
    }
    prevCount.current = completedMissions.length
  }, [completedMissions.length])

  useEffect(() => {
    const interval = setInterval(() => setFlameFrame((p) => (p + 1) % 3), 350)
    return () => clearInterval(interval)
  }, [])

  const cols = wizardType.pixels[0]?.length ?? 18
  const rows = wizardType.pixels.length
  const svgW = cols * P
  const svgH = rows * P

  const skinColor = wizardType.palette['s'] ?? '#F5D6C6'
  const robeColor = wizardType.palette['r'] ?? wizardType.palette['a'] ?? '#6B3F8E'

  const frameIndex = flameFrame
  const frames = [0, 1, 2]

  return (
    <div className="relative inline-flex">
      <AuraSVG color={config.aura.color} size={config.aura.size} svgW={svgW} svgH={svgH} />

      <div className="absolute inset-0 flex items-end justify-center">
        <div
          className="rounded-full blur-3xl animate-aura-pulse"
          style={{
            width: `${config.aura.size * 30 + 100}%`,
            height: `${config.aura.size * 15 + 60}%`,
            background: `radial-gradient(ellipse, ${config.flameColors.r}22 0%, ${config.flameColors.o}11 40%, transparent 70%)`,
            animationDuration: `${config.float.speed + 1}s`,
            marginBottom: '-10%',
          }}
        />
      </div>

      <div className="relative">
        {config.flames.filter((_, i) => i % 2 === frameIndex % 2).slice(0, 6).map((f, i) => (
          <FlameSVG
            key={i}
            frame={f.frame}
            className={cn(
              f.delay ? 'animate-flame-flicker-delay' : 'animate-flame-flicker',
            )}
            style={{
              position: 'absolute',
              left: f.left !== undefined ? `${f.left}px` : undefined,
              right: f.right !== undefined ? `${f.right}px` : undefined,
              bottom: `${f.bottom}px`,
            }}
          />
        ))}

        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className={cn(
            'shrink-0 relative z-[1]',
            jumping && 'animate-bounce',
            !jumping && 'animate-wizard-float',
          )}
          style={{
            imageRendering: 'pixelated',
            animationDuration: `${config.float.speed}s`,
            ['--float-distance' as string]: `${config.float.distance}px`,
          }}
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

        <ArmSVG
          pixels={config.arm.pixels}
          originX={config.arm.originX}
          originY={config.arm.originY}
          speed={config.arm.speed}
          angle={config.arm.angle}
          svgW={svgW}
          svgH={svgH}
        />
      </div>
    </div>
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
