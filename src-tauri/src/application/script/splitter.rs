fn contains_sql(fragment: &str) -> bool {
    let bytes = fragment.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] == b'-' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() {
                if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    i += 2;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == '\'' || c == '"' || c == '`' {
            return true;
        }
        if !c.is_whitespace() && c != ';' {
            return true;
        }
        i += 1;
    }
    false
}

fn parse_delimiter(sql_rest: &str) -> Option<String> {
    let trimmed = sql_rest.trim_start_matches(|c: char| c.is_whitespace());
    let head = trimmed.get(.."DELIMITER".len())?;
    if !head.eq_ignore_ascii_case("DELIMITER") {
        return None;
    }
    let after = trimmed.get("DELIMITER".len()..)?;
    let next = after.chars().next()?;
    if !next.is_whitespace() {
        return None;
    }
    let token = after.split_whitespace().next()?;
    if token.is_empty() {
        return None;
    }
    Some(token.to_string())
}

pub fn split_statements(sql: &str) -> Vec<String> {
    if sql.trim().is_empty() {
        return Vec::new();
    }
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut delimiter = String::from(";");
    let bytes = sql.as_bytes();
    let mut i = 0usize;
    let mut at_line_start = true;

    while i < bytes.len() {
        let c = bytes[i] as char;

        if c == '-' && i + 1 < bytes.len() && bytes[i + 1] == b'-' {
            while i < bytes.len() && bytes[i] != b'\n' {
                current.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }

        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            let start = i;
            i += 2;
            let mut closed = false;
            while i + 1 < bytes.len() {
                if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    closed = true;
                    i += 2;
                    break;
                }
                i += 1;
            }
            if !closed {
                i = bytes.len();
            }
            current.push_str(&sql[start..i]);
            continue;
        }

        if c == '\'' {
            current.push(c);
            i += 1;
            while i < bytes.len() {
                let sc = bytes[i] as char;
                current.push(sc);
                i += 1;
                if sc == '\'' && i < bytes.len() && bytes[i] == b'\'' {
                    current.push('\'');
                    i += 1;
                    continue;
                }
                if sc == '\'' {
                    break;
                }
            }
            continue;
        }

        if c == '"' || c == '`' {
            current.push(c);
            i += 1;
            while i < bytes.len() {
                let qc = bytes[i] as char;
                current.push(qc);
                i += 1;
                if qc == c && i < bytes.len() && bytes[i] as char == c {
                    current.push(c);
                    i += 1;
                    continue;
                }
                if qc == c {
                    break;
                }
            }
            continue;
        }

        if at_line_start {
            if let Some(rest) = sql.get(i..) {
                if let Some(new_delimiter) = parse_delimiter(rest) {
                    if contains_sql(&current) {
                        statements.push(current.clone());
                        current.clear();
                    }

                    while i < bytes.len() && bytes[i] != b'\n' {
                        i += 1;
                    }
                    if i < bytes.len() {
                        i += 1;
                    }
                    delimiter = new_delimiter;
                    at_line_start = true;
                    continue;
                }
            }
        }

        let delim = delimiter.as_bytes();
        if i + delim.len() <= bytes.len() && &bytes[i..i + delim.len()] == delim {
            if delimiter == ";" {
                current.push_str(&delimiter);
            }
            i += delim.len();
            if contains_sql(&current) {
                statements.push(current.clone());
            }
            current.clear();
            at_line_start = false;
            continue;
        }

        current.push(c);
        if c == '\n' {
            at_line_start = true;
        } else if !c.is_whitespace() {
            at_line_start = false;
        }
        i += 1;
    }

    if contains_sql(&current) {
        statements.push(current);
    }

    statements
}

#[cfg(test)]
mod tests {
    use super::split_statements;

    #[test]
    fn splits_multiple_statements() {
        let sql = "CREATE TABLE a (id INT); INSERT INTO a VALUES (1); SELECT * FROM a;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].trim(), "CREATE TABLE a (id INT);");
        assert_eq!(parts[1].trim(), "INSERT INTO a VALUES (1);");
        assert_eq!(parts[2].trim(), "SELECT * FROM a;");
    }

