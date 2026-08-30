import { useState } from 'react'
import { Heart, Lightbulb, Skull } from 'lucide-react'
import { PortraitArtwork } from './Portraits'
import { RichText } from './TermTip'
import { DraggableTable, type TableLike } from './DraggableTable'
import { checkQueryAnswer } from './types'
import type { Lang, MapNode, MysteryTable, Puzzle } from './types'

const ENGINE_BADGE: Record<string, string> = {
  sql: 'border-[#e7e0d0]/40 text-[#e7e0d0]',
  mongo: 'border-[#6d8f4b]/60 text-[#9dbf77]',
  redis: 'border-[#e02626]/60 text-[#ff6a5e]',
}

interface PuzzleModalProps {
  node: MapNode
  lang: Lang
  startAt?: number
  onSolved: (xp: number, total: number) => void
  onAbandon: () => void
}

export function PuzzleFlow({ node, lang, startAt = 0, onSolved, onAbandon }: PuzzleModalProps) {
  const [index, setIndex] = useState(startAt)
  const [lives, setLives] = useState(node.puzzles.length > 6 ? 5 : 3)
  const [dead, setDead] = useState(false)
  const [openTables, setOpenTables] = useState<MysteryTable[]>([])

  const puzzle = node.puzzles[index]
  const t = (o: { en: string; es: string }) => o[lang]

  const openTable = (table: MysteryTable) => {
    setOpenTables((open) =>
      open.some((tb) => tb.name === table.name) ? open : [...open, table],
    )
  }
  const closeTable = (name: string) => {
    setOpenTables((open) => open.filter((tb) => tb.name !== name))
  }

  const handleWrong = () => {
    const next = lives - 1
    if (next <= 0) setDead(true)
    else setLives(next)
  }

  const advance = (xp: number) => {
    onSolved(xp, index + 1)
    setOpenTables([])
    if (index + 1 < node.puzzles.length) setIndex(index + 1)
  }

  if (dead) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Skull className="h-12 w-12 text-[#e02626]" strokeWidth={2.5} />
        <h3 className="text-2xl font-black uppercase tracking-widest text-[#e02626]">
          {lang === 'en' ? 'You joined the archive' : 'Te uniste al archivo'}
        </h3>
        <p className="max-w-md text-sm text-[#8a8a94]">
          {lang === 'en'
            ? 'Your body was found filed under "unresolved queries". The alley keeps what it takes.'
            : 'Tu cuerpo apareció archivado bajo "consultas sin resolver". El callejón se queda lo que toma.'}
        </p>
        <button
          onClick={onAbandon}
          className="mt-2 border-2 border-black bg-[#8f1d1d] px-6 py-2.5 text-sm font-black uppercase tracking-widest text-[#e7e0d0] shadow-[3px_3px_0_#000]"
        >
          {lang === 'en' ? 'Back to the map' : 'Volver al mapa'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex items-start gap-4 rounded-lg border-2 border-black bg-[#101014] p-4 shadow-[4px_4px_0_#000]">
        <PortraitArtwork npc={node.npc} className="h-[76px] w-auto border-2 border-black" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-black uppercase tracking-widest text-[#e7e0d0]">
              {t(node.name)}
            </span>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${ENGINE_BADGE[puzzle.engine]}`}>
              {puzzle.engine}
            </span>
          </div>
          <p className={`mt-2 text-base leading-relaxed ${node.isBoss ? 'text-[#c98a8a]' : 'text-[#9a9aa4]'}`}>
            “<RichText text={t(puzzle.story)} lang={lang} />”
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {[0, 1, 2, 3, 4].slice(0, lives > 5 || node.puzzles.length <= 6 ? 3 : 5).map((i) => (
            <Heart key={i} className={`h-5 w-5 ${i < lives ? 'fill-[#e02626] text-[#e02626]' : 'text-[#2a2a30]'}`} />
          ))}
        </div>
      </div>

      <PuzzleBody
        key={puzzle.id}
        puzzle={puzzle}
        lang={lang}
        onWrong={handleWrong}
        onCorrect={(xp) => advance(xp)}
        onOpenTable={openTable}
      />

      <button
        onClick={onAbandon}
        className="self-end text-xs font-bold uppercase tracking-widest text-[#55555e] hover:text-[#e7e0d0]"
      >
        {lang === 'en' ? 'Flee to map' : 'Huir al mapa'}
      </button>

      {openTables.map((table, i) => (
        <DraggableTable
          key={puzzle.id + table.name}
          table={table as TableLike}
          initialX={120 + i * 36}
          initialY={140 + i * 32}
          zIndex={80 + i}
          onClose={() => closeTable(table.name)}
        />
      ))}
    </div>
  )
}

function PuzzleBody({
  puzzle,
  lang,
  onWrong,
  onCorrect,
  onOpenTable,
}: {
  puzzle: Puzzle
  lang: Lang
  onWrong: () => void
  onCorrect: (xp: number) => void
  onOpenTable?: (table: MysteryTable) => void
}) {
  const [failed, setFailed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [shake, setShake] = useState(false)
  const [feedback, setFeedback] = useState<'wrong' | 'correct' | null>(null)
  const t = (o: { en: string; es: string }) => o[lang]

  const reject = () => {
    setFailed(true)
    setShake(true)
    window.setTimeout(() => setShake(false), 400)
    onWrong()
    setFeedback('wrong')
  }
  const accept = () => {
    setSolved(true)
    setFeedback('correct')
  }
  const closeFeedback = () => {
    const wasCorrect = feedback === 'correct'
    setFeedback(null)
    if (wasCorrect) onCorrect(puzzle.xp)
  }

  return (
    <div className={`rounded-lg border-2 border-black bg-[#131318] p-5 shadow-[4px_4px_0_#000] ${shake ? 'animate-[wiggle_0.4s_ease-in-out]' : ''}`}>
      <h4 className="text-2xl font-black uppercase tracking-wider text-[#e7e0d0]">{t(puzzle.title)}</h4>
      <p className="mt-2 text-base font-semibold leading-relaxed text-[#c5c5cf]">
        <RichText text={t(puzzle.prompt)} lang={lang} />
      </p>

      {puzzle.tables && puzzle.tables.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {puzzle.tables.map((table) => (
            <button
              key={table.name}
              onClick={() => onOpenTable?.(table)}
              className="border-2 border-black bg-[#232329] px-3 py-1.5 font-mono text-xs font-bold text-[#c9e59a] shadow-[2px_2px_0_#000] hover:bg-[#8f1d1d] hover:text-[#e7e0d0]"
            >
              ▦ {table.name}
            </button>
          ))}
          <span className="self-center text-[10px] uppercase tracking-widest text-[#55555e]">
            {lang === 'en' ? 'click to open · drag to move' : 'clic para abrir · arrastra para mover'}
          </span>
        </div>
      )}

      {puzzle.kind === 'trivia' && (
        <TriviaBody puzzle={puzzle} lang={lang} failed={failed} solved={solved} reject={reject} accept={accept} />
      )}
      {puzzle.kind === 'query' && (
        <QueryBody puzzle={puzzle} lang={lang} solved={solved} reject={reject} accept={accept} />
      )}
      {puzzle.kind === 'mystery' && (
        <MysteryBody puzzle={puzzle} lang={lang} failed={failed} solved={solved} reject={reject} accept={accept} />
      )}

      {failed && !solved && (
        <div className="mt-3 flex items-start gap-2 rounded border border-[#c9a227]/40 bg-[#c9a227]/10 p-3 text-base text-[#e5cd7a]">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          {t(puzzle.hint)}
        </div>
      )}
      {solved && (
        <div className="mt-3 rounded border border-[#6d8f4b]/50 bg-[#6d8f4b]/10 p-3 text-sm font-bold uppercase tracking-widest text-[#9dbf77]">
          +{puzzle.xp} XP · {lang === 'en' ? 'The case file grows' : 'El expediente crece'}
        </div>
      )}

      {feedback && (
        <FeedbackOverlay
          kind={feedback}
          puzzle={puzzle}
          lang={lang}
          onClose={closeFeedback}
        />
      )}
    </div>
  )
}

function FeedbackOverlay({
  kind,
  puzzle,
  lang,
  onClose,
}: {
  kind: 'wrong' | 'correct'
  puzzle: Puzzle
  lang: Lang
  onClose: () => void
}) {
  const ok = kind === 'correct'
  const t = (o: { en: string; es: string }) => o[lang]
  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/85 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto border-4 border-black bg-[#101014] p-6 shadow-[8px_8px_0_rgba(143,29,29,0.5)]">
        <div className="flex items-center gap-3">
          <Skull className={`h-9 w-9 ${ok ? 'text-[#9dbf77]' : 'text-[#e02626]'}`} strokeWidth={2.5} />
          <h3
            className={`text-2xl font-black uppercase tracking-[0.15em] ${
              ok ? 'text-[#9dbf77]' : 'text-[#e02626]'
            }`}
          >
            {ok
              ? lang === 'en'
                ? 'Case cracked'
                : 'Caso resuelto'
              : lang === 'en'
                ? 'Wrong trail'
                : 'Pista falsa'}
          </h3>
          <span className="ml-auto rounded border px-2 py-0.5 text-[11px] font-bold uppercase text-[#8a8a94]">
            {puzzle.engine}
          </span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#c5c5cf]">
          <RichText text={t(puzzle.explain)} lang={lang} />
        </p>

        {!ok && (
          <div className="mt-4 rounded border border-[#c9a227]/40 bg-[#c9a227]/10 p-3 text-sm leading-relaxed text-[#e5cd7a]">
            <span className="font-black uppercase tracking-widest">
              {lang === 'en' ? 'Hint: ' : 'Pista: '}
            </span>
            <RichText text={t(puzzle.hint)} lang={lang} />
          </div>
        )}

        {puzzle.kind === 'query' && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#55555e]">
              {ok
                ? lang === 'en'
                  ? 'Your query did this:'
                  : 'Tu consulta hizo esto:'
                : lang === 'en'
                  ? 'Expected answer:'
                  : 'Respuesta esperada:'}
            </div>
            <pre className="overflow-x-auto rounded border-2 border-black bg-[#0b0b0d] p-3 font-mono text-xs leading-relaxed text-[#c9e59a]">
              {puzzle.solution}
            </pre>
          </div>
        )}

        {puzzle.kind !== 'query' && (
          <div className="mt-4 rounded border border-[#39435c]/60 bg-[#39435c]/15 p-3 text-base leading-relaxed text-[#c5d3e8]">
            <span className="font-black uppercase tracking-widest text-[#8fb3d9]">
              {lang === 'en' ? 'Correct answer: ' : 'Respuesta correcta: '}
            </span>
            {(puzzle.kind === 'trivia'
              ? puzzle.options[puzzle.answerIndex]
              : puzzle.options[puzzle.answerIndex]
            )[lang]}
          </div>
        )}

        {ok && (
          <div className="mt-4 rounded border border-[#6d8f4b]/50 bg-[#6d8f4b]/10 p-3 text-sm font-bold uppercase tracking-widest text-[#9dbf77]">
            +{puzzle.xp} XP ·{' '}
            {lang === 'en' ? 'The case file grows thicker.' : 'El expediente se vuelve más denso.'}
          </div>
        )}

        <button
          onClick={onClose}
          className={`mt-5 w-full border-2 border-black py-3 text-sm font-black uppercase tracking-[0.2em] text-[#e7e0d0] shadow-[3px_3px_0_#000] ${
            ok ? 'bg-[#4c7a3f] hover:bg-[#5c9049]' : 'bg-[#8f1d1d] hover:bg-[#a52525]'
          }`}
        >
          {ok
            ? lang === 'en'
              ? 'Continue ▸'
              : 'Continuar ▸'
            : lang === 'en'
              ? 'Try again'
              : 'Intentar de nuevo'}
        </button>
      </div>
    </div>
  )
}

interface BodyProps<P> {
  puzzle: P
  lang: Lang
  failed: boolean
  solved: boolean
  reject: () => void
  accept: () => void
}

function TriviaBody({ puzzle, lang, failed, solved, reject, accept }: BodyProps<Extract<Puzzle, { kind: 'trivia' }>>) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="mt-3 grid gap-2">
      {puzzle.options.map((opt, i) => {
        const isAnswer = i === puzzle.answerIndex
        const revealed = failed || solved
        return (
          <button
            key={i}
            disabled={solved}
            onClick={() => {
              setPicked(i)
              if (isAnswer) accept()
              else reject()
            }}
            className={`border-2 border-black px-4 py-3.5 text-left font-mono text-base shadow-[3px_3px_0_#000] transition-colors ${
              solved && isAnswer
                ? 'bg-[#6d8f4b]/25 text-[#c9e0af]'
                : picked === i
                  ? 'bg-[#8f1d1d]/30 text-[#ffb4ab]'
                  : revealed && isAnswer
                    ? 'bg-[#6d8f4b]/15 text-[#c9e0af]'
                    : 'bg-[#1c1c22] text-[#d8d8e2] hover:bg-[#26262e]'
            }`}
          >
            {opt[lang]}
          </button>
        )
      })}
    </div>
  )
}

