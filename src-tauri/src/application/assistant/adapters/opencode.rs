use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo};

use super::openai_format;
use super::AiAdapter;

pub struct OpenCodeAdapter {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OpenCodeAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://opencode.ai/zen/v1".to_string()),
            model: model.unwrap_or_else(|| "opencode/gpt-5.5".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for OpenCodeAdapter {
    fn id(&self) -> &str {
        "opencode"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let messages = openai_format::build_messages(&req.system, &req.messages);
        let tools = openai_format::build_tools(&req.tools);

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        });

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenCode returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode parse failed: {e}")))?;

        openai_format::parse_response(&data, &self.model)
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client
            .get("https://opencode.ai/zen/v1/models")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode models request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Internal("Failed to list OpenCode models".to_string()));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode parse failed: {e}")))?;

        let models = data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        Some(ModelInfo {
                            id: id.clone(),
                            name: id,
                            provider: "opencode".to_string(),
                            supports_tools: true,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    fn supports_tools(&self) -> bool {
        true
    }
}
