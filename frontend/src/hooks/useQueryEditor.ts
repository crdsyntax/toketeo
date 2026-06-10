import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { Monaco } from '@monaco-editor/react'
import { editor } from 'monaco-editor'
import { useAppStore } from '@/store/useAppStore'
import { DbValue, DbRow } from '@/types/database'

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
    const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/queries`)
    socketRef.current = socket

    socket.on('query-progress', (data: { tabId: string; status: string; message: string; isSilent?: boolean }) => {
      updateTabResults(data.tabId, { status: 'executing' })
    })

    socket.on('query-result', (data: { tabId: string, columns: string[], rows: DbRow[], executionTime: number, isSilent?: boolean }) => {
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

  const handleEditorWillMount = useCallback((monaco: Monaco) => {
    const languages = monaco.languages as typeof monaco.languages & { sqlProviderRegistered?: boolean };
    if (languages.sqlProviderRegistered) return;
    languages.sqlProviderRegistered = true;

    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: editor.ICompletionItem[] = [
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

  const handleEditorDidMount = useCallback((editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorInstance.addCommand(monaco.KeyMod.Ctrl | monaco.KeyCode.Enter, handleExecute)
  }, [handleExecute])

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
    handleExecute,
    handleCancel,
    handleSave,
    handleEditorWillMount,
    handleEditorDidMount,
    draggingRef,
    resizingRef
  }
}
