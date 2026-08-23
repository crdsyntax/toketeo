use crate::models::assistant::{ChatMessage, Preference, SchemaContext};

pub struct PromptBuilder;

impl PromptBuilder {
    /// Build a system prompt describing the database schema and user preferences.
    ///
    /// `connections` is a slice of `(name, id)` tuples for every saved database
    /// connection — injected so the model can reference them when calling tools
    /// that accept a `connection_id` argument (e.g. `compare_schema`, `backup`).
    pub fn build_system_prompt(
        ctx: &SchemaContext,
        prefs: &[Preference],
        connections: &[(&str, &str)],
    ) -> String {
        let mut parts = vec![
            "You are a DBA assistant. You help users manage databases, compare schemas, run backups, \
             analyse performance, generate SQL, and execute database administration tasks. \
             You have access to a set of tools — use them whenever possible instead of \
             replying with plain text."
                .to_string(),
        ];

        if !connections.is_empty() {
            parts.push(String::new());
            parts.push("=== AVAILABLE CONNECTIONS ===".to_string());
            for (name, id) in connections {
                parts.push(format!("  {name}: connection_id = {id}"));
            }
            parts.push(
                "Use the connection_id values above when calling tools that require a connection."
                    .to_string(),
            );
        }

        parts.push(format!("Active database engine: {}", ctx.db_type));
        if let Some(ref v) = ctx.version {
            parts.push(format!("Version: {v}"));
        }
        if let Some(ref db) = ctx.database {
            parts.push(format!("Current database: {db}"));
        }

        if !ctx.tables.is_empty() {
            parts.push(String::new());
            parts.push("=== ACTIVE SCHEMA ===".to_string());
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
                    parts.push(format!(
                        "  {col_name} {col_type}{pk}{null}{def}",
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
        parts.push(
            "0. SCOPE DISCIPLINE — the most important rule. Execute ONLY the exact task the user \
             asked for in their current message. NEVER chain, combine or proactively add \
             unrelated operations. If the user asks to delete rows in database A, do NOT connect \
             other connections, do NOT run syncs, backups, exports or queries against any other \
             database. If you believe an EXTRA step is genuinely required, ask a single yes/no \
             question and wait — execute only what the user explicitly approved."
                .to_string(),
        );
        parts.push("1. Use the available TOOLS to execute tasks — do NOT explain how to do something, DO it.".to_string());
        parts.push("2. For schema comparisons call the `compare_schema` tool with source and target connection IDs.".to_string());
        parts.push(
            "3. For backups call the `backup` tool with a connection_id, schema, and file path."
                .to_string(),
        );
        parts.push(
            "4. For export call the `export` tool with a table name and format (sql/json)."
                .to_string(),
        );
        parts.push(
            "5. For index suggestions call the `index` tool with a table name and connection_id."
                .to_string(),
        );
        parts.push("6. For SQL explanations call the `explain` tool with a query.".to_string());
        parts.push("7. For cross-dialect DDL generation call the `auto_schema` tool with table name and target dialect.".to_string());
        parts.push("8. For database syncs call the `sync` tool with source_connection_id, target_connection_id, and optional tables + mode (full/incremental).".to_string());
        parts.push("9. Write only valid SQL for the specified engine.".to_string());
        parts.push("10. Use appropriate data types and functions.".to_string());
        parts.push(
            "11. Consider performance: prefer JOINs over subqueries when possible.".to_string(),
        );
        parts.push("12. If the user refers to the connection that is currently active in the app, call tools WITHOUT a connection_id — the active connection is used automatically. Only pass connection_id when the user asks for a DIFFERENT connection.".to_string());
        parts.push("13. When a tool reports that a connection is not active or that an operation needs approval, reply to the user with a single natural-language question (e.g. \"¿Conecto la conexión X?\" or \"¿Procedo con Y?\") and STOP calling tools until the user confirms. NEVER mention confirm_destructive, requires_confirmation, tool names, JSON payloads, or any internal mechanism.".to_string());
        parts.push("14. After a tool succeeds, reply ONLY with the requested data (e.g. the rows, counts or files) formatted readably — never raw JSON, never the tool output itself. If the operation failed, say briefly why it failed and suggest what the user could try next.".to_string());
        parts.push(
            "15. Stay strictly inside the scope the user named: if they mention a connection, \
             database, schema or table, operate ONLY on those objects. Derived-table cascades \
             (e.g. \"delete X and its derived tables\") are allowed only via foreign-key \
             relationships of the named table — never touch unrelated tables."
                .to_string(),
        );
        parts.push(
            "16. DESTRUCTIVE OPERATIONS — before running any DELETE, UPDATE, TRUNCATE or DROP \
             you MUST first tell the user exactly what will be affected: run a SELECT COUNT(*) \
             on the target table(s), state clearly that records WILL BE DELETED/MODIFIED, and \
             wait for explicit confirmation. Never execute them silently."
                .to_string(),
        );
        parts.push(
            "17. PRODUCTION connections are READ-ONLY for you: any attempt to INSERT, UPDATE, \
             DELETE, TRUNCATE, DROP or ALTER on a connection whose environment is production is \
             blocked by the system. Do not try it; explain that the change must be done manually."
                .to_string(),
        );
        parts.push(
            "18. BACKUP BEFORE MODIFYING — when the user asks to modify or delete rows \
             (any UPDATE/DELETE/TRUNCATE), FIRST propose creating a backup of the affected \
             table(s) with the `backup` tool and wait for the user's approval. Only after the \
             backup completes (or the user declines) proceed with the modification."
                .to_string(),
        );

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
            acc + Self::estimate_tokens(&t.name)
                + t.columns.len() * 8
                + t.indexes.len() * 6
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
        connections: &[(&str, &str)],
        history: &[ChatMessage],
        question: &str,
        max_tokens: u32,
    ) -> (Vec<ChatMessage>, usize) {
        let system_prompt = Self::build_system_prompt(ctx, prefs, connections);
        let system_tokens = Self::estimate_tokens(&system_prompt);

        let max_context_tokens = (max_tokens as usize).saturating_sub(system_tokens + 256);
        let ctx = Self::truncate_context(ctx, max_context_tokens);
        let system_prompt = Self::build_system_prompt(&ctx, prefs, connections);

        let mut messages = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
            ..Default::default()
        }];

        let mut history_tokens = 0;
        for msg in history {
            history_tokens += Self::estimate_tokens(&msg.content);
            messages.push(msg.clone());
        }

        messages.push(ChatMessage {
            role: "user".to_string(),
            content: question.to_string(),
            ..Default::default()
        });

        let total_tokens = system_tokens + history_tokens + Self::estimate_tokens(question);
        (messages, total_tokens)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> SchemaContext {
        SchemaContext {
            db_type: "postgresql".to_string(),
            version: None,
            database: Some("db_picer".to_string()),
            user: None,
            tables: vec![],
            views: vec![],
            procedures: vec![],
            triggers: vec![],
        }
    }

    #[test]
    fn system_prompt_contains_scope_discipline() {
        let prompt = PromptBuilder::build_system_prompt(&ctx(), &[], &[]);
        assert!(prompt.contains("SCOPE DISCIPLINE"));
        assert!(prompt.contains("NEVER chain, combine or proactively add"));
        // Rule 15 keeps operations inside the named scope.
        assert!(prompt.contains("Stay strictly inside the scope"));
    }

    #[test]
    fn system_prompt_lists_connection_ids() {
        let prompt =
            PromptBuilder::build_system_prompt(&ctx(), &[], &[("plesk postgres", "abc-123")]);
        assert!(prompt.contains("plesk postgres: connection_id = abc-123"));
    }
}
