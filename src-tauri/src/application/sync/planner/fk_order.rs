use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::sync::SyncTableConfig;
use std::collections::{BinaryHeap, HashMap, HashSet};

/// Reordena las tablas de un pipeline respetando las dependencias de Foreign
/// Keys del source: toda tabla referenciada (padre) se procesa antes que las
/// que la referencian (hijas).
///
/// - Orden **estable**: las tablas sin dependencias conservan su orden
///   relativo original (por defecto alfabético).
/// - Las auto-referencias (`A.parent_id -> A.id`) se ignoran: el upsert por
///   `ON CONFLICT`/`ON DUPLICATE KEY` ya cubre el caso intra-tabla.
/// - Los ciclos multi-tabla se conservan en su orden relativo original y se
///   reportan por log, ya que no existe un orden seguro posible.
pub struct FkOrderer;

impl FkOrderer {
    /// Devuelve `tables` reordenadas (padres primero). Si la metadata de FK no
    /// está disponible o falla la lectura, conserva el orden original.
    pub async fn order_tables(
        tables: Vec<SyncTableConfig>,
        source: &dyn DbDriver,
        source_schema: Option<&str>,
    ) -> AppResult<Vec<SyncTableConfig>> {
        if tables.len() < 2 {
            return Ok(tables);
        }

        let original_index: HashMap<String, usize> = tables
            .iter()
            .enumerate()
            .map(|(i, t)| (t.source_table.clone(), i))
            .collect();

        // dependencies[tabla] = tablas del pipeline a las que referencia vía FK.
        let mut dependencies: HashMap<String, HashSet<String>> = HashMap::new();
        let mut fk_fetch_errors: usize = 0;

        for table in &tables {
            let fks = match source
                .fetch_foreign_keys(&table.source_table, source_schema.map(String::from))
                .await
            {
                Ok(fks) => fks,
                Err(e) => {
                    tracing::warn!(
                        "[fk_order] Could not read FKs for table '{}': {} — assuming no dependencies",
                        table.source_table,
                        e
                    );
                    fk_fetch_errors += 1;
                    continue;
                }
            };

            let deps: HashSet<String> = fks
                .iter()
                .filter_map(|fk| fk.get("referencedTable").and_then(|v| v.as_str()))
                .filter(|ref_table| {
                    original_index.contains_key(*ref_table) && *ref_table != table.source_table
                })
                .map(String::from)
                .collect();

            if !deps.is_empty() {
                dependencies.insert(table.source_table.clone(), deps);
            }
        }

        if fk_fetch_errors > 0 {
            tracing::warn!(
                "[fk_order] {} table(s) had FK metadata unavailable; treated as having no dependencies",
                fk_fetch_errors
            );
        }

        let ordered = Self::topological_sort(&tables, &dependencies, &original_index);

        tracing::info!(
            "[fk_order] FK-ordered tables: {:?}",
            ordered
                .iter()
                .map(|t| t.source_table.as_str())
                .collect::<Vec<_>>()
        );

        Ok(ordered)
    }

