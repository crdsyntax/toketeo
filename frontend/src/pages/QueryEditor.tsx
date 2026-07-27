import { AlertCircle, Sparkles } from 'lucide-react';
import { EditorTabs } from '@/components/query/panels/EditorTabs';
import { EditorToolbar } from '@/components/query/panels/EditorToolbar';
import { SqlEditorPanel } from '@/components/query/panels/SqlEditorPanel';
import { MongoFilterBar } from '@/components/query/panels/MongoFilterBar';
import { ResultsPanel } from '@/components/query/panels/ResultsPanel';
import { QueryMenus } from '@/components/query/panels/QueryMenus';
import { ResultsModal } from '@/components/query/ResultsModal';
import { SqlGeneratorModal } from '@/components/query/SqlGeneratorModal';
import { QueryHistoryPanel } from '@/components/query/QueryHistoryPanel';
import { AssistantLayout } from '@/components/assistant/AssistantLayout';
import { ContextualTip } from '@/components/ui/ContextualTip';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { NewScriptModal } from '@/components/query/NewScriptModal';
import { useAssistantStore } from '@/store/assistantStore';
import { useAppStore } from '@/store/useAppStore';
import { useQueryEditor } from '@/hooks/useQueryEditor';
import { useEffect, useRef, useState } from 'react';
import { ExecutionStatus, DatabaseType } from '@/types/database';
import { useQuery } from '@tanstack/react-query';
import { connectionService } from '@/services/connection.service';
import { cn } from '@/lib/utils';

