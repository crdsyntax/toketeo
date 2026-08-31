use crate::application::sync::validators::schema_diff::SchemaDiff;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncTableConfig, ValidationReport};

pub struct PipelineValidator;

impl PipelineValidator {
    pub async fn validate(
        pipeline: &SyncPipeline,
        source: &dyn DbDriver,
        target: &dyn DbDriver,
    ) -> AppResult<ValidationReport> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let mut table_checks = Vec::new();
        let mut source_connection_ok = true;
        let mut target_connection_ok = true;

        match source.db_type() {
            crate::db::DbType::Mongodb => match source.fetch_mongo_structure().await {
                Ok(_) => {}
                Err(e) => {
                    source_connection_ok = false;
                    errors.push(format!("Source connection failed: {e}"));
                }
            },
            _ => match source.fetch_databases().await {
                Ok(_) => {}
                Err(e) => {
                    source_connection_ok = false;
                    errors.push(format!("Source connection failed: {e}"));
                }
            },
        }

        match target.db_type() {
            crate::db::DbType::Mongodb => match target.fetch_mongo_structure().await {
                Ok(_) => {}
                Err(e) => {
                    target_connection_ok = false;
                    errors.push(format!("Target connection failed: {e}"));
                }
            },
            _ => match target.fetch_databases().await {
                Ok(_) => {}
                Err(e) => {
                    target_connection_ok = false;
                    errors.push(format!("Target connection failed: {e}"));
                }
            },
        }

        if !source_connection_ok || !target_connection_ok {
            return Ok(ValidationReport {
                is_valid: false,
                source_connection_ok,
                target_connection_ok,
                table_checks: vec![],
                warnings,
                errors,
            });
        }

        for table_config in &pipeline.tables {
            let check = Self::validate_table(source, target, table_config, pipeline).await?;
            table_checks.push(check);
        }

        for check in &table_checks {
            if !check.exists_on_source {
                errors.push(format!("Source table '{}' not found", check.table_name));
            }
            if !check.exists_on_target {
                errors.push(format!("Target table '{}' not found", check.table_name));
            }
            if !check.columns_match {
                warnings.push(format!("Schema mismatch for table '{}'", check.table_name));
            }
            for issue in &check.issues {
                warnings.push(format!("Table '{}': {issue}", check.table_name));
            }
        }

        let is_valid = errors.is_empty();

        Ok(ValidationReport {
            is_valid,
            source_connection_ok,
            target_connection_ok,
            table_checks,
            warnings,
            errors,
        })
    }

    async fn validate_table(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        table_config: &SyncTableConfig,
        _pipeline: &SyncPipeline,
    ) -> AppResult<crate::models::sync::TableValidation> {
        let (source_name, source_schema) = if source.db_type() == crate::db::DbType::Mongodb {
            split_mongo_table(&table_config.source_table)
        } else {
            (table_config.source_table.as_str(), None)
        };
        let (target_name, target_schema) = if target.db_type() == crate::db::DbType::Mongodb {
            split_mongo_table(&table_config.target_table)
        } else {
            (table_config.target_table.as_str(), None)
        };

        let source_tables = source
            .fetch_tables(source_schema.map(String::from), None)
            .await?;
        let exists_on_source = source_tables.iter().any(|t| t == source_name);

        let target_tables = target
            .fetch_tables(target_schema.map(String::from), None)
            .await?;
        let exists_on_target = target_tables.iter().any(|t| t == target_name);

        if !exists_on_source || !exists_on_target {
            return Ok(crate::models::sync::TableValidation {
                table_name: table_config.source_table.clone(),
                exists_on_source,
                exists_on_target,
                columns_match: false,
                column_diffs: vec![],
                primary_key_match: false,
                issues: vec![],
            });
        }

        SchemaDiff::compare_tables(
            source,
            target,
            source_name,
            target_name,
            source_schema,
            target_schema,
        )
        .await
    }
}

