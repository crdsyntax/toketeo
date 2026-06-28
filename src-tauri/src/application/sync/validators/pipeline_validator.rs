use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncTableConfig, ValidationReport};
use crate::application::sync::validators::schema_diff::SchemaDiff;

/// Valida un pipeline antes de ejecutarlo.
pub struct PipelineValidator;

impl PipelineValidator {
    /// Valida conexiones, tablas y esquemas.
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

        // Verificar conexión source (ejecutando un query simple)
        match source.db_type() {
            crate::db::DbType::Mongodb => {
                match source.fetch_mongo_structure().await {
                    Ok(_) => {}
                    Err(e) => {
                        source_connection_ok = false;
                        errors.push(format!("Source connection failed: {e}"));
                    }
                }
            }
            _ => {
                match source.fetch_databases().await {
                    Ok(_) => {}
                    Err(e) => {
                        source_connection_ok = false;
                        errors.push(format!("Source connection failed: {e}"));
                    }
                }
            }
        }

        // Verificar conexión target
        match target.db_type() {
            crate::db::DbType::Mongodb => {
                match target.fetch_mongo_structure().await {
                    Ok(_) => {}
                    Err(e) => {
                        target_connection_ok = false;
                        errors.push(format!("Target connection failed: {e}"));
                    }
                }
            }
            _ => {
                match target.fetch_databases().await {
                    Ok(_) => {}
                    Err(e) => {
                        target_connection_ok = false;
                        errors.push(format!("Target connection failed: {e}"));
                    }
                }
            }
        }

        // Si alguna conexión falla, no podemos validar tablas
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

        // Validar cada tabla configurada
        for table_config in &pipeline.tables {
            let check = Self::validate_table(
                source,
                target,
                table_config,
                pipeline,
            ).await?;
            table_checks.push(check);
        }

        // Revisar si hay errores en los table_checks
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
        // Verificar que la tabla existe en source
        let source_tables = source
            .fetch_tables(None, None)
            .await?;
        let exists_on_source = source_tables
            .iter()
            .any(|t| t == &table_config.source_table);

        // Verificar que la tabla existe en target
        let target_tables = target
            .fetch_tables(None, None)
            .await?;
        let exists_on_target = target_tables
            .iter()
            .any(|t| t == &table_config.target_table);

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

        // Comparar esquemas
        SchemaDiff::compare_tables(
            source,
            target,
            &table_config.source_table,
            &table_config.target_table,
            None,
            None,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{DbDriver, DbType};
    use crate::models::sync::{SyncMode, SyncPipeline, SyncTableConfig};
    use async_trait::async_trait;
    use serde_json::json;

    // ── Helpers ──

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

    // ── Mock drivers ──

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
                async fn count_rows(&self, _: &str, _: Option<&str>) -> crate::error::AppResult<u64> {
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
                ) -> crate::error::AppResult<u64> {
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

    /// Simulates a healthy Postgres source database.
    struct MockSourceDriver;

    #[async_trait]
    impl DbDriver for MockSourceDriver {
        fn db_type(&self) -> DbType { DbType::Postgres }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["prod_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into(), "products".into()])
        }

        async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(&self, table: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
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

        async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
    }

    /// Simulates a healthy MySQL target database with the same schema as source.
    struct MockMatchingTargetDriver;

    #[async_trait]
    impl DbDriver for MockMatchingTargetDriver {
        fn db_type(&self) -> DbType { DbType::Mysql }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["analytics_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into(), "products".into()])
        }

        async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(&self, table: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
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

        async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
    }

    /// Simulates a target with a DIFFERENT schema (type mismatches, missing columns).
    struct MockMismatchedTargetDriver;

    #[async_trait]
    impl DbDriver for MockMismatchedTargetDriver {
        fn db_type(&self) -> DbType { DbType::Mysql }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["analytics_db".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["public".into()])
        }

        async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into()])  // products is MISSING on target
        }

        async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(&self, table: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            match table {
                "users" => Ok(vec![
                    // id type differs: char(36) vs uuid → TypeMismatch
                    make_column("id", "char(36)", false, true),
                    // email is same
                    make_column("email", "varchar(255)", false, false),
                    // target has full_name instead of name → MissingInTarget for name, MissingInSource for full_name
                    make_column("full_name", "varchar(100)", true, false),
                    // phone column exists only on target → MissingInSource
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

        async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
    }

    /// Simulates a connection that FAILS on fetch_databases.
    struct MockFailingDriver;

    #[async_trait]
    impl DbDriver for MockFailingDriver {
        fn db_type(&self) -> DbType { DbType::Postgres }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_columns(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Err(crate::error::AppError::Database("Connection refused".into()))
        }

        async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
    }

    /// Simulates a MongoDB source driver.
    struct MockMongoSourceDriver;

    #[async_trait]
    impl DbDriver for MockMongoSourceDriver {
        fn db_type(&self) -> DbType { DbType::Mongodb }

        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }

        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["shop".into()])
        }

        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["shop".into()])
        }

