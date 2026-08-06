import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import { nodesToMermaid } from './toMermaid'

function tableNode(id: string, label: string, columns: unknown[] = [], foreignKeys: unknown[] = []): Node {
  return {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { label, columns, foreignKeys },
  }
}

function viewNode(id: string, label: string): Node {
  return { id, type: 'view', position: { x: 0, y: 0 }, data: { label } }
}

function cardEdge(id: string, source: string, target: string, cardinality: string, label?: string): Edge {
  return { id, source, target, type: 'cardinality', data: { cardinality }, label }
}

describe('nodesToMermaid', () => {
  it('generates erDiagram with typed attributes and PK/FK markers', () => {
    const nodes = [
      tableNode('table:users', 'users', [
        { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
        { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true },
        { name: 'role_id', type: 'INT', isPrimaryKey: false, isNullable: true },
      ], [{ columnName: 'role_id' }]),
    ]
    const code = nodesToMermaid(nodes, [])
    expect(code).toContain('erDiagram')
    expect(code).toContain('USERS {')
    expect(code).toContain('INT id PK')
    expect(code).toContain('VARCHAR(255) email')
    expect(code).toContain('INT role_id FK')
  })

  it('exports views as empty entities with a comment', () => {
    const nodes = [viewNode('view:active_users', 'active_users')]
    const code = nodesToMermaid(nodes, [])
    expect(code).toContain('%% VIEW active_users')
    expect(code).toContain('ACTIVE_USERS {}')
  })

  it('exports the view query as commented lines', () => {
    const nodes: Node[] = [
      {
        id: 'view:active_users',
        type: 'view',
        position: { x: 0, y: 0 },
        data: { label: 'active_users', query: 'SELECT id\nFROM users\nWHERE active = 1' },
      },
    ]
    const code = nodesToMermaid(nodes, [])
    expect(code).toContain('%% VIEW active_users')
    expect(code).toContain('%% SELECT id')
    expect(code).toContain('%% FROM users')
    expect(code).toContain('%% WHERE active = 1')
  })

  it('maps 1:N cardinality to ||--o{ with label', () => {
    const nodes = [
      tableNode('table:users', 'users', [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }]),
      tableNode('table:orders', 'orders', [{ name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }]),
    ]
    const edges = [cardEdge('fk:orders:fk_user', 'table:users', 'table:orders', '1:N', 'user_id → id')]
    const code = nodesToMermaid(nodes, edges)
    expect(code).toContain('USERS ||--o{ ORDERS : "user_id → id"')
  })

  it('maps 1:1 and N:M cardinalities', () => {
    const nodes = [
      tableNode('table:a', 'a'),
      tableNode('table:b', 'b'),
      tableNode('table:c', 'c'),
    ]
    const edges = [
      cardEdge('e1', 'table:a', 'table:b', '1:1'),
      cardEdge('e2', 'table:b', 'table:c', 'N:M'),
    ]
    const code = nodesToMermaid(nodes, edges)
    expect(code).toContain('A ||--|| B')
    expect(code).toContain('B }o--o{ C')
  })

  it('omits relations whose endpoints are missing', () => {
    const nodes = [tableNode('table:a', 'a')]
    const edges = [cardEdge('e1', 'table:a', 'table:missing', '1:N')]
    const code = nodesToMermaid(nodes, edges)
    expect(code).not.toContain('A ||--o{')
  })

  it('escapes entity names with special characters', () => {
    const nodes = [tableNode('table:my table', 'my table')]
    const code = nodesToMermaid(nodes, [])
    expect(code).toContain('["my table"]')
  })

  it('sanitizes uppercase and guarantees unique entity ids', () => {
    const nodes = [tableNode('table:users', 'users'), tableNode('table:USERS', 'USERS')]
    const code = nodesToMermaid(nodes, [])
    expect(code).toContain('USERS {')
    expect(code).toContain('USERS_2 {')
  })

  it('tolerates nodes without data (corrupted/legacy diagrams)', () => {
    // Simulates legacy/corrupted diagrams stored without node data.
    const nodes = [
      { id: 'table:orphan', type: 'table', position: { x: 0, y: 0 } },
      { id: 'view:orphan_view', type: 'view', position: { x: 0, y: 0 } },
    ] as unknown as Node[]
    const code = nodesToMermaid(nodes, [])
    // Falls back to the node id, quoted because of the ':' character.
    expect(code).toContain('["table:orphan"] {')
    expect(code).toContain('%% VIEW view:orphan_view')
    expect(code).toContain('["view:orphan_view"] {}')
  })
})