function QueryBody({ puzzle, lang, solved, reject, accept }: Omit<BodyProps<Extract<Puzzle, { kind: 'query' }>>, 'failed'>) {
  const [input, setInput] = useState('')
  return (
    <div className="mt-3">
      <textarea
        value={input}
        disabled={solved}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder={lang === 'en' ? '// write your query…' : '// escribe tu consulta…'}
        className="h-32 w-full resize-none border-2 border-black bg-[#0b0b0d] p-3 font-mono text-base text-[#c9e59a] outline-none placeholder:text-[#3f3f46] focus:border-[#8f1d1d] disabled:opacity-50"
      />
      {!solved ? (
        <button
          onClick={() => {
            if (checkQueryAnswer(input, puzzle.solution, puzzle.accept)) accept()
            else reject()
          }}
          className="mt-2 border-2 border-black bg-[#8f1d1d] px-6 py-2.5 text-sm font-black uppercase tracking-widest text-[#e7e0d0] shadow-[3px_3px_0_#000] hover:bg-[#a52525]"
        >
          EXECUTE ▸
        </button>
      ) : (
        <pre className="mt-2 overflow-x-auto border-2 border-black bg-[#0b0b0d] p-3 font-mono text-xs leading-relaxed text-[#9dbf77]">
          {puzzle.solution}
        </pre>
      )}
    </div>
  )
}

function MysteryBody({ puzzle, lang, failed, solved, reject, accept }: BodyProps<Extract<Puzzle, { kind: 'mystery' }>>) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-[#8a8a94]">
        {lang === 'en'
          ? 'Open each testimony table above and cross-reference the clues.'
          : 'Abre cada tabla de testimonio arriba y cruza las pistas.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {puzzle.options.map((opt, i) => {
          const isAnswer = i === puzzle.answerIndex
          const revealed = failed || solved
          return (
            <button
              key={i}
              disabled={solved}
              onClick={() => {
                setPicked(i)
                if (isAnswer) accept()
                else reject()
              }}
              className={`border-2 border-black px-4 py-3.5 text-left text-base font-black uppercase tracking-wider shadow-[3px_3px_0_#000] transition-colors ${
                solved && isAnswer
                  ? 'bg-[#6d8f4b]/25 text-[#c9e0af]'
                  : picked === i
                    ? 'bg-[#8f1d1d]/30 text-[#ffb4ab]'
                    : revealed && isAnswer
                      ? 'bg-[#6d8f4b]/15 text-[#c9e0af]'
                      : 'bg-[#1c1c22] text-[#d8d8e2] hover:bg-[#26262e]'
              }`}
            >
              ⚖ {opt[lang]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
