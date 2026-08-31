use std::sync::RwLock;

use super::embeddings::{cosine_similarity, KnowledgeKind};

struct IndexEntry {
    knowledge_id: String,
    kind: KnowledgeKind,
    dim: usize,
    vector: Vec<f32>,
}

#[derive(Default)]
pub struct VectorIndex {
    entries: RwLock<Vec<IndexEntry>>,
}

pub struct VectorHit {
    pub knowledge_id: String,
    pub kind: KnowledgeKind,

    pub similarity: f32,
}

impl VectorIndex {
    pub fn replace_all(&self, entries: Vec<(String, KnowledgeKind, Vec<f32>)>) {
        let mut guard = self.entries.write().unwrap();
        guard.clear();
        guard.reserve(entries.len());
        for (id, kind, vector) in entries {
            let dim = vector.len();
            guard.push(IndexEntry {
                knowledge_id: id,
                kind,
                dim,
                vector,
            });
        }
    }

    pub fn insert(&self, knowledge_id: String, kind: KnowledgeKind, vector: Vec<f32>) {
        let mut guard = self.entries.write().unwrap();
        guard.retain(|e| e.knowledge_id != knowledge_id);
        let dim = vector.len();
        guard.push(IndexEntry {
            knowledge_id,
            kind,
            dim,
            vector,
        });
    }

    pub fn remove(&self, knowledge_id: &str) {
        self.entries
            .write()
            .unwrap()
            .retain(|e| e.knowledge_id != knowledge_id);
    }

    pub fn search(&self, query: &[f32], k: usize) -> Vec<VectorHit> {
        if query.is_empty() || k == 0 {
            return vec![];
        }
        let guard = self.entries.read().unwrap();
        let mut scored: Vec<(f32, &IndexEntry)> = guard
            .iter()
            .filter(|e| e.dim == query.len())
            .map(|e| (cosine_similarity(query, &e.vector), e))
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored
            .into_iter()
            .take(k)
            .map(|(similarity, e)| VectorHit {
                knowledge_id: e.knowledge_id.clone(),
                kind: e.kind,
                similarity,
            })
            .collect()
    }

    pub fn len(&self) -> usize {
        self.entries.read().unwrap().len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.read().unwrap().is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_returns_nearest_and_skips_dim_mismatch() {
        let idx = VectorIndex::default();
        idx.replace_all(vec![
            ("a".into(), KnowledgeKind::Qa, vec![1.0, 0.0]),
            ("b".into(), KnowledgeKind::Qa, vec![0.0, 1.0]),
            ("c".into(), KnowledgeKind::Error, vec![1.0]),
        ]);

        let hits = idx.search(&[1.0, 0.0], 2);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].knowledge_id, "a");
        assert!((hits[0].similarity - 1.0).abs() < 1e-6);
        assert_eq!(hits[1].knowledge_id, "b");

        assert_eq!(hits[0].kind, KnowledgeKind::Qa);

        idx.insert("a".into(), KnowledgeKind::Qa, vec![0.9, 0.1]);
        idx.remove("a");
        let hits = idx.search(&[1.0, 0.0], 5);
        assert!(hits.iter().all(|h| h.knowledge_id != "a"));
        assert_eq!(idx.len(), 2);
    }
}
