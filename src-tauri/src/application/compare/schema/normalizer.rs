use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

fn re_definer() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*DEFINER\s*=\s*\S+").unwrap())
}

fn re_algorithm() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*ALGORITHM\s*=\s*\w+").unwrap())
}

fn re_security() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*SQL\s+SECURITY\s+(?:DEFINER|INVOKER)").unwrap())
}

fn re_line_comment() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)--[^\n]*").unwrap())
}

fn re_block_comment() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?s)/\*.*?\*/").unwrap())
}

fn re_spaces() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s+").unwrap())
}

pub fn normalize_sql(sql: &str) -> String {
    let mut s = sql.trim().to_string();

    s = re_definer().replace_all(&s, "").to_string();
    s = re_algorithm().replace_all(&s, "").to_string();
    s = re_security().replace_all(&s, "").to_string();
    s = re_line_comment().replace_all(&s, "").to_string();
    s = re_block_comment().replace_all(&s, "").to_string();
    s = re_spaces().replace_all(&s, " ").to_string();
    s = s.replace('\n', " ").replace('\r', "");

    s.trim().to_string()
}

pub fn hash_sql(sql: &str) -> String {
    let normalized = normalize_sql(sql);
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_definer_clause() {
        let sql = "CREATE DEFINER=`root`@`localhost` VIEW v AS SELECT 1";
        let n = normalize_sql(sql);
        assert!(!n.to_uppercase().contains("DEFINER"));
        assert!(n.to_uppercase().contains("VIEW"));
    }

    #[test]
    fn strips_algorithm_and_security() {
        let sql = "CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW v AS SELECT 1";
        let n = normalize_sql(sql);
        assert!(!n.to_uppercase().contains("ALGORITHM"));
        assert!(!n.to_uppercase().contains("SQL SECURITY"));
    }

    #[test]
    fn strips_line_and_block_comments() {
        let sql = "SELECT 1 -- comment\n/* block */ FROM t";
        let n = normalize_sql(sql);
        assert!(!n.contains("comment"));
        assert!(!n.contains("block"));
        assert!(n.contains("SELECT 1"));
        assert!(n.contains("FROM t"));
    }

    #[test]
    fn collapses_whitespace() {
        let sql = "SELECT   1\n\n  FROM    dual";
        let n = normalize_sql(sql);
        assert_eq!(n, "SELECT 1 FROM dual");
    }

    #[test]
    fn same_logic_same_hash() {
        let a = "CREATE DEFINER=`u`@`h` VIEW v AS SELECT  1";
        let b = "CREATE VIEW v AS SELECT 1";
        assert_eq!(hash_sql(a), hash_sql(b));
    }

    #[test]
    fn different_logic_different_hash() {
        let a = "SELECT 1";
        let b = "SELECT 2";
        assert_ne!(hash_sql(a), hash_sql(b));
    }

    #[test]
    fn hash_is_stable_hex_sha256() {
        let h = hash_sql("SELECT 1");
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn empty_and_whitespace_only() {
        assert_eq!(normalize_sql("   \n  "), "");
        assert_eq!(hash_sql(""), hash_sql("   "));
    }
}
