//! Shared helpers for OpenAI-compatible chat completion adapters
//! (OpenAI, OpenCode Zen, DeepSeek, Grok, Qwen, ...).
//!
//! Centralises the request body builder AND the response parser so fixes apply
//! to every OpenAI-format provider at once. The format is the OpenAI Chat
//! Completions API:
//! - Assistant tool-call messages use `content:null` + `tool_calls:[...]`.
//! - Tool results use `role:"tool"` + `tool_call_id:"..."` + content.

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiResponse, ChatMessage, TokenUsage, ToolCall, ToolDescriptor};

/// Build the OpenAI-format messages array, including a synthetic system
/// message when `system` is non-empty and honouring the assistant `tool_calls`
/// + tool-result conventions.
pub fn build_messages(system: &str, messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut result = Vec::with_capacity(messages.len() + 1);
    if !system.is_empty() {
        result.push(serde_json::json!({
            "role": "system",
            "content": system,
        }));
    }
    for msg in messages {
        if msg.role == "assistant" && !msg.tool_calls.is_empty() {
            let content_val = if msg.content.is_empty() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(msg.content.clone())
            };
            let tool_calls: Vec<serde_json::Value> = msg
                .tool_calls
                .iter()
                .map(|tc| {
                    serde_json::json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments_to_string(),
                        },
                    })
                })
                .collect();
            result.push(serde_json::json!({
                "role": "assistant",
                "content": content_val,
                "tool_calls": tool_calls,
            }));
            continue;
        }
        if msg.role == "tool" {
            if let Some(ref id) = msg.tool_call_id {
                result.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": id,
                    "content": msg.content,
                }));
                continue;
            }
        }
        result.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }
    result
}

/// Build the OpenAI-format `tools` array, or `None` if the slice is empty.
pub fn build_tools(tools: &[ToolDescriptor]) -> Option<Vec<serde_json::Value>> {
    if tools.is_empty() {
        return None;
    }
    Some(
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
            .collect(),
    )
}

/// Parse an OpenAI-compatible chat completion response. Used by the OpenAI,
/// DeepSeek, and OpenCode (Zen) adapters.
pub fn parse_response(data: &serde_json::Value, default_model: &str) -> AppResult<AiResponse> {
    let choice = data["choices"][0]["message"]
        .as_object()
        .ok_or_else(|| AppError::Internal("Missing choice in response".to_string()))?;

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
                        // OpenAI-compatible providers return `arguments` as a
                        // string-encoded JSON object. Normalise it to a real
                        // object here so tool executors can `args.get(...)`;
                        // fall back to the raw value if it cannot be parsed.
                        arguments: normalize_arguments(&tc["function"]["arguments"]),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let usage = data["usage"].as_object().map(|u| TokenUsage {
        prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
        completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
        total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
    });

    let model = data["model"].as_str().unwrap_or(default_model).to_string();

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

/// Normalise a provider tool-call `arguments` payload into a JSON object.
/// OpenAI-compatible providers send it as a string-encoded JSON object; if the
/// payload is already an object (or cannot be parsed) it is kept as-is.
fn normalize_arguments(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => {
            serde_json::from_str(s).unwrap_or_else(|_| serde_json::Value::String(s.clone()))
        }
        other => other.clone(),
    }
}

/// Callback invoked with each content delta as it streams in.
pub type OnDelta<'a> = &'a (dyn Fn(&str) + Send + Sync);

