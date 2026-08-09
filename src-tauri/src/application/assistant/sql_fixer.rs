use crate::application::assistant::adapters::create_adapter;
use crate::application::assistant::context::relevance::RelevanceFilter;
use crate::application::assistant::orchestrator::extract_sql_blocks;
use crate::error::AppResult;
use crate::models::assistant::{
    AiRequest, ChatMessage, ProviderConfig, SchemaContext, SqlFixResult,
};
use crate::state::AppState;

/// Analyzes a failing SQL query together with the database error message and
/// asks the configured AI provider for a corrected query. The assistant is fed
/// the schema context of the current connection (tables + columns + foreign
/// keys) so it can infer the join relationships and produce the corrected
/// query plus safer alternatives. Kept in the application layer so the Tauri
/// command stays thin and the flow is testable.
pub struct SqlFixer<'a> {
    state: &'a AppState,
    connection_id: &'a str,
    sql: &'a str,
    error: &'a str,
    config: &'a ProviderConfig,
}

impl<'a> SqlFixer<'a> {
    pub fn new(
        state: &'a AppState,
        connection_id: &'a str,
        sql: &'a str,
        error: &'a str,
        config: &'a ProviderConfig,
    ) -> Self {
        Self {
            state,
            connection_id,
            sql,
            error,
            config,
        }
    }

    pub async fn run(self) -> AppResult<SqlFixResult> {
        let driver = if self.connection_id.is_empty() {
            None
        } else {
            self.state.get_connection(self.connection_id).await.ok()
        };

        let ctx = if let Some(ref driver) = driver {
            let db_type = driver.db_type();
            let conn_cfg = self
                .state
                .storage
                .get_connection(self.connection_id)
                .await
                .ok();
            let db_name = match db_type {
                crate::db::DbType::Sqlite => Some("main"),
                _ => conn_cfg.as_ref().and_then(|c| c.database.as_deref()),
            };
            self.state
                .schema_engine
                .get_or_build(self.connection_id, driver.as_ref(), db_name)
                .await
                .ok()
        } else {
            None
        };

        let ctx = match ctx {
            Some(ctx) => RelevanceFilter::filter(&ctx, self.sql),
            None => SchemaContext {
                db_type: "generic".to_string(),
                version: None,
                database: None,
                user: None,
                tables: vec![],
                views: vec![],
                procedures: vec![],
                triggers: vec![],
            },
        };

        let engine = if ctx.db_type.is_empty() {
            "SQL".to_string()
        } else {
            ctx.db_type.clone()
        };

        let system = format!(
            "You are an expert SQL assistant embedded in a database client (Toketeo). You fix \
             SQL queries that failed to execute and suggest improvements.\n\
             Database engine: {engine}\n\
             Schema context is provided in the user message — it lists each table with its \
             columns, primary keys and foreign keys (format: `col type PK`, `fks=[local->table(ref)]`). \
             USE IT to infer the join relationships and to fix wrong table or column names.\n\n\
             TASK:\n\
             1. Analyze the failing query and the database error message.\n\
             2. Provide the CORRECTED query first, inside a single ```sql fenced block. Keep the \
             semantics identical unless the error requires a change.\n\
             3. If the original query would return misleading or duplicated rows (e.g. a cartesian \
             product because a join condition is wrong or missing), provide 1 to 3 ALTERNATIVE \
             queries that are safer, each in its own ```sql fenced block (for example a subquery \
             / JSON aggregation that avoids duplicates, or a LEFT JOIN that keeps unmatched rows).\n\
             4. Before each SQL block write a short label describing that variant on its own line \
             (e.g. `1. Corrected query` / `2. Subquery avoiding duplicates` / `3. LEFT JOIN`).\n\
             5. Use the exact table and column names from the schema context, and qualify ambiguous \
             columns with their table alias.\n\
             6. After the last SQL block, add a brief explanation (1-3 sentences) of what was wrong.\n\n\
             FORMAT:\n\
             <label of variant 1>\n```sql\n<query 1>\n```\n\
             <label of variant 2>\n```sql\n<query 2>\n```\n\n\
             Rules:\n\
             - Do NOT put explanation text inside the ```sql blocks; they must contain SQL only.\n\
             - If you cannot fix the query with confidence, do not emit any SQL block; just explain why."
        );

        let schema_text = format_schema(&ctx);
        let user = format!(
            "The following query failed to execute:\n```sql\n{0}\n```\n\nDatabase error:\n{1}\n\n{2}\n\n\
             Return the corrected query, any useful alternatives, and the explanation.",
            self.sql, self.error, schema_text
        );

        let adapter = create_adapter(self.config)?;
        let request = AiRequest {
            system,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: user,
                ..Default::default()
            }],
            tools: vec![],
            temperature: 0.2,
            max_tokens: Some(4096),
        };

        let response = adapter.complete(request).await?;

        let blocks = extract_sql_blocks(&response.content);
        match blocks.first() {
            Some(sql) => Ok(SqlFixResult {
                sql: Some(sql.clone()),
                alternatives: blocks.iter().skip(1).cloned().collect(),
                explanation: explanation_from_answer(&response.content),
                status: "ok".to_string(),
            }),
            None => Ok(SqlFixResult {
                sql: None,
                alternatives: vec![],
                explanation: response.content,
                status: "failed".to_string(),
            }),
        }
    }
}

