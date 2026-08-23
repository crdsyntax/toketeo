import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY, segmentRichText } from './glossary'
import type { Lang } from './types'

export function RichText({ text, lang }: { text: string; lang: Lang }) {
  const pieces = segmentRichText(text)
  return (
    <>
      {pieces.map((piece, i) =>
        piece.termKey ? (
          <TermTip key={i} termKey={piece.termKey} lang={lang}>
            {piece.text}
          </TermTip>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </>
  )
}

const TIP_W = 300

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function TermTip({
  termKey,
  lang,
  children,
}: {
  termKey: string
  lang: Lang
  children: React.ReactNode
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const sync = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setRect(r)
  }
  const hide = () => setRect(null)

  const entry = GLOSSARY[termKey]
  if (!entry) return <span>{children}</span>

  let style: React.CSSProperties | undefined
  if (rect) {
    const left = clamp(rect.left + rect.width / 2 - TIP_W / 2, 12, window.innerWidth - TIP_W - 12)
    const above = rect.top > 240
    style = above
      ? { left, bottom: window.innerHeight - rect.top + 8 }
      : { left, top: rect.bottom + 8 }
  }

  return (
    <span className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (rect ? hide() : sync())}
        onMouseEnter={sync}
        onMouseLeave={hide}
        className="cursor-help font-bold underline decoration-dotted decoration-[#c9a227] underline-offset-2 text-[#e5cd7a]"
      >
        {children}
      </button>
      {rect &&
        createPortal(
          <div
            onClick={hide}
            className="fixed z-[95] rounded border-2 border-black bg-[#101014] p-3 shadow-[4px_4px_0_rgba(0,0,0,0.8)]"
            style={{ ...style, width: TIP_W }}
          >
            <div className="mb-1 text-xs font-black uppercase tracking-widest text-[#c9a227]">
              {entry.label[lang]}
            </div>
            <div className="text-xs leading-relaxed text-[#d8d8e2]">{entry.def[lang]}</div>
            {entry.example && (
              <pre className="mt-2 max-h-40 overflow-auto rounded border border-[#2a2a32] bg-[#0b0b0d] p-2 font-mono text-[10px] leading-relaxed text-[#c9e59a]">
                {entry.example}
              </pre>
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}
