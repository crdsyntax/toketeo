import { tauriApi } from '@/lib/api'
import type { ProviderConfig, ProviderInfo, ModelInfo, TestResult, AssistantTurn, KnowledgeCase, Preference, SqlFixResult } from '@/types/assistant'

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

  chat: (connectionId: string, question: string, confirmDestructive = false) =>
    tauriApi.invoke<AssistantTurn>('assistant_chat', { connectionId, question, confirmDestructive }),

  fixSql: (connectionId: string, sql: string, error: string) =>
    tauriApi.invoke<SqlFixResult>('assistant_fix_sql', { connectionId, sql, error }),

  searchKnowledge: (query: string, engine: string, limit?: number) =>
    tauriApi.invoke<KnowledgeCase[]>('assistant_search_knowledge', { query, engine, limit }),

  listKnowledge: (engine: string, limit?: number) =>
    tauriApi.invoke<KnowledgeCase[]>('assistant_list_knowledge', { engine, limit }),

  toggleKnowledgeFavorite: (id: string) =>
    tauriApi.invoke<boolean>('assistant_toggle_knowledge_favorite', { id }),

  recordCase: (question: string, sqlText: string, engine: string, rating: string) =>
    tauriApi.invoke<string>('assistant_record_case', { question, sqlText, engine, rating }),

  recordFeedback: (messageId: string, connectionId: string, rating: string, engine: string, rejectionReason?: string | null, acceptedSql?: string | null) =>
    tauriApi.invoke<void>('assistant_record_feedback', { messageId, connectionId, rating, engine, rejectionReason, acceptedSql }),

  getPreferences: () =>
    tauriApi.invoke<Preference[]>('assistant_get_preferences'),

  setPreference: (key: string, value: string) =>
    tauriApi.invoke<void>('assistant_set_preference', { key, value }),
}
