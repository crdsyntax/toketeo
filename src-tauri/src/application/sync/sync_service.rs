use crate::application::sync::extractors::{DataExtractor, MongoExtractor, SqlExtractor};
use crate::application::sync::strategies::{FullSync, IncrementalSync, SyncEvent, SyncStrategy};
use crate::application::sync::validators::PipelineValidator;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::sync::{SyncMode, SyncPipeline, SyncTableConfig, ValidationReport};
use crate::state::SyncController;
use crate::storage::Storage;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

const DEFAULT_BATCH_SIZE: usize = 1000;

pub struct SyncService;

impl SyncService {
    pub async fn execute_pipeline(
        pipeline: &SyncPipeline,
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        storage: Arc<Storage>,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
        controller: &SyncController,
    ) -> AppResult<()> {
        let source_db_type = source.db_type();
        let target_db_type = target.db_type();

        let effective_source_schema = if source_db_type == DbType::Postgres {
            match Self::detect_source_schema(
                source,
                &pipeline.tables,
                pipeline.source_schema.as_deref(),
            )
            .await
            {
                Some(s) => Some(s),
                None => {
                    tracing::error!(
                        "[sync] No source table of the pipeline was found in ANY schema — aborting pipeline"
                    );
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::Error {
                            message:
                                "No source table of the pipeline was found in any schema on the source database"
                                    .to_string(),
                        });
                    }
                    return Err(crate::error::AppError::Validation(
                        "No source table of the pipeline was found in any schema on the source database"
                            .into(),
                    ));
                }
            }
        } else {
            pipeline.source_schema.clone()
        };

        if let Some(first_table) = pipeline.tables.first() {
            match source
                .fetch_ddl(
                    &first_table.source_table,
                    "table",
                    effective_source_schema.clone(),
                )
                .await
            {
                Ok(ref ddl) => {
                    tracing::info!(
                        "[sync] Source connection verified for table '{}', DDL preview: {:?}",
                        first_table.source_table,
                        &ddl[..ddl.len().min(80)]
                    );
                }
                Err(e) => {
                    tracing::error!("[sync] Source connection failed: {} — aborting pipeline", e);
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::Error {
                            message: format!("Source connection error: {}", e),
                        });
                    }
                    return Err(e);
                }
            }
        }

        let extractor: Box<dyn DataExtractor + '_> = match source_db_type {
            DbType::Mongodb => Box::new(MongoExtractor::new(source)),
            _ => Box::new(SqlExtractor::new(source)),
        };

        let strategy: Box<dyn SyncStrategy> = match pipeline.mode {
            SyncMode::Incremental => Box::new(IncrementalSync),
            SyncMode::Full => Box::new(FullSync),
        };

        let effective_batch_size = if pipeline.batch_size == 0 {
            DEFAULT_BATCH_SIZE
        } else {
            pipeline.batch_size
        };

        let mut pipeline_clone = pipeline.clone();
        pipeline_clone.source_schema = effective_source_schema;
        pipeline_clone.batch_size = effective_batch_size;

        let pipeline_id = pipeline_clone.id.clone().unwrap_or_default();

        let total_tables = pipeline_clone.tables.len() as u32;
        let mut pipeline_errors: u32 = 0;

        tracing::info!(
            "[sync] Starting pipeline '{}' with {} tables, mode={:?}, batch_size={}",
            pipeline_clone.name,
            total_tables,
            pipeline_clone.mode,
            effective_batch_size,
        );

        if controller.get(&pipeline_id).await == Some(crate::state::SyncControl::Cancelled) {
            tracing::info!(
                "[sync] Pipeline '{}' cancelled before starting",
                pipeline_clone.name
            );
            controller.remove(&pipeline_id).await;
            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::Error {
                    message: "Pipeline cancelled".to_string(),
                });
            }
            return Ok(());
        }

        for (idx, table_config) in pipeline_clone.tables.iter().enumerate() {
            if controller.get(&pipeline_id).await == Some(crate::state::SyncControl::Cancelled) {
                tracing::info!(
                    "[sync] Pipeline cancelled before table {}",
                    table_config.source_table
                );
                break;
            }

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::TableStarted {
                    table: table_config.source_table.clone(),
                    table_index: idx as u32 + 1,
                    total_tables,
                });
            }

            tracing::info!(
                "[sync] Processing table {}/{}: {} -> {}",
                idx + 1,
                total_tables,
                table_config.source_table,
                table_config.target_table,
            );

            let target_tables = target
                .fetch_tables(pipeline_clone.target_schema.clone(), None)
                .await
                .unwrap_or_default();
            let table_exists = target_tables
                .iter()
                .any(|t| t.eq_ignore_ascii_case(&table_config.target_table));

            if !table_exists {
                tracing::info!(
                    "[sync] Target table '{}' not found — creating from source",
                    table_config.target_table,
                );

                let source_ddl = source
                    .fetch_ddl(
                        &table_config.source_table,
                        "table",
                        pipeline_clone.source_schema.clone(),
                    )
                    .await;

                let create_sql = if source_db_type == DbType::Mongodb {
                    None
                } else {
                    match source_ddl {
                        Ok(ref ddl) if ddl.contains("CREATE") && ddl.contains('(') => {
                            let target_ref = match pipeline_clone.target_schema.as_deref() {
                                Some(s) => format!(
                                    "{}.{}",
                                    quote_for_target(&target_db_type, s),
                                    quote_for_target(&target_db_type, &table_config.target_table)
                                ),
                                None => {
                                    quote_for_target(&target_db_type, &table_config.target_table)
                                }
                            };
                            let ddl_body = &ddl[ddl.find('(').unwrap()..];
                            let sanitized_body = sanitize_ddl_for_target(ddl_body);
                            Some(format!(
                                "CREATE TABLE IF NOT EXISTS {}{}",
                                target_ref, sanitized_body
                            ))
                        }
                        Ok(ref ddl) => {
                            tracing::warn!("[sync] DDL for '{}' is not valid, falling back to column metadata: {:?}", table_config.source_table, &ddl[..ddl.len().min(80)]);
                            None
                        }
                        Err(e) => {
                            tracing::warn!(
                                "[sync] Could not read DDL for source table '{}': {}",
                                table_config.source_table,
                                e
                            );
                            None
                        }
                    }
                };

                let create_sql = match create_sql {
                    Some(sql) => Some(sql),
                    None => {
                        let col_info = if source_db_type == DbType::Postgres {
                            fetch_pg_columns(
                                source,
                                &table_config.source_table,
                                pipeline_clone.source_schema.as_deref(),
                            )
                            .await
                        } else {
                            fetch_generic_columns(
                                source,
                                &table_config.source_table,
                                pipeline_clone.source_schema.as_deref(),
                            )
                            .await
                        };

                        match col_info {
                            Ok(columns) if !columns.is_empty() => Some(build_create_table_sql(
                                &target_db_type,
                                &source_db_type,
                                pipeline_clone.target_schema.as_deref(),
                                &table_config.target_table,
                                &columns,
                            )),
                            _ => {
                                tracing::warn!("[sync] Could not read columns for source table '{}', skipping creation", table_config.source_table);
                                None
                            }
                        }
                    }
                };

                let mut table_created = false;
                if let Some(ref create_sql) = create_sql {
                    tracing::info!("[sync] Creating target table SQL: {}", create_sql);
                    match target.execute(create_sql).await {
                        Ok(_) => {
                            tracing::info!(
                                "[sync] Created target table '{}'",
                                table_config.target_table
                            );
                            table_created = true;
                        }
                        Err(e) => {
                            tracing::error!("[sync] Failed to create target table '{}': {} — trying column metadata fallback", table_config.target_table, e);

                            let col_info = if source_db_type == DbType::Postgres {
                                fetch_pg_columns(
                                    source,
                                    &table_config.source_table,
                                    pipeline_clone.source_schema.as_deref(),
                                )
                                .await
                            } else {
                                fetch_generic_columns(
                                    source,
                                    &table_config.source_table,
                                    pipeline_clone.source_schema.as_deref(),
                                )
                                .await
                            };

                            if let Ok(columns) = col_info {
                                if !columns.is_empty() {
                                    let fallback_sql = build_create_table_sql(
                                        &target_db_type,
                                        &source_db_type,
                                        pipeline_clone.target_schema.as_deref(),
                                        &table_config.target_table,
                                        &columns,
                                    );
                                    tracing::info!(
                                        "[sync] Fallback CREATE TABLE SQL: {}",
                                        fallback_sql
                                    );
                                    match target.execute(&fallback_sql).await {
                                        Ok(_) => {
                                            tracing::info!("[sync] Created target table '{}' from column metadata", table_config.target_table);
                                            table_created = true;
                                        }
                                        Err(e2) => tracing::error!(
                                            "[sync] Fallback also failed for '{}': {}",
                                            table_config.target_table,
                                            e2
                                        ),
                                    }
                                }
                            }
                        }
                    }
                }

                if !table_created {
                    tracing::error!(
                        "[sync] Target table '{}' could not be created — skipping table sync",
                        table_config.target_table,
                    );
                    pipeline_errors += 1;
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::RowError {
                            table: table_config.source_table.clone(),
                            row_key: None,
                            error: format!(
                                "Target table '{}' could not be created",
                                table_config.target_table
                            ),
                        });
                    }
                    continue;
                }
            }

            if let Err(e) = Self::ensure_target_columns(
                source,
                target,
                &source_db_type,
                &target_db_type,
                table_config,
                pipeline_clone.source_schema.as_deref(),
                pipeline_clone.target_schema.as_deref(),
            )
            .await
            {
                tracing::warn!(
                    "[sync] Column reconciliation failed for '{}': {} — continuing",
                    table_config.source_table,
                    e,
                );
            }

            match strategy
                .execute(
                    &pipeline_clone,
                    table_config,
                    extractor.as_ref(),
                    target,
                    storage.clone(),
                    event_sender.clone(),
                    controller,
                )
                .await
            {
                Ok(output) => {
                    if let Err(e) = storage.save_sync_run(&output.run).await {
                        tracing::error!("[sync] Failed to persist sync run: {e}");
                    }

                    tracing::info!(
                        "[sync] Table {} completed: {} rows in {} batches, {} errors",
                        table_config.source_table,
                        output.total_rows,
                        output.batch_count,
                        output.error_count,
                    );

                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::PhaseCompleted {
                            table: table_config.source_table.clone(),
                            total_rows: output.total_rows,
                        });
                    }
                }
                Err(e) => {
                    pipeline_errors += 1;
                    tracing::error!(
                        "[sync] Table {} failed: {} — skipping and continuing with next table",
                        table_config.source_table,
                        e,
                    );
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::RowError {
                            table: table_config.source_table.clone(),
                            row_key: None,
                            error: format!("Table sync failed: {}", e),
                        });
                    }
                }
            }
        }

        controller.remove(&pipeline_id).await;

        if pipeline_errors == 0 {
            if let Err(e) = storage.delete_sync_checkpoints(&pipeline_id).await {
                tracing::warn!(
                    "[sync] Failed to clean up sync checkpoints for pipeline '{pipeline_id}': {e}"
                );
            }
        }

        tracing::info!(
            "[sync] Pipeline '{}' finished: {}/{} tables completed, {} table errors",
            pipeline_clone.name,
            total_tables.saturating_sub(pipeline_errors),
            total_tables,
            pipeline_errors,
        );

        if pipeline_errors > 0 {
            let message = format!(
                "Pipeline '{}' finished with {}/{} tables in error — checkpoints preserved, re-run the pipeline to resume from where it stopped",
                pipeline_clone.name,
                pipeline_errors,
                total_tables,
            );
            tracing::error!("[sync] {message}");
            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::Error {
                    message: message.clone(),
                });
            }
            return Err(crate::error::AppError::Internal(message));
        }

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Completed {});
        }

        Ok(())
    }

    async fn ensure_target_columns(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        source_db_type: &DbType,
        target_db_type: &DbType,
        table_config: &SyncTableConfig,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
    ) -> AppResult<()> {
        let source_cols = source
            .fetch_columns(&table_config.source_table, source_schema.map(String::from))
            .await?;
        if source_cols.is_empty() {
            return Ok(());
        }

        let needed: Vec<(String, serde_json::Value)> = if table_config.column_mappings.is_empty() {
            source_cols
                .iter()
                .filter_map(|c| {
                    let name = c.get("name").and_then(|v| v.as_str())?;
                    Some((name.to_string(), c.clone()))
                })
                .collect()
        } else {
            let src_by_name: HashMap<&str, &serde_json::Value> = source_cols
                .iter()
                .filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(|n| (n, c)))
                .collect();
            table_config
                .column_mappings
                .iter()
                .filter_map(|m| {
                    src_by_name
                        .get(m.source_column.as_str())
                        .map(|c| (m.destination_column.clone(), (*c).clone()))
                })
                .collect()
        };
        if needed.is_empty() {
            return Ok(());
        }

        let target_cols = target
            .fetch_columns(&table_config.target_table, target_schema.map(String::from))
            .await?;
        let target_col_map: HashMap<String, &serde_json::Value> = target_cols
            .iter()
            .filter_map(|c| {
                c.get("name")
                    .and_then(|v| v.as_str())
                    .map(|n| (n.to_lowercase(), c))
            })
            .collect();

        let target_ref = match target_schema {
            Some(s) => format!(
                "{}.{}",
                quote_for_target(target_db_type, s),
                quote_for_target(target_db_type, &table_config.target_table)
            ),
            None => quote_for_target(target_db_type, &table_config.target_table),
        };
        let needs_add_column = matches!(target_db_type, DbType::Mysql | DbType::Mariadb);

        for (dest_name, src_col) in &needed {
            let dest_lower = dest_name.to_lowercase();

            if let Some(target_col) = target_col_map.get(&dest_lower) {
                let src_nullable = src_col
                    .get("isNullable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let tgt_nullable = target_col
                    .get("isNullable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                if src_nullable && !tgt_nullable {
                    Self::relax_not_null(
                        target,
                        target_db_type,
                        &target_ref,
                        &table_config.target_table,
                        dest_name,
                        target_col,
                    )
                    .await;
                }
                continue;
            }

            let src_type = src_col
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("text");
            let max_len = src_col
                .get("maxLength")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            let sql_type = map_column_type(source_db_type, src_type, max_len, target_db_type);
            let col_def = format!(
                "{} {}",
                quote_for_target(target_db_type, dest_name),
                sql_type
            );
            let keyword = if needs_add_column {
                "ADD COLUMN"
            } else {
                "ADD"
            };
            let alter = format!("ALTER TABLE {} {} {}", target_ref, keyword, col_def);

            match target.execute(&alter).await {
                Ok(_) => {
                    tracing::info!(
                        "[sync] Created missing target column '{}' on '{}' ({})",
                        dest_name,
                        table_config.target_table,
                        sql_type,
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        "[sync] Could not create target column '{}' on '{}': {}",
                        dest_name,
                        table_config.target_table,
                        e,
                    );
                }
            }
        }

        Ok(())
    }

    async fn relax_not_null(
        target: &dyn DbDriver,
        target_db_type: &DbType,
        target_ref: &str,
        target_table: &str,
        dest_name: &str,
        target_col: &serde_json::Value,
    ) {
        let sql = match target_db_type {
            DbType::Postgres => format!(
                "ALTER TABLE {} ALTER COLUMN {} DROP NOT NULL",
                target_ref,
                quote_for_target(target_db_type, dest_name)
            ),
            DbType::Mysql | DbType::Mariadb => {
                let col_type = target_col
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("TEXT");
                format!(
                    "ALTER TABLE {} MODIFY COLUMN {} {} NULL",
                    target_ref,
                    quote_for_target(target_db_type, dest_name),
                    col_type
                )
            }
            _ => return,
        };
        match target.execute(&sql).await {
            Ok(_) => tracing::info!(
                "[sync] Relaxed NOT NULL on target column '{}' of '{}' (source is nullable)",
                dest_name,
                target_table,
            ),
            Err(e) => tracing::warn!(
                "[sync] Could not relax NOT NULL on target column '{}' of '{}': {}",
                dest_name,
                target_table,
                e,
            ),
        }
    }

    pub async fn validate(
        pipeline: &SyncPipeline,
        source: &dyn DbDriver,
        target: &dyn DbDriver,
    ) -> AppResult<ValidationReport> {
        PipelineValidator::validate(pipeline, source, target).await
    }

    pub(crate) async fn detect_source_schema(
        source: &dyn DbDriver,
        tables: &[SyncTableConfig],
        configured: Option<&str>,
    ) -> Option<String> {
        if tables.is_empty() {
            return configured.filter(|s| !s.is_empty()).map(String::from);
        }

        let configured_schema = configured.filter(|s| !s.is_empty()).unwrap_or("public");
        if check_pg_table_exists(source, &tables[0].source_table, configured_schema)
            .await
            .unwrap_or(false)
        {
            tracing::info!(
                "[sync] Schema '{}' is correct for table '{}'",
                configured_schema,
                tables[0].source_table
            );
            return Some(configured_schema.to_string());
        }

        let quoted: Vec<String> = tables
            .iter()
            .map(|t| format!("'{}'", t.source_table.replace('\'', "''")))
            .collect();
        let query = format!(
            "SELECT n.nspname AS schema_name, count(*) AS table_count \
             FROM pg_catalog.pg_class c \
             JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid \
             WHERE c.relname IN ({}) AND c.relkind IN ('r','p') \
               AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') \
             GROUP BY n.nspname \
             ORDER BY table_count DESC \
             LIMIT 1",
            quoted.join(", ")
        );
        if let Ok(result) = source.execute(&query).await {
            if let Some(row) = result.rows.first() {
                if let Some(schema) = row.get("schema_name").and_then(|v| v.as_str()) {
                    tracing::info!(
                        "[sync] Auto-detected source schema '{}' (was configured as '{}')",
                        schema,
                        configured_schema
                    );
                    return Some(schema.to_string());
                }
            }
        }

        find_pg_schema_for_table(source, &tables[0].source_table).await
    }
}

