import type * as monaco from 'monaco-editor'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { useAppStore } from '@/store/useAppStore'
import { queryService } from '@/services/query.service'
import { tauriApi } from '@/lib/api'
import type { DbValue } from '@/types/database'
import { ExecutionStatus } from '@/types/database'

const TABLE_NAME_REGEX = /FROM\s+([a-zA-Z0-9_.`"[\]]+)/i

export function useQueryEditor() {
  const { 
    activeConnection, 
    tabs, 
    activeTabId, 
    addTab, 
    openTab,
    removeTab, 
    updateTabQuery, 
    setActiveTabId, 
    updateTabResults, 
    clearTabResults,
    panels, 
    setEditorHeight,
    togglePanel 
  } = useAppStore()
  
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  
  const [showContextMenu, setShowContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [modalRect, setModalRect] = useState({ x: 10, y: 10, w: 80, h: 80 }) 
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevRect, setPrevRect] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string; value: DbValue } | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)

  const draggingRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)
  const resizingRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragging = draggingRef.current
      if (dragging) {
        setIsInteracting(true)
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
        setIsInteracting(true)
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
      setIsInteracting(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

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
      
      updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })

      try {
        const result = await queryService.execute(activeConnection.id, sql, activeConnection.database, undefined, page, 1000);
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.SUCCESS,
          results: result,
          error: null
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.ERROR,
          error: message
        })
      }
    }
  }, [activeTab, activeConnection, updateTabResults, checkDangerousQuery])

  const handleExecuteCurrent = useCallback(async (page = 1) => {
    if (!editorRef.current || !activeTab || !activeConnection) return

    const position = editorRef.current.getPosition()
    if (!position) return

    const fullText = editorRef.current.getValue()
    const selection = editorRef.current.getSelection()
    let sqlSnippet: string
    
    if (selection && !selection.isEmpty()) {
      sqlSnippet = editorRef.current.getModel()?.getValueInRange(selection) || ''
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
      
      sqlSnippet = lines.slice(startIdx, endIdx + 1).join('\n').trim()
    }

    if (!sqlSnippet) return
    if (checkDangerousQuery(sqlSnippet)) return
    if (!sqlSnippet.endsWith(';')) sqlSnippet += ';'

    updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })
    
    try {
      const result = await queryService.execute(activeConnection.id, sqlSnippet, activeConnection.database, undefined, page, 1000);
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.SUCCESS,
        results: result,
        error: null
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: message
      })
    }
  }, [activeTab, activeConnection, updateTabResults, checkDangerousQuery])

  // Use refs to avoid stale closures in Monaco addCommand
  const executeCurrentRef = useRef(handleExecuteCurrent)
  const executeAllRef = useRef(handleExecuteAll)
  
  useEffect(() => {
    executeCurrentRef.current = handleExecuteCurrent
    executeAllRef.current = handleExecuteAll
  }, [handleExecuteCurrent, handleExecuteAll])

  const handleCancel = useCallback(() => {
    if (activeTabId && activeConnection) {
      updateTabResults(activeTabId, { 
        status: ExecutionStatus.ERROR, 
        error: 'Query cancelled by user',
        results: null 
      })
      queryService.cancel(activeConnection.id)
    }
  }, [activeTabId, activeConnection, updateTabResults])

  const handleSave = useCallback(async () => {
    if (!editingCell || !activeTab?.results || !activeConnection) return

    const { rowIndex, column, value: newValue } = editingCell
    const row = activeTab.results.rows[rowIndex]
    
    // Use primary_keys metadata from backend if available, fallback to 'id'
    const pkColumns = activeTab.results.primary_keys && activeTab.results.primary_keys.length > 0 
      ? activeTab.results.primary_keys 
      : activeTab.results.columns.filter(c => c.toLowerCase() === 'id')

    if (pkColumns.length === 0) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Primary key (or ID column) not found in result set.' 
      })
      setEditingCell(null)
      return
    }

    const tableNameMatch = activeTab.query.match(TABLE_NAME_REGEX)
    let tableName = tableNameMatch ? tableNameMatch[1] : null

    if (!tableName) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Table name not found in query.' 
      })
      setEditingCell(null)
      return
    }

    // Ensure tableName is escaped properly if it isn't
    if (!tableName.startsWith('`') && !tableName.startsWith('"') && !tableName.startsWith('[')) {
        tableName = `\`${tableName.replace(/\./g, '`.`')}\``
    }

    // Build WHERE clause using all PK columns
    const whereClauses = pkColumns.map((pk: string) => `\`${pk.replace(/`/g, "``")}\` = ?`).join(' AND ')
    const pkValues = pkColumns.map((pk: string) => row[pk])

    if (pkValues.some((v: DbValue) => v === null || v === undefined)) {
       updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Primary key value is null or undefined.' 
      })
      setEditingCell(null)
      return
    }

    const updateSqlTemplate = `UPDATE ${tableName} SET \`${column.replace(/`/g, "``")}\` = ? WHERE ${whereClauses};`
    const params = [newValue, ...pkValues]

    const finalSql = updateSqlTemplate.replace(/\?/g, () => {
      const val = params.shift();
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return String(val);
    });

    const updatedRows = [...activeTab.results.rows]
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: newValue }
    
    updateTabResults(activeTab.id, { 
      results: { ...activeTab.results, rows: updatedRows },
      status: ExecutionStatus.EXECUTING,
      error: null
    })

    try {
        await tauriApi.invoke('execute_query', {
            id: activeConnection.id,
            query: finalSql
        })
        updateTabResults(activeTab.id, { status: ExecutionStatus.SUCCESS, error: null })
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update record'
        updateTabResults(activeTab.id, { 
            status: ExecutionStatus.ERROR, 
            error: errorMessage 
        })
    }
    
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
    const rows = activeTab?.results?.rows;
    if (!rows) return []
    if (!sortConfig) return rows

    return [...rows].sort((a, b) => {
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
    
    // Always prioritize editor content if available
    const content = editorRef.current ? editorRef.current.getValue() : currentTab?.query;
    
    if (!content) return;
    
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
    isInteracting,
    draggingRef,
    resizingRef
  }
}