        async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec!["users".into(), "orders".into()])
        }

        async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }

        async fn fetch_columns(&self, table: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
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

        async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> {
            Ok(String::new())
        }

        async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
        }

        async fn fetch_mongo_structure(&self) -> crate::error::AppResult<serde_json::Value> {
            Ok(json!({"shop": {"users": ["_id","email","name"], "orders": ["_id","user_id","total"]}}))
        }

        async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
    }

    // ── Tests ──

    #[tokio::test]
    async fn test_valid_full_match() {
        let pipeline = make_pipeline(vec![
            make_table("users", "users"),
            make_table("orders", "orders"),
        ]);
        let source = MockSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(report.is_valid, "Expected valid report with matching schemas");
        assert!(report.source_connection_ok);
        assert!(report.target_connection_ok);
        assert_eq!(report.table_checks.len(), 2);
        assert!(report.errors.is_empty());
        // Warnings may exist for type differences (e.g. uuid vs char(36), timestamptz vs timestamp)
    }

    #[tokio::test]
    async fn test_source_connection_fails() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockFailingDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(!report.is_valid);
        assert!(!report.source_connection_ok);
        assert!(report.target_connection_ok);
        assert!(report.table_checks.is_empty());
        assert!(report.errors.iter().any(|e| e.contains("Source connection failed")));
    }

    #[tokio::test]
    async fn test_target_connection_fails() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockSourceDriver;
        let target = MockFailingDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(!report.is_valid);
        assert!(report.source_connection_ok);
        assert!(!report.target_connection_ok);
        assert!(report.table_checks.is_empty());
        assert!(report.errors.iter().any(|e| e.contains("Target connection failed")));
    }

    #[tokio::test]
    async fn test_table_missing_on_target() {
        let pipeline = make_pipeline(vec![
            make_table("users", "users"),
            make_table("products", "products"),  // products is missing on MockMismatchedTargetDriver
        ]);
        let source = MockSourceDriver;
        let target = MockMismatchedTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(!report.is_valid);
        assert!(report.errors.iter().any(|e| e.contains("Source table 'products' not found") || e.contains("Target table 'products' not found")));

        let products_check = report.table_checks.iter().find(|c| c.table_name == "products");
        assert!(products_check.is_some());
        // products exists on source but not on mismatched target
        assert!(!products_check.unwrap().exists_on_target);
    }

    #[tokio::test]
    async fn test_schema_mismatch() {
        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = MockSourceDriver;
        let target = MockMismatchedTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        // Schema mismatches produce warnings, not errors (pipeline is still valid)
        assert!(report.is_valid);
        assert!(report.errors.is_empty());
        assert!(report.warnings.iter().any(|w| w.contains("Schema mismatch")));
        // id type differs: uuid vs char(36)
        assert!(report.table_checks[0].column_diffs.iter().any(|d| d.column_name == "id" && d.diff_type == crate::models::sync::DiffType::TypeMismatch));
        // name → full_name → MissingInTarget for name
        assert!(report.table_checks[0].column_diffs.iter().any(|d| d.column_name == "name" && d.diff_type == crate::models::sync::DiffType::MissingInTarget));
        // phone is extra on target → MissingInSource
        assert!(report.table_checks[0].column_diffs.iter().any(|d| d.column_name == "phone" && d.diff_type == crate::models::sync::DiffType::MissingInSource));
    }

    #[tokio::test]
    async fn test_empty_tables_list() {
        let pipeline = make_pipeline(vec![]);
        let source = MockSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

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
        // MongoDB source + Postgres target (cross-DB sync)
        let source = MockMongoSourceDriver;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(report.is_valid, "Expected valid MongoDB → SQL cross-DB sync");
        assert!(report.source_connection_ok);
        assert!(report.target_connection_ok);
    }

    #[tokio::test]
    async fn test_mongodb_source_fails() {
        struct FailingMongo;
        #[async_trait]
        impl DataReader for FailingMongo {
            async fn fetch_rows(&self, _: &str, _: Option<&str>, _: &[String], _: &str, _: Option<serde_json::Value>, _: usize) -> crate::error::AppResult<Vec<serde_json::Value>> { unimplemented!() }
            async fn count_rows(&self, _: &str, _: Option<&str>) -> crate::error::AppResult<u64> { unimplemented!() }
        }
        #[async_trait]
        impl DataWriter for FailingMongo {
            async fn upsert_rows(&self, _: &str, _: Option<&str>, _: &[String], _: &[String], _: &[serde_json::Value]) -> crate::error::AppResult<u64> { unimplemented!() }
        }
        #[async_trait]
        impl DbDriver for FailingMongo {
            fn db_type(&self) -> DbType { DbType::Mongodb }
            async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> { unimplemented!() }
            async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_tables(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_views(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_procedures(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_triggers(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_functions(&self, _: Option<String>, _: Option<String>) -> crate::error::AppResult<Vec<String>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_columns(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_indexes(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_foreign_keys(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_constraints(&self, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<String> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_parameters(&self, _: &str, _: &str, _: Option<String>) -> crate::error::AppResult<Vec<serde_json::Value>> { Err(crate::error::AppError::Database("no".into())) }
            async fn fetch_mongo_structure(&self) -> crate::error::AppResult<serde_json::Value> { Err(crate::error::AppError::Database("Mongo connection failed".into())) }
            async fn close(&self) -> crate::error::AppResult<()> { Ok(()) }
        }

        let pipeline = make_pipeline(vec![make_table("users", "users")]);
        let source = FailingMongo;
        let target = MockMatchingTargetDriver;

        let report = PipelineValidator::validate(&pipeline, &source, &target).await.unwrap();

        assert!(!report.is_valid);
        assert!(!report.source_connection_ok);
        assert!(report.errors.iter().any(|e| e.contains("Source connection failed")));
    }
}
