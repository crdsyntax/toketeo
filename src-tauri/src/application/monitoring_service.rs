use crate::application::audit_service::AuditService;
use crate::db::DbType;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub struct MonitoringService;

impl MonitoringService {
    pub async fn get_process_list(state: &AppState, id: &str) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        let query = match driver.db_type() {
            DbType::Mysql | DbType::Mariadb => {
                "SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, LEFT(INFO, 200) AS INFO \
                 FROM information_schema.processlist \
                 WHERE COMMAND <> 'Sleep' \
                 ORDER BY TIME DESC"
            }
            DbType::Postgres => {
                "SELECT pid AS ID, usename AS USER, client_addr AS HOST, datname AS DB, \
                        state AS COMMAND, \
                        EXTRACT(EPOCH FROM (now() - query_start))::bigint AS TIME, \
                        wait_event AS STATE, LEFT(query, 200) AS INFO \
                 FROM pg_stat_activity \
                 WHERE state <> 'idle' \
                 ORDER BY TIME DESC"
            }
            other => {
                return Err(AppError::Validation(format!(
                    "Process list is not supported for {}",
                    other
                )));
            }
        };
        let result = driver.execute(query).await?;
        Ok(result.rows)
    }

    pub async fn get_slow_queries(
        state: &AppState,
        id: &str,
        min_time: u64,
    ) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;

        let query = match driver.db_type() {
            DbType::Mysql | DbType::Mariadb => {
                format!(
                    "SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, LEFT(INFO, 200) AS INFO \
                     FROM information_schema.processlist \
                     WHERE TIME > {} AND COMMAND <> 'Sleep' \
                     ORDER BY TIME DESC",
                    min_time
                )
            }
            DbType::Postgres => {
                format!(
                    "SELECT pid AS ID, usename AS USER, client_addr AS HOST, datname AS DB, \
                            state AS COMMAND, \
                            EXTRACT(EPOCH FROM (now() - query_start))::bigint AS TIME, \
                            wait_event AS STATE, LEFT(query, 200) AS INFO \
                     FROM pg_stat_activity \
                     WHERE state <> 'idle' \
                       AND EXTRACT(EPOCH FROM (now() - query_start)) > {} \
                     ORDER BY TIME DESC",
                    min_time
                )
            }
            other => {
                return Err(AppError::Validation(format!(
                    "Slow query monitoring is not supported for {}",
                    other
                )));
            }
        };
        let result = driver.execute(&query).await?;
        Ok(result.rows)
    }

    pub async fn get_innodb_status(state: &AppState, id: &str) -> AppResult<serde_json::Value> {
        let driver = state.get_connection(id).await?;
        match driver.db_type() {
            DbType::Mysql | DbType::Mariadb => {
                let result = driver.execute("SHOW ENGINE INNODB STATUS").await?;
                let raw = result
                    .rows
                    .first()
                    .and_then(|row| row.get("Status"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(serde_json::json!({
                    "type": "InnoDB",
                    "status": raw,
                    "transactionsSection": extract_innodb_section(&raw, "TRANSACTIONS"),
                    "sections": extract_innodb_sections(&raw),
                    "summary": parse_innodb_summary(&raw),
                }))
            }
            other => Err(AppError::Validation(format!(
                "InnoDB status is not supported for {}",
                other
            ))),
        }
    }

    pub async fn kill_process(state: &AppState, id: &str, process_id: &str) -> AppResult<String> {
        let trimmed = process_id.trim();
        if trimmed.is_empty() || !trimmed.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(format!(
                "Invalid process ID '{}': only numeric IDs are allowed.",
                process_id
            )));
        }

        if state.is_read_only(id).await? {
            return Err(AppError::Validation(
                "Connection is in read-only mode. Kill operations are disabled.".to_string(),
            ));
        }

        let driver = state.get_connection(id).await?;
        let sql = match driver.db_type() {
            DbType::Mysql | DbType::Mariadb => format!("KILL {}", trimmed),
            DbType::Postgres => format!("SELECT pg_terminate_backend({})", trimmed),
            other => {
                return Err(AppError::Validation(format!(
                    "Kill is not supported for {}",
                    other
                )));
            }
        };

        let start = std::time::Instant::now();
        match driver.execute(&sql).await {
            Ok(_) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    sql.clone(),
                    start.elapsed().as_millis() as u64,
                    "success".to_string(),
                    None,
                )
                .await;
                Ok(format!("Process {} killed successfully", trimmed))
            }
            Err(e) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    sql,
                    start.elapsed().as_millis() as u64,
                    "error".to_string(),
                    Some(e.to_string()),
                )
                .await;
                Err(e)
            }
        }
    }
}

