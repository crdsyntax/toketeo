use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo, TokenUsage};

use super::AiAdapter;

pub struct ClaudeAdapter {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl ClaudeAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string()),
            model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for ClaudeAdapter {
    fn id(&self) -> &str {
        "claude"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let mut claude_messages: Vec<serde_json::Value> = Vec::new();
        let mut system_text = req.system.clone();

        for msg in &req.messages {
            if msg.role == "system" {
                system_text = msg.content.clone();
            } else {
                claude_messages.push(serde_json::json!({
                    "role": msg.role,
                    "content": msg.content,
                }));
            }
        }

        let body = serde_json::json!({
            "model": self.model,
            "system": system_text,
            "messages": claude_messages,
            "max_tokens": req.max_tokens.unwrap_or(4096),
            "temperature": req.temperature,
        });

        let resp = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Claude request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Claude returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Claude parse failed: {e}")))?;

        let content = data["content"]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|c| c["type"] == "text")
                    .and_then(|c| c["text"].as_str())
            })
            .unwrap_or_default()
            .to_string();

        let usage = data["usage"].as_object().map(|u| TokenUsage {
            prompt_tokens: u["input_tokens"].as_u64().unwrap_or(0) as u32,
            completion_tokens: u["output_tokens"].as_u64().unwrap_or(0) as u32,
            total_tokens: (u["input_tokens"].as_u64().unwrap_or(0)
                + u["output_tokens"].as_u64().unwrap_or(0))
                as u32,
        });

        let model = data["model"].as_str().unwrap_or(&self.model).to_string();

        Ok(AiResponse {
            content,
            tool_calls: vec![],
            usage: usage.unwrap_or(TokenUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            }),
            model,
        })
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        // Claude doesn't have a public models list endpoint.
        Ok(vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "claude".to_string(),
                supports_tools: true,
                is_free: false,
                tier: String::new(),
            },
            ModelInfo {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: "claude".to_string(),
                supports_tools: true,
                is_free: false,
                tier: String::new(),
            },
        ])
    }

    fn supports_tools(&self) -> bool {
        true
    }
}