fn split_mongo_table(full: &str) -> (&str, Option<&str>) {
    if let Some(dot) = full.find('.') {
        let db = &full[..dot];
        let collection = &full[dot + 1..];
        (collection, Some(db))
    } else {
        (full, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{DbDriver, DbType};
    use crate::models::sync::{SyncMode, SyncPipeline, SyncTableConfig};
    use async_trait::async_trait;
    use serde_json::json;

    fn make_column(name: &str, ty: &str, nullable: bool, pk: bool) -> serde_json::Value {
        json!({
            "name": name,
            "type": ty,
            "isNullable": nullable,
            "isPrimaryKey": pk,
        })
    }

    fn make_pipeline(tables: Vec<SyncTableConfig>) -> SyncPipeline {
        SyncPipeline {
            id: None,
            name: "test".into(),
            source_connection_id: "src".into(),
            target_connection_id: "tgt".into(),
            source_schema: None,
            target_schema: None,
            mode: SyncMode::Full,
            status: crate::models::sync::PipelineStatus::Draft,
            tables,
            batch_size: 1000,
            created_at: None,
            updated_at: None,
        }
    }

    fn make_table(source: &str, target: &str) -> SyncTableConfig {
        SyncTableConfig {
            source_table: source.into(),
            target_table: target.into(),
            column_mappings: vec![],
            filters: None,
            primary_key: None,
        }
    }

    use crate::db::{DataReader, DataWriter};

    macro_rules! mock_data_reader_writer {
        ($ty:ty) => {
            #[async_trait]
            impl DataReader for $ty {
                async fn fetch_rows(
                    &self,
                    _: &str,
                    _: Option<&str>,
                    _: &[String],
                    _: &str,
                    _: Option<serde_json::Value>,
                    _: usize,
                ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                    unimplemented!()
                }
                async fn count_rows(
                    &self,
                    _: &str,
                    _: Option<&str>,
                ) -> crate::error::AppResult<u64> {
                    unimplemented!()
                }
            }
            #[async_trait]
            impl DataWriter for $ty {
                async fn upsert_rows(
                    &self,
                    _: &str,
                    _: Option<&str>,
                    _: &[String],
                    _: &[String],
                    _: &[serde_json::Value],
                ) -> crate::error::AppResult<crate::db::UpsertResult> {
                    unimplemented!()
                }
            }
        };
    }

    mock_data_reader_writer!(MockSourceDriver);
    mock_data_reader_writer!(MockMatchingTargetDriver);
    mock_data_reader_writer!(MockMismatchedTargetDriver);
    mock_data_reader_writer!(MockFailingDriver);
    mock_data_reader_writer!(MockMongoSourceDriver);

    struct MockSourceDriver;

    #[async_trait]
    impl DbDriver for MockSourceDriver {
        fn db_type(&self) -> DbType {
            DbType::Postgres
        }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["prod_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into(), "products".into()])
        }

        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(
            &self,
            table: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            match table {
                "users" => Ok(vec![
                    make_column("id", "uuid", false, true),
                    make_column("email", "varchar(255)", false, false),
                    make_column("name", "varchar(100)", true, false),
                    make_column("created_at", "timestamptz", false, false),
                ]),
                "orders" => Ok(vec![
                    make_column("id", "uuid", false, true),
                    make_column("user_id", "uuid", false, false),
                    make_column("total", "decimal(10,2)", false, false),
                    make_column("status", "varchar(50)", false, false),
                ]),
                "products" => Ok(vec![
                    make_column("id", "uuid", false, true),
                    make_column("sku", "varchar(50)", false, false),
                    make_column("price", "decimal(10,2)", false, false),
                ]),
                _ => Ok(vec![]),
            }
        }

        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> {
            Ok(())
        }
    }

    struct MockMatchingTargetDriver;

    #[async_trait]
    impl DbDriver for MockMatchingTargetDriver {
        fn db_type(&self) -> DbType {
            DbType::Mysql
        }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["analytics_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into(), "products".into()])
        }

        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(
            &self,
            table: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            match table {
                "users" => Ok(vec![
                    make_column("id", "char(36)", false, true),
                    make_column("email", "varchar(255)", false, false),
                    make_column("name", "varchar(100)", true, false),
                    make_column("created_at", "timestamp", false, false),
                ]),
                "orders" => Ok(vec![
                    make_column("id", "char(36)", false, true),
                    make_column("user_id", "char(36)", false, false),
                    make_column("total", "decimal(10,2)", false, false),
                    make_column("status", "varchar(50)", false, false),
                ]),
                "products" => Ok(vec![
                    make_column("id", "char(36)", false, true),
                    make_column("sku", "varchar(50)", false, false),
                    make_column("price", "decimal(10,2)", false, false),
                ]),
                _ => Ok(vec![]),
            }
        }

        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> {
            Ok(())
        }
    }

    struct MockMismatchedTargetDriver;

    #[async_trait]
    impl DbDriver for MockMismatchedTargetDriver {
        fn db_type(&self) -> DbType {
            DbType::Mysql
        }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["analytics_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into()])
        }

        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(
            &self,
            table: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            match table {
                "users" => Ok(vec![
                    make_column("id", "char(36)", false, true),
                    make_column("email", "varchar(255)", false, false),
                    make_column("full_name", "varchar(100)", true, false),
                    make_column("phone", "varchar(20)", true, false),
                    make_column("created_at", "timestamp", false, false),
                ]),
                "orders" => Ok(vec![
                    make_column("id", "char(36)", false, true),
                    make_column("user_id", "char(36)", false, false),
                    make_column("total", "decimal(10,2)", false, false),
                    make_column("status", "varchar(50)", false, false),
                ]),
                _ => Ok(vec![]),
            }
        }

        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> {
            Ok(())
        }
    }

    struct MockFailingDriver;

    #[async_trait]
    impl DbDriver for MockFailingDriver {
        fn db_type(&self) -> DbType {
            DbType::Postgres
        }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_columns(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_ddl(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<String> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database(
                "Connection refused".into(),
            ))
        }

        async fn close(&self) -> crate::error::AppResult<()> {
            Ok(())
        }
    }

    struct MockMongoSourceDriver;

    #[async_trait]
    impl DbDriver for MockMongoSourceDriver {
        fn db_type(&self) -> DbType {
            DbType::Mongodb
        }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["shop".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["shop".into()])
        }

        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into()])
        }

        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(
            &self,
            table: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            match table {
                "users" => Ok(vec![
                    make_column("_id", "ObjectId", false, true),
                    make_column("email", "string", false, false),
                    make_column("name", "string", true, false),
                ]),
                "orders" => Ok(vec![
                    make_column("_id", "ObjectId", false, true),
                    make_column("user_id", "ObjectId", false, false),
                    make_column("total", "double", false, false),
                ]),
                _ => Ok(vec![]),
            }
        }

        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_mongo_structure(&self) -> crate::error::AppResult<serde_json::Value> {
            Ok(
                json!({"shop": {"users": ["_id","email","name"], "orders": ["_id","user_id","total"]}}),
            )
        }

        async fn close(&self) -> crate::error::AppResult<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_valid_full_match() {
        let pipeline = make_pipeline(vec![
            make_table("users", "users"),
            make_table("orders", "orders"),
        ]);
        let source = MockSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(
            report.is_valid,
            "Expected valid report with matching schemas"
        );
        assert!(report.source_connection_ok);
        assert!(report.target_connection_ok);
        assert_eq!(report.table_checks.len(), 2);
        assert!(report.errors.is_empty());
    }

    #[tokio::test]
    async fn test_source_connection_fails() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockFailingDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(!report.is_valid);
        assert!(!report.source_connection_ok);
        assert!(report.target_connection_ok);
        assert!(report.table_checks.is_empty());
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Source connection failed")));
    }

    #[tokio::test]
    async fn test_target_connection_fails() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockSourceDriver;
        let target = MockFailingDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(!report.is_valid);
        assert!(report.source_connection_ok);
        assert!(!report.target_connection_ok);
        assert!(report.table_checks.is_empty());
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Target connection failed")));
    }

    #[tokio::test]
    async fn test_table_missing_on_target() {
        let pipeline = make_pipeline(vec![
            make_table("users", "users"),
            make_table("products", "products"),
        ]);
        let source = MockSourceDriver;
        let target = MockMismatchedTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(!report.is_valid);
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Source table 'products' not found")
                || e.contains("Target table 'products' not found")));

        let products_check = report
            .table_checks
            .iter()
            .find(|c| c.table_name == "products");
        assert!(products_check.is_some());

        assert!(!products_check.unwrap().exists_on_target);
    }

    #[tokio::test]
    async fn test_schema_mismatch() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockSourceDriver;
        let target = MockMismatchedTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(report.is_valid);
        assert!(report.errors.is_empty());
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("Schema mismatch")));

        assert!(report.table_checks[0]
            .column_diffs
            .iter()
            .any(|d| d.column_name == "id"
                && d.diff_type == crate::models::sync::DiffType::TypeMismatch));

        assert!(report.table_checks[0]
            .column_diffs
            .iter()
            .any(|d| d.column_name == "name"
                && d.diff_type == crate::models::sync::DiffType::MissingInTarget));

        assert!(report.table_checks[0]
            .column_diffs
            .iter()
            .any(|d| d.column_name == "phone"
                && d.diff_type == crate::models::sync::DiffType::MissingInSource));
    }

    #[tokio::test]
    async fn test_empty_tables_list() {
        let pipeline = make_pipeline(vec![]);
        let source = MockSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(report.is_valid);
        assert!(report.source_connection_ok);
        assert!(report.target_connection_ok);
        assert!(report.table_checks.is_empty());
        assert!(report.errors.is_empty());
        assert!(report.warnings.is_empty());
    }

    #[tokio::test]
    async fn test_mongodb_source() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);

        let source = MockMongoSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(
            report.is_valid,
            "Expected valid MongoDB → SQL cross-DB sync"
        );
        assert!(report.source_connection_ok);
        assert!(report.target_connection_ok);
    }

    #[tokio::test]
    async fn test_mongodb_source_fails() {
        struct FailingMongo;
        #[async_trait]
        impl DataReader for FailingMongo {
            async fn fetch_rows(
                &self,
                _: &str,
                _: Option<&str>,
                _: &[String],
                _: &str,
                _: Option<serde_json::Value>,
                _: usize,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                unimplemented!()
            }
            async fn count_rows(&self, _: &str, _: Option<&str>) -> crate::error::AppResult<u64> {
                unimplemented!()
            }
        }
        #[async_trait]
        impl DataWriter for FailingMongo {
            async fn upsert_rows(
                &self,
                _: &str,
                _: Option<&str>,
                _: &[String],
                _: &[String],
                _: &[serde_json::Value],
            ) -> crate::error::AppResult<crate::db::UpsertResult> {
                unimplemented!()
            }
        }
        #[async_trait]
        impl DbDriver for FailingMongo {
            fn db_type(&self) -> DbType {
                DbType::Mongodb
            }
            async fn execute(
                &self,
                _: &str,
            ) -> crate::error::AppResult<crate::models::QueryResult> {
                unimplemented!()
            }
            async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_tables(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_views(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_procedures(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_triggers(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_functions(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_columns(
                &self,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_indexes(
                &self,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_foreign_keys(
                &self,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_constraints(
                &self,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_ddl(
                &self,
                _: &str,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<String> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_parameters(
                &self,
                _: &str,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database("no".into()))
            }
            async fn fetch_mongo_structure(&self) -> crate::error::AppResult<serde_json::Value> {
                Err(crate::error::AppError::Database(
                    "Mongo connection failed".into(),
                ))
            }
            async fn close(&self) -> crate::error::AppResult<()> {
                Ok(())
            }
        }

        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = FailingMongo;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target)
            .await
            .unwrap();

        assert!(!report.is_valid);
        assert!(!report.source_connection_ok);
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Source connection failed")));
    }
}
