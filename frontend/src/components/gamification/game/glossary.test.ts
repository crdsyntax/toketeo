import { describe, expect, it } from 'vitest'
import { GLOSSARY, segmentRichText } from './glossary'

describe('glossary', () => {
  it('has bilingual definitions for every term', () => {
    Object.entries(GLOSSARY).forEach(([, entry]) => {
      expect(entry.label.en.trim()).toBeTruthy()
      expect(entry.label.es.trim()).toBeTruthy()
      expect(entry.def.en.trim()).toBeTruthy()
      expect(entry.def.es.trim()).toBeTruthy()
    })
  })

  it('segments plain text without matches untouched', () => {
    const pieces = segmentRichText('Nothing special here.')
    expect(pieces).toEqual([{ text: 'Nothing special here.' }])
  })

  it('detects keywords in english and spanish with case insensitivity', () => {
    const cases: Array<[string, string]> = [
      ['Join both tables on the relation.', 'join'],
      ['Une las tablas con JOIN.', 'join'],
      ['Use GROUP BY to bucket rows.', 'groupby'],
      ['la relación entre tablas', 'relacion'],
      ['The foreign key points at persons(id).', 'fk'],
      ['SETEX stores the value with TTL.', 'setex'],
      ['a DEADLOCK kills progress', 'deadlock'],
      ['db.residents.find()', 'find'],
    ]
    cases.forEach(([text, key]) => {
      const hit = segmentRichText(text).find((p) => p.termKey)
      expect(hit?.termKey, text).toBe(key)
    })
  })

  it('keeps full matched text in the piece', () => {
    const pieces = segmentRichText('Group By the graves')
    const hit = pieces.find((p) => p.termKey === 'groupby')
    expect(hit?.text.toLowerCase()).toBe('group by')
  })
})
