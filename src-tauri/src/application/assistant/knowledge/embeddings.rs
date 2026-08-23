//! Semantic embeddings for the assistant knowledge library.
//!
//! Responsibilities:
//! - Build a semantic *document* per knowledge type (QA / error) whose
//!   embedding represents the meaning of the knowledge, not just its question.
//! - Generate embeddings through an OpenAI-compatible provider endpoint
//!   (`POST {base_url}/embeddings`). When no embedding-capable provider is
//!   configured (or the call fails), retrieval degrades gracefully to
//!   lexical-only search.
//! - Vector math helpers for the brute-force in-memory index.

use crate::error::{AppError, AppResult};
use crate::models::assistant::{KnowledgeCase, ProviderConfig};

/// Embedding dimension used by this app. `text-embedding-3-small` returns
/// 1536; if the configured provider returns a different size we keep it —
/// the index stores `dim` per entry and skips mismatched comparisons.
#[derive(Debug, Clone)]
pub struct EmbeddingProvider {
    base_url: String,
    api_key: Option<String>,
    model: String,
}

impl EmbeddingProvider {
    /// Build from the first configured AI provider. Returns `None` when there
    /// is nothing usable (no config / no base URL resolvable).
    pub fn from_config(config: &ProviderConfig) -> Option<Self> {
        let base_url = match &config.base_url {
            Some(url) if !url.trim().is_empty() => url.trim().trim_end_matches('/').to_string(),
            _ => {
                // Known defaults per provider id (mirrors the adapters).
                match config.provider_id.as_str() {
                    "openai" => "https://api.openai.com/v1".to_string(),
                    "deepseek" => "https://api.deepseek.com/v1".to_string(),
                    "opencode" => "https://opencode.ai/zen/v1".to_string(),
                    _ => return None,
                }
            }
        };
        Some(Self {
            base_url,
            api_key: config.api_key.clone().filter(|k| !k.trim().is_empty()),
            // Small, cheap and widely available across OpenAI-compatible APIs.
            model: std::env::var("TOKETEO_EMBEDDING_MODEL")
                .unwrap_or_else(|_| "text-embedding-3-small".to_string()),
        })
    }

    /// Embed a batch of texts. Returns one vector per input, in order.
    pub async fn embed(&self, texts: Vec<String>) -> AppResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }
        let client = reqwest::Client::new();
        let mut req =
            client
                .post(format!("{}/embeddings", self.base_url))
                .json(&serde_json::json!({
                    "model": self.model,
                    "input": texts,
                }));
        if let Some(key) = &self.api_key {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Embedding request failed: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Embedding endpoint returned {status}: {}",
                body.chars().take(200).collect::<String>()
            )));
        }
        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Embedding parse failed: {e}")))?;
        let mut items: Vec<(usize, Vec<f32>)> = data["data"]
            .as_array()
            .ok_or_else(|| AppError::Internal("Missing data array in embedding response".into()))?
            .iter()
            .filter_map(|item| {
                let index = item["index"].as_u64()? as usize;
                let vec = item["embedding"]
                    .as_array()?
                    .iter()
                    .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                    .collect();
                Some((index, vec))
            })
            .collect();
        items.sort_by_key(|(i, _)| *i);
        if items.len() != texts.len() {
            return Err(AppError::Internal(
                "Embedding response count mismatch".into(),
            ));
        }
        Ok(items.into_iter().map(|(_, v)| v).collect())
    }

    pub async fn embed_one(&self, text: String) -> AppResult<Vec<f32>> {
        Ok(self.embed(vec![text]).await?.pop().unwrap_or_default())
    }
}

/// The kind of semantic document stored alongside each knowledge case.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KnowledgeKind {
    Qa,
    Error,
}

impl KnowledgeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Qa => "qa",
            Self::Error => "error",
        }
    }

    pub fn parse(s: &str) -> Self {
        if s == "error" {
            Self::Error
        } else {
            Self::Qa
        }
    }
}

/// Classify a knowledge case by its engine tag.
pub fn kind_of(case: &KnowledgeCase) -> KnowledgeKind {
    if case.engine == "error" {
        KnowledgeKind::Error
    } else {
        KnowledgeKind::Qa
    }
}

/// Build the semantic document that gets embedded. Different knowledge types
/// get different representations so the vector captures the meaning of the
/// whole piece of knowledge (question + SQL + rating, or error + context).
pub fn build_semantic_document(case: &KnowledgeCase) -> String {
    match kind_of(case) {
        KnowledgeKind::Qa => format!(
            "Engine: {}\n\nQuestion:\n{}\n\nSQL:\n{}\n\nRating:\n{}",
            case.engine, case.question, case.sql_text, case.rating
        ),
        KnowledgeKind::Error => {
            let error_text = case
                .question
                .strip_prefix("[error] ")
                .unwrap_or(&case.question);
            format!(
                "Engine: {}\n\nError:\n{}\n\nContext:\n{}",
                case.engine, error_text, case.sql_text
            )
        }
    }
}

/// Cosine similarity between two vectors. Returns 0 when dimensions differ or
/// either vector is zero-length.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let mut dot = 0f32;
    let mut norm_a = 0f32;
    let mut norm_b = 0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn qa_case() -> KnowledgeCase {
        KnowledgeCase {
            id: "1".into(),
            question: "¿Cómo obtengo las reservas pendientes?".into(),
            sql_text: "SELECT * FROM tb_reserva WHERE estado = 1;".into(),
            engine: "mysql".into(),
            rating: "positive".into(),
            used_count: 0,
            favorite: false,
        }
    }

    fn error_case() -> KnowledgeCase {
        KnowledgeCase {
            id: "2".into(),
            question: "[error] Unknown column 'estado_reserva'".into(),
            sql_text: "SELECT * FROM tb_reserva WHERE estado_reserva = 1".into(),
            // Errors are tagged engine="error" (see record_error_case).
            engine: "error".into(),
            rating: "unrated".into(),
            used_count: 0,
            favorite: false,
        }
    }

    #[test]
    fn qa_document_contains_all_parts() {
        let doc = build_semantic_document(&qa_case());
        assert!(doc.starts_with("Engine: mysql"));
        assert!(doc.contains("Question:\n¿Cómo obtengo"));
        assert!(doc.contains("SQL:\nSELECT * FROM tb_reserva"));
        assert!(doc.contains("Rating:\npositive"));
    }

    #[test]
    fn qa_document_not_treated_as_error() {
        assert_eq!(kind_of(&qa_case()), KnowledgeKind::Qa);
        assert_eq!(kind_of(&error_case()), KnowledgeKind::Error);
    }

    #[test]
    fn error_document_strips_prefix_and_has_context() {
        let doc = build_semantic_document(&error_case());
        assert!(doc.contains("Error:\nUnknown column 'estado_reserva'"));
        assert!(doc.contains("Context:\nSELECT * FROM tb_reserva"));
        assert!(!doc.contains("[error]"));
    }

    #[test]
    fn cosine_similarity_basic() {
        let a = [1.0f32, 0.0, 0.0];
        let b = [1.0f32, 0.0, 0.0];
        let c = [0.0f32, 1.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);
        assert!(cosine_similarity(&a, &c).abs() < 1e-6);
        assert_eq!(cosine_similarity(&a, &[1.0, 1.0]), 0.0); // dim mismatch
    }
}
