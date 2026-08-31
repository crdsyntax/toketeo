use crate::error::AppResult;
use crate::models::assistant::KnowledgeCase;
use crate::storage::Storage;
use std::sync::Arc;

use super::embeddings::{build_semantic_document, kind_of, EmbeddingProvider};
use super::vector_index::VectorIndex;

pub struct HybridSearch {
    pub qa: Vec<(KnowledgeCase, f64)>,

    pub errors: Vec<KnowledgeCase>,
}

pub struct KnowledgeEngine;

impl KnowledgeEngine {
    pub async fn search(
        storage: &Storage,
        query: &str,
        engine: Option<&str>,
        limit: i64,
    ) -> AppResult<Vec<KnowledgeCase>> {
        storage.search_knowledge(query, engine, limit).await
    }

    pub async fn record_case(
        storage: &Arc<Storage>,
        question: &str,
        sql_text: &str,
        engine: &str,
        rating: &str,
    ) -> AppResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let case = KnowledgeCase {
            id: id.clone(),
            question: question.to_string(),
            sql_text: sql_text.to_string(),
            engine: engine.to_string(),
            rating: rating.to_string(),
            used_count: 0,
            favorite: false,
        };
        storage.save_knowledge_case(&case).await?;
        Ok(id)
    }

    pub async fn record_error_case(
        storage: &Arc<Storage>,
        error: &str,
        context: &str,
    ) -> AppResult<(String, bool)> {
        let question = format!("[error] {error}");

        let existing = storage
            .search_knowledge(&question, Some("error"), 20)
            .await?;
        if let Some(case) = existing.into_iter().find(|c| c.question == question) {
            return Ok((case.id, false));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let case = KnowledgeCase {
            id: id.clone(),
            question,
            sql_text: context.to_string(),
            engine: "error".to_string(),
            rating: "unrated".to_string(),
            used_count: 0,
            favorite: false,
        };
        storage.save_knowledge_case(&case).await?;
        Ok((id, true))
    }

    pub async fn purge_tool_cases(storage: &Arc<Storage>) -> AppResult<usize> {
        let cases = storage.list_knowledge_global(1000).await?;
        let mut removed = 0;
        for case in cases {
            if case.question.starts_with("[tool:") {
                storage.delete_knowledge_case(&case.id).await?;
                removed += 1;
            }
        }
        Ok(removed)
    }

    pub async fn hybrid_search<F>(
        storage: &Arc<Storage>,
        vectors: &VectorIndex,
        question: &str,
        threshold: f64,
        embed_query: F,
    ) -> AppResult<HybridSearch>
    where
        F: std::future::Future<Output = Option<Vec<f32>>>,
    {
        let words: Vec<String> = question
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.chars().count() >= 4)
            .take(8)
            .map(String::from)
            .collect();

        let (qa_candidates, error_candidates, query_embedding) = tokio::join!(
            storage.search_knowledge_by_words(&words, None, 200),
            storage.search_knowledge_by_words(&words, Some("error"), 50),
            embed_query,
        );
        let qa_candidates = qa_candidates.unwrap_or_default();
        let error_candidates = error_candidates.unwrap_or_default();

        let mut scores: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        for (case, score) in Self::find_similar_scored(question, &qa_candidates, threshold) {
            scores.insert(case.id.clone(), score);
        }
        for (case, score) in Self::find_similar_scored(question, &error_candidates, 0.6) {
            scores.insert(case.id.clone(), score);
        }

        if let Some(embedding) = query_embedding {
            if !embedding.is_empty() {
                for hit in vectors.search(&embedding, 15) {
                    let normalized = ((hit.similarity + 1.0) / 2.0) as f64;
                    scores
                        .entry(hit.knowledge_id)
                        .and_modify(|s| *s = (*s).max(normalized))
                        .or_insert(normalized);
                }
            }
        }

        let ids: Vec<String> = scores.keys().cloned().collect();
        let cases = storage.get_knowledge_cases_by_ids(&ids).await?;
        let mut qa: Vec<(KnowledgeCase, f64)> = vec![];
        let mut errors: Vec<KnowledgeCase> = vec![];
        for case in cases {
            let Some(score) = scores.get(&case.id).copied() else {
                continue;
            };
            if kind_of(&case) == super::embeddings::KnowledgeKind::Error {
                if score >= 0.6 {
                    errors.push(case);
                }
            } else if score >= threshold {
                qa.push((case, score));
            }
        }
        qa.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        qa.truncate(10);
        errors.truncate(5);

        Ok(HybridSearch { qa, errors })
    }

    pub async fn index_case(
        storage: &Arc<Storage>,
        vectors: &VectorIndex,
        provider: &EmbeddingProvider,
        case: &KnowledgeCase,
    ) {
        let doc = build_semantic_document(case);
        let Ok(vector) = provider.embed_one(doc).await else {
            return;
        };
        let kind = kind_of(case);
        if storage
            .upsert_knowledge_embedding(&case.id, kind.as_str(), &vector)
            .await
            .is_ok()
        {
            vectors.insert(case.id.clone(), kind, vector);
        }
    }

    pub fn find_similar<'a>(
        query: &str,
        cases: &'a [KnowledgeCase],
        threshold: f64,
    ) -> Vec<&'a KnowledgeCase> {
        Self::find_similar_scored(query, cases, threshold)
            .into_iter()
            .map(|(c, _)| c)
            .collect()
    }

    pub fn find_similar_scored<'a>(
        query: &str,
        cases: &'a [KnowledgeCase],
        threshold: f64,
    ) -> Vec<(&'a KnowledgeCase, f64)> {
        let query_lower = query.to_lowercase();
        let query_words: Vec<&str> = query_lower.split_whitespace().collect();

        if query_words.is_empty() {
            return vec![];
        }

        let mut scored: Vec<(&KnowledgeCase, f64)> = cases
            .iter()
            .map(|case| {
                let question_lower = case.question.to_lowercase();
                let matches = query_words
                    .iter()
                    .filter(|w| question_lower.contains(*w))
                    .count();
                let score = matches as f64 / query_words.len() as f64;
                (case, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        scored
            .into_iter()
            .filter(|(_, score)| *score >= threshold)
            .collect()
    }
}
