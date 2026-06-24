import type { Node, Edge } from '@xyflow/react'

export type DiagramNodeType = 'table' | 'view' | 'function' | 'procedure' | 'trigger'

export interface Diagram {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceConnectionId: string | null
  nodes: Node[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
}

export interface DiagramFileFormat {
  version: 1
  name: string
  sourceConnectionId: string | null
  createdAt: string
  updatedAt: string
  nodes: Node[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
}

export function generateId(): string {
  return `diag_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export const DIAGRAM_FILE_EXTENSION = '.tokdiagram'
export const DIAGRAM_FILE_FILTER = 'Toketeo Diagram'
