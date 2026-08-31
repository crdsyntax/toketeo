import { render, screen } from '@testing-library/react'
import QueryEditor from './QueryEditor'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useQueryEditor } from '@/hooks/useQueryEditor'
import { useAppStore } from '@/store/useAppStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'


vi.mock('@/hooks/useQueryEditor')
vi.mock('@/store/useAppStore')


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
vi.mock('@/components/query/panels/MongoFilterBar', () => ({
  MongoFilterBar: () => <div data-testid="mongo-filter">Mongo Filter</div>
}))
vi.mock('@/components/query/panels/QueryMenus', () => ({
  QueryMenus: () => <div data-testid="query-menus">Menus</div>
}))
vi.mock('@/components/query/ResultsModal', () => ({
  ResultsModal: () => <div data-testid="results-modal">Modal</div>
}))
vi.mock('@/components/query/SqlGeneratorModal', () => ({
  SqlGeneratorModal: () => <div data-testid="sql-generator">Generator</div>
}))
vi.mock('@/components/query/QueryHistoryPanel', () => ({
  QueryHistoryPanel: () => <div data-testid="query-history">History</div>
}))
vi.mock('@/components/query/NewScriptModal', () => ({
  NewScriptModal: () => <div data-testid="new-script">New Script</div>
}))
vi.mock('@/components/assistant/AssistantLayout', () => ({
  AssistantLayout: () => <div data-testid="assistant">Assistant</div>
}))
vi.mock('@/components/ui/KeyboardShortcutsModal', () => ({
  KeyboardShortcutsModal: () => <div data-testid="shortcuts">Shortcuts</div>
}))

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('QueryEditor', () => {
  const mockActiveConnection = {
    id: 'test-conn',
    name: 'Test DB',
    type: 'mysql',
    environment: 'dev' as const,
    host: 'localhost',
    port: 3306,
    user: 'root',
    database: 'test',
    color: '#000000',
  }
  const makeTab = (overrides: Record<string, unknown> = {}) => ({
    id: 'tab1',
    name: 'Query 1',
    query: '',
    status: 'idle',
    connectionId: 'test-conn',
    ...overrides,
  })
  const makeUseQueryEditor = (overrides: Record<string, unknown> = {}) => ({
    activeConnection: mockActiveConnection,
    tabs: [makeTab()],
    activeTabId: 'tab1',
    activeTab: makeTab(),
    panels: { editor: true, results: true },
    showContextMenu: null,
    setShowContextMenu: vi.fn(),
    showLayoutMenu: false,
    setShowLayoutMenu: vi.fn(),
    showResultModal: false,
    setShowResultModal: vi.fn(),
    sortConfig: null,
    requestSort: vi.fn(),
    sortedRows: [],
    modalRect: null,
    setModalRect: vi.fn(),
    isMaximized: false,
    setIsMaximized: vi.fn(),
    toggleMaximize: vi.fn(),
    executeCurrentRef: { current: null },
    executeAllRef: { current: null },
    editingCell: null,
    setEditingCell: vi.fn(),
    pendingEdit: null,
    confirmPendingEdit: vi.fn(),
    discardPendingEdit: vi.fn(),
    handleExecuteAll: vi.fn(),
    handleExecuteCurrent: vi.fn(),
    handleCancel: vi.fn(),
    handleSave: vi.fn(),
    handleSaveScript: vi.fn(),
    editorRef: { current: null },
    handlePageChange: vi.fn(),
    clearTabResults: vi.fn(),
    isInteracting: false,
    draggingRef: { current: null },
    resizingRef: { current: null },
    contextMenuSql: null,
    setContextMenuSql: vi.fn(),
    sqlModal: { isOpen: false, sql: '' },
    setSqlModal: vi.fn(),
    handleGenerateSql: vi.fn(),
    updateTabConnection: vi.fn(),
    updateTabViewState: vi.fn(),
    addTab: vi.fn(),
    openTab: vi.fn(),
    removeTab: vi.fn(),
    updateTabQuery: vi.fn(),
    setActiveTabId: vi.fn(),
    updateTabResults: vi.fn(),
    togglePanel: vi.fn(),
    setEditorHeight: vi.fn(),
    queryLimit: 100,
    setQueryLimit: vi.fn(),
    updateTabMongoFilter: vi.fn(),
    updateTabEditorMode: vi.fn(),
    queryHistory: {},
    clearQueryHistory: vi.fn(),
    safeDeleteSuggestion: null,
    setSafeDeleteSuggestion: vi.fn(),
    sqlFixSuggestion: null,
    setSqlFixSuggestion: vi.fn(),
    sqlFixLoading: false,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppStore).mockReturnValue({
      setActiveConnection: vi.fn(),
    } as ReturnType<typeof useAppStore>)
    vi.mocked(useQueryEditor).mockReturnValue(makeUseQueryEditor() as unknown as unknown as ReturnType<typeof useQueryEditor>)
  })

  it('renders correctly when connection is active', () => {
    renderWithClient(<QueryEditor />)

    expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('sql-editor')).toBeInTheDocument()
    expect(screen.getByTestId('results-panel')).toBeInTheDocument()
    expect(screen.getByTestId('editor-tabs')).toBeInTheDocument()
  })

  it('renders the mongo filter bar for mongo connections', () => {
    vi.mocked(useQueryEditor).mockReturnValue(makeUseQueryEditor({
      activeConnection: {
        ...mockActiveConnection,
        id: 'mongo-conn',
        type: 'mongodb',
        name: 'Mongo',
      },
      activeTab: makeTab({ connectionId: 'mongo-conn', type: 'mongodb' }),
      tabs: [makeTab({ connectionId: 'mongo-conn', type: 'mongodb' })],
    }) as unknown as ReturnType<typeof useQueryEditor>)

    renderWithClient(<QueryEditor />)

    expect(screen.getByTestId('mongo-filter')).toBeInTheDocument()
  })

  it('hides the results panel when the results panel is toggled off', () => {
    vi.mocked(useQueryEditor).mockReturnValue(makeUseQueryEditor({
      panels: { editor: true, results: false },
    }) as unknown as ReturnType<typeof useQueryEditor>)

    renderWithClient(<QueryEditor />)

    expect(screen.queryByTestId('results-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('sql-editor')).toBeInTheDocument()
  })
})