    #[test]
    fn last_statement_without_semicolon() {
        let parts = split_statements("INSERT INTO a VALUES (1); SELECT 1");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[1].trim(), "SELECT 1");
    }

    #[test]
    fn semicolons_inside_strings_are_ignored() {
        let sql = "INSERT INTO t (msg) VALUES ('a;b'); SELECT 'a;y';";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].trim(), "INSERT INTO t (msg) VALUES ('a;b');");
        assert_eq!(parts[1].trim(), "SELECT 'a;y';");
    }

    #[test]
    fn escaped_quotes_are_kept() {
        let parts = split_statements("INSERT INTO t (m) VALUES ('it''s; ok');");
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].trim(), "INSERT INTO t (m) VALUES ('it''s; ok');");
    }

    #[test]
    fn backticks_and_double_quotes_protect_semicolons() {
        let sql = "CREATE TABLE `a;b` (id INT); SELECT \"x;y\" FROM t;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].trim(), "CREATE TABLE `a;b` (id INT);");
        assert_eq!(parts[1].trim(), "SELECT \"x;y\" FROM t;");
    }

    #[test]
    fn comments_are_kept_inside_statements() {
        let sql = "-- header comment\nSELECT 1; /* block\n */ INSERT INTO a VALUES (2);";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].contains("-- header comment"));
        assert!(parts[1].contains("/* block\n */"));
        assert!(parts[1].trim().ends_with(';'));
    }

    #[test]
    fn only_comments_produce_no_statements() {
        let parts = split_statements("-- nothing here\n/* still nothing */\n");
        assert!(parts.is_empty());
    }

    #[test]
    fn empty_and_padding_produce_nothing() {
        assert!(split_statements("").is_empty());
        assert!(split_statements("   \n\t  ").is_empty());
        assert!(split_statements(";;\n-- x").is_empty());
    }

    #[test]
    fn trailing_comment_after_statement_is_attached() {
        let parts = split_statements("SELECT 1; -- one\nSELECT 2;");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].trim(), "SELECT 1;");
        assert!(parts[1].contains("-- one"));
        assert!(parts[1].trim().ends_with(';'));
    }

    #[test]
    fn delimiter_changes_terminator_and_is_removed() {
        let sql =
            "DELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND$$\nDELIMITER ;\nSELECT 2;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].contains("CREATE PROCEDURE p()"));
        assert!(parts[0].contains("SELECT 1;"));
        assert!(parts[0].trim().ends_with("END"));
        assert!(!parts[0].contains("DELIMITER"));
        assert_eq!(parts[1].trim(), "SELECT 2;");
    }

    #[test]
    fn delimiter_restores_semicolon_after_block() {
        let sql = "DELIMITER //\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN SET NEW.x = 1; END//\nDELIMITER ;\nDROP TRIGGER t;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].trim().starts_with("CREATE TRIGGER"));
        assert!(parts[0].trim().ends_with("END"));
        assert_eq!(parts[1].trim(), "DROP TRIGGER t;");
    }

    #[test]
    fn delimiter_is_case_insensitive_and_allows_any_token() {
        let sql = "delimiter //\nCREATE FUNCTION f() RETURNS INT DETERMINISTIC BEGIN RETURN 1; END//\nDELIMITER ;\nSELECT f();";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert!(parts[0].trim().starts_with("CREATE FUNCTION"));
        assert!(parts[0].trim().ends_with("END"));
        assert_eq!(parts[1].trim(), "SELECT f();");
    }

    #[test]
    fn delimiter_does_not_close_inside_strings() {
        let sql = "DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT '$$'; END$$\nDELIMITER ;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 1);
        assert!(parts[0].trim().starts_with("CREATE PROCEDURE"));
        assert!(parts[0].trim().ends_with("END"));
        assert!(parts[0].contains("'$$'"));
    }

    #[test]
    fn delimiter_only_recognized_at_line_start() {
        let sql = "SELECT 1; DELIMITER $$\nSELECT 2$$\nDELIMITER ;";
        let parts = split_statements(sql);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].trim(), "SELECT 1;");
        assert!(parts[1].trim().starts_with("DELIMITER $$"));
        assert!(parts[1].trim().ends_with("SELECT 2$$"));
    }
}
