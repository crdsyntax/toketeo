use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Diagram {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub source_connection_id: Option<String>,
    #[serde(default)]
    pub source_schema: Option<String>,
    pub nodes: serde_json::Value,
    pub edges: serde_json::Value,
    #[serde(default)]
    pub viewport: Option<serde_json::Value>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}