/// Compact, model-friendly representation of the filtered schema context.
fn format_schema(ctx: &SchemaContext) -> String {
    if ctx.tables.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Schema context:".to_string()];
    for t in &ctx.tables {
        let cols: Vec<String> = t
            .columns
            .iter()
            .map(|c| {
                let mut s = format!("{} {}", c.name, c.col_type);
                if c.is_primary_key {
                    s.push_str(" PK");
                }
                if !c.nullable {
                    s.push_str(" NOT NULL");
                }
                s
            })
            .collect();
        let fks: Vec<String> = t
            .foreign_keys
            .iter()
            .map(|f| {
                format!(
                    "{}->{}({})",
                    f.columns.join(","),
                    f.referenced_table,
                    f.referenced_columns.join(",")
                )
            })
            .collect();
        let mut line = format!("- {}: [{}]", t.name, cols.join(", "));
        if !fks.is_empty() {
            line.push_str(&format!(" fks=[{}]", fks.join(", ")));
        }
        lines.push(line);
    }
    lines.join("\n")
}

/// Return the answer with every ```sql fenced block removed (the explanation).
fn explanation_from_answer(answer: &str) -> String {
    let re = regex::Regex::new(r"(?is)```sql\s*[\s\S]*?```").unwrap();
    let stripped = re.replace_all(answer, "\n").to_string();
    let lines: Vec<String> = stripped
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();
    let text = lines.join("\n");
    if text.is_empty() {
        "The query was corrected.".to_string()
    } else {
        text
    }
}

#[cfg(test)]
mod tests {
    use super::explanation_from_answer;

    #[test]
    fn extracts_explanation_after_sql_block() {
        let answer = "```sql\nSELECT * FROM t;\n```\nThe WHERE clause was misplaced.";
        assert_eq!(
            explanation_from_answer(answer),
            "The WHERE clause was misplaced."
        );
    }

    #[test]
    fn returns_whole_answer_when_no_sql_block() {
        assert_eq!(explanation_from_answer("just text"), "just text");
    }

    #[test]
    fn returns_default_when_only_sql_block() {
        assert_eq!(
            explanation_from_answer("```sql\nSELECT 1;\n```"),
            "The query was corrected."
        );
    }

    #[test]
    fn strips_all_sql_blocks_keeping_labels() {
        let answer = "1. Direct:\n```sql\nSELECT 1;\n```\n2. Subquery:\n```sql\nSELECT 2;\n```\nUse the first one.";
        assert_eq!(
            explanation_from_answer(answer),
            "1. Direct:\n2. Subquery:\nUse the first one."
        );
    }
}
