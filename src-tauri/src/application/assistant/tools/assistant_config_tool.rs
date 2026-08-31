use async_trait::async_trait;

use crate::application::assistant::tools::recommendation_engine::RecommendationEngine;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

pub struct AssistantConfigTool;

#[async_trait]
impl AssistantTool for AssistantConfigTool {
    fn name(&self) -> &str {
        "assistant_config"
    }

    fn description(&self) -> &str {
        "Inspect the assistant's configuration: 'configs' (configured AI providers, API keys never exposed — only hasKey), 'preferences' (user preferences), 'recommendations' (suggested next actions for a connection)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["configs", "preferences", "recommendations"],
                    "description": "What to inspect"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID (used by recommendations)"
                }
            },
            "required": ["action"]
        })
    }

    fn is_destructive(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        args: serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("configs");

        match action {
            "configs" => {
                let configs = state.storage.load_provider_configs().await?;

                let safe: Vec<serde_json::Value> = configs
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "id": c.id,
                            "providerId": c.provider_id,
                            "model": c.model,
                            "baseUrl": c.base_url,
                            "hasKey": c.api_key.as_deref().map(|k| !k.is_empty()).unwrap_or(false),
                        })
                    })
                    .collect();
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "configs": safe })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "preferences" => {
                let prefs = state.storage.get_preferences().await?;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "preferences": prefs })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "recommendations" => {
                let cid = args
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let messages = state.storage.load_assistant_messages(cid).await?;
                let history = state.storage.load_query_history(cid, 100).await?;
                let cases = state.storage.list_knowledge_global(200).await?;
                let recommendations = RecommendationEngine::analyze(&messages, &history, &cases);
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "recommendations": recommendations })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            other => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown action: {other}")),
            }),
        }
    }
}
