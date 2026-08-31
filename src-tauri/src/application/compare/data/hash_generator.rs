use crate::db::{DbDriver, DbType};
use crate::error::AppResult;

pub async fn compute_table_hashes(
    driver: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
    columns: &[String],
    pk_column: &str,
    chunk_size: usize,
    last_pk: Option<&str>,
) -> AppResult<Vec<(String, String)>> {
    let db_type = driver.db_type();
    let schema_clause = schema.map(|s| format!("`{}`.", s)).unwrap_or_default();
    let qualified = format!("{}`{}`", schema_clause, table);

    let pk_quoted = quote_column(pk_column, &db_type);
    let cols_quoted: Vec<String> = columns.iter().map(|c| quote_column(c, &db_type)).collect();

    let hash_expr = build_hash_expr(&cols_quoted, &db_type);

    let keyset_clause = last_pk
        .map(|last| format!("WHERE {} > {}", pk_quoted, quote_pk_literal(last, &db_type)))
        .unwrap_or_default();

    let query = match db_type {
        DbType::Mysql | DbType::Mariadb => {
            format!(
                "SELECT {} AS pk, {} AS row_hash FROM {} {} ORDER BY {} LIMIT {}",
                pk_quoted, hash_expr, qualified, keyset_clause, pk_quoted, chunk_size
            )
        }
        DbType::Postgres => {
            format!(
                "SELECT {}::text AS pk, {} AS row_hash FROM {} {} ORDER BY {} LIMIT {}",
                pk_quoted, hash_expr, qualified, keyset_clause, pk_quoted, chunk_size
            )
        }
        DbType::Sqlite => {
            format!(
                "SELECT CAST({} AS TEXT) AS pk, {} AS row_hash FROM {} {} ORDER BY {} LIMIT {}",
                pk_quoted, hash_expr, qualified, keyset_clause, pk_quoted, chunk_size
            )
        }
        DbType::Sqlserver => {
            format!(
                "SELECT CAST({} AS NVARCHAR(MAX)) AS pk, {} AS row_hash FROM {} {} ORDER BY {} OFFSET 0 ROWS FETCH NEXT {} ROWS ONLY",
                pk_quoted, hash_expr, qualified, keyset_clause, pk_quoted, chunk_size
            )
        }
        _ => {
            return Err(crate::error::AppError::Validation(
                "Unsupported database type for hash generation".into(),
            ))
        }
    };

    let result = driver.execute(&query).await?;
    let rows: Vec<(String, String)> = result
        .rows
        .iter()
        .filter_map(|row| {
            let pk = row
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let hash = row
                .get(1)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if pk.is_empty() {
                None
            } else {
                Some((pk, hash))
            }
        })
        .collect();

    Ok(rows)
}

fn quote_column(col: &str, db_type: &DbType) -> String {
    match db_type {
        DbType::Mysql | DbType::Mariadb => format!("`{}`", col),
        DbType::Postgres => format!("\"{}\"", col),
        DbType::Sqlite => format!("\"{}\"", col),
        DbType::Sqlserver => format!("[{}]", col),
        _ => col.to_string(),
    }
}

fn quote_pk_literal(pk: &str, db_type: &DbType) -> String {
    let numeric = !pk.is_empty()
        && pk
            .chars()
            .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
        && pk.parse::<f64>().is_ok();
    if numeric {
        pk.to_string()
    } else {
        let escaped = pk.replace('\'', "''");
        match db_type {
            DbType::Sqlserver => format!("N'{}'", escaped),
            _ => format!("'{}'", escaped),
        }
    }
}

fn build_hash_expr(columns: &[String], db_type: &DbType) -> String {
    match db_type {
        DbType::Mysql | DbType::Mariadb => {
            let concat = columns
                .iter()
                .map(|c| format!("COALESCE(CAST({} AS CHAR), 'NULL')", c))
                .collect::<Vec<_>>()
                .join(", '||', ");
            format!("MD5(CONCAT_WS('||', {}))", concat)
        }
        DbType::Postgres => {
            let concat = columns
                .iter()
                .map(|c| format!("COALESCE({}::text, 'NULL')", c))
                .collect::<Vec<_>>()
                .join(" || '||' || ");
            format!("MD5({})", concat)
        }
        DbType::Sqlite => {
            let concat = columns
                .iter()
                .map(|c| format!("COALESCE(CAST({} AS TEXT), 'NULL')", c))
                .collect::<Vec<_>>()
                .join(" || '||' || ");
            format!("hex(md5({}))", concat)
        }
        DbType::Sqlserver => {
            let concat = columns
                .iter()
                .map(|c| format!("COALESCE(CAST({} AS NVARCHAR(MAX)), 'NULL')", c))
                .collect::<Vec<_>>()
                .join(" + '||' + ");
            format!(
                "CONVERT(VARCHAR(32), HASHBYTES('MD5', CONCAT_WS('||', {})), 2)",
                concat
            )
        }
        _ => "''".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mysql_hash_expr() {
        let db_type = DbType::Mysql;
        let cols = ["id".to_string(), "name".to_string()];
        let quoted: Vec<String> = cols.iter().map(|c| quote_column(c, &db_type)).collect();
        let expr = build_hash_expr(&quoted, &db_type);
        assert!(expr.contains("MD5"));
        assert!(expr.contains("CONCAT_WS"));
        assert!(expr.contains("`id`"));
        assert!(expr.contains("`name`"));
        assert!(expr.contains("COALESCE"));
    }

    #[test]
    fn postgres_hash_expr() {
        let db_type = DbType::Postgres;
        let cols = ["id".to_string(), "name".to_string()];
        let quoted: Vec<String> = cols.iter().map(|c| quote_column(c, &db_type)).collect();
        let expr = build_hash_expr(&quoted, &db_type);
        assert!(expr.contains("MD5"));
        assert!(expr.contains("::text"));
        assert!(expr.contains("\"id\""));
        assert!(expr.contains("'||'"));
    }

    #[test]
    fn sqlite_hash_expr() {
        let db_type = DbType::Sqlite;
        let cols = ["id".to_string()];
        let quoted: Vec<String> = cols.iter().map(|c| quote_column(c, &db_type)).collect();
        let expr = build_hash_expr(&quoted, &db_type);
        assert!(expr.contains("md5"));
        assert!(expr.contains("CAST"));
        assert!(expr.contains("\"id\""));
    }

    #[test]
    fn sqlserver_hash_expr() {
        let db_type = DbType::Sqlserver;
        let cols = ["id".to_string()];
        let quoted: Vec<String> = cols.iter().map(|c| quote_column(c, &db_type)).collect();
        let expr = build_hash_expr(&quoted, &db_type);
        assert!(expr.contains("HASHBYTES"));
        assert!(expr.contains("NVARCHAR(MAX)"));
        assert!(expr.contains("[id]"));
    }

    #[test]
    fn quote_mysql() {
        assert_eq!(quote_column("name", &DbType::Mysql), "`name`");
    }

    #[test]
    fn quote_postgres() {
        assert_eq!(quote_column("name", &DbType::Postgres), "\"name\"");
    }

    #[test]
    fn quote_sqlserver() {
        assert_eq!(quote_column("name", &DbType::Sqlserver), "[name]");
    }
}