fn quote_for_target(db_type: &DbType, name: &str) -> String {
    match db_type {
        DbType::Postgres => crate::db::postgres::quote_pg(name),
        DbType::Mysql | DbType::Mariadb => crate::db::mysql::quote_mysql(name),
        DbType::Sqlserver => crate::db::sqlserver::quote_ss(name),
        DbType::Sqlite => crate::db::sqlite::quote_sqlite(name),
        _ => name.to_string(),
    }
}

type ColInfo = (String, String, bool, bool, Option<usize>);

fn bson_type_to_sql(bson_type: &str, max_len: Option<usize>, target_db_type: &DbType) -> String {
    let t = bson_type.trim().trim_matches('"');
    let pg = matches!(target_db_type, DbType::Postgres);
    match t {
        "ObjectId" | "ObjectID" => "VARCHAR(48)".into(),
        "String" | "Utf8" => {
            let max = max_len.unwrap_or(0);
            if max > 0 && max <= 255 {
                format!("VARCHAR({})", max.max(16))
            } else if max > 255 && max <= 16384 {
                format!("VARCHAR({})", max)
            } else if pg {
                "VARCHAR".into()
            } else {
                "TEXT".into()
            }
        }
        "Int32" | "I32" => if pg { "INTEGER" } else { "INT" }.into(),
        "Int64" | "I64" | "Long" => "BIGINT".into(),
        "Double" | "F64" => if pg { "DOUBLE PRECISION" } else { "DOUBLE" }.into(),
        "Boolean" | "Bool" => if pg { "BOOLEAN" } else { "TINYINT(1)" }.into(),
        "DateTime" | "Date" | "Timestamp" => if pg { "TIMESTAMP" } else { "DATETIME" }.into(),
        "Binary" | "BinData" => if pg { "BYTEA" } else { "LONGBLOB" }.into(),

        "Array" | "EmbeddedDocument" | "Document" | "Object" => {
            if pg { "JSONB" } else { "JSON" }.into()
        }
        "Decimal128" | "Decimal" => "DECIMAL(38,18)".into(),
        "Null" | "Undefined" => "TEXT".into(),
        "RegularExpression" | "Regex" => "TEXT".into(),
        "JavaScript" | "JavaScriptWithScope" | "Symbol" | "Code" => "TEXT".into(),
        "MinKey" | "MaxKey" | "DbPointer" => "TEXT".into(),
        _ => "TEXT".into(),
    }
}

