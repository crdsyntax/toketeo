use crate::error::AppResult;
use crate::state::AppState;

pub struct LearningEngine;

impl LearningEngine {
    pub async fn record_positive(
        state: &AppState,
        message_id: &str,
        connection_id: &str,
        engine: &str,
    ) -> AppResult<()> {
        let storage = state.storage.clone();
        storage
            .update_assistant_feedback(message_id, "positive")
            .await?;

        let messages = storage.load_assistant_messages(connection_id).await?;
        if let Some(msg) = messages.iter().find(|m| m.id == message_id) {
            if let Some(ref sql) = msg.sql {
                let idx = messages.iter().position(|m| m.id == message_id);
                if let Some(pos) = idx {
                    if pos > 0 {
                        let question = &messages[pos - 1].content;

                        let existing = storage.search_knowledge(question, Some(engine), 20).await?;
                        if existing
                            .iter()
                            .any(|c| c.rating == "positive" && c.sql_text == *sql)
                        {
                            return Ok(());
                        }
                        let id =
                            crate::application::assistant::knowledge::KnowledgeEngine::record_case(
                                &storage, question, sql, engine, "positive",
                            )
                            .await;
                        if let Ok(id) = id {
                            if let Ok(Some(case)) = storage.get_knowledge_case(&id).await {
                                AppState::spawn_index_knowledge(
                                    &storage,
                                    &state.knowledge_vectors,
                                    case,
                                );
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub async fn record_negative(
        state: &AppState,
        message_id: &str,
        connection_id: &str,
        engine: &str,
        _rejection_reason: Option<&str>,
        accepted_sql: Option<&str>,
    ) -> AppResult<()> {
        let storage = state.storage.clone();
        storage
            .update_assistant_feedback(message_id, "negative")
            .await?;

        if let Some(sql) = accepted_sql {
            let messages = storage.load_assistant_messages(connection_id).await?;
            if messages.iter().any(|m| m.id == message_id) {
                let idx = messages.iter().position(|m| m.id == message_id);
                if let Some(pos) = idx {
                    if pos > 0 {
                        let question = &messages[pos - 1].content;
                        let id =
                            crate::application::assistant::knowledge::KnowledgeEngine::record_case(
                                &storage, question, sql, engine, "negative",
                            )
                            .await;
                        if let Ok(id) = id {
                            if let Ok(Some(case)) = storage.get_knowledge_case(&id).await {
                                AppState::spawn_index_knowledge(
                                    &storage,
                                    &state.knowledge_vectors,
                                    case,
                                );
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
