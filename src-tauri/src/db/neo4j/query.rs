use crate::db::neo4j::result::row_to_graph;
use crate::error::{AppError, AppResult};
use crate::models::GraphResult;
use neo4rs::Graph;
use std::time::Duration;

/// Timeout por defecto para una consulta Cypher (protege queries sin fin).
const DEFAULT_QUERY_TIMEOUT: Duration = Duration::from_secs(60);

/// Ejecuta una query Cypher con parámetros posicionales (`$0`, `$1`, …) y
/// devuelve el grafo normalizado. Los valores de usuario SIEMPRE viajan como
/// parámetros tipados — nunca se concatenan al texto de la query.
pub async fn execute_cypher(
    graph: &Graph,
    query_text: &str,
    params: &[Option<String>],
    timeout: Option<Duration>,
) -> AppResult<GraphResult> {
    let mut query = neo4rs::query(query_text);
    for (index, value) in params.iter().enumerate() {
        let key = index.to_string();
        query = match value {
            Some(v) => query.param(key.as_str(), v.as_str()),
            None => query.param(key.as_str(), neo4rs::BoltType::Null(neo4rs::BoltNull)),
        };
    }

    let timeout = timeout.unwrap_or(DEFAULT_QUERY_TIMEOUT);
    let stream = tokio::time::timeout(timeout, graph.execute(query))
        .await
        .map_err(|_| {
            AppError::Database(format!(
                "Query timed out after {:?} — consider adding a LIMIT",
                timeout
            ))
        })?
        .map_err(AppError::from)?;

    let mut result = GraphResult::default();
    let mut stream = stream;
    while let Some(row) = tokio::time::timeout(timeout, stream.next())
        .await
        .map_err(|_| {
            AppError::Database(format!(
                "Query timed out while streaming rows after {:?}",
                timeout
            ))
        })?
        .map_err(AppError::from)?
    {
        let partial = row_to_graph(&row);
        result.nodes.extend(partial.nodes);
        result.relationships.extend(partial.relationships);
        result.paths.extend(partial.paths);
    }
    Ok(result)
}

/// Ejecuta una query de verificación de conectividad (ping).
pub async fn ping(graph: &Graph) -> AppResult<()> {
    let mut stream = tokio::time::timeout(DEFAULT_QUERY_TIMEOUT, graph.execute("RETURN 1"))
        .await
        .map_err(|_| AppError::Connection("Neo4j ping timed out".into()))?
        .map_err(AppError::from)?;
    while stream.next().await?.is_some() {}
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_timeout_is_sane() {
        assert_eq!(DEFAULT_QUERY_TIMEOUT.as_secs(), 60);
    }

    #[test]
    fn test_neo4rs_error_maps_to_app_error() {
        let err = neo4rs::Error::AuthenticationError("bad credentials".into());
        let app_err = AppError::from(err);
        assert!(matches!(app_err, AppError::Auth(_)));
    }
}
