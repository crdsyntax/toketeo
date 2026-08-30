use crate::db::DbDriver;
use crate::error::{AppError, AppResult};
use crate::models::sql_flow::{SqlFlowEdge, SqlFlowGraph, SqlFlowNode};
use sqlparser::ast::{
    Expr, Ident, Join, JoinConstraint, JoinOperator, ObjectName, Query, Select, SelectItem,
    SetExpr, Statement, TableFactor, TableWithJoins,
};
use sqlparser::dialect::{
    Dialect, GenericDialect, MsSqlDialect, MySqlDialect, PostgreSqlDialect, SQLiteDialect,
};
use sqlparser::parser::Parser;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub struct SqlFlowService;

#[derive(Debug, Clone)]
struct TableInfo {
    name: String,
    alias: Option<String>,
}

impl SqlFlowService {
    fn select_dialect(dialect_name: Option<&str>) -> Box<dyn Dialect> {
        match dialect_name.map(|s| s.trim().to_lowercase()).as_deref() {
            Some("postgres") | Some("postgresql") => Box::new(PostgreSqlDialect {}),
            Some("mysql") | Some("mariadb") => Box::new(MySqlDialect {}),
            Some("sqlite") => Box::new(SQLiteDialect {}),
            Some("mssql") | Some("sqlserver") => Box::new(MsSqlDialect {}),
            _ => Box::new(GenericDialect {}),
        }
    }

