import { useCallback, useEffect, useRef, useState } from 'react'
import { X, RotateCcw, Trophy, Trash2 } from 'lucide-react'
import { useGamificationStore } from '@/store/gamificationStore'
import { useCampaignStore, } from './campaignStore'
import { IntroCinematic } from './IntroCinematic'
import { MapScreen } from './MapScreen'
import { NodeBrief } from './NodeBrief'
import { PuzzleFlow } from './PuzzleModal'
import { LEVEL1_NODES } from './content/level1'
import type { Lang } from './types'

type View = 'map' | 'brief' | 'flow' | 'victory'

const NODE_CLEAR_BONUS = 250
const BOSS_CLEAR_BONUS = 1000

export function DataDefenderGame({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('map')
  const [activeNode, setActiveNode] = useState(0)
  const [earned, setEarned] = useState(0)

  const addXP = useGamificationStore((s) => s.addXP)
  const completed = useCampaignStore((s) => s.completedNodes)
  const nodePos = useCampaignStore((s) => s.nodePos)
  const lang = useCampaignStore((s) => s.lang)
  const setNodePos = useCampaignStore((s) => s.setNodePos)
  const completeNode = useCampaignStore((s) => s.completeNode)
  const nodePuzzleIndex = useCampaignStore((s) => s.nodePuzzleIndex)
  const setNodePuzzleIndex = useCampaignStore((s) => s.setNodePuzzleIndex)
  const introSeen = useCampaignStore((s) => s.introSeen)
  const setIntroSeen = useCampaignStore((s) => s.setIntroSeen)
  const [forceIntro, setForceIntro] = useState(false)
  const resetCampaign = useCampaignStore((s) => s.resetCampaign)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const handleArrive = useCallback((index: number) => {
    setNodePos(index)
    setActiveNode(index)
    setView('brief')
  }, [setNodePos])

  const handleArriveRef = useRef(handleArrive)
  const viewRefCurrent = useRef({ view, nodePos })
  useEffect(() => {
    handleArriveRef.current = handleArrive
    viewRefCurrent.current = { view, nodePos }
  }, [handleArrive, view, nodePos])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      const viewRef = viewRefCurrent.current
      if ((e.key === 'Enter' || e.key === ' ') && viewRef.view === 'map') {
        e.preventDefault()
        handleArriveRef.current(viewRef.nodePos)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const t = (en: string, es: string) => (lang === 'en' ? en : es)
  const allDone = LEVEL1_NODES.every((n) => completed.includes(n.id))

  const handleSolved = (xp: number, solvedCount: number) => {
    addXP(xp, 'Data Defender')
    setEarned((e) => e + xp)
    const node = LEVEL1_NODES[activeNode]
    if (solvedCount >= node.puzzles.length) {
      const bonus = node.isBoss ? BOSS_CLEAR_BONUS : NODE_CLEAR_BONUS
      addXP(bonus, 'Data Defender')
      setEarned((e) => e + bonus)
      completeNode(node.id)
      setNodePuzzleIndex(node.id, 0)
      if (node.isBoss) setView('victory')
      else setView('map')
    } else {
      setNodePuzzleIndex(node.id, solvedCount)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative max-h-[96vh] w-[min(1400px,98vw)] overflow-hidden rounded-lg border-4 border-black bg-[#0b0b0d] shadow-[8px_8px_0_rgba(143,29,29,0.5)]">
        <div className="flex items-center gap-3 border-b-4 border-black bg-[#101014] px-5 py-3">
          <span className="text-2xl font-black uppercase tracking-[0.3em] text-[#e7e0d0]">
            DATA DEFENDER
          </span>
          <span className="hidden text-sm font-bold uppercase tracking-widest text-[#6a6a74] sm:inline">
            {t('Case: The Quesera Murders', 'Caso: Los asesinatos de la Quesera')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => useCampaignStore.getState().setLang(lang === 'en' ? 'es' : 'en')}
              className="border-2 border-black bg-[#232329] px-3 py-1.5 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[2px_2px_0_#000]"
            >
              {lang}
            </button>
            <button
              onClick={onClose}
              aria-label="close"
              className="border-2 border-black bg-[#232329] p-2 text-[#e7e0d0] shadow-[2px_2px_0_#000] hover:bg-[#8f1d1d]"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(96vh-72px)] overflow-y-auto p-6">
          {!introSeen || forceIntro ? (
            <IntroCinematic
              key={lang}
              lang={lang}
              onFinish={() => {
                setIntroSeen(true)
                setForceIntro(false)
              }}
            />
          ) : view === 'map' ? (
            <>
              <MapScreen
                nodes={LEVEL1_NODES}
                completed={completed}
                nodePos={nodePos}
                lang={lang}
                onArrive={handleArrive}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#55555e]">
                  {t('Click a node or press Enter to investigate · Esc to leave', 'Clic en un nodo o Enter para investigar · Esc para salir')}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setForceIntro(true)}
                    className="border-2 border-black bg-[#232329] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#8a8a94] shadow-[2px_2px_0_#000] hover:text-[#e7e0d0]"
                  >
                    {t('▶ Intro', '▶ Intro')}
                  </button>
                  <ResetButton
                    lang={lang}
                    onReset={() => {
                      resetCampaign()
                      setView('map')
                      setActiveNode(0)
                      setEarned(0)
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}

          {view === 'brief' && (
            <NodeBrief
              node={LEVEL1_NODES[activeNode]}
              lang={lang}
              onStart={() => setView('flow')}
              onBack={() => setView('map')}
            />
          )}

          {view === 'flow' && (
            <PuzzleFlow
              key={LEVEL1_NODES[activeNode].id}
              node={LEVEL1_NODES[activeNode]}
              lang={lang}
              startAt={nodePuzzleIndex[LEVEL1_NODES[activeNode].id] ?? 0}
              onSolved={handleSolved}
              onAbandon={() => setView('map')}
            />
          )}

          {view === 'victory' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Trophy className="h-14 w-14 text-[#c9a227]" strokeWidth={2} />
              <h2 className="text-3xl font-black uppercase tracking-[0.2em] text-[#e7e0d0]">
                {t('The Bone Court rests', 'La Corte de Huesos descansa')}
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-[#9a9aa4]">
                {t(
                  'The Deadlock King crumbles into committed rows. Aldous Vex swings at dawn. Nullville sleeps — until the next migration.',
                  'El Rey del Deadlock se deshace en filas confirmadas. Aldous Vex será ahorcado al alba. Nullville duerme — hasta la siguiente migración.',
                )}
              </p>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#c9a227]">
                +{earned} XP · Level 1 clear
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    resetCampaign()
                    setView('map')
                  }}
                  className="flex items-center gap-2 border-2 border-black bg-[#232329] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[3px_3px_0_#000]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t('New game +', 'Nueva partida +')}
                </button>
                {allDone && (
                  <button
                    onClick={onClose}
                    className="border-2 border-black bg-[#8f1d1d] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-[#e7e0d0] shadow-[3px_3px_0_#000]"
                  >
                    {t('Leave', 'Salir')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResetButton({ lang, onReset }: { lang: Lang; onReset: () => void }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(timer)
  }, [armed])

  return (
    <button
      onClick={() => {
        if (armed) {
          onReset()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
      className={`flex shrink-0 items-center gap-1.5 border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0_#000] transition-colors ${
        armed
          ? 'animate-pulse bg-[#e02626] text-[#fff]'
          : 'bg-[#232329] text-[#8a8a94] hover:bg-[#8f1d1d] hover:text-[#e7e0d0]'
      }`}
    >
      <Trash2 className="h-3 w-3" />
      {armed
        ? lang === 'en'
          ? 'Sure? Click again'
          : '¿Seguro? Clic otra vez'
        : lang === 'en'
          ? 'Reset progress'
          : 'Reiniciar progreso'}
    </button>
  )
}