fn is_innodb_header(lines: &[&str], index: usize) -> bool {
    let line = lines[index];
    let has_lowercase = line.chars().any(|c| c.is_ascii_lowercase());
    let next_is_dashes = lines
        .get(index + 1)
        .map(|next| {
            let trimmed = next.trim();
            !trimmed.is_empty() && trimmed.chars().all(|c| c == '-')
        })
        .unwrap_or(false);
    !line.trim().is_empty() && !has_lowercase && next_is_dashes
}

fn extract_innodb_section(status: &str, name: &str) -> Option<String> {
    let lines: Vec<&str> = status.lines().collect();
    let header = lines.iter().position(|l| l.trim() == name)?;

    let mut end = lines.len();
    let mut i = header + 2;
    while i < lines.len() {
        if is_innodb_header(&lines, i) || lines[i].contains("END OF INNODB MONITOR OUTPUT") {
            end = i;
            break;
        }
        i += 1;
    }

    Some(lines[header..end].join("\n"))
}

fn extract_innodb_sections(status: &str) -> Vec<serde_json::Value> {
    let lines: Vec<&str> = status.lines().collect();

    let mut headers: Vec<usize> = Vec::new();
    for (i, _) in lines.iter().enumerate() {
        if is_innodb_header(&lines, i) {
            headers.push(i);
        }
    }

    let end_marker = lines
        .iter()
        .position(|l| l.contains("END OF INNODB MONITOR OUTPUT"));

    let mut sections = Vec::new();
    for (idx, &header) in headers.iter().enumerate() {
        let end = headers
            .get(idx + 1)
            .copied()
            .or(end_marker)
            .unwrap_or(lines.len());
        sections.push(serde_json::json!({
            "name": lines[header].trim(),
            "content": lines[header..end].join("\n"),
        }));
    }
    sections
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InnodbIndicator {
    id: &'static str,
    label: &'static str,
    value: String,
    hint: &'static str,

    level: &'static str,
}

fn parse_innodb_summary(status: &str) -> serde_json::Value {
    let active_transactions = status
        .lines()
        .filter(|l| l.trim_start().starts_with("---TRANSACTION"))
        .filter(|l| !l.contains("not started"))
        .count();
    let lock_waits = status.lines().filter(|l| l.contains("LOCK WAIT")).count();
    let deadlock_detected = status.contains("LATEST DETECTED DEADLOCK");
    let history_list_length = capture_u64(status, r"History list length\s+(\d+)");
    let row_locks = status
        .lines()
        .filter_map(|l| capture_u64(l, r"(\d+)\s+row lock\(s\)"))
        .sum::<u64>();

    let buffer_pool_size = capture_u64(status, r"Buffer pool size\s+(\d+)");
    let free_buffers = capture_u64(status, r"Free buffers\s+(\d+)");
    let dirty_pages = capture_u64(status, r"(?:Dirty pages|Modified db pages)\s+(\d+)");
    let free_pct = match (free_buffers, buffer_pool_size) {
        (Some(free), Some(total)) if total > 0 => Some((free as f64 / total as f64) * 100.0),
        _ => None,
    };

    let writes_re = regex::Regex::new(r"aio writes:\s*\[([^\]]*)\]").unwrap();
    let pending_writes = status
        .lines()
        .filter_map(|l| {
            writes_re
                .captures(l)?
                .get(1)?
                .as_str()
                .split(',')
                .filter_map(|s| s.trim().parse::<u64>().ok())
                .reduce(|a, b| a + b)
        })
        .max();

    let mut indicators: Vec<InnodbIndicator> = Vec::new();

    let (tx_value, tx_level, tx_hint) = if lock_waits > 0 {
        (
            format!("{}", lock_waits),
            "critical",
            "Queries waiting for another query to release a locked row. This can freeze the application.",
        )
    } else if active_transactions > 0 {
        (
            format!("{}", active_transactions),
            "ok",
            "Queries currently being executed by the engine.",
        )
    } else {
        (
            "0".to_string(),
            "ok",
            "No queries running right now. The engine is idle.",
        )
    };
    indicators.push(InnodbIndicator {
        id: "active_transactions",
        label: "Active transactions",
        value: tx_value,
        hint: tx_hint,
        level: tx_level,
    });

    indicators.push(InnodbIndicator {
        id: "lock_waits",
        label: "Waiting on locks",
        value: format!("{}", lock_waits),
        hint: if lock_waits > 0 {
            "Blocked queries — they cannot finish until a locked row is released."
        } else {
            "No query is blocked. Locks are being acquired and released normally."
        },
        level: if lock_waits > 0 { "critical" } else { "ok" },
    });

    indicators.push(InnodbIndicator {
        id: "deadlock",
        label: "Deadlock",
        value: if deadlock_detected { "Detected".to_string() } else { "None".to_string() },
        hint: if deadlock_detected {
            "Two queries blocked each other and the engine auto-recovered. Check the process list for the involved queries."
        } else {
            "No circular locking detected. This is good."
        },
        level: if deadlock_detected { "critical" } else { "ok" },
    });

    let history_value = history_list_length
        .map(|v| format!("{}", v))
        .unwrap_or_else(|| "—".to_string());
    let history_high = history_list_length.map(|v| v > 10000).unwrap_or(false);
    indicators.push(InnodbIndicator {
        id: "history_list",
        label: "Undo backlog",
        value: history_value,
        hint: if history_high {
            "A long-running transaction is keeping old data alive. Watch for sessions that never finish."
        } else {
            "Old versions of rows are being cleaned up normally. Nothing is piling up."
        },
        level: if history_high { "warning" } else { "ok" },
    });

    let (memory_value, memory_level, memory_hint) = match free_pct {
        Some(pct) if pct < 10.0 => (
            format!("{:.0}%", pct),
            "warning",
            "The engine cache is nearly full. Add more RAM or review heavy queries.",
        ),
        Some(pct) => (
            format!("{:.0}%", pct),
            "ok",
            "How much engine cache is free. Plenty of headroom.",
        ),
        None => ("—".to_string(), "ok", "Engine memory info not available."),
    };
    indicators.push(InnodbIndicator {
        id: "buffer_pool",
        label: "Cache memory free",
        value: memory_value,
        hint: memory_hint,
        level: memory_level,
    });

    let writes_value = pending_writes
        .map(|v| format!("{}", v))
        .unwrap_or_else(|| "0".to_string());
    let writes_backlog = pending_writes.map(|v| v > 100).unwrap_or(false);
    indicators.push(InnodbIndicator {
        id: "pending_writes",
        label: "Pending disk writes",
        value: writes_value,
        hint: if writes_backlog {
            "Many changes still need to be saved to disk. The disk may be the bottleneck."
        } else {
            "Changes are being written to disk normally."
        },
        level: if writes_backlog { "warning" } else { "ok" },
    });

    indicators.push(InnodbIndicator {
        id: "dirty_pages",
        label: "Unsaved changes",
        value: dirty_pages
            .map(|v| format!("{}", v))
            .unwrap_or_else(|| "—".to_string()),
        hint: if dirty_pages.map(|v| v > 10000).unwrap_or(false) {
            "A lot of changes in memory are not on disk yet. A crash could lose them — check disk speed."
        } else {
            "Data is being flushed to disk as expected."
        },
        level: if dirty_pages.map(|v| v > 10000).unwrap_or(false) { "warning" } else { "ok" },
    });

    indicators.push(InnodbIndicator {
        id: "row_locks",
        label: "Locked rows",
        value: format!("{}", row_locks),
        hint: if row_locks > 0 {
            "How many rows are currently locked by running transactions."
        } else {
            "No rows are locked right now."
        },
        level: if row_locks > 0 { "info" } else { "ok" },
    });

    let (health, health_message) = if deadlock_detected {
        (
            "critical".to_string(),
            "The engine detected a deadlock between two queries. It recovered automatically, but the affected queries may have failed.".to_string(),
        )
    } else if lock_waits > 0 {
        (
            "critical".to_string(),
            format!(
                "{} quer{} blocked waiting on row locks. The database may feel slow or frozen until the lock is released.",
                lock_waits,
                if lock_waits == 1 { "y is" } else { "ies are" }
            ),
        )
    } else if history_high || free_pct.map(|p| p < 10.0).unwrap_or(false) || writes_backlog {
        (
            "warning".to_string(),
            "The engine is running, but there are signs of pressure (undo backlog, low cache or disk writes). Monitor the indicators below.".to_string(),
        )
    } else {
        (
            "ok".to_string(),
            "The storage engine looks healthy. No blocked queries, no deadlocks, and plenty of cache headroom.".to_string(),
        )
    };

    serde_json::json!({
        "health": health,
        "healthMessage": health_message,
        "indicators": indicators,
    })
}

fn capture_u64(text: &str, pattern: &str) -> Option<u64> {
    regex::Regex::new(pattern)
        .ok()?
        .captures(text)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_transactions_section() {
        let status = "\
Header
-------
TRANSACTIONS
------------
Trx id counter 1234
Purge done for trx's n:o < 100
History list length 5
...
FILE I/O
--------
I/O thread 0 state: waiting
END OF INNODB MONITOR OUTPUT";
        let section = extract_innodb_section(status, "TRANSACTIONS").unwrap();
        assert!(section.contains("TRANSACTIONS"));
        assert!(section.contains("Trx id counter 1234"));
        assert!(!section.contains("FILE I/O"));
        assert!(!section.contains("END OF INNODB"));
    }

    #[test]
    fn transactions_section_absent_returns_none() {
        let status = "FOO\n---\nbar\n";
        assert!(extract_innodb_section(status, "TRANSACTIONS").is_none());
    }

    #[test]
    fn extracts_all_innodb_sections_in_order() {
        let status = "\
BACKGROUND THREAD
----------------
srv_master_thread loops: 123
TRANSACTIONS
------------
Trx id counter 5
FILE I/O
--------
I/O thread 0 state: waiting
END OF INNODB MONITOR OUTPUT";
        let sections = extract_innodb_sections(status);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0]["name"], "BACKGROUND THREAD");
        assert!(sections[0]["content"]
            .as_str()
            .unwrap()
            .contains("srv_master_thread loops: 123"));
        assert_eq!(sections[1]["name"], "TRANSACTIONS");
        assert!(sections[1]["content"]
            .as_str()
            .unwrap()
            .contains("Trx id counter 5"));
        assert_eq!(sections[2]["name"], "FILE I/O");
        let last = sections[2]["content"].as_str().unwrap();
        assert!(last.contains("I/O thread 0 state: waiting"));
        assert!(!last.contains("END OF INNODB"));
    }

    #[test]
    fn extract_innodb_sections_ignores_top_banner() {
        let status = "\
=====================================
2024-01-01 10:00:00 0x123 INNODB MONITOR OUTPUT
=====================================
Per second averages calculated from the last 18 seconds
-----------------
BACKGROUND THREAD
-----------------
stuff
END OF INNODB MONITOR OUTPUT";
        let sections = extract_innodb_sections(status);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0]["name"], "BACKGROUND THREAD");
    }

    #[test]
    fn extract_innodb_sections_empty_without_headers() {
        let status = "just some text\nwith lowercase\n";
        assert!(extract_innodb_sections(status).is_empty());
    }

    #[test]
    fn summary_healthy_engine() {
        let status = "\
TRANSACTIONS
------------
Trx id counter 1234
History list length 5
---TRANSACTION 1, not started
0 lock struct(s), heap size 1136, 0 row lock(s)
BUFFER POOL AND MEMORY
----------------------
Buffer pool size 8192
Free buffers 4000
FILE I/O
--------
Pending normal aio reads: [0] 0, aio writes: [0, 0, 0, 0] |
END OF INNODB MONITOR OUTPUT";
        let summary = parse_innodb_summary(status);
        assert_eq!(summary["health"], "ok");
        let indicators = summary["indicators"].as_array().unwrap();
        assert_eq!(indicators.len(), 8);
        let tx = indicators[0].clone();
        assert_eq!(tx["id"], "active_transactions");
        assert_eq!(tx["value"], "0");
        assert_eq!(tx["level"], "ok");
    }

    #[test]
    fn summary_detects_lock_waits_and_deadlock() {
        let status = "\
LATEST DETECTED DEADLOCK
------------------------
2024-01-01 10:00:00 0x0
*** (1) TRANSACTION:
TRANSACTIONS
------------
Trx id counter 99
History list length 20000
---TRANSACTION 100, ACTIVE 30 sec
1 lock struct(s), heap size 1136, 3 row lock(s)
LOCK WAIT 2 lock struct(s), heap size 1136, 5 row lock(s)
---TRANSACTION 101, ACTIVE 40 sec
BUFFER POOL AND MEMORY
----------------------
Buffer pool size 8192
Free buffers 100
FILE I/O
--------
Pending normal aio reads: [0] 0, aio writes: [200, 300, 400, 500] |
END OF INNODB MONITOR OUTPUT";
        let summary = parse_innodb_summary(status);
        assert_eq!(summary["health"], "critical");
        let indicators = summary["indicators"].as_array().unwrap();
        let lock_waits = indicators.iter().find(|i| i["id"] == "lock_waits").unwrap();
        assert_eq!(lock_waits["value"], "1");
        assert_eq!(lock_waits["level"], "critical");
        let deadlock = indicators.iter().find(|i| i["id"] == "deadlock").unwrap();
        assert_eq!(deadlock["value"], "Detected");
        let history = indicators
            .iter()
            .find(|i| i["id"] == "history_list")
            .unwrap();
        assert_eq!(history["value"], "20000");
        assert_eq!(history["level"], "warning");
    }

    #[test]
    fn capture_u64_extracts_number() {
        assert_eq!(
            capture_u64("History list length 42", r"History list length\s+(\d+)"),
            Some(42)
        );
        assert_eq!(capture_u64("none", r"History list length\s+(\d+)"), None);
    }
}
