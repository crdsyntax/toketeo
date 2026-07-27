use serde::{Deserialize, Serialize};

// ── Schema Context Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaContext {
    pub db_type: String,
    pub version: Option<String>,
    pub database: Option<String>,
    pub user: Option<String>,
    pub tables: Vec<TableContext>,
    pub views: Vec<String>,
    pub procedures: Vec<String>,
    pub triggers: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TableContext {
    pub name: String,
    pub columns: Vec<ColumnContext>,
    pub indexes: Vec<IndexContext>,
    pub foreign_keys: Vec<ForeignKeyContext>,
    pub row_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ColumnContext {
    pub name: String,
    pub col_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexContext {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub index_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyContext {
    pub constraint_name: String,
    pub columns: Vec<String>,
    pub referenced_table: String,
    pub referenced_columns: Vec<String>,
    pub on_delete: Option<String>,
    pub on_update: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaFingerprint {
    pub table_names: Vec<String>,
    pub view_names: Vec<String>,
    pub table_hashes: Vec<(String, u64)>,
}

// ── AI API Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolDescriptor>,
    pub temperature: f32,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    /// Tool calls issued by the assistant in this message (only set when
    /// `role == "assistant"` after a model round returning `tool_calls`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    /// Tool-call id this message is a result of (only set when `role == "tool"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub usage: TokenUsage,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

impl ToolCall {
    /// Serialise `arguments` to a JSON string for providers (e.g. OpenAI's
    /// Chat Completions API) that expect `function.arguments` as a string
    /// rather than an embedded JSON object.
    pub fn arguments_to_string(&self) -> String {
        match self.arguments {
            serde_json::Value::Null => String::from("null"),
            serde_json::Value::String(ref s) => s.clone(),
            _ => self.arguments.to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub supports_tools: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_key: bool,
    pub supports_tools: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: Option<String>,
    pub provider_id: String,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurn {
    pub turn_id: String,
    pub answer: String,
    pub sql: Option<String>,
    pub tool_used: Option<String>,
    pub source: String,
    pub requires_confirmation: bool,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCase {
    pub id: String,
    pub question: String,
    pub sql_text: String,
    pub engine: String,
    pub rating: String,
    pub used_count: i64,
    pub favorite: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub ok: bool,
    pub data: Option<serde_json::Value>,
    pub requires_confirmation: bool,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preference {
    pub key: String,
    pub value: String,
}
