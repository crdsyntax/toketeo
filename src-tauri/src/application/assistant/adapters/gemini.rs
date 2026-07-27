use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo, TokenUsage};

use super::AiAdapter;

pub struct GeminiAdapter {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl GeminiAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| {
                "https://generativelanguage.googleapis.com".to_string()
            }),
            model: model.unwrap_or_else(|| "gemini-2.5-pro".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for GeminiAdapter {
    fn id(&self) -> &str {
        "gemini"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let mut gemini_contents: Vec<serde_json::Value> = Vec::new();

        let system_instruction = if !req.system.is_empty() {
            Some(serde_json::json!({
                "parts": [{ "text": req.system }]
            }))
        } else {
            None
        };

        for msg in &req.messages {
            let role = match msg.role.as_str() {
                "system" => "user",
                "assistant" => "model",
                _ => "user",
            };
            gemini_contents.push(serde_json::json!({
                "role": role,
                "parts": [{ "text": msg.content }],
            }));
        }

        let mut body = serde_json::json!({
            "contents": gemini_contents,
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": req.max_tokens.unwrap_or(4096),
            }
        });

        if let Some(ref si) = system_instruction {
            body["systemInstruction"] = si.clone();
        }

        let url = format!(
            "{}/v1/models/{}:generateContent?key={}",
            self.base_url, self.model, self.api_key
        );

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Gemini request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Gemini returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Gemini parse failed: {e}")))?;

        let content = data["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();

        let usage = data["usageMetadata"].as_object().map(|u| TokenUsage {
            prompt_tokens: u["promptTokenCount"].as_u64().unwrap_or(0) as u32,
            completion_tokens: u["candidatesTokenCount"].as_u64().unwrap_or(0) as u32,
            total_tokens: u["totalTokenCount"].as_u64().unwrap_or(0) as u32,
        });

        Ok(AiResponse {
            content,
            tool_calls: vec![],
            usage: usage.unwrap_or(TokenUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            }),
            model: self.model.clone(),
        })
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let url = format!(
            "{}/v1/models?key={}&pageSize=50",
            self.base_url, self.api_key
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Gemini models request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Internal(
                "Failed to list Gemini models".to_string(),
            ));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Gemini parse failed: {e}")))?;

        Ok(data["models"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["name"].as_str()?.to_string();
                        let short = id.split('/').last().unwrap_or(&id).to_string();
                        if short.starts_with("gemini") {
                            Some(ModelInfo {
                                id: short.clone(),
                                name: short,
                                provider: "gemini".to_string(),
                                supports_tools: false,
                            })
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    fn supports_tools(&self) -> bool {
        false
    }
}