fn map_column_type(
    source_db_type: &DbType,
    col_type: &str,
    max_len: Option<usize>,
    target_db_type: &DbType,
) -> String {
    if *source_db_type == DbType::Mongodb {
        bson_type_to_sql(col_type, max_len, target_db_type)
    } else {
        quote_pg_type(col_type)
    }
}

fn build_create_table_sql(
    target_db_type: &DbType,
    source_db_type: &DbType,
    target_schema: Option<&str>,
    target_table: &str,
    columns: &[ColInfo],
) -> String {
    let mut col_defs = Vec::new();
    let mut pk_cols = Vec::new();

    for (col_name, col_type, is_nullable, is_pk, max_len) in columns {
        let sql_type = map_column_type(source_db_type, col_type, *max_len, target_db_type);
        let mut def = format!(
            "    {} {}",
            quote_for_target(target_db_type, col_name),
            sql_type
        );
        if !*is_nullable {
            def.push_str(" NOT NULL");
        }
        col_defs.push(def);
        if *is_pk {
            pk_cols.push(quote_for_target(target_db_type, col_name));
        }
    }

    let can_use_pk = *source_db_type != DbType::Mongodb && !pk_cols.is_empty();
    if can_use_pk {
        col_defs.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
    } else if *source_db_type == DbType::Mongodb && !pk_cols.is_empty() {
        let id_col = columns.iter().find(|c| c.0 == "_id");
        if let Some((_, ty, _, _, max_len)) = id_col {
            let mapped = map_column_type(source_db_type, ty, *max_len, target_db_type);
            if mapped.starts_with("VARCHAR") || mapped.starts_with("CHAR") {
                col_defs.push(format!(
                    "    PRIMARY KEY ({})",
                    quote_for_target(target_db_type, "_id")
                ));
            }
        }
    }

    let target_ref = match target_schema {
        Some(s) => format!(
            "{}.{}",
            quote_for_target(target_db_type, s),
            quote_for_target(target_db_type, target_table)
        ),
        None => quote_for_target(target_db_type, target_table),
    };

    let sql = format!(
        "CREATE TABLE IF NOT EXISTS {} (\n{}\n)",
        target_ref,
        col_defs.join(",\n")
    );
    tracing::info!(
        "[sync] Built CREATE TABLE from columns for '{}'",
        target_table
    );
    sql
}

