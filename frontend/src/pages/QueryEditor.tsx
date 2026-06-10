import { Editor } from '@monaco-editor/react'
import { Play, Plus, X, AlertCircle, Clock, Table2, FileJson, Download, Loader2, Square, ChevronDown, ChevronUp, MoreVertical, Layout, Trash2, Maximize2, ArrowUpDown, ArrowUp, ArrowDown, Check, ExternalLink, Minus, Copy, Save } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { io, Socket } from 'socket.io-client'

export default function QueryEditor() {
  const { activeConnection, tabs, activeTabId, addTab, removeTab, updateTabQuery, setActiveTabId, updateTabResults, panels, togglePanel } = useAppStore()
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const socketRef = useRef<Socket | null>(null)
  const [showContextMenu, setShowContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [modalRect, setModalRect] = useState({ x: 10, y: 10, w: 80, h: 80 }) 
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevRect, setPrevRect] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string; value: any } | null>(null)

  const draggingRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)

  const resizingRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null)

  const handlePopout = () => {
    if (!activeTab?.results) return
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return

    const html = `
      <html>
        <head>
          <title>Results - ${activeTab.name}</title>
          <style>
            body { font-family: sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #1a1a1a; padding: 10px; text-align: left; border-bottom: 2px solid #333; position: sticky; top: 0; }
            td { padding: 8px; border-bottom: 1px solid #222; }
            tr:hover { background: #111; }
            .null { color: #666; font-style: italic; font-size: 10px; }
          </style>
        </head>
        <body>
          <h3>${activeTab.name} - Results</h3>
          <table>
            <thead>
              <tr>${activeTab.results.columns.map(c => `<th>${c}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${activeTab.results.rows.map(row => `
                <tr>${activeTab.results!.columns.map(col => `<td>${row[col] === null ? '<span class="null">NULL</span>' : row[col]}</td>`).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `
    win.document.write(html)
    win.document.close()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragging = draggingRef.current
      if (dragging) {
        const deltaX = ((e.clientX - dragging.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - dragging.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          x: dragging.startPos.x + deltaX,
          y: dragging.startPos.y + deltaY
        }))
      }
      const resizing = resizingRef.current
      if (resizing) {
        const deltaX = ((e.clientX - resizing.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - resizing.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          w: Math.max(20, resizing.startSize.w + deltaX),
          h: Math.max(20, resizing.startSize.h + deltaY)
        }))
      }
    }
    const handleMouseUp = () => {
      draggingRef.current = null
      resizingRef.current = null
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/queries`)
    socketRef.current = socket

    socket.on('query-progress', (data: { tabId: string; status: string; message: string; isSilent?: boolean }) => {
      // Don't change status to 'executing' if it's silent, or at least keep it subtle
      updateTabResults(data.tabId, { status: 'executing' })
    })

    socket.on('query-result', (data: any) => {
      const { tabId, columns, rows, executionTime, isSilent } = data
      if (isSilent) {
        updateTabResults(tabId, { status: 'success', error: null })
        return
      }
      updateTabResults(tabId, {
        status: 'success',
        results: { columns, rows, executionTime },
        error: null
      })
    })

    socket.on('query-error', (data: any) => {
      const { tabId, message, isSilent } = data
      if (isSilent) {
        updateTabResults(tabId, { status: 'error', error: message })
        return
      }
      updateTabResults(tabId, {
        status: 'error',
        error: message,
        results: null
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [updateTabResults])

  const handleCancel = () => {
    if (activeTabId && socketRef.current && activeConnection) {
      updateTabResults(activeTabId, { 
        status: 'error', 
        error: 'Query cancelled by user',
        results: null 
      })
      socketRef.current.emit('cancel-query', { 
        tabId: activeTabId,
        connectionId: activeConnection.id 
      })
    }
  }

  const onContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setShowContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  // Close context menu on click anywhere
  useEffect(() => {
    const handleClick = () => setShowContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])
  const sortedRows = useMemo(() => {
    if (!activeTab?.results?.rows) return []
    if (!sortConfig) return activeTab.results.rows

    return [...activeTab.results.rows].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [activeTab?.results?.rows, sortConfig])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }
  const handleSave = useCallback(() => {
    if (!editingCell || !activeTab?.results || !activeConnection || !socketRef.current) return

    const { rowIndex, column, value: newValue } = editingCell
    const row = activeTab.results.rows[rowIndex]
    const idColumn = activeTab.results.columns.find(c => c.toLowerCase() === 'id')
    const idValue = idColumn ? row[idColumn] : null

    // Try to extract table name from the original SELECT query
    const tableNameMatch = activeTab.query.match(/FROM\s+([a-zA-Z0-9_\.`"\[\]]+)/i)
    let tableName = tableNameMatch ? tableNameMatch[1].replace(/[`"\[\]]/g, '') : null

    if (!tableName || !idColumn || idValue === undefined || idValue === null) {
      updateTabResults(activeTab.id, { 
        status: 'error', 
        error: `Cannot update: ${!tableName ? 'Table not found' : 'ID column not found/null'}.` 
      })
      setEditingCell(null)
      return
    }

    const updateSql = `UPDATE ${tableName} SET ${column} = ? WHERE ${idColumn} = ?;`

    // Optimistic update
    const updatedRows = [...activeTab.results.rows]
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: newValue }
    
    updateTabResults(activeTab.id, { 
      results: { ...activeTab.results, rows: updatedRows },
      status: 'executing',
      error: null
    })

    socketRef.current.emit('execute-query', {
      connectionId: activeConnection.id,
      dto: { sql: updateSql, params: [newValue, idValue] },
      tabId: activeTab.id,
      isSilent: true
    })
    
    setEditingCell(null)
  }, [editingCell, activeTab, activeConnection, updateTabResults])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])
  const handleExecute = useCallback(() => {
    if (activeTab?.query && activeConnection && socketRef.current) {
      const sql = activeTab.query.trim().endsWith(';') ? activeTab.query.trim() : `${activeTab.query.trim()};`
      
      updateTabResults(activeTab.id, { status: 'executing', error: null, results: null })
      socketRef.current.emit('execute-query', {
        connectionId: activeConnection.id,
        dto: { sql },
        tabId: activeTab.id
      })
    }
  }, [activeTab, activeConnection, updateTabResults])

  const handleEditorWillMount = useCallback((monaco: any) => {
    // Register provider only if not already registered (simplified check)
    if ((monaco.languages as any).sqlProviderRegistered) return;
    (monaco.languages as any).sqlProviderRegistered = true;

    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = [
          {
            label: 'SELECT',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Basic SELECT statement',
            range: range,
          },
          {
            label: 'INSERT',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Basic INSERT statement',
            range: range,
          },
          {
            label: 'UPDATE',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Basic UPDATE statement',
            range: range,
          },
          {
            label: 'DELETE',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Basic DELETE statement',
            range: range,
          },
        ];
        return { suggestions };
      },
    });
  }, [])

  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    editor.addCommand(monaco.KeyMod.Ctrl | monaco.KeyCode.Enter, handleExecute)
  }, [handleExecute])

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

  const toggleMaximize = () => {
    if (isMaximized) {
      setModalRect(prevRect)
      setIsMaximized(false)
    } else {
      setPrevRect(modalRect)
      setModalRect({ x: 0, y: 0, w: 100, h: 100 })
      setIsMaximized(true)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4 relative">
      {/* Result Modal */}
      {showResultModal && activeTab?.results && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm p-4 overflow-hidden">
          <div 
            className={cn(
              "bg-card border border-border shadow-2xl flex flex-col overflow-hidden absolute transition-all duration-200",
              isMaximized ? "" : "rounded-xl"
            )}
            style={{ 
              top: `${modalRect.y}%`, 
              left: `${modalRect.x}%`, 
              width: `${modalRect.w}%`, 
              height: `${modalRect.h}%`,
              transition: draggingRef.current || resizingRef.current ? 'none' : undefined
            }}
          >
            <div 
              className="h-10 border-b border-border flex justify-between items-center bg-muted/40 cursor-move select-none shrink-0"
              onMouseDown={(e) => {
                if (isMaximized) return;
                draggingRef.current = { startX: e.clientX, startY: e.clientY, startPos: { x: modalRect.x, y: modalRect.y } }
              }}
              onDoubleClick={toggleMaximize}
            >
              <div className="flex items-center gap-2 px-4">
                <Table2 className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold truncate max-w-[200px]">
                  {activeTab.name} - Results
                </span>
              </div>

              <div className="flex items-center h-full">
                <button 
                  onClick={handlePopout}
                  className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-4 bg-border mx-1" />
                <button 
                  onClick={() => setShowResultModal(false)}
                  className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={toggleMaximize}
                  className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
                  title={isMaximized ? "Restore" : "Maximize"}
                >
                  {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={() => setShowResultModal(false)} 
                  className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto relative">
              <table className="w-full text-left text-sm border-collapse">
                {/* ... table content unchanged ... */}
                <thead className="sticky top-0 bg-background border-b border-border z-10">
                  <tr>
                    {activeTab.results.columns.map(col => (
                      <th 
                        key={col} 
                        onClick={() => requestSort(col)}
                        className="p-3 font-bold bg-muted/50 border-r border-border cursor-pointer hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {col}
                          {sortConfig?.key === col ? (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                      {activeTab.results!.columns.map(col => (
                        <td 
                          key={col} 
                          onDoubleClick={() => setEditingCell({ rowIndex: i, column: col, value: row[col] })}
                          className="p-3 border-r border-border last:border-0 relative"
                        >
                          {editingCell?.rowIndex === i && editingCell?.column === col ? (
                            <input 
                              autoFocus
                              className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-3 z-20"
                              value={editingCell.value || ''}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                            />
                          ) : (
                            row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Resize Handle */}
              {!isMaximized && (
                <div 
                  className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 hover:text-primary transition-colors"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    resizingRef.current = { startX: e.clientX, startY: e.clientY, startSize: { w: modalRect.w, h: modalRect.h } }
                  }}
                >
                  <div className="w-2 h-2 border-r-2 border-b-2 border-current opacity-30" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu (Tabs) */}
      {/* ... unchanged ... */}

      {/* Layout Menu */}
      {showLayoutMenu && (
        <div className="absolute top-12 right-0 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]">
          <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
            Toggle Panels
          </div>
          <button 
            onClick={() => { togglePanel('editor'); setShowLayoutMenu(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Layout className="w-3.5 h-3.5" />
              SQL Editor
            </div>
            {panels.editor && <Check className="w-3 h-3 text-primary" />}
          </button>
          <button 
            onClick={() => { togglePanel('results'); setShowLayoutMenu(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Table2 className="w-3.5 h-3.5" />
              Results Panel
            </div>
            {panels.results && <Check className="w-3 h-3 text-primary" />}
          </button>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex items-center gap-1 overflow-x-auto min-h-[40px] border-b border-border/50 pr-10">
        {/* ... tabs logic ... */}
        {tabs.map((tab) => (
          <div 
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer transition-colors border-x border-t",
              activeTabId === tab.id 
                ? "bg-card border-border text-foreground" 
                : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
            )}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            {tab.status === 'executing' && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            <button 
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/20 rounded transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button 
          onClick={addTab}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground ml-2"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button 
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className={cn("p-1.5 hover:bg-muted rounded-md transition-colors", showLayoutMenu && "bg-muted text-primary")}
          >
            <Layout className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className={cn(
        "border border-border rounded-xl bg-card overflow-hidden flex flex-col transition-all duration-300",
        panels.editor ? "flex-[2] min-h-[150px]" : "h-10 shrink-0"
      )}>
        <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => togglePanel('editor')}
              className="p-1 hover:bg-muted rounded"
            >
              {panels.editor ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SQL Editor</span>
            
            <button 
              onClick={handleExecute}
              disabled={activeTab?.status === 'executing'}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50 ml-4"
            >
              {activeTab?.status === 'executing' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5 fill-current" />}
              {activeTab?.status === 'executing' ? 'Running' : 'Run'}
            </button>

            {activeTab?.status === 'executing' && (
              <button 
                onClick={handleCancel}
                className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded-md text-[10px] font-bold hover:bg-destructive/20 transition-colors"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                Stop
              </button>
            )}
          </div>
          
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-3 border-l border-border">
            {activeConnection.name} • {activeConnection.type}
          </div>
        </div>
        
        {panels.editor && (
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={activeTab?.query}
              onChange={(val) => updateTabQuery(activeTab.id, val || '')}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16 },
              }}
            />
          </div>
        )}
      </div>

      {/* Results Panel */}
      <div className={cn(
        "border border-border rounded-xl bg-card flex flex-col overflow-hidden transition-all duration-300",
        panels.results ? "flex-1 min-h-[150px]" : "h-10 shrink-0"
      )}>
        <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center px-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => togglePanel('results')}
              className="p-1 hover:bg-muted rounded"
            >
              {panels.results ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Table2 className="w-3 h-3" />
              Results {activeTab?.status === 'executing' && <span className="animate-pulse text-primary ml-2">Executing...</span>}
            </h3>
          </div>
          
          {activeTab?.results && panels.results && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                {activeTab.results.executionTime}ms
              </div>
              <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
                {editingCell && (
                  <button 
                    onClick={handleSave}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 mr-2 animate-pulse"
                  >
                    <Save className="w-3 h-3" />
                    Save Changes
                  </button>
                )}
                <button 
                  onClick={() => setShowResultModal(true)}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 mr-2"
                >
                  <Maximize2 className="w-3 h-3" />
                  Full Screen
                </button>
                <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>

        {panels.results && (
          <div className="flex-1 overflow-auto">
            {activeTab?.status === 'error' && (
              <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <p className="text-xs font-mono">{activeTab.error}</p>
                <button onClick={() => updateTabResults(activeTab.id, { status: 'idle', error: null })} className="ml-auto p-1 hover:bg-destructive/20 rounded">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {activeTab?.results ? (
              <table className="w-full text-left text-xs border-collapse">
                {/* ... table content unchanged ... */}

                <thead className="sticky top-0 bg-background border-b border-border z-10 shadow-sm">
                  <tr>
                    {activeTab.results.columns.map(col => (
                      <th 
                        key={col} 
                        onClick={() => requestSort(col)}
                        className="p-2 font-bold bg-muted/50 border-r border-border cursor-pointer hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{col}</span>
                          {sortConfig?.key === col ? (
                            sortConfig.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                          ) : <ArrowUpDown className="w-2.5 h-2.5 opacity-20" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                      {activeTab.results!.columns.map(col => (
                        <td 
                          key={col} 
                          onDoubleClick={() => setEditingCell({ rowIndex: i, column: col, value: row[col] })}
                          className="p-2 border-r border-border last:border-0 truncate max-w-[250px] relative group"
                        >
                          {editingCell?.rowIndex === i && editingCell?.column === col ? (
                            <input 
                              autoFocus
                              className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2 z-20"
                              value={editingCell.value || ''}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              onBlur={() => { /* Allow blur to stay in editing mode until save? No, let's keep it simple. */ }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                            />
                          ) : (
                            row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

            ) : activeTab?.status !== 'executing' && (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
                Run a query to see results
              </div>
            )}

            {activeTab?.status === 'executing' && (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-6 bg-muted animate-pulse rounded" />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
