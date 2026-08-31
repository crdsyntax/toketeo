pub mod constraint_comparator;
pub mod fk_comparator;
pub mod index_comparator;
pub mod normalizer;
pub mod routine_comparator;
pub mod table_comparator;
pub mod trigger_comparator;
pub mod view_comparator;

pub(crate) const INTROSPECTION_CONCURRENCY: usize = 4;

pub use constraint_comparator::{compare_constraints_for_table, compare_table_constraints};
pub use fk_comparator::{compare_foreign_keys_for_table, compare_table_foreign_keys};
pub use index_comparator::{compare_indexes_for_table, compare_table_indexes};
pub use normalizer::{hash_sql, normalize_sql};
pub use routine_comparator::{compare_functions, compare_procedures};
pub use table_comparator::{compare_columns, compare_table, compare_tables};
pub use trigger_comparator::compare_triggers;
pub use view_comparator::{
    compare_views, compare_views_for_names, compute_hashes, fetch_view_ddls,
};
