use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ChatMessage, ModelInfo, TokenUsage, ToolCall};

use super::AiAdapter;

pub struct OpenAiAdapter {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OpenAiAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
            model: model.unwrap_or_else(|| "gpt-4o".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for OpenAiAdapter {
    fn id(&self) -> &str {
        "openai"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let messages = build_messages(&req.system, &req.messages);
        let tools = if req.tools.is_empty() {
            None
        } else {
            Some(build_tools(&req.tools))
        };

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
            .map_err(|e| AppError::Internal(format!("OpenAI request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenAI returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {e}")))?;

        let choice = data["choices"][0]["message"]
            .as_object()
            .ok_or_else(|| AppError::Internal("OpenAI: missing choice".to_string()))?;

        let content = choice
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        let tool_calls = choice
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|tc| {
                        Some(ToolCall {
                            id: tc["id"].as_str()?.to_string(),
                            name: tc["function"]["name"].as_str()?.to_string(),
                            arguments: tc["function"]["arguments"].clone(),
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let usage = data["usage"].as_object().map(|u| TokenUsage {
            prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
            completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
            total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
        });

        let model = data["model"].as_str().unwrap_or(&self.model).to_string();

        Ok(AiResponse {
            content,
            tool_calls,
            usage: usage.unwrap_or(TokenUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            }),
            model,
        })
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI models request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Internal("Failed to list OpenAI models".to_string()));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {e}")))?;

        let models = data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        let supports_tools = !id.starts_with("o1") && !id.starts_with("gpt-3.5");
                        Some(ModelInfo {
                            id: id.clone(),
                            name: id,
                            provider: "openai".to_string(),
                            supports_tools,
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

fn build_tools(tools: &[crate::models::assistant::ToolDescriptor]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            })
        })
        .collect()
}
