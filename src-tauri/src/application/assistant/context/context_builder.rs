use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::assistant::{
    ColumnContext, ForeignKeyContext, IndexContext, SchemaContext, SchemaFingerprint, TableContext,
};

pub struct ContextBuilder;

impl ContextBuilder {
    pub async fn build(driver: &dyn DbDriver, db_name: Option<&str>) -> AppResult<SchemaContext> {
        let db_type = driver.db_type();

        let version = Self::fetch_version(driver).await?;
        let database = db_name
            .map(|s| s.to_string())
            .or_else(|| Self::detect_database(&db_type));
        let user = Self::fetch_user(driver, &db_type).await?;

        let tables = driver
            .fetch_tables(database.clone(), None)
            .await?;

        let mut table_contexts = Vec::with_capacity(tables.len());
        for table_name in &tables {
            let ctx = Self::build_table_context(driver, table_name, &db_type).await?;
            table_contexts.push(ctx);
        }

        let views = driver
            .fetch_views(database.clone(), None)
            .await?;
        let procedures = driver
            .fetch_procedures(database.clone(), None)
            .await?;
        let triggers = driver
            .fetch_triggers(database.clone(), None)
            .await?;

        Ok(SchemaContext {
            db_type: db_type.to_string(),
            version,
            database,
            user,
            tables: table_contexts,
            views,
            procedures,
            triggers,
        })
    }

    pub fn compute_fingerprint(ctx: &SchemaContext) -> SchemaFingerprint {
        let table_names: Vec<String> = ctx.tables.iter().map(|t| t.name.clone()).collect();
        let view_names = ctx.views.clone();
        let table_hashes: Vec<(String, u64)> = ctx
            .tables
            .iter()
            .map(|t| {
                let mut h: u64 = 0;
                for c in &t.columns {
                    h = h.wrapping_mul(31).wrapping_add(c.name.len() as u64);
                    h = h.wrapping_mul(31).wrapping_add(c.col_type.len() as u64);
                }
                (t.name.clone(), h)
            })
            .collect();

        SchemaFingerprint {
            table_names,
            view_names,
            table_hashes,
        }
    }

    async fn build_table_context(
        driver: &dyn DbDriver,
        table_name: &str,
        db_type: &DbType,
    ) -> AppResult<TableContext> {
        let columns_raw = driver.fetch_columns(table_name, None).await?;
        let indexes_raw = driver.fetch_indexes(table_name, None).await?;
        let fks_raw = driver.fetch_foreign_keys(table_name, None).await?;

        let columns = Self::parse_columns(&columns_raw, db_type);
        let indexes = Self::parse_indexes(&indexes_raw, db_type);
        let foreign_keys = Self::parse_foreign_keys(&fks_raw, db_type);

        Ok(TableContext {
            name: table_name.to_string(),
            columns,
            indexes,
            foreign_keys,
            row_count: None,
        })
    }

    fn parse_columns(raw: &[serde_json::Value], _db_type: &DbType) -> Vec<ColumnContext> {
        raw.iter()
            .map(|v| {
                let name = v
                    .get("name")
                    .and_then(|s| s.as_str())
                    .unwrap_or("?")
                    .to_string();
                let col_type = v
                    .get("type")
                    .and_then(|s| s.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let nullable = v
                    .get("isNullable")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(true);
                let is_primary_key = v
                    .get("isPrimaryKey")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);
                let default_value = v
                    .get("defaultValue")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                let comment = v
                    .get("comment")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());

                ColumnContext {
                    name,
                    col_type,
                    nullable,
                    is_primary_key,
                    default_value,
                    comment,
                }
            })
            .collect()
    }

    fn parse_indexes(raw: &[serde_json::Value], _db_type: &DbType) -> Vec<IndexContext> {
        let mut grouped: std::collections::HashMap<String, IndexContext> =
            std::collections::HashMap::new();

        for v in raw {
            let name = v
                .get("name")
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();
            let column = v
                .get("column")
                .or_else(|| v.get("column_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();
            let unique = v
                .get("isUnique")
                .or_else(|| v.get("is_unique"))
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            let index_type = v
                .get("type")
                .and_then(|s| s.as_str())
                .unwrap_or("btree")
                .to_string();

            let entry = grouped.entry(name.clone()).or_insert_with(|| IndexContext {
                name,
                columns: Vec::new(),
                unique,
                index_type,
            });
            entry.columns.push(column);
        }

        grouped.into_values().collect()
    }

    fn parse_foreign_keys(raw: &[serde_json::Value], _db_type: &DbType) -> Vec<ForeignKeyContext> {
        let mut grouped: std::collections::HashMap<String, ForeignKeyContext> =
            std::collections::HashMap::new();

        for v in raw {
            let constraint_name = v
                .get("constraintName")
                .or_else(|| v.get("constraint_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();
            let column = v
                .get("columnName")
                .or_else(|| v.get("column_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();
            let referenced_table = v
                .get("referencedTable")
                .or_else(|| v.get("referencedTableName"))
                .or_else(|| v.get("referenced_table_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();
            let referenced_column = v
                .get("referencedColumn")
                .or_else(|| v.get("referencedColumnName"))
                .or_else(|| v.get("referenced_column_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("?")
                .to_string();

            let entry =
                grouped.entry(constraint_name.clone()).or_insert_with(|| ForeignKeyContext {
                    constraint_name,
                    columns: Vec::new(),
                    referenced_table: referenced_table.clone(),
                    referenced_columns: Vec::new(),
                    on_delete: None,
                    on_update: None,
                });
            entry.columns.push(column);
            entry.referenced_columns.push(referenced_column);
        }

        grouped.into_values().collect()
    }

    async fn fetch_version(driver: &dyn DbDriver) -> AppResult<Option<String>> {
        let db_type = driver.db_type();
        let query = match db_type {
            DbType::Mysql | DbType::Mariadb => "SELECT VERSION() AS version",
            DbType::Postgres => "SELECT version() AS version",
            DbType::Sqlite => "SELECT sqlite_version() AS version",
            DbType::Sqlserver => "SELECT @@VERSION AS version",
            _ => return Ok(None),
        };

        let result = driver.execute(query).await?;
        Ok(result
            .rows
            .first()
            .and_then(|r| r.get("version").and_then(|s| s.as_str()))
            .map(|s| s.to_string()))
    }

    async fn fetch_user(driver: &dyn DbDriver, db_type: &DbType) -> AppResult<Option<String>> {
        let query = match db_type {
            DbType::Mysql | DbType::Mariadb => "SELECT CURRENT_USER() AS user",
            DbType::Postgres => "SELECT current_user AS user",
            DbType::Sqlserver => "SELECT SUSER_SNAME() AS user",
            _ => return Ok(None),
        };

        let result = driver.execute(query).await?;
        Ok(result
            .rows
            .first()
            .and_then(|r| r.get("user").and_then(|s| s.as_str()))
            .map(|s| s.to_string()))
    }

    fn detect_database(db_type: &DbType) -> Option<String> {
        match db_type {
            DbType::Sqlite => Some("main".to_string()),
            _ => None,
        }
    }
}
