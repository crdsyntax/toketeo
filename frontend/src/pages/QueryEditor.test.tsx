import { render, screen } from '@testing-library/react'
import QueryEditor from './QueryEditor'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useQueryEditor } from '@/hooks/useQueryEditor'
import { useAppStore } from '@/store/useAppStore'
import React from 'react'

// Mock the hooks
vi.mock('@/hooks/useQueryEditor')
vi.mock('@/store/useAppStore')

// Mock UI components that might be complex or use Monaco
vi.mock('@/components/query/panels/SqlEditorPanel', () => ({
  SqlEditorPanel: () => <div data-testid="sql-editor">SQL Editor</div>
}))
vi.mock('@/components/query/panels/EditorToolbar', () => ({
  EditorToolbar: () => <div data-testid="editor-toolbar">Toolbar</div>
}))
vi.mock('@/components/query/panels/ResultsPanel', () => ({
  ResultsPanel: () => <div data-testid="results-panel">Results</div>
}))
vi.mock('@/components/query/panels/EditorTabs', () => ({
  EditorTabs: () => <div data-testid="editor-tabs">Tabs</div>
}))

describe('QueryEditor', () => {
  const mockActiveConnection = { id: 'test-conn', name: 'Test DB', type: 'mysql' }
  const mockUseQueryEditor = {
    activeConnection: mockActiveConnection,
    tabs: [{ id: 'tab1', name: 'Query 1', query: '', status: 'idle' }],
    activeTabId: 'tab1',
    activeTab: { id: 'tab1', name: 'Query 1', query: '', status: 'idle' },
    panels: { editor: true, results: true, editorHeight: 50 },
    setShowContextMenu: vi.fn(),
    handleSaveScript: vi.fn(),
    setEditorHeight: vi.fn(),
    addTab: vi.fn(),
    openTab: vi.fn(),
    removeTab: vi.fn(),
    updateTabQuery: vi.fn(),
    setActiveTabId: vi.fn(),
    updateTabResults: vi.fn(),
    togglePanel: vi.fn(),
    setShowLayoutMenu: vi.fn(),
    setShowResultModal: vi.fn(),
    requestSort: vi.fn(),
    toggleMaximize: vi.fn(),
    setEditingCell: vi.fn(),
    handleExecuteAll: vi.fn(),
    handleExecuteCurrent: vi.fn(),
    handleCancel: vi.fn(),
    handleSave: vi.fn(),
    handleEditorWillMount: vi.fn(),
    handleEditorDidMount: vi.fn(),
    handlePageChange: vi.fn(),
    clearTabResults: vi.fn(),
    setModalRect: vi.fn(),
    draggingRef: { current: null },
    resizingRef: { current: null },
    isInteracting: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: mockActiveConnection,
    } as ReturnType<typeof useAppStore>)
    vi.mocked(useQueryEditor).mockReturnValue(mockUseQueryEditor as unknown as ReturnType<typeof useQueryEditor>)
  })

  it('renders correctly when connection is active', () => {
    render(<QueryEditor />)

    expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('sql-editor')).toBeInTheDocument()
    expect(screen.getByTestId('results-panel')).toBeInTheDocument()
    expect(screen.getByTestId('editor-tabs')).toBeInTheDocument()
  })

  it('shows error state when no connection is active', () => {
    vi.mocked(useQueryEditor).mockReturnValue({
      ...mockUseQueryEditor,
      activeConnection: null
    } as unknown as ReturnType<typeof useQueryEditor>)

    render(<QueryEditor />)
    
    expect(screen.getByText(/No Connection Active/i)).toBeInTheDocument()
    expect(screen.queryByTestId('sql-editor')).not.toBeInTheDocument()
  })
})