async fn fetch_pg_columns(
    source: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<Vec<ColInfo>> {
    let schema = schema.unwrap_or("public");

    let schema_clean = schema.replace('\'', "''");
    let table_clean = table.replace('\'', "''");

    let query = format!(
        "SELECT a.attname as name, \
                pg_catalog.format_type(a.atttypid, a.atttypmod) as type, \
                a.attnotnull as not_null, \
                CASE WHEN pk.indisprimary THEN true ELSE false END as is_pk \
         FROM pg_catalog.pg_class c \
         JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid \
         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid \
         LEFT JOIN pg_catalog.pg_index pk ON c.oid = pk.indrelid AND a.attnum = ANY(pk.indkey) AND pk.indisprimary \
         WHERE c.relname = '{}' AND n.nspname = '{}' \
           AND a.attnum > 0 AND NOT a.attisdropped \
         ORDER BY a.attnum",
        table_clean, schema_clean
    );

    let result = source.execute(&query).await?;
    let mut columns = Vec::new();

    for row in &result.rows {
        let name = row
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let col_type = row
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("text")
            .to_string();
        let not_null = row
            .get("not_null")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let is_pk = row.get("is_pk").and_then(|v| v.as_bool()).unwrap_or(false);

        columns.push((name, col_type, !not_null, is_pk, None));
    }

    Ok(columns)
}

async fn fetch_generic_columns(
    source: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<Vec<ColInfo>> {
    let cols = source
        .fetch_columns(table, schema.map(|s| s.to_string()))
        .await?;
    let mut columns = Vec::new();

    for col in &cols {
        let name = col
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let col_type = col
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("text")
            .to_string();
        let is_nullable = col
            .get("isNullable")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let is_pk = col
            .get("isPrimaryKey")
            .or_else(|| col.get("isPrimary"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let max_len = col
            .get("maxLength")
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);

        columns.push((name, col_type, is_nullable, is_pk, max_len));
    }

    Ok(columns)
}

fn sanitize_ddl_for_target(ddl: &str) -> String {
    let re_seq =
        Regex::new("(?i)\\s+DEFAULT\\s+(?:nextval|currval|setval)\\s*\\([^)]*\\)(?:::\\w+)?")
            .unwrap();
    let result = re_seq.replace_all(ddl, "").to_string();

    let re_kw = Regex::new(
        "(?i)\\s+DEFAULT\\s+(?:current_user|session_user|current_database|current_schema|user)\\b(?:::\\w+(?:\\([^)]*\\))?)?"
    ).unwrap();
    let result = re_kw.replace_all(&result, "").to_string();

    let re_custom_default = Regex::new(
        "(?i)\\s+DEFAULT\\s+(?:'[^']*'|\"[^\"]*\"|\\w+(?:\\([^)]*\\))?|\\d+)\\s*::\\s*(\\w+)",
    )
    .unwrap();
    re_custom_default
        .replace_all(&result, |caps: &regex::Captures| {
            let cast_type = caps
                .get(1)
                .map(|m| m.as_str().to_lowercase())
                .unwrap_or_default();
            let is_builtin = PG_BUILTIN_TYPES.iter().any(|&bt| bt == cast_type)
                || cast_type.ends_with("[]")
                || cast_type.starts_with('_');
            if is_builtin {
                caps.get(0).unwrap().as_str().to_string()
            } else {
                String::new()
            }
        })
        .to_string()
}

const PG_BUILTIN_TYPES: &[&str] = &[
    "smallint",
    "integer",
    "bigint",
    "decimal",
    "numeric",
    "real",
    "double precision",
    "smallserial",
    "serial",
    "bigserial",
    "money",
    "char",
    "character",
    "varchar",
    "character varying",
    "text",
    "bytea",
    "boolean",
    "bool",
    "date",
    "time",
    "time with time zone",
    "time without time zone",
    "timestamp",
    "timestamp with time zone",
    "timestamp without time zone",
    "interval",
    "cidr",
    "inet",
    "macaddr",
    "macaddr8",
    "bit",
    "bit varying",
    "varbit",
    "uuid",
    "xml",
    "json",
    "jsonb",
    "point",
    "line",
    "lseg",
    "box",
    "path",
    "polygon",
    "circle",
    "tsquery",
    "tsvector",
    "oid",
    "regclass",
    "regtype",
    "regproc",
    "regprocedure",
    "xid",
    "cid",
    "tid",
    "record",
    "void",
    "anyelement",
    "anyarray",
    "anynonarray",
    "anyenum",
    "anyrange",
    "cstring",
    "internal",
    "trigger",
    "language_handler",
    "jsonpath",
];

fn quote_pg_type(ty: &str) -> String {
    let lower = ty.to_lowercase();
    if PG_BUILTIN_TYPES.contains(&lower.as_str()) || lower.ends_with("[]") || lower.starts_with('_')
    {
        ty.to_string()
    } else {
        "text".to_string()
    }
}

async fn check_pg_table_exists(
    source: &dyn DbDriver,
    table: &str,
    schema: &str,
) -> AppResult<bool> {
    let table_clean = table.replace('\'', "''");
    let schema_clean = schema.replace('\'', "''");

    let query = format!(
        "SELECT EXISTS(
            SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
            WHERE c.relname = '{}' AND n.nspname = '{}' AND c.relkind IN ('r','p')
        ) as is_present",
        table_clean, schema_clean
    );

    let result = source.execute(&query).await?;
    Ok(result
        .rows
        .first()
        .and_then(|r| r.get("is_present"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

async fn find_pg_schema_for_table(source: &dyn DbDriver, table: &str) -> Option<String> {
    let table_clean = table.replace('\'', "''");

    let query = format!(
        "SELECT n.nspname as schema_name \
         FROM pg_catalog.pg_class c \
         JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid \
         WHERE c.relname = '{}' AND c.relkind IN ('r','p') \
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
         LIMIT 1",
        table_clean
    );

    match source.execute(&query).await {
        Ok(result) => {
            if let Some(row) = result.rows.first() {
                if let Some(schema) = row.get("schema_name").and_then(|v| v.as_str()) {
                    return Some(schema.to_string());
                }
            }
            None
        }
        Err(e) => {
            tracing::warn!(
                "[sync] Error searching for schema of table '{}': {}",
                table,
                e
            );
            None
        }
    }
}
