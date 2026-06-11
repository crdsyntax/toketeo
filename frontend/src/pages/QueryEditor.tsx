import { AlertCircle } from 'lucide-react';
import { EditorTabs } from '@/components/query/panels/EditorTabs';
import { EditorToolbar } from '@/components/query/panels/EditorToolbar';
import { SqlEditorPanel } from '@/components/query/panels/SqlEditorPanel';
import { ResultsPanel } from '@/components/query/panels/ResultsPanel';
import { QueryMenus } from '@/components/query/panels/QueryMenus';
import { ResultsModal } from '@/components/query/ResultsModal';
import { useQueryEditor } from '@/hooks/useQueryEditor';
import { useEffect } from 'react';

export default function QueryEditor() {
  const {
    activeConnection,
    tabs,
    activeTabId,
    activeTab,
    addTab,
    removeTab,
    updateTabQuery,
    setActiveTabId,
    updateTabResults,
    panels,
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
    isMaximized,
    toggleMaximize,
    editingCell,
    setEditingCell,
    handleExecuteAll,
    handleExecuteCurrent,
    handleCancel,
    handleSave,
    handleSaveScript,
    handleEditorWillMount,
    handleEditorDidMount,
    draggingRef,
    resizingRef,
    setModalRect
  } = useQueryEditor()

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

  const handleFileImport = (content: string, _fileName: string) => {
    addTab();
    if (activeTabId) {
      updateTabQuery(activeTabId, content);
    }
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
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-2 relative">
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

      <SqlEditorPanel 
        activeTab={activeTab}
        isVisible={panels.editor}
        onToggle={() => togglePanel('editor')}
        updateTabQuery={updateTabQuery}
        handleEditorWillMount={handleEditorWillMount}
        handleEditorDidMount={handleEditorDidMount}
        connectionName={activeConnection.name}
        connectionType={activeConnection.type}
      />

      <ResultsPanel 
        activeTab={activeTab}
        isVisible={panels.results}
        onToggle={() => togglePanel('results')}
        updateTabResults={updateTabResults}
        handleSave={handleSave}
        setShowResultModal={setShowResultModal}
        sortConfig={sortConfig}
        requestSort={requestSort}
        sortedRows={sortedRows}
        editingCell={editingCell}
        setEditingCell={setEditingCell}
      />
    </div>
  )
}
