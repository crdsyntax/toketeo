export interface ProviderInfo {
  id: string
  name: string
  requiresKey: boolean
  supportsTools: boolean
}

export interface ProviderConfig {
  id?: string
  providerId: string
  model?: string | null
  apiKey?: string | null
  baseUrl?: string | null
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  supportsTools: boolean
}

export interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number | null
}

export interface AssistantTurn {
  turnId: string
  answer: string
  sql?: string | null
  toolUsed?: string | null
  source: string
  requiresConfirmation: boolean
  usage?: TokenUsage | null
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface KnowledgeCase {
  id: string
  question: string
  sqlText: string
  engine: string
  rating: string
  usedCount: number
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  requiresConfirmation: boolean
  message?: string | null
}

export interface Preference {
  key: string
  value: string
}