    /// Orden topológico estable (Kahn) con desempate por índice original.
    /// Devuelve todas las tablas; los nodos en ciclos quedan al final en su
    /// orden relativo original.
    fn topological_sort(
        tables: &[SyncTableConfig],
        dependencies: &HashMap<String, HashSet<String>>,
        original_index: &HashMap<String, usize>,
    ) -> Vec<SyncTableConfig> {
        let mut dependents: HashMap<String, Vec<String>> = HashMap::new();
        let mut indegree: HashMap<String, usize> = HashMap::new();

        for (table, deps) in dependencies {
            indegree.insert(table.clone(), deps.len());
            for parent in deps {
                dependents
                    .entry(parent.clone())
                    .or_default()
                    .push(table.clone());
            }
        }

        // Min-heap por índice original → produce un orden estable.
        let mut ready: BinaryHeap<(std::cmp::Reverse<usize>, String)> = BinaryHeap::new();
        for (i, t) in tables.iter().enumerate() {
            let deg = indegree.get(&t.source_table).copied().unwrap_or(0);
            if deg == 0 {
                ready.push((std::cmp::Reverse(i), t.source_table.clone()));
            }
        }

        let mut sorted: Vec<SyncTableConfig> = Vec::with_capacity(tables.len());
        let mut placed: HashSet<String> = HashSet::new();

        while let Some((_, name)) = ready.pop() {
            placed.insert(name.clone());
            let idx = original_index
                .get(&name)
                .expect("table must exist in original index");
            sorted.push(tables[*idx].clone());

            if let Some(children) = dependents.get(&name) {
                for child in children {
                    let deg = indegree
                        .get_mut(child)
                        .expect("child must exist in indegree map");
                    *deg -= 1;
                    if *deg == 0 {
                        let child_idx = original_index[child];
                        ready.push((std::cmp::Reverse(child_idx), child.clone()));
                    }
                }
            }
        }

        // Ciclos restantes: conservar orden relativo original y advertir.
        let mut remaining: Vec<&SyncTableConfig> = tables
            .iter()
            .filter(|t| !placed.contains(&t.source_table))
            .collect();
        if !remaining.is_empty() {
            let names: Vec<&str> = remaining.iter().map(|t| t.source_table.as_str()).collect();
            tracing::warn!(
                "[fk_order] Cyclic FK dependencies among: {:?} — keeping original relative order",
                names
            );
            remaining.sort_by_key(|t| original_index[&t.source_table]);
            sorted.extend(remaining.into_iter().cloned());
        }

        sorted
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbType;
    use crate::models::sync::SyncTableConfig;
    use async_trait::async_trait;
    use serde_json::json;

    macro_rules! mock_data_reader_writer {
        ($ty:ty) => {
            #[async_trait]
            impl crate::db::DataReader for $ty {
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
            impl crate::db::DataWriter for $ty {
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

    fn make_table(name: &str) -> SyncTableConfig {
        SyncTableConfig {
            source_table: name.to_string(),
            target_table: name.to_string(),
            column_mappings: vec![],
            filters: None,
            primary_key: None,
        }
    }

    /// Driver mock que solo provee metadata de FK.
    struct MockFkDriver {
        fks: HashMap<String, Vec<serde_json::Value>>,
    }

    impl MockFkDriver {
        fn with(entries: Vec<(&str, Vec<&str>)>) -> Self {
            let mut fks = HashMap::new();
            for (table, refs) in entries {
                fks.insert(
                    table.to_string(),
                    refs.into_iter()
                        .map(|r| json!({ "referencedTable": r }))
                        .collect(),
                );
            }
            Self { fks }
        }
    }
    mock_data_reader_writer!(MockFkDriver);

    #[async_trait]
    impl DbDriver for MockFkDriver {
        fn db_type(&self) -> DbType {
            DbType::Postgres
        }
        async fn execute(&self, _: &str) -> crate::error::AppResult<crate::models::QueryResult> {
            unimplemented!()
        }
        async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }
        async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
        }
        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<String>> {
            Ok(vec![])
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
            _: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(vec![])
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
            table: &str,
            _: Option<String>,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            Ok(self.fks.get(table).cloned().unwrap_or_default())
        }
        async fn fetch_referenced_by_keys(
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

    fn names(tables: &[SyncTableConfig]) -> Vec<&str> {
        tables.iter().map(|t| t.source_table.as_str()).collect()
    }

    #[tokio::test]
    async fn orders_parents_before_children() {
        // Orden alfabético: brands antes de categories → violaría FK.
        let tables = vec![make_table("brands"), make_table("categories")];
        let driver = MockFkDriver::with(vec![("brands", vec!["categories"])]);

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        assert_eq!(names(&ordered), vec!["categories", "brands"]);
    }

    #[tokio::test]
    async fn keeps_stable_order_when_no_dependencies() {
        let tables = vec![
            make_table("audit_logs"),
            make_table("users"),
            make_table("orders"),
        ];
        let driver = MockFkDriver::with(vec![]);

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        assert_eq!(names(&ordered), vec!["audit_logs", "users", "orders"]);
    }

    #[tokio::test]
    async fn resolves_transitive_dependencies() {
        // products → categories → media (categories referencia a media)
        let tables = vec![
            make_table("products"),
            make_table("categories"),
            make_table("media"),
        ];
        let driver = MockFkDriver::with(vec![
            ("products", vec!["categories"]),
            ("categories", vec!["media"]),
        ]);

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        // media antes de categories antes de products
        assert_eq!(names(&ordered), vec!["media", "categories", "products"]);
    }

    #[tokio::test]
    async fn ignores_self_references() {
        // categories.parent_id -> categories.id (auto-referencia)
        let tables = vec![
            make_table("categories"),
            make_table("products"),
            make_table("brands"),
        ];
        let driver = MockFkDriver::with(vec![
            ("categories", vec!["categories"]),
            ("products", vec!["categories"]),
            ("brands", vec!["categories"]),
        ]);

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        // categories (raíz, índice 0) primero; products/brands conservan su
        // orden relativo original tras resolverse su dependencia.
        assert_eq!(names(&ordered), vec!["categories", "products", "brands"]);
    }

    #[tokio::test]
    async fn keeps_cycle_members_in_original_relative_order() {
        // a -> b -> a (ciclo), c independiente
        let tables = vec![make_table("a"), make_table("b"), make_table("c")];
        let driver = MockFkDriver::with(vec![("a", vec!["b"]), ("b", vec!["a"])]);

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        let names = names(&ordered);
        assert!(names.contains(&"a"));
        assert!(names.contains(&"b"));
        assert!(names.contains(&"c"));
        // c (independiente) debe salir antes que el ciclo
        assert_eq!(names[0], "c");
    }

    #[tokio::test]
    async fn falls_back_to_original_order_on_fk_errors() {
        struct FailingFkDriver;
        mock_data_reader_writer!(FailingFkDriver);
        #[async_trait]
        impl DbDriver for FailingFkDriver {
            fn db_type(&self) -> DbType {
                DbType::Mysql
            }
            async fn fetch_foreign_keys(
                &self,
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Err(crate::error::AppError::Database(
                    "FK metadata not supported".into(),
                ))
            }
            async fn close(&self) -> crate::error::AppResult<()> {
                Ok(())
            }
            async fn execute(
                &self,
                _: &str,
            ) -> crate::error::AppResult<crate::models::QueryResult> {
                unimplemented!()
            }
            async fn fetch_databases(&self) -> crate::error::AppResult<Vec<String>> {
                Ok(vec![])
            }
            async fn fetch_schemas(&self) -> crate::error::AppResult<Vec<String>> {
                Ok(vec![])
            }
            async fn fetch_tables(
                &self,
                _: Option<String>,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<String>> {
                Ok(vec![])
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
                _: &str,
                _: Option<String>,
            ) -> crate::error::AppResult<Vec<serde_json::Value>> {
                Ok(vec![])
            }
            async fn fetch_indexes(
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
        }

        let tables = vec![
            make_table("brands"),
            make_table("categories"),
            make_table("products"),
        ];
        let driver = FailingFkDriver;

        let ordered = FkOrderer::order_tables(tables, &driver, None)
            .await
            .unwrap();
        assert_eq!(names(&ordered), vec!["brands", "categories", "products"]);
    }
}
