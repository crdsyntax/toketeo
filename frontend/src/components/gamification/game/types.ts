export type Lang = 'en' | 'es'

export interface LText {
  en: string
  es: string
}

export type EngineKind = 'sql' | 'mongo' | 'redis'

export type SceneKey =
  | 'street'
  | 'morgue'
  | 'cheeseShop'
  | 'graveyard'
  | 'warehouse'
  | 'throne'

export type NpcKey =
  | 'coroner'
  | 'witness'
  | 'scribe'
  | 'keeper'
  | 'ghost'
  | 'butcher'
  | 'boss'

interface BasePuzzle {
  id: string
  engine: EngineKind
  title: LText
  story: LText
  prompt: LText
  hint: LText
  explain: LText
  xp: number
  tables?: MysteryTable[]
}

export interface TriviaPuzzle extends BasePuzzle {
  kind: 'trivia'
  options: LText[]
  answerIndex: number
}

export interface QueryPuzzle extends BasePuzzle {
  kind: 'query'
  solution: string
  accept?: string[]
}

export interface MysteryTable {
  name: string
  columns: string[]
  rows: string[][]
}

export interface MysteryPuzzle extends BasePuzzle {
  kind: 'mystery'
  tables: MysteryTable[]
  options: LText[]
  answerIndex: number
}

export type Puzzle = TriviaPuzzle | QueryPuzzle | MysteryPuzzle

export interface MapNode {
  id: string
  name: LText
  subtitle: LText
  scene: SceneKey
  npc: NpcKey
  isBoss: boolean
  learn: LText[]
  puzzles: Puzzle[]
}

export const normalizeAnswer = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/["`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/;+\s*$/, '')

export const toAsciiTable = (columns: string[], rows: string[][]): string => {
  const indexed = rows.map((r, i) => [String(i + 1), ...r])
  const header = ['#', ...columns]
  const widths = header.map((h, ci) =>
    Math.max(h.length, ...indexed.map((r) => r[ci]?.length ?? 0)),
  )
  const divider = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
  const format = (cells: string[]) =>
    '|' + cells.map((c, i) => ` ${c.padEnd(widths[i])} `).join('|') + '|'
  return [
    divider,
    format(header),
    divider,
    ...indexed.map((r) => format(r)),
    divider,
  ].join('\n')
}

export const checkQueryAnswer = (
  input: string,
  solution: string,
  accept?: string[],
): boolean => {
  const candidate = normalizeAnswer(input)
  if (!candidate) return false
  const candidates = [solution, ...(accept ?? [])].map(normalizeAnswer)
  return candidates.includes(candidate)
}
