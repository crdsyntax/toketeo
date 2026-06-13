import { Code, Play, X, AlertCircle } from 'lucide-react'
import { Sidebar } from '@/components/explorer/Sidebar'
import { ObjectDetail } from '@/components/explorer/ObjectDetail'
import { useExplorer } from '@/hooks/useExplorer'
import { useEffect } from 'react'

export default function Explorer() {
  const {
    activeConnection,
    search,
    setSearch,
    selectedItem,
    setSelectedItem,
    sidebarTab,
    setSidebarTab,
    activeTab,
    setActiveTab,
    currentSchema,
    page,
    setPage,
    pageSize,
    setPageSize,
    executionStatus,
    executionError,
    socketResults,
    setSocketResults,
    setExecutionStatus,
    setExecutionError,
    editableDdl,
    setEditableDdl,
    paramValues,
    setParamsValues,
    showParamModal,
    setShowParamModal,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isLoadingSidebar,
    filteredItems,
    columns,
    isLoadingColumns,
    indexes,
    isLoadingIndexes,
    foreignKeys,
    isLoadingForeignKeys,
    constraints,
    isLoadingConstraints,
    isLoadingDDL,
    parameters,
    updateDdlMutation,
    editColumnMutation,
    dropColumnMutation,
    dropIndexMutation,
    renameIndexMutation,
    dropForeignKeyMutation,
    dropConstraintMutation,
    updateCell,
    handleExecute,
    handleCancel,
    handleRefetch
  } = useExplorer()

  useEffect(() => {
    // Only auto-execute if we are on the data tab and the status is idle
    // Changing page or pageSize will manually trigger execution via their setters if needed, 
    // or we can let this effect handle it by resetting status to idle when those change.
    if ((selectedItem?.type === 'table' || selectedItem?.type === 'view') && activeTab === 'data' && executionStatus === 'idle') {
      handleExecute()
    }
  }, [selectedItem, activeTab, executionStatus, handleExecute])

  // Reset status to idle when pagination changes to allow the effect above to re-run
  useEffect(() => {
    if (activeTab === 'data') {
      setExecutionStatus('idle')
    }
  }, [page, pageSize, activeTab, setExecutionStatus])

  if (!activeConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No Connection Active</h2>
          <p className="text-muted-foreground">Select a connection first to explore the schema.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 relative">
      {showParamModal && (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-left">
            <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
              <h4 className="font-bold flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                Execution Parameters
              </h4>
              <button onClick={() => setShowParamModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">Provide the required parameters to execute <b>{selectedItem?.name}</b>.</p>
              {parameters?.map(p => (
                <div key={p.name} className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                    {p.name} <span className="text-primary/70">{p.type} ({p.mode})</span>
                  </label>
                  <input 
                    type="text"
                    value={paramValues[p.name] || ''}
                    onChange={(e) => setParamsValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={`Enter value for ${p.name}...`}
                  />
                </div>
              ))}
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowParamModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleExecute(true)}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Execute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sidebar 
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        currentSchema={currentSchema}
        handleRefetch={handleRefetch}
        isLoadingSidebar={isLoadingSidebar}
        search={search}
        setSearch={setSearch}
        filteredItems={filteredItems || []}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        setPage={setPage}
        setSocketResults={setSocketResults}
        setExecutionStatus={setExecutionStatus}
        setExecutionError={setExecutionError}
        setParamsValues={setParamsValues}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        <ObjectDetail 
          selectedItem={selectedItem}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          columns={columns}
          isLoadingColumns={isLoadingColumns}
          indexes={indexes}
          isLoadingIndexes={isLoadingIndexes}
          foreignKeys={foreignKeys}
          isLoadingForeignKeys={isLoadingForeignKeys}
          constraints={constraints}
          isLoadingConstraints={isLoadingConstraints}
          isLoadingData={executionStatus === 'executing'}
          executionStatus={executionStatus}
          executionError={executionError}
          queryData={socketResults}
          pageSize={pageSize}
          setPageSize={setPageSize}
          page={page}
          setPage={setPage}
          handleExecute={handleExecute}
          handleCancel={handleCancel}
          updateCell={updateCell}
          isLoadingDDL={isLoadingDDL}
          editableDdl={editableDdl}
          setEditableDdl={setEditableDdl}
          updateDdlMutation={updateDdlMutation}
          editColumnMutation={editColumnMutation}
          dropColumnMutation={dropColumnMutation}
          dropIndexMutation={dropIndexMutation}
          renameIndexMutation={renameIndexMutation}
          dropForeignKeyMutation={dropForeignKeyMutation}
          dropConstraintMutation={dropConstraintMutation}
        />
      </div>
    </div>
  )
}
