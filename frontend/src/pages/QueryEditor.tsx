import { Play, Copy } from 'lucide-react';
import { EditorTabs } from '@/components/query/panels/EditorTabs';
import { EditorToolbar } from '@/components/query/panels/EditorToolbar';
import { SqlEditorPanel } from '@/components/query/panels/SqlEditorPanel';
import { MongoFilterBar } from '@/components/query/panels/MongoFilterBar';
import { ResultsPanel } from '@/components/query/panels/ResultsPanel';
import { QueryMenus } from '@/components/query/panels/QueryMenus';
import { ResultsModal } from '@/components/query/ResultsModal';
import { SqlGeneratorModal } from '@/components/query/SqlGeneratorModal';
import { ScriptErrorModal } from '@/components/query/ScriptErrorModal';
import { ScriptSummaryModal } from '@/components/query/ScriptSummaryModal';
import { QueryHistoryPanel } from '@/components/query/QueryHistoryPanel';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { NewScriptModal } from '@/components/query/NewScriptModal';
import { useAppStore } from '@/store/useAppStore';
import { useQueryEditor } from '@/hooks/useQueryEditor';
import { TransactionBanner } from '@/components/query/TransactionBanner';
import { useEffect, useRef, useState } from 'react';
import { ExecutionStatus, DatabaseType } from '@/types/database';
import { useQuery } from '@tanstack/react-query';
import { connectionService } from '@/services/connection.service';

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
    pendingEdit,
    confirmPendingEdit,
    discardPendingEdit,
    selectedRowIndexes,
    setSelectedRowIndexes,
    selectionAnchor,
    setSelectionAnchor,
    handleExecuteAll,
    handleExecuteCurrent,
    handleCancel,
    handleSave,
    handleSaveScript,
    editorRef,
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
    handleCopyRows,
    handleCopyCell,
    handleExecuteRowSql,
    updateTabViewState,
    queryLimit,
    setQueryLimit,
    updateTabMongoFilter,
    updateTabEditorMode,
    queryHistory,
    clearQueryHistory,
    safeDeleteSuggestion,
    setSafeDeleteSuggestion,
    sqlFixSuggestion,
    setSqlFixSuggestion,
    sqlFixLoading,
    scriptPrompt,
    scriptSummary,
    scriptResponding,
    respondScriptPrompt,
    scriptLive,
    openTransaction,
    handleCommit,
    handleRollback,
  } = useQueryEditor()

  const setActiveConnection = useAppStore((s) => s.setActiveConnection)
  const [showHistory, setShowHistory] = useState(false);
  const [showNewScriptModal, setShowNewScriptModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [seenReportId, setSeenReportId] = useState<string | null>(null);
  const currentConnectionId = activeTab?.connectionId || activeConnection?.id;
  const targetConnection = (connections.find(c => c.id === currentConnectionId) || activeConnection || null);

  const scriptLiveRunning = scriptLive?.some(s => s.phase === 'running' || s.phase === 'pending') ?? false;
  const scriptSummaryOpen = !!scriptSummary && seenReportId !== scriptSummary.runId;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts(true)
      }
      // Ctrl/Cmd+I is handled globally by the AssistantDrawer.
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const currentHistory = currentConnectionId ? (queryHistory[currentConnectionId] ?? []) : [];

  const isMongo = targetConnection?.type === DatabaseType.MONGODB

  const SQL_ACTIONS: string[] = ['SELECT', 'UPDATE', 'INSERT', 'DELETE', 'JSON']
  const MONGO_ACTIONS: string[] = ['FIND', 'UPDATE', 'INSERT', 'DELETE', 'JSON']

  const containerRef = useRef<HTMLDivElement>(null)
  const splitterRef = useRef({ isDragging: false, startY: 0, startHeight: 60 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (splitterRef.current.isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const { startY, startHeight } = splitterRef.current
        const newHeight = startHeight + ((e.clientY - startY) / rect.height) * 100

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

  return (
    <div className="flex flex-col h-full gap-0 relative overflow-hidden" onClick={() => setContextMenuSql(null)}>
      <SqlGeneratorModal
        isOpen={sqlModal.isOpen}
        onClose={() => setSqlModal({ isOpen: false, sql: '' })}
        initialSql={sqlModal.sql}
      />

      <ScriptErrorModal
        prompt={scriptPrompt}
        responding={scriptResponding}
        onSkip={() => respondScriptPrompt('skip')}
        onSkipAll={() => respondScriptPrompt('skip_all')}
        onCancel={() => respondScriptPrompt('cancel')}
      />

      <ScriptSummaryModal
        report={scriptSummaryOpen ? scriptSummary : null}
        onClose={() => { if (scriptSummary) setSeenReportId(scriptSummary.runId) }}
      />

      {contextMenuSql && (
        <div
          className="fixed z-[200] min-w-[160px] bg-card border border-border/60 rounded-lg shadow-xl shadow-black/40 p-1.5 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenuSql.y, left: contextMenuSql.x }}
        >
          <div className="px-2 py-1 text-[var(--ch-text-10)] font-semibold text-muted-foreground uppercase tracking-wider select-none">
            {isMongo ? 'Mongo Actions' : 'SQL Actions'}
          </div>
          <hr className="border-border/50 my-1" />
          <div className="space-y-0.5">
            {!isMongo && (
              <>
                <button
                  onClick={() => handleExecuteRowSql()}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors duration-150 flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute</span>
                  {selectedRowIndexes.size > 1 && (
                    <span className="ml-auto text-[var(--ch-text-10)] text-muted-foreground font-mono">
                      {selectedRowIndexes.size} rows
                    </span>
                  )}
                </button>
                <hr className="border-border/50 my-1" />
              </>
            )}
            {(isMongo ? MONGO_ACTIONS : SQL_ACTIONS).map((action) => (
              <button
                key={action}
                onClick={() => handleGenerateSql(action.toLowerCase())}
                className="w-full text-left px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent-muted hover:text-accent transition-colors duration-150 flex items-center justify-between font-medium"
              >
                <span>Generate {action}</span>
                <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono">
                  ⌘{action[0]}
                </span>
              </button>
            ))}
            <hr className="border-border/50 my-1" />
            <button
              onClick={() => handleCopyRows()}
              className="w-full text-left px-2.5 py-1.5 text-xs text-foreground rounded-md hover:bg-accent-muted hover:text-accent transition-colors duration-150 flex items-center justify-between font-medium"
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5" />
                {selectedRowIndexes.size > 1 ? 'Copy Rows' : 'Copy Row'}
              </span>
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono">
                {selectedRowIndexes.size > 1 ? `${selectedRowIndexes.size} rows` : 'JSON'}
              </span>
            </button>
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
          if (!id) return
          const conn = connections.find(c => c.id === id)
          if (conn) setActiveConnection(conn)
        }}
        onHistoryToggle={() => setShowHistory((v) => !v)}
        showHistory={showHistory}
        historyCount={currentHistory.length}
        onNewWithConnection={() => setShowNewScriptModal(true)}
        executionTime={activeTab?.results?.executionTime}
        query={activeTab?.query}
      />

      <NewScriptModal
        isOpen={showNewScriptModal}
        onClose={() => setShowNewScriptModal(false)}
        connections={connections}
        onCreate={(connectionId, database) => {
          addTab(connectionId, database)
        }}
      />

      {openTransaction && (
        <TransactionBanner
          connectionId={openTransaction.connectionId}
          startedAt={openTransaction.startedAt}
          onCommit={handleCommit}
          onRollback={handleRollback}
        />
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
        selectedRowIndexes={selectedRowIndexes}
        setSelectedRowIndexes={setSelectedRowIndexes}
        selectionAnchor={selectionAnchor}
        setSelectionAnchor={setSelectionAnchor}
        isMongo={isMongo}
        handleCopyCell={handleCopyCell}
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
            <div
              className="min-h-[100px] flex flex-col"
              style={
                panels.editorHeight
                  ? { height: `${panels.editorHeight}%`, flexGrow: 0, flexShrink: 0 }
                  : undefined
              }
            >
              {isMongo && activeTab && (
                <MongoFilterBar
                  filter={activeTab.mongoFilter ?? { find: '', project: '', sort: '', collation: '', hint: '' }}
                  onChange={(f) => updateTabMongoFilter(activeTab.id, f)}
                  onExecute={() => handleExecuteAll()}
                />
              )}
              {(() => {
                return (
                  <SqlEditorPanel 
                    activeTab={activeTab}
                    onToggle={() => togglePanel('editor')}
                    updateTabQuery={updateTabQuery}
                    editorRef={editorRef}
                    executeCurrent={handleExecuteCurrent}
                    executeAll={handleExecuteAll}
                    connectionId={currentConnectionId}
                    connectionName={targetConnection?.name}
                    connectionType={targetConnection?.type}
                    updateTabViewState={updateTabViewState}
                    updateTabEditorMode={updateTabEditorMode}
                  />
                );
              })()}
            </div>
          )}

          {panels.editor && panels.results && (
            <div 
              className="h-1 w-full cursor-row-resize bg-border/60 hover:bg-primary/70 active:bg-primary transition-colors shrink-0 z-50 relative"
              onMouseDown={(e) => {
                e.preventDefault()
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                splitterRef.current.startY = e.clientY
                splitterRef.current.startHeight = panels.editorHeight ?? 60
                splitterRef.current.isDragging = true
              }}
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/40" />
            </div>
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
                pendingEdit={pendingEdit}
                confirmPendingEdit={confirmPendingEdit}
                discardPendingEdit={discardPendingEdit}
                handlePageChange={handlePageChange}
                setContextMenuSql={setContextMenuSql}
                selectedRowIndexes={selectedRowIndexes}
                setSelectedRowIndexes={setSelectedRowIndexes}
                selectionAnchor={selectionAnchor}
                setSelectionAnchor={setSelectionAnchor}
                queryLimit={queryLimit}
                setQueryLimit={setQueryLimit}
                safeDeleteSuggestion={safeDeleteSuggestion}
                setSafeDeleteSuggestion={setSafeDeleteSuggestion}
                sqlFixSuggestion={sqlFixSuggestion}
                setSqlFixSuggestion={setSqlFixSuggestion}
                sqlFixLoading={sqlFixLoading}
                scriptLive={scriptLive}
                scriptLiveRunning={scriptLiveRunning}
                onShowScriptSummary={() => {
                  if (scriptSummary) setSeenReportId(null);
                }}
                isMongo={isMongo}
                handleCopyCell={handleCopyCell}
              />
            </div>
          )}
        </div>
      </div>

      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}