/// Streaming chat completion against an OpenAI-compatible endpoint (SSE).
/// Emits content deltas through `on_delta` as they arrive and returns the
/// fully assembled response (content + tool calls). Tool-call argument
/// fragments are accumulated per call index. Usage is not reported by most
/// providers when streaming, so token usage is zeroed.
pub async fn complete_streaming(
    client: &reqwest::Client,
    base_url: &str,
    api_key: Option<&str>,
    provider_label: &str,
    body: &serde_json::Value,
    model: &str,
    on_delta: OnDelta<'_>,
) -> AppResult<AiResponse> {
    use futures::StreamExt;

    let mut request_body = body.clone();
    request_body["stream"] = serde_json::Value::Bool(true);

    let mut req = client
        .post(format!("{base_url}/chat/completions"))
        .json(&request_body);
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        req = req.header("Authorization", format!("Bearer {key}"));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("{provider_label} request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "{provider_label} returned {status}: {text}"
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();
    // tool_calls keyed by their streamed index: (id, name, arguments-so-far).
    let mut tool_calls: std::collections::BTreeMap<u64, (String, String, String)> =
        std::collections::BTreeMap::new();
    let mut finish_model = model.to_string();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk
            .map_err(|e| AppError::Internal(format!("{provider_label} stream failed: {e}")))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // SSE events are separated by newlines; process every complete line.
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim_end_matches(['\n', '\r']);
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                continue;
            }
            let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            if let Some(m) = parsed["model"].as_str() {
                finish_model = m.to_string();
            }
            let delta = &parsed["choices"][0]["delta"];

            if let Some(text) = delta["content"].as_str() {
                if !text.is_empty() {
                    content.push_str(text);
                    on_delta(text);
                }
            }

            if let Some(tcs) = delta["tool_calls"].as_array() {
                for tc in tcs {
                    let index = tc["index"].as_u64().unwrap_or(0);
                    let entry = tool_calls.entry(index).or_default();
                    if let Some(id) = tc["id"].as_str() {
                        entry.0.push_str(id);
                    }
                    if let Some(name) = tc["function"]["name"].as_str() {
                        entry.1.push_str(name);
                    }
                    if let Some(args) = tc["function"]["arguments"].as_str() {
                        entry.2.push_str(args);
                    }
                }
            }
        }
    }

    let tool_calls: Vec<ToolCall> = tool_calls
        .into_values()
        .filter(|(_, name, _)| !name.is_empty())
        .map(|(id, name, args)| ToolCall {
            id,
            name,
            arguments: normalize_arguments(&serde_json::Value::String(args)),
        })
        .collect();

    Ok(AiResponse {
        content,
        tool_calls,
        usage: TokenUsage {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
        model: finish_model,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_messages, normalize_arguments, parse_response};
    use crate::models::assistant::ToolCall;

    #[test]
    fn normalizes_string_encoded_arguments() {
        let args = normalize_arguments(&serde_json::json!(
            "{\"connection_id\": \"abc\", \"sql\": \"SELECT 1\"}"
        ));
        assert_eq!(args["connection_id"], "abc");
        assert_eq!(args["sql"], "SELECT 1");
    }

    #[test]
    fn keeps_object_arguments_as_is() {
        let args = normalize_arguments(&serde_json::json!({
            "connection_id": "abc",
        }));
        assert_eq!(args["connection_id"], "abc");
    }

    #[test]
    fn keeps_unparseable_string() {
        let args = normalize_arguments(&serde_json::json!("not-json"));
        assert_eq!(args, serde_json::json!("not-json"));
    }

    #[test]
    fn parse_response_parses_tool_call_arguments() {
        let data = serde_json::json!({
            "choices": [{
                "message": {
                    "content": null,
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "query",
                            "arguments": "{\"connection_id\":\"c1\",\"sql\":\"SELECT 1\"}",
                        },
                    }],
                }
            }],
            "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 },
            "model": "test-model",
        });
        let resp = parse_response(&data, "fallback").unwrap();
        assert_eq!(resp.tool_calls.len(), 1);
        let tc = &resp.tool_calls[0];
        assert_eq!(tc.name, "query");
        assert_eq!(tc.arguments["connection_id"], "c1");
        assert_eq!(tc.arguments["sql"], "SELECT 1");
    }

    #[test]
    fn build_messages_serializes_arguments_back_to_string() {
        let tc = ToolCall {
            id: "call_1".to_string(),
            name: "query".to_string(),
            arguments: serde_json::json!({ "connection_id": "c1" }),
        };
        let msg = crate::models::assistant::ChatMessage {
            role: "assistant".to_string(),
            content: String::new(),
            tool_calls: vec![tc],
            ..Default::default()
        };
        let messages = build_messages("", &[msg]);
        assert!(
            messages[0]["tool_calls"][0]["function"]["arguments"]
                .as_str()
                .is_some(),
            "arguments must be re-serialized as a string for the provider"
        );
    }
}
