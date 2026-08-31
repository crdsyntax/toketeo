import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Connection } from '@/types/database'
import { useAssistantStore, type AssistantMessage } from '@/store/assistantStore'
import { useAppStore } from '@/store/useAppStore'
import { schemaService } from '@/services/schema.service'
import { assistantService } from '@/services/assistant.service'
import { tauriApi } from '@/lib/api'
import { requestRunQuery } from '@/lib/queryRunEvents'
import { buildAgentContext } from '@/lib/agentContext'
import type { AgentAction } from '@/types/assistant'
import type { ColumnResponse } from '@/types/database'
import type { ModelInfo } from '@/types/assistant'


function extractSqlFromText(text: string): string | null {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fence) {
    const sql = fence[1].trim()
    if (sql) return sql
  }
  const trimmed = text.trim()
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|SHOW|DESCRIBE|EXPLAIN|CREATE|ALTER|DROP|TRUNCATE|USE|CALL|EXEC)\b/i.test(trimmed)) {
    return trimmed
  }
  return null
}

function resultsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(','))
  return [header, ...body].join('\n')
}


async function runAgentAction(action: AgentAction): Promise<string> {
  const app = useAppStore.getState()
  if (action.type === 'focus_tab') {
    app.setActiveTabId(action.tabId)
    return `Tab enfocado: ${action.tabName ?? action.tabId}`
  }

  if (action.type === 'export_tab_results') {
    const tab = app.tabs.find((t) => t.id === action.tabId)
    if (!tab?.results) return 'El tab no tiene resultados para exportar.'
    const { columns, rows } = tab.results
    const format = action.format === 'csv' ? 'csv' : 'json'
    const content =
      format === 'json'
        ? JSON.stringify(rows, null, 2)
        : resultsToCsv(columns, [...rows])
    const base = (action.tabName ?? tab.name).replace(/[^\w.-]+/g, '_')
    const savedPath = await tauriApi.invoke<string | null>('save_file_dialog', {
      content,
      defaultFileName: `${base}.${format}`,
      filterName: format.toUpperCase(),
      filterExt: format,
    })
    return savedPath
      ? `Resultados exportados a ${savedPath}`
      : 'Exportación cancelada por el usuario.'
  }

  return ''
}



function applyToolSideEffects(
  evt: { name?: string; ok?: boolean; data?: unknown },
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (evt.name !== 'connection_manage' || !evt.ok) return
  void queryClient.invalidateQueries({ queryKey: ['connections'] })
  const data = evt.data as
    | { connectionId?: string; connected?: boolean; deleted?: string }
    | undefined
  const app = useAppStore.getState()

  if (data?.connected === true && data.connectionId) {
    app.setConnectedConnection(data.connectionId)

    const cached = queryClient.getQueryData<Connection[]>(['connections'])
    const conn = cached?.find((c) => c.id === data.connectionId)
    if (conn) {
      app.setActiveConnection({ ...conn, database: conn.defaultDatabase || conn.database })
    }
  } else if (data?.connected === false && data.connectionId) {
    app.removeConnectedConnection(data.connectionId)
    app.removeExplorerTabsForConnection(data.connectionId)
  } else if (data?.deleted) {
    app.removeConnectedConnection(data.deleted)
    app.removeExplorerTabsForConnection(data.deleted)
  }
}

export interface UseAgentChatOptions {

  onBeforeSend?: (text: string) => void
}

