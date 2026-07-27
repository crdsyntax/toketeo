use crate::models::assistant::{ChatMessage, Preference, SchemaContext};

pub struct PromptBuilder;

impl PromptBuilder {
    /// Build a system prompt describing the database schema and user preferences.
    pub fn build_system_prompt(ctx: &SchemaContext, prefs: &[Preference]) -> String {
        let mut parts = vec![
            "You are a SQL assistant. You help users write, optimize, and understand SQL queries.".to_string(),
        ];

        parts.push(format!("Database engine: {}", ctx.db_type));
        if let Some(ref v) = ctx.version {
            parts.push(format!("Version: {v}"));
        }
        if let Some(ref db) = ctx.database {
            parts.push(format!("Current database: {db}"));
        }

        if !ctx.tables.is_empty() {
            parts.push(String::new());
            parts.push("=== SCHEMA ===".to_string());
            for table in &ctx.tables {
                parts.push(format!(
                    "\nTABLE {} ({} columns):",
                    table.name,
                    table.columns.len()
                ));

                for col in &table.columns {
                    let pk = if col.is_primary_key { " PK" } else { "" };
                    let null = if col.nullable { "" } else { " NOT NULL" };
                    let def = col
                        .default_value
                        .as_ref()
                        .map(|d| format!(" DEFAULT {d}"))
                        .unwrap_or_default();
                    parts.push(format!("  {col_name} {col_type}{pk}{null}{def}",
                        col_name = col.name,
                        col_type = col.col_type,
                    ));
                }

                if !table.indexes.is_empty() {
                    for idx in &table.indexes {
                        let uq = if idx.unique { " UNIQUE" } else { "" };
                        parts.push(format!(
                            "  INDEX {name}({cols}){uq} [{t}]",
                            name = idx.name,
                            cols = idx.columns.join(", "),
                            t = idx.index_type,
                        ));
                    }
                }

                if !table.foreign_keys.is_empty() {
                    for fk in &table.foreign_keys {
                        parts.push(format!(
                            "  FK {name}: {cols} -> {ref_table}({ref_cols})",
                            name = fk.constraint_name,
                            cols = fk.columns.join(", "),
                            ref_table = fk.referenced_table,
                            ref_cols = fk.referenced_columns.join(", "),
                        ));
                    }
                }
            }
        }

        if !ctx.views.is_empty() {
            parts.push(String::new());
            parts.push(format!("VIEWS ({}):", ctx.views.len()));
            for v in &ctx.views {
                parts.push(format!("  - {v}"));
            }
        }

        parts.push(String::new());
        parts.push("=== RULES ===".to_string());
        parts.push("1. Write only valid SQL for the specified engine.".to_string());
        parts.push("2. Use appropriate data types and functions.".to_string());
        parts.push("3. Consider performance: prefer JOINs over subqueries when possible.".to_string());
        parts.push("4. Use EXPLAIN / query plan analysis when asked.".to_string());
        parts.push("5. Return ONLY the SQL query in a code block when generating queries.".to_string());

        if !prefs.is_empty() {
            parts.push(String::new());
            parts.push("=== USER PREFERENCES ===".to_string());
            for p in prefs {
                parts.push(format!("  {key}: {value}", key = p.key, value = p.value));
            }
        }

        parts.join("\n")
    }

    /// Estimate token count (rough: 4 chars per token for English/SQL, ~1.3 for CJK).
    pub fn estimate_tokens(text: &str) -> usize {
        let ascii_count = text.chars().filter(|c| c.is_ascii()).count();
        let non_ascii_count = text.len() - ascii_count;
        ascii_count / 4 + non_ascii_count
    }

    /// Truncate context to fit within max_tokens, preserving the most relevant parts.
    pub fn truncate_context(ctx: &SchemaContext, max_context_tokens: usize) -> SchemaContext {
        let system_estimate = Self::estimate_tokens("");
        let remaining = max_context_tokens.saturating_sub(system_estimate);
        if remaining == 0 {
            return SchemaContext {
                tables: vec![],
                views: vec![],
                ..ctx.clone()
            };
        }

        let mut ctx = ctx.clone();
        let total_tokens = ctx.tables.iter().fold(0, |acc, t| {
            acc + Self::estimate_tokens(&t.name) + t.columns.len() * 8 + t.indexes.len() * 6
                + t.foreign_keys.len() * 8
        });

        if total_tokens <= remaining {
            return ctx;
        }

        let ratio = remaining as f64 / total_tokens.max(1) as f64;
        let keep_count = (ctx.tables.len() as f64 * ratio).ceil() as usize;
        ctx.tables.truncate(keep_count);
        ctx
    }

    /// Build the full chat message list (system + conversation + user question).
    pub fn build_messages(
        ctx: &SchemaContext,
        prefs: &[Preference],
        history: &[ChatMessage],
        question: &str,
        max_tokens: u32,
    ) -> (Vec<ChatMessage>, usize) {
        let system_prompt = Self::build_system_prompt(ctx, prefs);
        let system_tokens = Self::estimate_tokens(&system_prompt);

        let max_context_tokens = (max_tokens as usize).saturating_sub(system_tokens + 256);
        let ctx = Self::truncate_context(ctx, max_context_tokens);
        let system_prompt = Self::build_system_prompt(&ctx, prefs);

        let mut messages = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
        }];

        let mut history_tokens = 0;
        for msg in history {
            history_tokens += Self::estimate_tokens(&msg.content);
            messages.push(msg.clone());
        }

        messages.push(ChatMessage {
            role: "user".to_string(),
            content: question.to_string(),
        });

        let total_tokens = system_tokens + history_tokens + Self::estimate_tokens(question);
        (messages, total_tokens)
    }
}
