import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { Diagram, DiagramFileFormat } from './types'
import { generateId } from './types'
import { diagramService } from '@/services/diagram.service'

interface DiagramState {
  diagrams: Diagram[]
  activeDiagramId: string | null
  loaded: boolean

  loadDiagrams: () => Promise<void>
  createDiagram: (name: string, sourceConnectionId?: string | null, sourceSchema?: string) => string
  deleteDiagram: (id: string) => void
  saveDiagram: (id: string, nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }) => void
  renameDiagram: (id: string, name: string) => void
  setDiagramSchema: (id: string, schema: string) => void
  setDiagramConnection: (id: string, connectionId: string, schema: string) => void

  setActiveDiagram: (id: string | null) => void
  getActiveDiagram: () => Diagram | null

  exportToJson: (id: string) => string | null
  importFromJson: (json: string) => string | null
}

function toPersistable(d: Diagram) {
  return {
    id: d.id,
    name: d.name,
    sourceConnectionId: d.sourceConnectionId,
    sourceSchema: d.sourceSchema,
    nodes: d.nodes,
    edges: d.edges,
    viewport: d.viewport,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

export const useDiagramStore = create<DiagramState>()((set, get) => ({
  diagrams: [],
  activeDiagramId: null,
  loaded: false,

  loadDiagrams: async () => {
    try {
      const diagrams = await diagramService.list()
      set({ diagrams, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  createDiagram: (name: string, sourceConnectionId: string | null = null, sourceSchema?: string) => {
    const id = generateId()
    const now = new Date().toISOString()
    const diagram: Diagram = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      sourceConnectionId: sourceConnectionId ?? null,
      sourceSchema,
      nodes: [],
      edges: [],
    }
    set((state) => ({ diagrams: [...state.diagrams, diagram] }))
    diagramService.save(toPersistable(diagram)).catch(() => {})
    return id
  },

  deleteDiagram: (id: string) => {
    set((state) => ({
      diagrams: state.diagrams.filter((d) => d.id !== id),
      activeDiagramId: state.activeDiagramId === id ? null : state.activeDiagramId,
    }))
    diagramService.remove(id).catch(() => {})
  },

  saveDiagram: (id: string, nodes: Node[], edges: Edge[], viewport?: { x: number; y: number; zoom: number }) => {
    set((state) => ({
      diagrams: state.diagrams.map((d) =>
        d.id === id
          ? { ...d, nodes, edges, viewport, updatedAt: new Date().toISOString() }
          : d,
      ),
    }))
    const diagram = get().diagrams.find((d) => d.id === id)
    if (diagram) diagramService.save(toPersistable(diagram)).catch(() => {})
  },

  renameDiagram: (id: string, name: string) => {
    set((state) => ({
      diagrams: state.diagrams.map((d) =>
        d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d,
      ),
    }))
    const diagram = get().diagrams.find((d) => d.id === id)
    if (diagram) diagramService.save(toPersistable(diagram)).catch(() => {})
  },

  setDiagramSchema: (id: string, schema: string) => {
    set((state) => ({
      diagrams: state.diagrams.map((d) =>
        d.id === id ? { ...d, sourceSchema: schema, updatedAt: new Date().toISOString() } : d,
      ),
    }))
    const diagram = get().diagrams.find((d) => d.id === id)
    if (diagram) diagramService.save(toPersistable(diagram)).catch(() => {})
  },

  setDiagramConnection: (id: string, connectionId: string, schema: string) => {
    set((state) => ({
      diagrams: state.diagrams.map((d) =>
        d.id === id
          ? { ...d, sourceConnectionId: connectionId, sourceSchema: schema, nodes: [], edges: [], updatedAt: new Date().toISOString() }
          : d,
      ),
    }))
    const diagram = get().diagrams.find((d) => d.id === id)
    if (diagram) diagramService.save(toPersistable(diagram)).catch(() => {})
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
      sourceSchema: diagram.sourceSchema,
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
        sourceSchema: file.sourceSchema,
        nodes: file.nodes,
        edges: file.edges,
        viewport: file.viewport,
      }
      set((state) => ({ diagrams: [...state.diagrams, diagram] }))
      diagramService.save(toPersistable(diagram)).catch(() => {})
      return id
    } catch {
      return null
    }
  },
}))
