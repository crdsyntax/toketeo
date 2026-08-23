use crate::error::AppResult;
use crate::models::assistant::KnowledgeCase;
use crate::storage::Storage;
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

    /// Record an application error into the knowledge library so the agent can
    /// learn from it and recognize recurrences. Deduplicates by exact error
    /// message within the "error" engine. Returns the case id and whether the
    /// case was newly created.
    pub async fn record_error_case(
        storage: &Arc<Storage>,
        error: &str,
        context: &str,
    ) -> AppResult<(String, bool)> {
        let question = format!("[error] {error}");
        // Dedupe: skip if an identical error is already stored.
        let existing = storage.search_knowledge(&question, "error", 20).await?;
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

    /// Remove knowledge cases that were previously auto-recorded from tool
    /// results (question prefixed with `[tool:`). Those polluted the library
    /// with raw JSON payloads that are never useful as validated SQL answers.
    /// Returns how many cases were removed.
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
