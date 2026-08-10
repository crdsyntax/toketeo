use crate::models::{GraphNode, GraphPath, GraphRelationship, GraphResult};
use neo4rs::{Node, Path, Relation, Row};

/// Normaliza un nodo del driver a un `GraphNode` neutral.
/// D2: `id` es el `elementId` de Neo4j en producción; el driver RC aún solo
/// expone el id numérico, así que por ahora se usa `id(n)` con warning de
/// degradación (migrar a elementId cuando el driver lo exponga).
fn node_to_graph(node: &Node) -> GraphNode {
    let mut properties = std::collections::HashMap::new();
    for key in node.keys() {
        if let Ok(value) = node.get::<serde_json::Value>(key) {
            properties.insert(key.to_string(), value);
        }
    }
    GraphNode {
        id: node.id().to_string(),
        labels: node.labels().into_iter().map(|l| l.to_string()).collect(),
        properties,
    }
}

fn relation_to_graph(relation: &Relation) -> GraphRelationship {
    let mut properties = std::collections::HashMap::new();
    for key in relation.keys() {
        if let Ok(value) = relation.get::<serde_json::Value>(key) {
            properties.insert(key.to_string(), value);
        }
    }
    GraphRelationship {
        id: relation.id().to_string(),
        r#type: relation.typ().to_string(),
        source: relation.start_node_id().to_string(),
        target: relation.end_node_id().to_string(),
        properties,
    }
}

fn path_to_graph(path: &Path) -> GraphPath {
    let indices = path.indices();
    let relationships = path
        .rels()
        .iter()
        .enumerate()
        .map(|(i, r)| GraphRelationship {
            id: r.id().to_string(),
            r#type: r.typ().to_string(),
            source: indices
                .get(i * 2)
                .map(|v| v.to_string())
                .unwrap_or_default(),
            target: indices
                .get(i * 2 + 2)
                .map(|v| v.to_string())
                .unwrap_or_default(),
            properties: r
                .keys()
                .iter()
                .filter_map(|k| {
                    r.get::<serde_json::Value>(k)
                        .ok()
                        .map(|v| (k.to_string(), v))
                })
                .collect(),
        })
        .collect();
    GraphPath {
        nodes: path.nodes().iter().map(node_to_graph).collect(),
        relationships,
    }
}

/// Convierte una fila en un `GraphResult` parcial: acumula nodos, relaciones y
/// caminos vistos en la fila. La normalización completa (topología de la query
/// `RETURN`) se afina en la Fase 2.
pub fn row_to_graph(row: &Row) -> GraphResult {
    let mut result = GraphResult::default();
    for key in row.keys() {
        let key = key.value.as_str();
        if let Ok(node) = row.get::<Node>(key) {
            result.nodes.push(node_to_graph(&node));
            continue;
        }
        if let Ok(rel) = row.get::<Relation>(key) {
            result.relationships.push(relation_to_graph(&rel));
            continue;
        }
        if let Ok(path) = row.get::<Path>(key) {
            let graph_path = path_to_graph(&path);
            result.paths.push(graph_path.clone());
            result.nodes.extend(graph_path.nodes);
            result.relationships.extend(graph_path.relationships);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::GraphResult;
    use neo4rs::{BoltInteger, BoltList, BoltMap, BoltNode, BoltType};

    fn bolt_node(id: i64, labels: Vec<&str>, name: &str) -> BoltNode {
        let mut map = BoltMap::default();
        map.put("name".into(), name.into());
        BoltNode::new(
            BoltInteger::new(id),
            BoltList::from(labels.into_iter().map(BoltType::from).collect::<Vec<_>>()),
            map,
        )
    }

    #[test]
    fn test_row_to_graph_accumulates_nodes() {
        let node = bolt_node(1, vec!["Person"], "Alice");
        let fields = BoltList::from(vec![BoltType::from("n")]);
        let data = BoltList::from(vec![BoltType::from(node)]);
        let row = Row::new(fields, data);

        let result: GraphResult = row_to_graph(&row);
        assert_eq!(result.nodes.len(), 1);
        assert_eq!(result.nodes[0].id, "1");
        assert_eq!(result.nodes[0].labels, vec!["Person"]);
        assert_eq!(
            result.nodes[0]
                .properties
                .get("name")
                .and_then(|v| v.as_str()),
            Some("Alice")
        );
        assert!(result.relationships.is_empty());
        assert!(result.paths.is_empty());
    }

    #[test]
    fn test_row_to_graph_empty_row() {
        let fields = BoltList::from(vec![BoltType::from("x")]);
        let data = BoltList::from(vec![BoltType::from(42)]);
        let row = Row::new(fields, data);

        let result = row_to_graph(&row);
        assert!(result.nodes.is_empty());
        assert!(result.relationships.is_empty());
        assert!(result.paths.is_empty());
    }
}
