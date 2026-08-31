import { useEffect, useRef, useState } from 'react'
import { ChevronRight, SkipForward } from 'lucide-react'
import { PixelSprite } from './PixelSprite'
import { PortraitArtwork } from './Portraits'
import { drawScene } from './sprites'
import type { Lang } from './types'

const W = 960
const H = 320

interface Line {
  who: 'coroner' | 'hero'
  en: string
  es: string
}

const SCRIPT_EN: Line[] = [
  { who: 'coroner', en: 'Another one in Tallow Lane. Third this week... strangled. The rain washed everything, as always.', es: '' },
  { who: 'hero', en: 'Then the ledger will talk for them. Every crime leaves rows, Coroner.', es: '' },
  { who: 'coroner', en: 'Rows nobody can read! The Cheesemaker of the Corner - murdered on January 2nd at 2 AM, dismembered. The Watch found nothing.', es: '' },
  { who: 'hero', en: "SELECT reads what the dead left behind. WHERE keeps only what matches. Start there.", es: '' },
  { who: 'coroner', en: 'Witnesses contradict each other. You will have to JOIN their testimonies... and count what repeats with GROUP BY.', es: '' },
  { who: 'hero', en: 'And beyond SQL?', es: '' },
  { who: 'coroner', en: 'The Collection preserves documents in jars - MongoDB. The warehouse hums with keys that expire - Redis. And beneath it all, EL DEADLOCK holds court: transactions, ACID, indexes.', es: '' },
  { who: 'hero', en: 'Ten puzzles per district. Five hearts between me and the archive. Every answer explains itself - every mistake teaches.', es: '' },
  { who: 'coroner', en: 'Then go, before the trail rots. The Bone Court is in session.', es: '' },
]

const SCRIPT_ES: Line[] = [
  { who: 'coroner', en: '', es: 'Otro más en Tallow Lane. Tercero esta semana... estrangulado. La lluvia lo lavó todo, como siempre.' },
  { who: 'hero', en: '', es: 'Entonces el registro hablará por ellos. Cada crimen deja filas, Forense.' },
  { who: 'coroner', en: '', es: '¡Filas que nadie supo leer! La Quesera de la Esquina - asesinada el 2 de enero a las 2 AM, descuartizada. La Guardia no encontró nada.' },
  { who: 'hero', en: '', es: 'SELECT lee lo que los muertos dejaron. WHERE conserva solo lo que coincide. Empieza por ahí.' },
  { who: 'coroner', en: '', es: 'Los testigos se contradicen. Tendrás que unir sus testimonios con JOIN... y contar lo que se repite con GROUP BY.' },
  { who: 'hero', en: '', es: '¿Y más allá del SQL?' },
  { who: 'coroner', en: '', es: 'La Colección preserva documentos en frascos - MongoDB. El almacén zumba con claves que expiran - Redis. Y debajo de todo, EL DEADLOCK dicta sentencia: transacciones, ACID, índices.' },
  { who: 'hero', en: '', es: 'Diez acertijos por distrito. Cinco corazones entre yo y el archivo. Cada respuesta se explica - cada error enseña.' },
  { who: 'coroner', en: '', es: 'Entonces ve, antes de que el rastro se pudra. La Corte de Huesos está en sesión.' },
]

export function IntroCinematic({ lang, onFinish }: IntroCinematicProps) {
  const [pos, setPos] = useState({ line: 0, chars: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const script = lang === 'en' ? SCRIPT_EN : SCRIPT_ES

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const loop = (now: number) => {
      drawScene(ctx, 'street', W, H, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const current = script[pos.line]
  const langKey = lang === 'en' ? 'en' : 'es'
  const fullText = current[langKey]
  const done = pos.chars >= fullText.length

  useEffect(() => {
    const id = window.setInterval(() => {
      setPos((s) => {
        const len = script[s.line][lang === 'en' ? 'en' : 'es'].length
        if (s.chars >= len) return s
        return { ...s, chars: s.chars + 1 }
      })
    }, 16)
    return () => window.clearInterval(id)

  }, [lang, script])

  function advance() {
    if (!done) {
      setPos((s) => ({ ...s, chars: fullText.length }))
      return
    }
    if (pos.line + 1 >= script.length) onFinish()
    else setPos({ line: pos.line + 1, chars: 0 })
  }

  const speakerName =
    current.who === 'coroner'
      ? lang === 'en'
        ? 'THE CORONER'
        : 'EL FORENSE'
      : lang === 'en'
        ? 'YOU'
        : 'TÚ'

  return (
    <div className="select-none overflow-hidden rounded-lg border-4 border-black" onClick={advance}>
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="block h-auto w-full cursor-pointer" style={{ imageRendering: 'pixelated' }} />

        <div className="pointer-events-none absolute bottom-[86px] left-[10%]">
          <PixelSprite kind="hero" scale={5} moving={!done} level={99} />
        </div>
        <PortraitArtwork
          npc="coroner"
          className={`pointer-events-none absolute bottom-6 right-[8%] h-[150px] ${current.who === 'coroner' ? 'opacity-100' : 'opacity-70'} transition-opacity`}
        />

        <button
          onClick={(e) => {
            e.stopPropagation()
            onFinish()
          }}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 border-2 border-black bg-[#101014]/85 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[2px_2px_0_#000] hover:bg-[#8f1d1d]"
        >
          {lang === 'en' ? 'Skip intro' : 'Saltar'} <SkipForward className="h-3.5 w-3.5" />
        </button>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-6 pb-5 pt-12">
          <div className="rounded border-2 border-black bg-[#101014]/95 p-4 shadow-[4px_4px_0_#000]" onClick={(e) => e.stopPropagation()}>
            <div className={`text-xs font-black uppercase tracking-[0.25em] ${current.who === 'coroner' ? 'text-[#c9a227]' : 'text-[#66d9ff]'}`}>
              {speakerName}
            </div>
            <p className="mt-1.5 min-h-[48px] text-base leading-relaxed text-[#e7e0d0]">
              “{fullText.slice(0, pos.chars)}”
              {!done && <span className="animate-pulse">▌</span>}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1.5">
                {script.map((_, i) => (
                  <span key={i} className={`h-1.5 w-7 ${i <= pos.line ? 'bg-[#e02626]' : 'bg-[#2a2a30]'}`} />
                ))}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  advance()
                }}
                className="flex items-center gap-1.5 border-2 border-black bg-[#232329] px-4 py-1.5 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[2px_2px_0_#000] hover:bg-[#8f1d1d]"
              >
                {pos.line + 1 >= script.length && done ? (lang === 'en' ? 'Begin ▸' : 'Comenzar ▸') : lang === 'en' ? 'Next' : 'Siguiente'}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface IntroCinematicProps {
  lang: Lang
  onFinish: () => void
}
