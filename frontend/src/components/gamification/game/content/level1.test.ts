import { describe, expect, it } from 'vitest'
import { LEVEL1_NODES } from './level1'
import { checkQueryAnswer, normalizeAnswer } from '../types'

describe('data defender level 1 content', () => {
  const allPuzzles = LEVEL1_NODES.flatMap((n) => n.puzzles)

  it('has 6 nodes ending with the boss', () => {
    expect(LEVEL1_NODES).toHaveLength(6)
    expect(LEVEL1_NODES.at(-1)?.isBoss).toBe(true)
    expect(LEVEL1_NODES.filter((n) => n.isBoss)).toHaveLength(1)
  })

  it('has unique node ids', () => {
    const ids = LEVEL1_NODES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has at least 10 puzzles per node', () => {
    LEVEL1_NODES.forEach((n) => {
      expect(n.puzzles.length, n.id).toBeGreaterThanOrEqual(10)
    })
  })

  it('has bilingual text everywhere', () => {
    allPuzzles.forEach((p) => {
      expect(p.title.en.trim()).toBeTruthy()
      expect(p.title.es.trim()).toBeTruthy()
      expect(p.story.en.trim()).toBeTruthy()
      expect(p.story.es.trim()).toBeTruthy()
      expect(p.prompt.en.trim()).toBeTruthy()
      expect(p.prompt.es.trim()).toBeTruthy()
      expect(p.xp).toBeGreaterThan(0)
    })
    LEVEL1_NODES.forEach((n) => {
      expect(n.name.en.trim()).toBeTruthy()
      expect(n.name.es.trim()).toBeTruthy()
    })
  })

  it('has valid answer indexes and table shapes', () => {
    allPuzzles.forEach((p) => {
      if (p.kind === 'trivia') {
        expect(p.answerIndex).toBeLessThan(p.options.length)
        p.options.forEach((o) => {
          expect(o.en.trim()).toBeTruthy()
          expect(o.es.trim()).toBeTruthy()
        })
      }
      if (p.kind === 'mystery') {
        expect(p.answerIndex).toBeLessThan(p.options.length)
        expect(p.tables.length).toBeGreaterThanOrEqual(1)
        p.tables.forEach((t) => {
          t.rows.forEach((row) => {
            expect(row).toHaveLength(t.columns.length)
          })
        })
      }
      if (p.kind === 'query') {
        expect(normalizeAnswer(p.solution).length).toBeGreaterThan(5)
      }
    })
  })

  it('covers sql, mongo and redis engines', () => {
    const engines = new Set(allPuzzles.map((p) => p.engine))
    expect(engines.has('sql')).toBe(true)
    expect(engines.has('mongo')).toBe(true)
    expect(engines.has('redis')).toBe(true)
  })
})

describe('checkQueryAnswer normalization', () => {
  it('accepts case, whitespace and semicolon differences', () => {
    expect(checkQueryAnswer('SELECT name FROM victims;', 'select name from victims')).toBe(true)
    expect(checkQueryAnswer('SELECT   name\nFROM victims ', 'SELECT name FROM victims')).toBe(true)
  })

  it('accepts double quotes as string delimiters', () => {
    const puzzle = LEVEL1_NODES[1].puzzles.find((p) => p.id === 'l1-s2-p2')
    expect(puzzle && puzzle.kind === 'query').toBe(true)
    if (puzzle?.kind === 'query') {
      expect(
        checkQueryAnswer(
          'select p.name from roles r JOIN persons p on p.id = r.person_id where r.job = "butcher" and r.shift = "night"',
          puzzle.solution,
          puzzle.accept,
        ),
      ).toBe(true)
    }
  })

  it('rejects wrong answers', () => {
    expect(checkQueryAnswer('SELECT * FROM victims', 'SELECT name FROM victims')).toBe(false)
    expect(checkQueryAnswer('', 'SELECT name FROM victims')).toBe(false)
  })
})
