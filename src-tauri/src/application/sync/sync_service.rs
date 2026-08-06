use crate::application::sync::extractors::{DataExtractor, MongoExtractor, SqlExtractor};
use crate::application::sync::strategies::{FullSync, IncrementalSync, SyncEvent, SyncStrategy};
use crate::application::sync::validators::PipelineValidator;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::sync::{SyncMode, SyncPipeline, ValidationReport};
use crate::state::SyncController;
use crate::storage::Storage;
use regex::Regex;
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

        // --- Auto-detect correct source schema ---
        let mut effective_source_schema = pipeline.source_schema.clone();

        if source_db_type == DbType::Postgres {
            if let Some(first_table) = pipeline.tables.first() {
                // Try the configured schema first
                let test_schema = effective_source_schema
                    .clone()
                    .unwrap_or_else(|| "public".to_string());
                let found = check_pg_table_exists(source, &first_table.source_table, &test_schema)
                    .await
                    .unwrap_or(false);
                if found {
                    tracing::info!(
                        "[sync] Schema '{}' is correct for table '{}'",
                        test_schema,
                        first_table.source_table
                    );
                } else {
                    // Search through all schemas to find which one has this table
                    let detected =
                        find_pg_schema_for_table(source, &first_table.source_table).await;
                    if let Some(ref real_schema) = detected {
                        tracing::info!(
                            "[sync] Auto-detected source schema '{}' (was configured as '{}') for table '{}'",
                            real_schema, test_schema, first_table.source_table
                        );
                        effective_source_schema = Some(real_schema.clone());
                    } else {
                        tracing::error!(
                            "[sync] Table '{}' not found in ANY schema on source database — aborting pipeline",
                            first_table.source_table
                        );
                        if let Some(ref sender) = event_sender {
                            let _ = sender.send(SyncEvent::Error {
                                message: format!(
                                    "Table '{}' not found in any schema on source database",
                                    first_table.source_table
                                ),
                            });
                        }
                        return Err(crate::error::AppError::Validation(format!(
                            "Table '{}' not found in any schema on source database",
                            first_table.source_table
                        )));
                    }
                }
            }
        }

        // Verify source connection before starting
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

        // Pre-check controller before starting
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
            // Check for cancellation before each table
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

            // Ensure target table exists — auto-create if missing
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

                // Step 1: Try to get DDL from source (CREATE TABLE statement)
                let source_ddl = source
                    .fetch_ddl(
                        &table_config.source_table,
                        "table",
                        pipeline_clone.source_schema.clone(),
                    )
                    .await;

                // MongoDB fetch_ddl returns JSON metadata, not CREATE TABLE — skip DDL path
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

                // Step 2: Build CREATE TABLE from column metadata when DDL is unavailable
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

            // Execute sync strategy for this table
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

        tracing::info!(
            "[sync] Pipeline '{}' finished: {}/{} tables completed, {} table errors",
            pipeline_clone.name,
            total_tables.saturating_sub(pipeline_errors),
            total_tables,
            pipeline_errors,
        );

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Completed {});
        }

        Ok(())
    }

    pub async fn validate(
        pipeline: &SyncPipeline,
        source: &dyn DbDriver,
        target: &dyn DbDriver,
    ) -> AppResult<ValidationReport> {
        PipelineValidator::validate(pipeline, source, target).await
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

/// Map BSON / MongoDB element type names to equivalent SQL column types for
/// the target RDBMS. `max_len` is the longest observed string value (in chars)
/// for `String` fields; used to choose between VARCHAR(n) and TEXT.
fn bson_type_to_sql(bson_type: &str, max_len: Option<usize>, target_db_type: &DbType) -> String {
    let t = bson_type.trim().trim_matches('"');
    let pg = matches!(target_db_type, DbType::Postgres);
    match t {
        "ObjectId" | "ObjectID" => "VARCHAR(48)".into(),
        "String" | "Utf8" => {
            let max = max_len.unwrap_or(0);
            if max > 0 && max <= 255 {
                // numeric IDs, short text — VARCHAR sized to observed content
                format!("VARCHAR({})", max.max(16))
            } else if max > 255 && max <= 16384 {
                // still fits in VARCHAR on MySQL/PG
                format!("VARCHAR({})", max)
            } else if pg {
                // PostgreSQL allows VARCHAR without length
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
        // Objects/arrays → JSON on MySQL/PG (PG supports JSONB too; use JSON for compatibility)
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

/// Convert a source column type name into a SQL type suitable for the target DB.
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

/// Build a CREATE TABLE statement from column metadata.
/// `(name, type, is_nullable, is_pk, max_len_hint)`
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

    // MongoDB _id becomes VARCHAR/TEXT Extended JSON — skip PK to avoid MySQL ERROR 1170
    // (BLOB/TEXT used in key without key length). Add PK only if _id maps to VARCHAR.
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

/// Fetch column info using pg_catalog (bypasses information_schema permission issues).
/// Returns Vec<(name, type, not_null, is_pk)>.
async fn fetch_pg_columns(
    source: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<Vec<ColInfo>> {
    let schema = schema.unwrap_or("public");
    // Safe escaping for identifiers (not ideal but avoids SQL injection via table/schema names)
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

/// Fetch column info using generic fetch_columns (information_schema-based).
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

/// Strip sequence-dependent DEFAULT clauses (nextval/currval/setval) and
/// reserved-keyword DEFAULT expressions (USER, current_user, session_user, etc.)
/// from DDL. These reference source-specific state that doesn't exist on the
/// target database.
fn sanitize_ddl_for_target(ddl: &str) -> String {
    // 1) Sequence functions: nextval(...), currval(...), setval(...)
    let re_seq =
        Regex::new("(?i)\\s+DEFAULT\\s+(?:nextval|currval|setval)\\s*\\([^)]*\\)(?:::\\w+)?")
            .unwrap();
    let result = re_seq.replace_all(ddl, "").to_string();

    // 2) Reserved-keyword expressions: USER, current_user, session_user, current_schema, etc.
    //    May have an optional ::type cast suffix (e.g. USER::character varying).
    let re_kw = Regex::new(
        "(?i)\\s+DEFAULT\\s+(?:current_user|session_user|current_database|current_schema|user)\\b(?:::\\w+(?:\\([^)]*\\))?)?"
    ).unwrap();
    let result = re_kw.replace_all(&result, "").to_string();

    // 3) DEFAULT with ::cast to a non-builtin type (enums, composite types, domains).
    //    e.g. DEFAULT 'image'::media_files_context_enum
    //    If the cast type is NOT a PostgreSQL built-in, strip the DEFAULT since
    //    the type won't exist on the target database.
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

/// PostgreSQL built-in type names that should never be quoted in DDL.
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

/// Quote a PostgreSQL type name if it could be a reserved keyword or user-defined type.
/// Built-in types are left unquoted; user-defined types (enums, etc.) are mapped to text
/// since they won't exist on the target database.
fn quote_pg_type(ty: &str) -> String {
    let lower = ty.to_lowercase();
    if PG_BUILTIN_TYPES.contains(&lower.as_str()) || lower.ends_with("[]") || lower.starts_with('_')
    {
        ty.to_string()
    } else {
        // User-defined types (enums, composite types, etc.) — map to text
        // since they likely don't exist on the target database
        "text".to_string()
    }
}

/// Check if a table exists in a specific PostgreSQL schema using pg_catalog.
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
            WHERE c.relname = '{}' AND n.nspname = '{}' AND c.relkind = 'r'
        ) as exists",
        table_clean, schema_clean
    );

    let result = source.execute(&query).await?;
    Ok(result
        .rows
        .first()
        .and_then(|r| r.get("exists"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

/// Find which PostgreSQL schema contains a given table (searches all schemas).
async fn find_pg_schema_for_table(source: &dyn DbDriver, table: &str) -> Option<String> {
    let table_clean = table.replace('\'', "''");

    let query = format!(
        "SELECT n.nspname as schema_name \
         FROM pg_catalog.pg_class c \
         JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid \
         WHERE c.relname = '{}' AND c.relkind = 'r' \
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
