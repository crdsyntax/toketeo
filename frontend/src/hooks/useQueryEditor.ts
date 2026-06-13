import type * as monaco from 'monaco-editor'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { Monaco } from '@monaco-editor/react'
import { useAppStore } from '@/store/useAppStore'
import { queryService } from '@/services/query.service'
import { getApiUrl } from '@/lib/api'
import type { DbValue, DbRow } from '@/types/database'

export function useQueryEditor() {
  const { 
    activeConnection, 
    tabs, 
    activeTabId, 
    addTab, 
    removeTab, 
    updateTabQuery, 
    setActiveTabId, 
    updateTabResults, 
    clearTabResults,
    panels, 
    togglePanel 
  } = useAppStore()
  
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const socketRef = useRef<Socket | null>(null)
  
  const [showContextMenu, setShowContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [modalRect, setModalRect] = useState({ x: 10, y: 10, w: 80, h: 80 }) 
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevRect, setPrevRect] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string; value: DbValue } | null>(null)

  const draggingRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)
  const resizingRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null)

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
    const socket = io(getApiUrl('/queries'))
    socketRef.current = socket

    socket.on('query-progress', (data: { tabId: string; status: string; message: string; isSilent?: boolean }) => {
      updateTabResults(data.tabId, { status: 'executing' })
    })

    socket.on('query-result', (data: { 
      tabId: string, 
      columns: string[], 
      rows: DbRow[], 
      executionTime: number, 
      isSilent?: boolean,
      page?: number,
      pageSize?: number,
      hasMore?: boolean
    }) => {
      const { tabId, columns, rows, executionTime, isSilent, page, pageSize, hasMore } = data
      if (isSilent) {
        updateTabResults(tabId, { status: 'success', error: null })
        return
      }

      // We use a functional update to get the latest state and append rows if needed
      useAppStore.setState((state) => {
        const tab = state.tabs.find(t => t.id === tabId);
        if (!tab) return state;

        const isContinuation = tab.results && tab.status === 'executing' && tab.results.page !== undefined && page !== undefined && page > 1;
        const newRows = isContinuation ? [...(tab.results?.rows || []), ...rows] : rows;

        return {
          tabs: state.tabs.map(t => t.id === tabId ? {
            ...t,
            status: hasMore ? 'executing' : 'success',
            results: { columns, rows: newRows, executionTime, page, pageSize, hasMore },
            error: null
          } : t)
        }
      });
    })

    socket.on('query-error', (data: { tabId: string, message: string, isSilent?: boolean }) => {
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

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const checkDangerousQuery = useCallback((sql: string): boolean => {
    const upperSql = sql.toUpperCase()
    const hasUpdate = upperSql.includes('UPDATE')
    const hasDelete = upperSql.includes('DELETE')
    const hasWhere = upperSql.includes('WHERE')

    if ((hasUpdate || hasDelete) && !hasWhere) {
      return !window.confirm('Warning: This query contains an UPDATE or DELETE statement without a WHERE clause. Are you sure you want to proceed?')
    }
    return false
  }, [])

  const handleExecuteAll = useCallback(async (page: number = 1) => {
    if (activeTab?.query && activeConnection) {
      if (checkDangerousQuery(activeTab.query)) return

      const sql = activeTab.query.trim().endsWith(';') ? activeTab.query.trim() : `${activeTab.query.trim()};`
      
      const isSelect = /^\s*(SELECT|WITH)\b/i.test(sql);
      const limitMatch = sql.match(/\bLIMIT\b\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 0;
      
      // A query is "large" if it's a SELECT with a limit > 10000 or no limit (which we default to 1000, so it's simple)
      // Actually, if it has NO limit, we add 1000, so it's simple.
      // If it has a limit > 10000, we consider it large and use WebSocket streaming.
      const isLarge = isSelect && limit > 10000;

      updateTabResults(activeTab.id, { status: 'executing', error: null, results: page === 1 ? null : activeTab.results })

      if (isLarge && socketRef.current) {
        socketRef.current.emit('execute-query', {
          connectionId: activeConnection.id,
          dto: { sql, page, pageSize: 1000 },
          tabId: activeTab.id
        })
      } else {
        try {
          const result = await queryService.execute(activeConnection.id, sql, activeConnection.database, undefined, page, 1000);
          updateTabResults(activeTab.id, {
            status: 'success',
            results: result,
            error: null
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          updateTabResults(activeTab.id, {
            status: 'error',
            error: message
          })
        }
      }
    }
  }, [activeTab, activeConnection, updateTabResults, checkDangerousQuery])

  const handleExecuteCurrent = useCallback(async (page = 1) => {
    if (!editorRef.current || !activeTab || !activeConnection) return

    const position = editorRef.current.getPosition()
    if (!position) return

    const fullText = editorRef.current.getValue()
    const selection = editorRef.current.getSelection()
    let sql = ''
    
    if (selection && !selection.isEmpty()) {
      sql = editorRef.current.getModel()?.getValueInRange(selection) || ''
    } else {
      // Improved logic: Find the SQL block bounded by semicolons or file start/end
      const lines = fullText.split('\n')
      const cursorLine = position.lineNumber - 1
      
      let startIdx = 0
      for (let i = cursorLine; i >= 0; i--) {
        if (lines[i].includes(';') && i < cursorLine) {
          startIdx = i + 1
          break
        }
      }
      
      let endIdx = lines.length - 1
      for (let i = cursorLine; i < lines.length; i++) {
        if (lines[i].includes(';')) {
          endIdx = i
          break
        }
      }
      
      sql = lines.slice(startIdx, endIdx + 1).join('\n').trim()
    }

    if (!sql) return
    if (checkDangerousQuery(sql)) return
    if (!sql.endsWith(';')) sql += ';'

    const isSelect = /^\s*(SELECT|WITH)\b/i.test(sql);
    const limitMatch = sql.match(/\bLIMIT\b\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 0;
    const isLarge = isSelect && limit > 10000;
    
    updateTabResults(activeTab.id, { status: 'executing', error: null, results: page === 1 ? null : activeTab.results })
    
    if (isLarge && socketRef.current) {
      socketRef.current.emit('execute-query', {
        connectionId: activeConnection.id,
        dto: { sql, page, pageSize: 1000 },
        tabId: activeTab.id
      })
    } else {
      try {
        const result = await queryService.execute(activeConnection.id, sql, activeConnection.database, undefined, page, 1000);
        updateTabResults(activeTab.id, {
          status: 'success',
          results: result,
          error: null
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        updateTabResults(activeTab.id, {
          status: 'error',
          error: message
        })
      }
    }
  }, [activeTab, activeConnection, updateTabResults, checkDangerousQuery])

  // Use refs to avoid stale closures in Monaco addCommand
  const executeCurrentRef = useRef(handleExecuteCurrent)
  const executeAllRef = useRef(handleExecuteAll)
  
  useEffect(() => {
    executeCurrentRef.current = handleExecuteCurrent
    executeAllRef.current = handleExecuteAll
  }, [handleExecuteCurrent, handleExecuteAll])

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

  const handleSave = useCallback(() => {
    if (!editingCell || !activeTab?.results || !activeConnection || !socketRef.current) return

    const { rowIndex, column, value: newValue } = editingCell
    const row = activeTab.results.rows[rowIndex]
    const idColumn = activeTab.results.columns.find(c => c.toLowerCase() === 'id')
    const idValue = idColumn ? row[idColumn] : null

    const tableNameMatch = activeTab.query.match(/FROM\s+([a-zA-Z0-9_\.`"\[\]]+)/i)
    const tableName = tableNameMatch ? tableNameMatch[1].replace(/[`"\[\]]/g, '') : null

    if (!tableName || !idColumn || idValue === undefined || idValue === null) {
      updateTabResults(activeTab.id, { 
        status: 'error', 
        error: `Cannot update: ${!tableName ? 'Table not found' : 'ID column not found/null'}.` 
      })
      setEditingCell(null)
      return
    }

    const updateSql = `UPDATE ${tableName} SET ${column} = ? WHERE ${idColumn} = ?;`

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

  const handleEditorWillMount = useCallback((monacoInstance: Monaco) => {
    const languages = monacoInstance.languages as typeof monacoInstance.languages & { sqlProviderRegistered?: boolean };
    if (languages.sqlProviderRegistered) return;
    languages.sqlProviderRegistered = true;

    monacoInstance.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: monaco.languages.CompletionItem[] = [
          {
            label: 'SELECT',
            kind: 17, // CompletionItemKind.Snippet
            insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4, // CompletionItemInsertTextRule.InsertAsSnippet
            documentation: 'Basic SELECT statement',
            range: range,
          },
          {
            label: 'INSERT',
            kind: 17,
            insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});',
            insertTextRules: 4,
            documentation: 'Basic INSERT statement',
            range: range,
          },
          {
            label: 'UPDATE',
            kind: 17,
            insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};',
            insertTextRules: 4,
            documentation: 'Basic UPDATE statement',
            range: range,
          },
          {
            label: 'DELETE',
            kind: 17,
            insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4,
            documentation: 'Basic DELETE statement',
            range: range,
          },
        ];
        return { suggestions };
      },
    });
  }, [])

  const handleEditorDidMount = useCallback((editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editorInstance
    
    // Ctrl/Cmd + Enter: Execute Current Statement (or selection)
    editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      executeCurrentRef.current()
    })

    // F5: Execute All (Legacy SQL editor behavior)
    editorInstance.addCommand(monacoInstance.KeyCode.F5, () => {
      executeAllRef.current()
    })
  }, [])

  const sortedRows = useMemo(() => {
    if (!activeTab?.results?.rows) return []
    if (!sortConfig) return activeTab.results.rows

    return [...activeTab.results.rows].sort((a, b) => {
      const aVal = a[sortConfig.key]
      const bVal = b[sortConfig.key]
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
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

  const handleSaveScript = useCallback(() => {
    const state = useAppStore.getState();
    const currentTab = state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
    const content = editorRef.current ? editorRef.current.getValue() : currentTab?.query;
    
    if (content === undefined || content === null) return;
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentTab?.name || 'query'}.sql`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, []) // No dependencies

  const saveScriptRef = useRef(handleSaveScript)
  useEffect(() => {
    saveScriptRef.current = handleSaveScript
  }, [handleSaveScript])

  const handlePageChange = useCallback((page: number) => {
    handleExecuteAll(page)
  }, [handleExecuteAll])

  return {
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
    setModalRect,
    isMaximized,
    setIsMaximized,
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
    handlePageChange,
    clearTabResults,
    draggingRef,
    resizingRef
  }
}