    pub async fn get_flow_with_executed_result(
        query_str: &str,
        query_res: Option<&crate::models::QueryResult>,
        driver: Option<&Arc<dyn DbDriver>>,
        dialect_name: Option<&str>,
        schema: Option<&str>,
    ) -> AppResult<SqlFlowGraph> {
        let mut graph = Self::parse_query(query_str, dialect_name)?;

        if let Some(query_res) = query_res {
            let raw_rows = &query_res.rows;
            let result_columns = &query_res.columns;
            let mut result_cols_lower = HashMap::new();
            for col in result_columns {
                result_cols_lower.insert(col.to_lowercase(), col.clone());
            }

            for node in &mut graph.nodes {
                let col_defs = if let Some(driver) = driver {
                    driver
                        .fetch_columns(&node.id, schema.map(String::from))
                        .await
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };
                let table_cols: Vec<String> = col_defs
                    .iter()
                    .filter_map(|c| {
                        c.get("name")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect();
                let pk_cols: Vec<String> = col_defs
                    .iter()
                    .filter(|c| {
                        c.get("isPrimaryKey")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                    })
                    .filter_map(|c| {
                        c.get("name")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect();

                let mut matched_cols = Vec::new();
                let mut col_to_key = HashMap::new();

                for col in &table_cols {
                    let mut candidates = Vec::new();
                    candidates.push(col.clone());
                    if let Some(alias) = &node.alias {
                        candidates.push(format!("{alias}.{col}"));
                        candidates.push(format!("{alias}_{col}"));
                    }
                    candidates.push(format!("{}.{col}", node.id));
                    candidates.push(format!("{}_{col}", node.id));
                    let prefix = node.alias.clone().unwrap_or_else(|| node.id.clone());
                    candidates.push(format!("{prefix}__{col}"));

                    for cand in candidates {
                        if let Some(actual_key) = result_cols_lower.get(&cand.to_lowercase()) {
                            matched_cols.push(col.clone());
                            col_to_key.insert(col.clone(), actual_key.clone());
                            break;
                        }
                    }
                }

                let final_cols = if !matched_cols.is_empty() {
                    matched_cols
                } else {
                    // Fallback: match result columns by alias/table prefix pattern
                    // (e.g. "cuof__id" matches node with alias "cuof")
                    let prefix = node.alias.clone().unwrap_or_else(|| node.id.clone());
                    let prefix_dunder = format!("{prefix}__").to_lowercase();
                    let prefix_single = format!("{prefix}_").to_lowercase();
                    let mut prefix_matched = Vec::new();
                    let mut prefix_col_to_key = HashMap::new();

                    for result_col in result_columns {
                        let lower = result_col.to_lowercase();
                        let stripped = if lower.starts_with(&prefix_dunder) {
                            Some(result_col[prefix_dunder.len()..].to_string())
                        } else if lower.starts_with(&prefix_single) {
                            Some(result_col[prefix_single.len()..].to_string())
                        } else {
                            None
                        };
                        if let Some(col_name) = stripped {
                            prefix_matched.push(col_name.clone());
                            prefix_col_to_key.insert(col_name, result_col.clone());
                        }
                    }

                    if !prefix_matched.is_empty() {
                        // Merge prefix_col_to_key into col_to_key so row extraction
                        // can map the short column name back to the result key.
                        col_to_key.extend(prefix_col_to_key);
                        prefix_matched
                    } else {
                        result_columns.clone()
                    }
                };

                let mut seen_keys = HashSet::new();
                let mut extracted_rows = Vec::new();

                for r in raw_rows {
                    if let serde_json::Value::Object(map) = r {
                        let mut row_map = serde_json::Map::new();
                        let mut has_non_null = false;

                        for col in &final_cols {
                            let src_key = col_to_key
                                .get(col)
                                .cloned()
                                .or_else(|| result_cols_lower.get(&col.to_lowercase()).cloned())
                                .unwrap_or_else(|| col.clone());
                            let val = map
                                .get(&src_key)
                                .cloned()
                                .unwrap_or(serde_json::Value::Null);
                            if !val.is_null() {
                                has_non_null = true;
                            }
                            row_map.insert(col.clone(), val);
                        }

                        if !has_non_null {
                            continue;
                        }

                        let row_val = serde_json::Value::Object(row_map);
                        let dedup_key = if !pk_cols.is_empty()
                            && pk_cols
                                .iter()
                                .all(|pk| row_val.get(pk).map(|v| !v.is_null()).unwrap_or(false))
                        {
                            let pk_parts: Vec<String> = pk_cols
                                .iter()
                                .map(|pk| {
                                    row_val.get(pk).map(|v| v.to_string()).unwrap_or_default()
                                })
                                .collect();
                            format!("pk:{}", pk_parts.join("::"))
                        } else {
                            format!("val:{}", row_val)
                        };

                        if seen_keys.insert(dedup_key) {
                            extracted_rows.push(row_val);
                        }
                    }
                }

                node.columns = Some(final_cols);
                node.rows = Some(extracted_rows);
            }
        }

        Ok(graph)
    }

    pub fn parse_query(query_str: &str, dialect_name: Option<&str>) -> AppResult<SqlFlowGraph> {
        let trimmed = query_str.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation("Query cannot be empty".to_string()));
        }

        let dialect = Self::select_dialect(dialect_name);
        let statements = Parser::parse_sql(&*dialect, trimmed)
            .map_err(|e| AppError::Validation(format!("SQL parser error: {e}")))?;

        if statements.is_empty() {
            return Ok(SqlFlowGraph::default());
        }

        let mut nodes_map: HashMap<String, SqlFlowNode> = HashMap::new();
        let mut edges: Vec<SqlFlowEdge> = Vec::new();
        let mut edge_counter = 1;

        for stmt in statements {
            if let Statement::Query(query) = stmt {
                Self::process_query(*query, &mut nodes_map, &mut edges, &mut edge_counter);
            }
        }

        let nodes: Vec<SqlFlowNode> = nodes_map.into_values().collect();
        Ok(SqlFlowGraph { nodes, edges })
    }

    /// Rewrites a `SELECT` that uses `alias.*` / `*` projections into an explicit,
    /// disambiguated projection (`alias.col AS alias__col`). This keeps every joined
    /// table's columns uniquely named so downstream consumers can attribute them per
    /// node instead of having duplicate names collapse into a single JSON key.
    ///
    /// Returns `None` when the query cannot be safely rewritten (subqueries, mixed
    /// projections, parse errors, etc.) so the caller can fall back to the original SQL.
    pub async fn qualify_query(
        query_str: &str,
        driver: &Arc<dyn DbDriver>,
        dialect_name: Option<&str>,
        schema: Option<&str>,
    ) -> Option<String> {
        let mut stmts = {
            let dialect = Self::select_dialect(dialect_name);
            Parser::parse_sql(&*dialect, query_str).ok()?
        };
        if stmts.len() != 1 {
            return None;
        }
        let mut stmt = stmts.remove(0);
        let query = match &mut stmt {
            Statement::Query(q) => q,
            _ => return None,
        };
        let alias_map = Self::collect_alias_map(query)?;
        if Self::qualify_select_body(query, driver, schema, &alias_map).await {
            Some(stmt.to_string())
        } else {
            None
        }
    }

    fn collect_alias_map(query: &Query) -> Option<HashMap<String, String>> {
        let mut map = HashMap::new();
        let select = match query.body.as_ref() {
            SetExpr::Select(s) => s,
            _ => return None,
        };
        for twj in &select.from {
            if !Self::register_table_alias(&twj.relation, &mut map)? {
                return None;
            }
            for j in &twj.joins {
                if !Self::register_table_alias(&j.relation, &mut map)? {
                    return None;
                }
            }
        }
        Some(map)
    }

    /// Returns `Some(true)` when the factor is a plain table (registered into `map`),
    /// `Some(false)` when it is a subquery/derived/function (abort rewriting), or
    /// `None` on a hard error.
    fn register_table_alias(tf: &TableFactor, map: &mut HashMap<String, String>) -> Option<bool> {
        match tf {
            TableFactor::Table { name, alias, .. } => {
                let table = name.0.last().map(|i| i.value.clone()).unwrap_or_default();
                let key = alias
                    .as_ref()
                    .map(|a| a.name.value.clone())
                    .unwrap_or_else(|| table.clone());
                map.insert(key, table);
                Some(true)
            }
            TableFactor::Derived { .. }
            | TableFactor::TableFunction { .. }
            | TableFactor::NestedJoin { .. } => Some(false),
            _ => Some(false),
        }
    }

    async fn qualify_select_body(
        query: &mut Query,
        driver: &Arc<dyn DbDriver>,
        schema: Option<&str>,
        alias_map: &HashMap<String, String>,
    ) -> bool {
        let select = match query.body.as_mut() {
            SetExpr::Select(s) => s,
            _ => return false,
        };
        // Only rewrite when the projection is entirely wildcards; otherwise the
        // per-column attribution would be ambiguous.
        if select.projection.iter().any(|i| {
            !matches!(
                i,
                SelectItem::Wildcard(..) | SelectItem::QualifiedWildcard(..)
            )
        }) {
            return false;
        }

        let mut new_projection: Vec<SelectItem> = Vec::new();
        for item in &select.projection {
            match item {
                SelectItem::Wildcard(..) => {
                    if alias_map.len() != 1 {
                        return false;
                    }
                    let (prefix, table) = alias_map.iter().next().unwrap();
                    let cols = match driver.fetch_columns(table, schema.map(String::from)).await {
                        Ok(c) => c,
                        Err(_) => return false,
                    };
                    for c in cols {
                        let name = match c.get("name").and_then(|v| v.as_str()) {
                            Some(n) => n.to_string(),
                            None => continue,
                        };
                        new_projection.push(Self::qualified_item(prefix, &name));
                    }
                }
                SelectItem::QualifiedWildcard(obj, ..) => {
                    let alias = obj.0.last().map(|i| i.value.clone()).unwrap_or_default();
                    let table = match alias_map.get(&alias) {
                        Some(t) => t.clone(),
                        None => return false,
                    };
                    let cols = match driver.fetch_columns(&table, schema.map(String::from)).await {
                        Ok(c) => c,
                        Err(_) => return false,
                    };
                    for c in cols {
                        let name = match c.get("name").and_then(|v| v.as_str()) {
                            Some(n) => n.to_string(),
                            None => continue,
                        };
                        new_projection.push(Self::qualified_item(&alias, &name));
                    }
                }
                _ => return false,
            }
        }
        select.projection = new_projection;
        true
    }

    fn qualified_item(prefix: &str, col: &str) -> SelectItem {
        SelectItem::ExprWithAlias {
            expr: Expr::Identifier(Ident::new(col)),
            alias: Ident::new(format!("{}__{}", prefix, col)),
        }
    }

    fn process_query(
        query: Query,
        nodes_map: &mut HashMap<String, SqlFlowNode>,
        edges: &mut Vec<SqlFlowEdge>,
        edge_counter: &mut usize,
    ) {
        if let SetExpr::Select(select) = *query.body {
            Self::process_select(*select, nodes_map, edges, edge_counter);
        }
    }

    fn process_select(
        select: Select,
        nodes_map: &mut HashMap<String, SqlFlowNode>,
        edges: &mut Vec<SqlFlowEdge>,
        edge_counter: &mut usize,
    ) {
        for table_with_joins in select.from {
            Self::process_table_with_joins(table_with_joins, nodes_map, edges, edge_counter);
        }
    }

    fn process_table_with_joins(
        twj: TableWithJoins,
        nodes_map: &mut HashMap<String, SqlFlowNode>,
        edges: &mut Vec<SqlFlowEdge>,
        edge_counter: &mut usize,
    ) {
        let mut alias_to_table: HashMap<String, String> = HashMap::new();
        let mut current_root: Option<String> = None;

        // Process FROM base relation (Root table)
        if let Some(root_table) = Self::extract_table_factor(&twj.relation, true) {
            let table_id = root_table.name.clone();
            current_root = Some(table_id.clone());

            if let Some(alias) = &root_table.alias {
                alias_to_table.insert(alias.clone(), table_id.clone());
            }
            alias_to_table.insert(table_id.clone(), table_id.clone());

            nodes_map
                .entry(table_id.clone())
                .or_insert_with(|| SqlFlowNode {
                    id: table_id.clone(),
                    label: format!("{} (Tabla)", table_id),
                    is_root: true,
                    alias: root_table.alias.clone(),
                    columns: None,
                    rows: None,
                });
        }

        // Process JOIN clauses
        for join in twj.joins {
            Self::process_join(
                join,
                &current_root,
                &mut alias_to_table,
                nodes_map,
                edges,
                edge_counter,
            );
        }
    }

    fn process_join(
        join: Join,
        current_root: &Option<String>,
        alias_to_table: &mut HashMap<String, String>,
        nodes_map: &mut HashMap<String, SqlFlowNode>,
        edges: &mut Vec<SqlFlowEdge>,
        edge_counter: &mut usize,
    ) {
        let joined_table = match Self::extract_table_factor(&join.relation, false) {
            Some(t) => t,
            None => return,
        };

        let target_id = joined_table.name.clone();
        if let Some(alias) = &joined_table.alias {
            alias_to_table.insert(alias.clone(), target_id.clone());
        }
        alias_to_table.insert(target_id.clone(), target_id.clone());

        nodes_map
            .entry(target_id.clone())
            .or_insert_with(|| SqlFlowNode {
                id: target_id.clone(),
                label: format!("{} (Tabla)", target_id),
                is_root: false,
                alias: joined_table.alias.clone(),
                columns: None,
                rows: None,
            });

        let (join_type_str, on_label, on_expr) = match &join.join_operator {
            JoinOperator::Inner(constraint) => (
                "INNER JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            JoinOperator::LeftOuter(constraint) => (
                "LEFT JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            JoinOperator::RightOuter(constraint) => (
                "RIGHT JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            JoinOperator::FullOuter(constraint) => (
                "FULL JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            JoinOperator::CrossJoin => ("CROSS JOIN", String::new(), None),
            JoinOperator::CrossApply => ("CROSS APPLY", String::new(), None),
            JoinOperator::OuterApply => ("OUTER APPLY", String::new(), None),
            JoinOperator::Semi(constraint) => (
                "SEMI JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            JoinOperator::Anti(constraint) => (
                "ANTI JOIN",
                Self::constraint_to_label(constraint),
                Self::constraint_to_expr(constraint),
            ),
            _ => ("JOIN", String::new(), None),
        };

        // Determine source table by inspecting the ON condition identifiers
        let mut source_candidate: Option<String> = None;
        if let Some(expr) = on_expr {
            let referenced_qualifiers = Self::extract_qualifiers_from_expr(&expr);
            for qual in referenced_qualifiers {
                if let Some(resolved_tbl) = alias_to_table.get(&qual) {
                    if resolved_tbl != &target_id {
                        source_candidate = Some(resolved_tbl.clone());
                        break;
                    }
                }
            }
        }

        let source_id = source_candidate
            .or_else(|| current_root.clone())
            .unwrap_or_else(|| "unknown".to_string());

        let edge_id = format!("e{}", *edge_counter);
        *edge_counter += 1;

        edges.push(SqlFlowEdge {
            id: edge_id,
            source: source_id,
            target: target_id,
            label: on_label,
            join_type: join_type_str.to_string(),
        });
    }

    fn constraint_to_label(constraint: &JoinConstraint) -> String {
        match constraint {
            JoinConstraint::On(expr) => format!("ON {}", expr),
            JoinConstraint::Using(idents) => {
                let cols = idents
                    .iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("USING ({})", cols)
            }
            JoinConstraint::Natural => "NATURAL".to_string(),
            JoinConstraint::None => String::new(),
        }
    }

    fn constraint_to_expr(constraint: &JoinConstraint) -> Option<Expr> {
        match constraint {
            JoinConstraint::On(expr) => Some(expr.clone()),
            _ => None,
        }
    }

    fn extract_qualifiers_from_expr(expr: &Expr) -> HashSet<String> {
        let mut qualifiers = HashSet::new();
        Self::collect_qualifiers(expr, &mut qualifiers);
        qualifiers
    }

    fn collect_qualifiers(expr: &Expr, qualifiers: &mut HashSet<String>) {
        match expr {
            Expr::CompoundIdentifier(idents) => {
                if idents.len() >= 2 {
                    qualifiers.insert(idents[0].value.clone());
                }
            }
            Expr::BinaryOp { left, right, .. } => {
                Self::collect_qualifiers(left, qualifiers);
                Self::collect_qualifiers(right, qualifiers);
            }
            Expr::Nested(inner) => {
                Self::collect_qualifiers(inner, qualifiers);
            }
            _ => {}
        }
    }

    fn extract_table_factor(tf: &TableFactor, _is_root: bool) -> Option<TableInfo> {
        match tf {
            TableFactor::Table { name, alias, .. } => {
                let table_name = Self::object_name_to_string(name);
                let alias_str = alias.as_ref().map(|a| a.name.value.clone());
                Some(TableInfo {
                    name: table_name,
                    alias: alias_str,
                })
            }
            TableFactor::Derived { alias, .. } => {
                let alias_name = alias
                    .as_ref()
                    .map(|a| a.name.value.clone())
                    .unwrap_or_else(|| "derived_subquery".to_string());
                Some(TableInfo {
                    name: alias_name.clone(),
                    alias: Some(alias_name),
                })
            }
            _ => None,
        }
    }

    fn object_name_to_string(name: &ObjectName) -> String {
        name.0
            .iter()
            .map(|ident| ident.value.clone())
            .collect::<Vec<_>>()
            .join(".")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_multi_join_query() {
        let sql = r#"
            SELECT *
            FROM reserva r
            JOIN cuenta_por_cobrar c ON c.reservaId = r.id
            JOIN cuotas q ON q.cuentaId = c.id
            JOIN wallet w ON w.id = q.walletId
        "#;

        let graph = SqlFlowService::parse_query(sql, Some("postgres")).expect("Should parse");
        assert_eq!(graph.nodes.len(), 4);
        assert_eq!(graph.edges.len(), 3);

        let root_node = graph
            .nodes
            .iter()
            .find(|n| n.id == "reserva")
            .expect("reserva must exist");
        assert!(root_node.is_root);
        assert_eq!(root_node.alias.as_deref(), Some("r"));

        // Check edge relations
        let e1 = graph
            .edges
            .iter()
            .find(|e| e.target == "cuenta_por_cobrar")
            .unwrap();
        assert_eq!(e1.source, "reserva");
        assert!(e1.label.contains("c.reservaId = r.id"));

        let e2 = graph.edges.iter().find(|e| e.target == "cuotas").unwrap();
        assert_eq!(e2.source, "cuenta_por_cobrar");

        let e3 = graph.edges.iter().find(|e| e.target == "wallet").unwrap();
        assert_eq!(e3.source, "cuotas");
    }

    #[test]
    fn test_parse_single_table() {
        let sql = "SELECT id, name FROM users";
        let graph = SqlFlowService::parse_query(sql, None).expect("Should parse");
        assert_eq!(graph.nodes.len(), 1);
        assert_eq!(graph.nodes[0].id, "users");
        assert!(graph.nodes[0].is_root);
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn test_parse_invalid_sql() {
        let sql = "SELECT * FROMM invalid table JON x";
        let result = SqlFlowService::parse_query(sql, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_flow_populates_rows_from_executed_result() {
        // Replicates the real MariaDB output for the joined, qualified query.
        let columns = vec![
            "r__id".to_string(),
            "r__clienteId".to_string(),
            "cf__id".to_string(),
            "cf__tipo".to_string(),
            "c__id".to_string(),
            "cuof__id".to_string(),
            "ctx__id".to_string(),
            "w__id".to_string(),
            "wtx__id".to_string(),
        ];
        let row = serde_json::json!({
            "r__id": 19884,
            "r__clienteId": 12198,
            "cf__id": 4103,
            "cf__tipo": "ingreso",
            "c__id": 12198,
            "cuof__id": 18868,
            "ctx__id": 5786,
            "w__id": 238,
            "wtx__id": 581,
        });
        let query_res = crate::models::QueryResult {
            columns,
            column_types: None,
            rows: vec![row],
            execution_time_ms: 0,
            primary_keys: None,
            rows_affected: 0,
            next_cursor: None,
        };

        let sql = "SELECT r.id AS r__id, cf.id AS cf__id, c.id AS c__id, \
                   cuof.id AS cuof__id, ctx.id AS ctx__id, w.id AS w__id, wtx.id AS wtx__id \
                   FROM tb_reserva r \
                   INNER JOIN tb_cuenta_financiera cf ON cf.reservaId = r.id \
                   LEFT JOIN tb_cliente c ON cf.clienteId = c.id";
        let graph = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(SqlFlowService::get_flow_with_executed_result(
                sql,
                Some(&query_res),
                None,
                Some("mariadb"),
                Some("db_felizviaje_05122025"),
            ))
            .expect("flow");

        assert!(!graph.nodes.is_empty(), "nodes must be detected");
        for node in &graph.nodes {
            assert!(
                node.rows.as_ref().map(|r| !r.is_empty()).unwrap_or(false),
                "node {} must have rows",
                node.id
            );
        }
    }
}
