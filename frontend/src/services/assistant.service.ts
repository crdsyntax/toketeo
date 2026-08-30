import { tauriApi } from '@/lib/api'
import { Channel } from '@tauri-apps/api/core'
import type { ProviderConfig, ProviderInfo, ModelInfo, TestResult, AssistantTurn, KnowledgeCase, Preference, SqlFixResult } from '@/types/assistant'
import type { AgentUiContext } from '@/lib/agentContext'

export interface AgentStreamEvent {
  event: 'delta' | 'status' | 'tool' | 'clear_content'
  text?: string
  message?: string
  name?: string
  ok?: boolean
  data?: unknown
}

export const assistantService = {
  getProviders: () =>
    tauriApi.invoke<ProviderInfo[]>('assistant_get_providers'),

  getModels: (providerId: string, config: ProviderConfig) =>
    tauriApi.invoke<ModelInfo[]>('assistant_get_models', { providerId, config }),

  testProvider: (config: ProviderConfig) =>
    tauriApi.invoke<TestResult>('assistant_test_provider', { config }),

  saveProviderConfig: (config: ProviderConfig) =>
    tauriApi.invoke<string>('assistant_save_provider_config', { config }),

  getProviderConfigs: () =>
    tauriApi.invoke<ProviderConfig[]>('assistant_get_provider_configs'),

  getProviderConfig: (id: string) =>
    tauriApi.invoke<ProviderConfig | null>('assistant_get_provider_config', { id }),

  deleteProviderConfig: (id: string) =>
    tauriApi.invoke<void>('assistant_delete_provider_config', { id }),

  chat: (connectionId: string, question: string, confirmDestructive = false, uiContext?: AgentUiContext, onEvent?: (evt: AgentStreamEvent) => void) => {    const onEventChannel = new Channel<AgentStreamEvent>()
    if (onEvent) {
      onEventChannel.onmessage = onEvent
    }
    return tauriApi.invoke<AssistantTurn>('assistant_chat', { connectionId, question, confirmDestructive, uiContext, onEvent: onEventChannel })
  },

  fixSql: (connectionId: string, sql: string, error: string) =>
    tauriApi.invoke<SqlFixResult>('assistant_fix_sql', { connectionId, sql, error }),

  searchKnowledge: (query: string, engine?: string | null, limit?: number) =>
    tauriApi.invoke<KnowledgeCase[]>('assistant_search_knowledge', { query, engine: engine ?? null, limit }),

  listKnowledge: (engine?: string | null, limit?: number) =>
    tauriApi.invoke<KnowledgeCase[]>('assistant_list_knowledge', { engine: engine ?? null, limit }),

  toggleKnowledgeFavorite: (id: string) =>
    tauriApi.invoke<boolean>('assistant_toggle_knowledge_favorite', { id }),

  knowledgeIndexStats: () =>
    tauriApi.invoke<[number, number]>('assistant_knowledge_index_stats'),

  clearMessages: (connectionId: string) =>
    tauriApi.invoke<void>('clear_assistant_messages', { connectionId }),

  recordCase: (question: string, sqlText: string, engine: string, rating: string) =>
    tauriApi.invoke<string>('assistant_record_case', { question, sqlText, engine, rating }),

  recordFeedback: (messageId: string, connectionId: string, rating: string, engine: string, rejectionReason?: string | null, acceptedSql?: string | null) =>
    tauriApi.invoke<void>('assistant_record_feedback', { messageId, connectionId, rating, engine, rejectionReason, acceptedSql }),

  getPreferences: () =>
    tauriApi.invoke<Preference[]>('assistant_get_preferences'),

  setPreference: (key: string, value: string) =>
    tauriApi.invoke<void>('assistant_set_preference', { key, value }),
}
