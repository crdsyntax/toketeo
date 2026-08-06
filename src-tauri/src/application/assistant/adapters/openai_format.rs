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
