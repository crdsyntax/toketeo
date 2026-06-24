import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Node, Edge } from '@xyflow/react'
import type { Diagram, DiagramFileFormat } from './types'
import { generateId } from './types'

interface DiagramState {
  diagrams: Diagram[]
  activeDiagramId: string | null

  createDiagram: (name: string, sourceConnectionId?: string | null) => string
  deleteDiagram: (id: string) => void
  saveDiagram: (id: string, nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }) => void
  renameDiagram: (id: string, name: string) => void

  setActiveDiagram: (id: string | null) => void
  getActiveDiagram: () => Diagram | null

  exportToJson: (id: string) => string | null
  importFromJson: (json: string) => string | null
}

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => ({
      diagrams: [],
      activeDiagramId: null,

      createDiagram: (name: string, sourceConnectionId: string | null = null) => {
        const id = generateId()
        const now = new Date().toISOString()
        const diagram: Diagram = {
          id,
          name,
          createdAt: now,
          updatedAt: now,
          sourceConnectionId: sourceConnectionId ?? null,
          nodes: [],
          edges: [],
        }
        set((state) => ({ diagrams: [...state.diagrams, diagram] }))
        return id
      },

      deleteDiagram: (id: string) => {
        set((state) => ({
          diagrams: state.diagrams.filter((d) => d.id !== id),
          activeDiagramId: state.activeDiagramId === id ? null : state.activeDiagramId,
        }))
      },

      saveDiagram: (id: string, nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }) => {
        set((state) => ({
          diagrams: state.diagrams.map((d) =>
            d.id === id
              ? { ...d, nodes, edges, viewport, updatedAt: new Date().toISOString() }
              : d,
          ),
        }))
      },

      renameDiagram: (id: string, name: string) => {
        set((state) => ({
          diagrams: state.diagrams.map((d) =>
            d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d,
          ),
        }))
      },

      setActiveDiagram: (id: string | null) => {
        set({ activeDiagramId: id })
      },

      getActiveDiagram: () => {
        const { diagrams, activeDiagramId } = get()
        if (!activeDiagramId) return null
        return diagrams.find((d) => d.id === activeDiagramId) ?? null
      },

      exportToJson: (id: string) => {
        const diagram = get().diagrams.find((d) => d.id === id)
        if (!diagram) return null
        const file: DiagramFileFormat = {
          version: 1,
          name: diagram.name,
          sourceConnectionId: diagram.sourceConnectionId,
          createdAt: diagram.createdAt,
          updatedAt: diagram.updatedAt,
          nodes: diagram.nodes,
          edges: diagram.edges,
          viewport: diagram.viewport,
        }
        return JSON.stringify(file, null, 2)
      },

      importFromJson: (json: string) => {
        try {
          const file = JSON.parse(json) as DiagramFileFormat
          if (!file.version || !file.nodes || !file.edges) return null

          const id = generateId()
          const now = new Date().toISOString()
          const diagram: Diagram = {
            id,
            name: file.name || 'Imported Diagram',
            createdAt: now,
            updatedAt: now,
            sourceConnectionId: file.sourceConnectionId ?? null,
            nodes: file.nodes,
            edges: file.edges,
            viewport: file.viewport,
          }
          set((state) => ({ diagrams: [...state.diagrams, diagram] }))
          return id
        } catch {
          return null
        }
      },
    }),
    {
      name: 'toketeo-diagram-storage',
    },
  ),
)
