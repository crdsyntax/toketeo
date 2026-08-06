use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ChatMessage, ModelInfo, TokenUsage, ToolCall};

use super::AiAdapter;

pub struct OllamaAdapter {
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OllamaAdapter {
    pub fn new(model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model: model.unwrap_or_else(|| "llama3.2".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for OllamaAdapter {
    fn id(&self) -> &str {
        "ollama"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let messages = build_messages(&req.system, &req.messages);

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "stream": false,
            "options": {
                "temperature": req.temperature,
            },
        });

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Ollama returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama parse failed: {e}")))?;

        let message = data["message"]
            .as_object()
            .ok_or_else(|| AppError::Internal("Ollama: missing message".to_string()))?;

        let content = message
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        let tool_calls = message
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|tc| {
                        let function = tc["function"].as_object()?;
                        Some(ToolCall {
                            id: tc["id"].as_str().unwrap_or("ollama_tc").to_string(),
                            name: function["name"].as_str()?.to_string(),
                            arguments: function["arguments"].clone(),
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let total = data["eval_count"].as_u64().or_else(|| data["prompt_eval_count"].as_u64()).unwrap_or(0) as u32;

        Ok(AiResponse {
            content,
            tool_calls,
            usage: TokenUsage {
                prompt_tokens: data["prompt_eval_count"].as_u64().unwrap_or(0) as u32,
                completion_tokens: data["eval_count"].as_u64().unwrap_or(0) as u32,
                total_tokens: total,
            },
            model: data["model"].as_str().unwrap_or(&self.model).to_string(),
        })
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama models request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Internal("Failed to list Ollama models".to_string()));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama parse failed: {e}")))?;

        let models = data["models"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let name = m["name"].as_str()?.to_string();
                        Some(ModelInfo {
                            id: name.clone(),
                            name: name,
                            provider: "ollama".to_string(),
                            supports_tools: false,
                            is_free: false,
                            tier: String::new(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    fn supports_tools(&self) -> bool {
        false
    }
}

fn build_messages(system: &str, messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut result = Vec::new();
    if !system.is_empty() {
        result.push(serde_json::json!({
            "role": "system",
            "content": system,
        }));
    }
    for msg in messages {
        result.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }
    result
}
