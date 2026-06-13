import { AlertCircle } from 'lucide-react';
import { EditorTabs } from '@/components/query/panels/EditorTabs';
import { EditorToolbar } from '@/components/query/panels/EditorToolbar';
import { SqlEditorPanel } from '@/components/query/panels/SqlEditorPanel';
import { ResultsPanel } from '@/components/query/panels/ResultsPanel';
import { QueryMenus } from '@/components/query/panels/QueryMenus';
import { ResultsModal } from '@/components/query/ResultsModal';
import { useQueryEditor } from '@/hooks/useQueryEditor';
import { useEffect, useRef } from 'react';

export default function QueryEditor() {
  const {
    activeConnection,
    tabs,
    activeTabId,
    activeTab,
    addTab,
    openTab,
    removeTab,
    updateTabQuery,
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
  } = useQueryEditor()

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
    const handleClick = () => setShowContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [setShowContextMenu])

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
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-0 relative overflow-hidden">
      <EditorToolbar 
        onNew={addTab}
        onOpen={handleFileImport}
        onSave={handleSaveScript}
        onExecute={handleExecuteAll}
        onCancel={handleCancel}
        isExecuting={activeTab?.status === 'executing'}
        showLayoutMenu={showLayoutMenu}
        setShowLayoutMenu={setShowLayoutMenu}
      />

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
      />

      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {panels.editor && (
          <div style={{ height: panels.results ? `${panels.editorHeight}%` : '100%' }} className="min-h-[100px]">
            <SqlEditorPanel 
              activeTab={activeTab}
              onToggle={() => togglePanel('editor')}
              updateTabQuery={updateTabQuery}
              handleEditorWillMount={handleEditorWillMount}
              handleEditorDidMount={handleEditorDidMount}
              connectionName={activeConnection.name}
              connectionType={activeConnection.type}
            />
          </div>
        )}

        {panels.editor && panels.results && (
          <div 
            className="h-1 w-full cursor-row-resize bg-border hover:bg-primary transition-colors shrink-0 z-50"
            onMouseDown={() => { splitterRef.current.isDragging = true }}
          />
        )}

        {panels.results && (
          <div className="flex-1 min-h-[100px]">
            <ResultsPanel 
              activeTab={activeTab}
              onToggle={() => togglePanel('results')}
              updateTabResults={updateTabResults}
              handleSave={handleSave}
              setShowResultModal={setShowResultModal}
              sortConfig={sortConfig}
              requestSort={requestSort}
              sortedRows={sortedRows}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              handlePageChange={handlePageChange}
              clearResults={() => clearTabResults(activeTab.id)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
