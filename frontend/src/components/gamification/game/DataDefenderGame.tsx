import { useEffect, useRef, useState } from 'react'
import { useGamificationStore } from '@/store/gamificationStore'
import {
  X, Play, RotateCcw, Gamepad2, Heart, Zap, Sword, Wand2, Map as MapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VIEW_H, VIEW_W } from './constants'
import { GameEngine } from './engine'
import { MAPS } from './maps'
import { renderFrame } from './renderer'
import type { Difficulty, Phase } from './types'

const DIFF_STYLE: Record<Difficulty, string> = {
  easy: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  hard: 'border-red-500/40 bg-red-500/10 text-red-300',
}

export function DataDefenderGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const phaseRef = useRef<Phase>('menu')

  const [phase, setPhase] = useState<Phase>('menu')
  const [selectedMap, setSelectedMap] = useState(MAPS[0].id)
  const [finalScore, setFinalScore] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)
  const [weaponLabel, setWeaponLabel] = useState<'sword' | 'staff'>('sword')

  const addXP = useGamificationStore((s) => s.addXP)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const engine = new GameEngine(selectedMap, {
      onPhase: (p) => {
        phaseRef.current = p
        setPhase(p)
      },
      onScore: (score, xp) => {
        setFinalScore(score)
        setXpEarned(xp)
      },
      addXP,
    })
    engineRef.current = engine

    let raf = 0
    let last = performance.now()
    let lastWeapon = engine.getWeapon()
    const loop = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      engine.update(dt)
      const w = engine.getWeapon()
      if (w !== lastWeapon) {
        lastWeapon = w
        setWeaponLabel(w)
      }
      renderFrame(ctx, engine, phaseRef.current, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const GAME_KEYS = new Set([
      'arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ',
      'w', 'a', 's', 'd', 'j', 'k', 'x', 'z', 'q', 'tab', '1', '2',
    ])

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (key === 'tab') e.preventDefault()
      if (phaseRef.current === 'playing' && GAME_KEYS.has(key)) e.preventDefault()
      engine.keyDown(key, e.repeat)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      engine.keyUp(e.key.toLowerCase())
    }
    const onBlur = () => engine.clearKeys()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine recreated only on mount; maps via selectMap
  }, [addXP])

  const selectMap = (id: string) => {
    setSelectedMap(id)
    engineRef.current?.loadMap(id)
    phaseRef.current = 'menu'
    setPhase('menu')
  }

  const start = () => engineRef.current?.start()
  const currentMap = MAPS.find((m) => m.id === selectedMap) ?? MAPS[0]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative rounded-xl border border-border bg-card p-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative" style={{ width: VIEW_W, height: VIEW_H }}>
          <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="rounded-lg" />

          {phase === 'menu' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/70 px-6 overflow-y-auto">
              <div className="flex items-center gap-2 text-primary">
                <Gamepad2 className="w-7 h-7" />
                <h2 className="text-2xl font-black tracking-widest">DATA DEFENDER</h2>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                Side-scrolling penance. Walk, jump, and strike with blade or void staff.
              </p>

              <div className="w-full max-w-xl grid grid-cols-2 gap-2 mt-1">
                {MAPS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectMap(m.id)}
                    className={cn(
                      'text-left rounded-lg border p-3 transition-all',
                      selectedMap === m.id
                        ? 'border-primary bg-primary/15 shadow-[0_0_16px_rgba(139,92,246,0.25)]'
                        : 'border-border/60 bg-black/30 hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-bold flex items-center gap-1.5">
                        <MapIcon className="w-3.5 h-3.5 text-primary" />
                        {m.name}
                      </span>
                      <span className={cn('text-[var(--ch-text-9)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', DIFF_STYLE[m.difficulty])}>
                        {m.difficulty}
                      </span>
                    </div>
                    <p className="text-[var(--ch-text-10)] text-muted-foreground line-clamp-2">{m.subtitle}</p>
                    <p className="text-[var(--ch-text-9)] text-muted-foreground/60 mt-1 font-mono">
                      {m.enemies.length} foes · {m.lives}♥ · +{m.clearBonus} clear
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-[var(--ch-text-10)] text-muted-foreground/70 font-mono mt-1">
                <span>A/D move</span>
                <span>Space jump</span>
                <span>J strike</span>
                <span>Q weapon</span>
              </div>

              <div className="flex items-center gap-2 text-[var(--ch-text-11)] text-muted-foreground">
                {weaponLabel === 'sword' ? (
                  <><Sword className="w-3.5 h-3.5" /> Blade — close slash</>
                ) : (
                  <><Wand2 className="w-3.5 h-3.5" /> Staff — void orb</>
                )}
                <span className="text-muted-foreground/40">·</span>
                <span className="text-primary font-semibold">{currentMap.name}</span>
              </div>

              <button
                onClick={start}
                className="mt-1 flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Play className="w-4 h-4" />
                Begin Penance (Enter)
              </button>
            </div>
          )}

          {phase === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70">
              <h2 className="text-3xl font-black tracking-widest text-red-500">PENANCE FAILED</h2>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold">Score: {finalScore}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" />
                  <span className="font-bold">+{xpEarned} XP</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={start}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <RotateCcw className="w-4 h-4" /> Retry (R)
                </button>
                <button
                  onClick={() => { phaseRef.current = 'menu'; setPhase('menu') }}
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Maps
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {phase === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70">
              <h2 className="text-3xl font-black tracking-widest text-primary">PENANCE COMPLETE</h2>
              <p className="text-sm text-muted-foreground">
                {currentMap.name} cleared · +{currentMap.clearBonus} bonus
              </p>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold">Score: {finalScore}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" />
                  <span className="font-bold">+{xpEarned} XP</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={start}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <RotateCcw className="w-4 h-4" /> Again (R)
                </button>
                <button
                  onClick={() => { phaseRef.current = 'menu'; setPhase('menu') }}
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Maps
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