export default function QueryEditor() {
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  });

  const {
    activeConnection,
    tabs,
    activeTabId,
    activeTab,
    addTab,
    openTab,
    removeTab,
    updateTabQuery,
    updateTabConnection,
    setActiveTabId,
    updateTabResults,
    panels,
    setEditorHeight,
    togglePanel,
    showContextMenu,
    setShowContextMenu,
    showLayoutMenu,
    setShowLayoutMenu,
    showResultModal,
    setShowResultModal,
    sortConfig,
    requestSort,
    sortedRows,
    modalRect,
    setModalRect,
    isMaximized,
    toggleMaximize,
    editingCell,
    setEditingCell,
    handleExecuteAll,
    handleCancel,
    handleSave,
    handleSaveScript,
    handleEditorWillMount,
    handleEditorDidMount,
    handlePageChange,
    clearTabResults,
    isInteracting,
    draggingRef,
    resizingRef,
    contextMenuSql,
    setContextMenuSql,
    sqlModal,
    setSqlModal,
    handleGenerateSql,
    updateTabViewState,
    queryLimit,
    setQueryLimit,
    updateTabMongoFilter,
    updateTabEditorMode,
    queryHistory,
    clearQueryHistory,
    safeDeleteSuggestion,
    setSafeDeleteSuggestion,
  } = useQueryEditor()

  const setActiveConnection = useAppStore((s) => s.setActiveConnection)
  const [showHistory, setShowHistory] = useState(false);
  const [showNewScriptModal, setShowNewScriptModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const showAssistant = useAssistantStore((s) => s.showAssistant);
  const setShowAssistant = useAssistantStore((s) => s.setShowAssistant);
  const currentConnectionId = activeTab?.connectionId || activeConnection?.id;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault()
        setShowAssistant(!showAssistant)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showAssistant, setShowAssistant])
  const currentHistory = currentConnectionId ? (queryHistory[currentConnectionId] ?? []) : [];

  const isMongo = activeConnection?.type === DatabaseType.MONGODB

  const SQL_ACTIONS: string[] = ['SELECT', 'UPDATE', 'INSERT', 'DELETE', 'JSON']

  const containerRef = useRef<HTMLDivElement>(null)
  const splitterRef = useRef({ isDragging: false })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (splitterRef.current.isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const relativeY = e.clientY - rect.top
        const newHeight = (relativeY / rect.height) * 100
        
        if (newHeight > 10 && newHeight < 90) {
          setEditorHeight(newHeight)
        }
      }
    }
    const handleMouseUp = () => {
      splitterRef.current.isDragging = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setEditorHeight])

  useEffect(() => {
    const handleClick = () => {
      setShowContextMenu(null)
      setContextMenuSql(null)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [setShowContextMenu, setContextMenuSql])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveScript()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveScript])

  const onContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setShowContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const handleFileImport = (content: string, fileName: string) => {
    openTab(fileName, content)
  };

  if (!activeConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No Connection Active</h2>
          <p className="text-muted-foreground">Select a connection first to execute queries.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-0 relative overflow-hidden" onClick={() => setContextMenuSql(null)}>
      <SqlGeneratorModal
        isOpen={sqlModal.isOpen}
        onClose={() => setSqlModal({ isOpen: false, sql: '' })}
        initialSql={sqlModal.sql}
      />

      {contextMenuSql && (
        <div
          className="fixed z-[200] min-w-[160px] bg-slate-800 border border-slate-700/60 rounded-lg shadow-xl shadow-black/40 p-1.5 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenuSql.y, left: contextMenuSql.x }}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider select-none">
            {isMongo ? 'Schema Query Actions' : 'SQL Actions'}
          </div>
          <hr className="border-slate-700/50 my-1" />
          <div className="space-y-0.5">
            {SQL_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => handleGenerateSql(action.toLowerCase())}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 rounded-md hover:bg-slate-700 hover:text-white transition-colors duration-150 flex items-center justify-between font-medium"
              >
                <span>Generate {action}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  ⌘{action[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EditorToolbar 
        onNew={() => addTab()}
        onOpen={handleFileImport}
        onSave={handleSaveScript}
        onExecute={handleExecuteAll}
        onCancel={handleCancel}
        isExecuting={activeTab?.status === ExecutionStatus.EXECUTING}
        showLayoutMenu={showLayoutMenu}
        setShowLayoutMenu={setShowLayoutMenu}
        connections={connections}
        currentConnectionId={activeTab?.connectionId || activeConnection?.id}
        onConnectionChange={(id) => {
          updateTabConnection(activeTab.id, id)
          const conn = connections.find(c => c.id === id)
          if (conn) setActiveConnection(conn)
        }}
        onHistoryToggle={() => setShowHistory((v) => !v)}
        showHistory={showHistory}
        historyCount={currentHistory.length}
        onNewWithConnection={() => setShowNewScriptModal(true)}
      />

      <NewScriptModal
        isOpen={showNewScriptModal}
        onClose={() => setShowNewScriptModal(false)}
        connections={connections}
        onCreate={(connectionId, database) => {
          addTab(connectionId, database)
        }}
      />

      {/* Contextual tips */}
      {activeConnection && activeTab && (
        <div className="px-4 pt-2">
          {activeTab.query.includes('SELECT *') && (
            <ContextualTip
              id="select-star"
              message="Tip: Selecting specific columns instead of * improves performance and clarity."
            />
          )}
        </div>
      )}

      {/* History panel floating dropdown */}
      {showHistory && (
        <div className="relative">
          <QueryHistoryPanel
            connectionId={currentConnectionId}
            history={currentHistory}
            onClear={clearQueryHistory}
            onReplay={(query) => {
              updateTabQuery(activeTab.id, query);
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
          />
        </div>
      )}

      <ResultsModal 
        isOpen={showResultModal}
        activeTab={activeTab}
        modalRect={modalRect}
        setModalRect={setModalRect}
        isMaximized={isMaximized}
        toggleMaximize={toggleMaximize}
        onClose={() => setShowResultModal(false)}
        requestSort={requestSort}
        sortConfig={sortConfig}
        sortedRows={sortedRows}
        editingCell={editingCell}
        setEditingCell={setEditingCell}
        handleSave={handleSave}
        handlePageChange={handlePageChange}
        clearResults={() => clearTabResults(activeTab.id)}
        isInteracting={isInteracting}
        draggingRef={draggingRef}
        resizingRef={resizingRef}
        setContextMenuSql={setContextMenuSql}
      />

      <QueryMenus 
        showContextMenu={showContextMenu}
        removeTab={removeTab}
        setShowContextMenu={setShowContextMenu}
        showLayoutMenu={showLayoutMenu}
        setShowLayoutMenu={setShowLayoutMenu}
        panels={panels}
        togglePanel={togglePanel}
      />

      <button
        onClick={() => setShowAssistant(!showAssistant)}
        className={cn(
          "absolute bottom-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all",
          showAssistant
            ? "bg-primary text-primary-foreground"
            : "bg-card text-muted-foreground hover:text-foreground border border-border"
        )}
        title="Assistant"
      >
        <Sparkles className="w-5 h-5" />
      </button>

      <EditorTabs 
        tabs={tabs}
        activeTabId={activeTabId}
        setActiveTabId={setActiveTabId}
        removeTab={removeTab}
        onContextMenu={onContextMenu}
        connections={connections}
        activeConnection={activeConnection}
      />

      <div className="flex-1 flex min-h-0">
        <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {panels.editor && (
            <div style={{ height: panels.results ? `${panels.editorHeight}%` : '100%' }} className="min-h-[100px] flex flex-col">
              {isMongo && activeTab && (
                <MongoFilterBar
                  filter={activeTab.mongoFilter ?? { find: '', project: '', sort: '', collation: '', hint: '' }}
                  onChange={(f) => updateTabMongoFilter(activeTab.id, f)}
                  onExecute={() => handleExecuteAll()}
                />
              )}
              {(() => {
                const targetConnectionId = activeTab?.connectionId || activeConnection.id;
                const targetConnection = connections.find(c => c.id === targetConnectionId) || activeConnection;
                return (
                  <SqlEditorPanel 
                    activeTab={activeTab}
                    onToggle={() => togglePanel('editor')}
                    updateTabQuery={updateTabQuery}
                    handleEditorWillMount={handleEditorWillMount}
                    handleEditorDidMount={handleEditorDidMount}
                    connectionName={targetConnection.name}
                    connectionType={targetConnection.type}
                    updateTabViewState={updateTabViewState}
                    updateTabEditorMode={updateTabEditorMode}
                  />
                );
              })()}
            </div>
          )}

          {panels.editor && panels.results && (
            <div 
              className="h-1 w-full cursor-row-resize bg-border hover:bg-primary transition-colors shrink-0 z-50"
              onMouseDown={() => { splitterRef.current.isDragging = true }}
            />
          )}

          {panels.results && (
            <div className="flex-1 min-h-[100px] flex flex-col overflow-hidden">
              <ResultsPanel
                activeTab={activeTab}
                panels={panels}
                togglePanel={togglePanel}
                updateTabResults={updateTabResults}
                handleSave={handleSave}
                setShowResultModal={setShowResultModal}
                sortConfig={sortConfig}
                requestSort={requestSort}
                sortedRows={sortedRows}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                handlePageChange={handlePageChange}
                setContextMenuSql={setContextMenuSql}
                queryLimit={queryLimit}
                setQueryLimit={setQueryLimit}
                safeDeleteSuggestion={safeDeleteSuggestion}
                setSafeDeleteSuggestion={setSafeDeleteSuggestion}
              />
            </div>
          )}
        </div>

        {showAssistant && (
          <div className="w-80 2xl:w-96 border-l border-border shrink-0 overflow-hidden">
            <AssistantLayout />
          </div>
        )}
      </div>

      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}
