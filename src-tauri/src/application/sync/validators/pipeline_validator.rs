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
