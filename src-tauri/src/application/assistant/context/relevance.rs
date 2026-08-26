use std::collections::HashSet;

use crate::models::assistant::{SchemaContext, TableContext};

pub struct RelevanceFilter;

impl RelevanceFilter {
    pub fn filter(ctx: &SchemaContext, question: &str) -> SchemaContext {
        let question_lower = question.to_lowercase();
        let all_table_names: Vec<&str> = ctx.tables.iter().map(|t| t.name.as_str()).collect();

        let mentioned = Self::find_mentioned_tables(&all_table_names, &question_lower);
        let all_fk_targets = Self::collect_fk_targets(&ctx.tables);

        let relevant_names: HashSet<&str> = mentioned
            .iter()
            .chain(
                mentioned
                    .iter()
                    .flat_map(|name| all_fk_targets.get(*name).into_iter().flatten()),
            )
            .copied()
            .collect();

        if relevant_names.is_empty() {
            return ctx.clone();
        }

        let (relevant, _other): (Vec<&TableContext>, Vec<&TableContext>) = ctx
            .tables
            .iter()
            .partition(|t| relevant_names.contains(t.name.as_str()));

        let other_names: Vec<&str> = ctx
            .tables
            .iter()
            .filter(|t| !relevant_names.contains(t.name.as_str()))
            .map(|t| t.name.as_str())
            .collect();

        let mut tables = relevant.into_iter().cloned().collect::<Vec<_>>();

        if !other_names.is_empty() {
            tables.push(TableContext {
                name: format!("[other tables: {}]", other_names.join(", ")),
                columns: vec![],
                indexes: vec![],
                foreign_keys: vec![],
                row_count: None,
            });
        }

        SchemaContext {
            tables,
            ..ctx.clone()
        }
    }

    fn find_mentioned_tables<'a>(
        table_names: &[&'a str],
        question_lower: &str,
    ) -> HashSet<&'a str> {
        table_names
            .iter()
            .filter(|name| {
                let lower = name.to_lowercase();
                question_lower.contains(&lower)
            })
            .copied()
            .collect()
    }

    fn collect_fk_targets(tables: &[TableContext]) -> std::collections::HashMap<&str, Vec<&str>> {
        let mut map: std::collections::HashMap<&str, Vec<&str>> = std::collections::HashMap::new();
        for table in tables {
            for fk in &table.foreign_keys {
                map.entry(table.name.as_str())
                    .or_default()
                    .push(fk.referenced_table.as_str());
            }
        }
        map
    }
}