export function useAgentChat(options?: UseAgentChatOptions) {
  const { onBeforeSend } = options ?? {}
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const messages = useAssistantStore((s) => s.messages)
  const addMessage = useAssistantStore((s) => s.addMessage)
  const updateMessageFeedback = useAssistantStore((s) => s.updateMessageFeedback)
  const setSchemaCache = useAssistantStore((s) => s.setSchemaCache)
  const clearSchemaCache = useAssistantStore((s) => s.clearSchemaCache)
  const schemaCache = useAssistantStore((s) => s.schemaCache)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const isStreaming = useAssistantStore((s) => s.isStreaming)
  const setStreaming = useAssistantStore((s) => s.setStreaming)
  const pendingConfirmation = useAssistantStore((s) => s.pendingConfirmation)
  const setPendingConfirmation = useAssistantStore((s) => s.setPendingConfirmation)

  const recallIndexRef = useRef(-1)
  const userMessagesRef = useRef<string[]>([])
  const isArrowRecallRef = useRef(false)
  const nowRef = useRef(0)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null)


  useEffect(() => {
    userMessagesRef.current = messages.filter((m) => m.role === 'user').map((m) => m.content)
  }, [messages])


  useEffect(() => {
    if (!activeConnection) { clearSchemaCache(); return }
    let cancelled = false
    const schema = (activeConnection as { database?: string }).database
    ;(async () => {
      try {
        const tables = await schemaService.getTables(activeConnection.id, schema)
        const columns: Record<string, ColumnResponse[]> = {}
        await Promise.all(tables.map(async (t) => {
          try { columns[t.name] = await schemaService.getColumns(activeConnection.id, t.name, schema) } catch {  }
        }))
        if (!cancelled) setSchemaCache({ tables, columns })
      } catch {  }
    })()
    return () => { cancelled = true }

  }, [activeConnection, clearSchemaCache, setSchemaCache])


  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const configs = await assistantService.getProviderConfigs()
        if (cancelled || configs.length === 0) return
        const config = configs[0]
        const modelsList = await assistantService.getModels(config.providerId, config)
        if (cancelled) return
        setModels(modelsList)
        const currentModel = modelsList.find(m => m.id === config.model) || modelsList[0]
        setSelectedModel(currentModel || null)
      } catch {

      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleModelChange = useCallback(async (model: ModelInfo) => {
    setSelectedModel(model)
    try {
      const configs = await assistantService.getProviderConfigs()
      if (configs.length === 0) return
      const updatedConfig: typeof configs[0] = { ...configs[0], model: model.id }
      await assistantService.saveProviderConfig(updatedConfig)
    } catch {

    }
  }, [])

  const handleSend = useCallback(async (text: string, confirmDestructive = false) => {
    if (!text.trim() || isStreaming) return
    const ts = (nowRef.current = nowRef.current + 1)

    if (!confirmDestructive) {
      addMessage({ id: crypto.randomUUID(), role: 'user' as const, content: text, timestamp: ts })
    }
    recallIndexRef.current = -1
    setInput('')
    onBeforeSend?.(text)

    const activeConn = useAppStore.getState().activeConnection

    const deleteMatch = text.match(/(?:DELETE|delete|eliminar|borrar)\s+(?:FROM|from|de)\s+[`'"']?(\w+)[`'"']?/i)
    if (deleteMatch && activeConn) {
      const table = deleteMatch[1]
      try {
        const sql = await schemaService.generateSafeDeleteSql(activeConn.id, table, activeConn.database)
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: sql, sql, isSafeDelete: true, timestamp: (nowRef.current = nowRef.current + 1) })
      } catch (err) {
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : 'Failed', timestamp: (nowRef.current = nowRef.current + 1) })
      }
      return
    }


    const userSql = extractSqlFromText(text)
    if (userSql) {
      const engine = activeConn?.type ?? 'mysql'
      const { activeTabId, updateTabQuery } = useAppStore.getState()
      if (activeTabId) updateTabQuery(activeTabId, userSql)
      requestRunQuery(userSql)
      assistantService.recordCase(text.trim(), userSql, engine, 'positive').catch(() => undefined)
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: 'Consulta ejecutada en el editor y guardada en la biblioteca de conocimiento.', sql: userSql, timestamp: (nowRef.current = nowRef.current + 1) })
      return
    }

    setStreaming(true)
    useAssistantStore.getState().setLiveMessage(null)
    try {
      const uiContext = buildAgentContext(location.pathname)
      const onEvent = (evt: { event: 'delta' | 'status' | 'tool' | 'clear_content'; text?: string; message?: string; name?: string; ok?: boolean; data?: unknown }) => {
        const store = useAssistantStore.getState()
        if (evt.event === 'delta' && evt.text) {
          store.setLiveMessage({ content: (store.liveMessage?.content ?? '') + evt.text, status: null })
        } else if (evt.event === 'clear_content') {

          store.setLiveMessage({ content: '', status: null })
        } else if (evt.event === 'status') {
          store.setLiveMessage({ content: store.liveMessage?.content ?? '', status: evt.message ?? null })
        } else if (evt.event === 'tool') {

          const mark = evt.ok ? '✓' : '✗'
          store.setLiveMessage({ content: store.liveMessage?.content ?? '', status: `${mark} ${evt.name}` })
          applyToolSideEffects(evt, queryClient)
        }
      }
      const response = await assistantService.chat(activeConn?.id ?? '', text, confirmDestructive, uiContext, onEvent)
      useAssistantStore.getState().setLiveMessage(null)
      addMessage({ id: response.turnId, role: 'assistant', content: response.answer, sql: response.sql ?? undefined, toolUsed: response.toolUsed ?? null, timestamp: (nowRef.current = nowRef.current + 1) })

      setPendingConfirmation(response.requiresConfirmation ? { question: text } : null)

      if (response.action) {
        try {
          const result = await runAgentAction(response.action as AgentAction)
          if (result) {
            addMessage({ id: crypto.randomUUID(), role: 'assistant', content: result, timestamp: (nowRef.current = nowRef.current + 1) })
          }
        } catch {
          addMessage({ id: crypto.randomUUID(), role: 'assistant', content: 'No se pudo completar la acción solicitada en la interfaz.', timestamp: (nowRef.current = nowRef.current + 1) })
        }
      }
    } catch (err) {
      useAssistantStore.getState().setLiveMessage(null)
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : 'Failed to get response', timestamp: (nowRef.current = nowRef.current + 1) })
    } finally {
      setStreaming(false)
      useAssistantStore.getState().setLiveMessage(null)
    }
  }, [location.pathname, isStreaming, addMessage, setPendingConfirmation, setStreaming, onBeforeSend, queryClient])

  const handleFeedback = useCallback((messageId: string, feedback: 'positive' | 'negative') => {
    updateMessageFeedback(messageId, feedback)
    schemaService.updateAssistantFeedback(messageId, feedback).catch(() => undefined)
    const activeConn = useAppStore.getState().activeConnection
    if (!activeConn) return

    const msgs = useAssistantStore.getState().messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sql: m.sql,
      isSafeDelete: m.isSafeDelete,
      feedback: m.feedback,
      timestamp: m.timestamp,
      connectionId: activeConn.id,
    }))
    void schemaService
      .saveAssistantMessages(msgs)
      .then(() =>
        assistantService.recordFeedback(
          messageId,
          activeConn.id,
          feedback,

          activeConn.type,
        ),
      )
      .catch(() => undefined)
  }, [updateMessageFeedback])


  useEffect(() => {
    if (!activeConnection) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = await tauriApi.invoke<AssistantMessage[]>('load_assistant_messages', { connectionId: activeConnection.id })
        if (!cancelled && stored.length > 0) {
          const store = useAssistantStore.getState()
          if (store.messages.length === 0) {
            for (const m of stored) store.addMessage(m as AssistantMessage)
          }
        }
      } catch {  }
    })()
    return () => { cancelled = true }

  }, [activeConnection])


  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const conn = activeConnection
    if (!conn || messages.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const msgs = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sql: m.sql,
        isSafeDelete: m.isSafeDelete,
        feedback: m.feedback,
        timestamp: m.timestamp,
        connectionId: conn.id,
      }))
      schemaService.saveAssistantMessages(msgs).catch(() => undefined)
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }

  }, [messages, activeConnection])

  const loadInEditor = useCallback((sql: string) => {
    const app = useAppStore.getState()
    if (app.activeTabId) {

      app.updateTabQuery(app.activeTabId, sql)
    } else {

      app.openTab('Assistant SQL', sql, app.activeConnection?.id)
    }

    navigate('/query')
  }, [navigate])

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    if (!isArrowRecallRef.current) recallIndexRef.current = -1
    isArrowRecallRef.current = false
  }, [setInput])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const userMsgs = userMessagesRef.current
    if (e.key === 'ArrowUp' && userMsgs.length > 0) {
      e.preventDefault()
      isArrowRecallRef.current = true
      const next = Math.min(recallIndexRef.current + 1, userMsgs.length - 1)
      recallIndexRef.current = next
      setInput(userMsgs[userMsgs.length - 1 - next])
      return
    }
    if (e.key === 'ArrowDown' && recallIndexRef.current >= 0) {
      e.preventDefault()
      isArrowRecallRef.current = true
      const next = recallIndexRef.current - 1
      if (next < 0) {
        recallIndexRef.current = -1
        setInput('')
      } else {
        recallIndexRef.current = next
        setInput(userMsgs[userMsgs.length - 1 - next])
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(input) }
  }, [handleSend, input, setInput])


  const clearConversation = useCallback(() => {
    const store = useAssistantStore.getState()
    store.clearMessages()
    store.setLiveMessage(null)
    store.setPendingConfirmation(null)
    const conn = useAppStore.getState().activeConnection
    if (conn) {
      assistantService.clearMessages(conn.id).catch(() => undefined)
    }
  }, [])

  return {
    messages,
    addMessage,
    schemaCache,
    isStreaming,
    pendingConfirmation,
    liveMessage: useAssistantStore((s) => s.liveMessage),
    models,
    selectedModel,
    input,
    handleInputChange,
    handleInputKeyDown,
    handleModelChange,
    handleSend,
    handleFeedback,
    loadInEditor,
    clearConversation,
    confirmPending: useCallback(() => {
      const p = useAssistantStore.getState().pendingConfirmation
      if (!p) return
      setPendingConfirmation(null)
      handleSend(p.question, true)
    }, [handleSend, setPendingConfirmation]),
  }
}
