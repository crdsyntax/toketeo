use crate::models::assistant::KnowledgeCase;
use crate::storage::Storage;
use crate::error::AppResult;
use std::sync::Arc;

pub struct KnowledgeEngine;

impl KnowledgeEngine {
    /// Search knowledge cases by text similarity (LIKE-based).
    pub async fn search(
        storage: &Storage,
        query: &str,
        engine: &str,
        limit: i64,
    ) -> AppResult<Vec<KnowledgeCase>> {
        storage.search_knowledge(query, engine, limit).await
    }

    /// Record a new knowledge case from a successful QA pair.
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

    /// Find similar existing cases based on keyword overlap.
    /// Returns references ranked by descending score (filtered to ≥ threshold).
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

    /// Same as [find_similar] but keeps the similarity score for each match.
    /// Used by `assistant_chat` for short-circuiting high-confidence hits and
    /// for ranking candidates injected into the system prompt.
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
