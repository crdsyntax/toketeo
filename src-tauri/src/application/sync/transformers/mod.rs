use crate::error::AppResult;
use crate::models::sync::{ColumnMapping, ColumnTransform};

/// Aplica transformaciones a un conjunto de filas según
/// los mapeos de columna configurados.
///
/// 1. Renombra columnas (source → destination).
/// 2. Aplica `ColumnTransform` por columna.
pub fn transform_rows(
    rows: Vec<serde_json::Value>,
    mappings: &[ColumnMapping],
) -> AppResult<Vec<serde_json::Value>> {
    let mut result = Vec::with_capacity(rows.len());

    for row in rows {
        let transformed = apply_mappings(&row, mappings)?;
        result.push(transformed);
    }

    Ok(result)
}

fn apply_mappings(
    row: &serde_json::Value,
    mappings: &[ColumnMapping],
) -> AppResult<serde_json::Value> {
    let mut map = serde_json::Map::new();

    for mapping in mappings {
        let value = row.get(&mapping.source_column).cloned().unwrap_or(serde_json::Value::Null);

        let transformed = if let Some(ref t) = mapping.transform {
            apply_transform(value, t)?
        } else {
            value
        };

        map.insert(mapping.destination_column.clone(), transformed);
    }

    Ok(serde_json::Value::Object(map))
}

fn apply_transform(
    value: serde_json::Value,
    transform: &ColumnTransform,
) -> AppResult<serde_json::Value> {
    match transform {
        ColumnTransform::Trim => {
            Ok(value.as_str().map(|s| serde_json::Value::String(s.trim().to_string())).unwrap_or(value))
        }
        ColumnTransform::Uppercase => {
            Ok(value.as_str().map(|s| serde_json::Value::String(s.to_uppercase())).unwrap_or(value))
        }
        ColumnTransform::Lowercase => {
            Ok(value.as_str().map(|s| serde_json::Value::String(s.to_lowercase())).unwrap_or(value))
        }
        ColumnTransform::DefaultValue { value: default } => {
            if value.is_null() {
                Ok(serde_json::Value::String(default.clone()))
            } else {
                Ok(value)
            }
        }
        ColumnTransform::Regex { pattern, replacement } => {
            let s = value.as_str().unwrap_or("");
            let re = regex::Regex::new(pattern)
                .map_err(|e| crate::error::AppError::Validation(format!("Invalid regex: {e}")))?;
            let result = re.replace_all(s, replacement.as_str()).to_string();
            Ok(serde_json::Value::String(result))
        }
        ColumnTransform::Concat { parts } => {
            Ok(serde_json::Value::String(parts.join("")))
        }
        ColumnTransform::Cast { target_type } => {
            cast_value(value, target_type)
        }
        ColumnTransform::DateFormat { format } => {
            date_format(value, format)
        }
    }
}

fn cast_value(value: serde_json::Value, target_type: &str) -> AppResult<serde_json::Value> {
    match target_type {
        "string" | "text" | "varchar" => {
            Ok(serde_json::Value::String(match value {
                serde_json::Value::String(s) => s,
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Null => String::new(),
                other => other.to_string(),
            }))
        }
        "int" | "integer" | "i64" => {
            let n = value.as_i64().unwrap_or(0);
            Ok(serde_json::json!(n))
        }
        "float" | "double" | "f64" => {
            let n = value.as_f64().unwrap_or(0.0);
            Ok(serde_json::json!(n))
        }
        "bool" | "boolean" => {
            let b = value.as_bool().unwrap_or(false);
            Ok(serde_json::Value::Bool(b))
        }
        _ => Ok(value),
    }
}

fn date_format(value: serde_json::Value, format: &str) -> AppResult<serde_json::Value> {
    let s = match value.as_str() {
        Some(s) if !s.is_empty() => s,
        _ => return Ok(value),
    };

    // Try common ISO 8601 / datetime formats automatically
    let parsed = try_parse_datetime(s);
    let formatted = match parsed {
        Some(dt) => {
            if format.contains('%') {
                // strftime-style format
                dt.format(format).to_string()
            } else {
                // Common named format shortcuts
                match format {
                    "date" => dt.format("%Y-%m-%d").to_string(),
                    "datetime" => dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                    "time" => dt.format("%H:%M:%S").to_string(),
                    "timestamp" => dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                    "year" => dt.format("%Y").to_string(),
                    "month" => dt.format("%Y-%m").to_string(),
                    _ => {
                        // Treat as strftime format
                        let fmt = format.replace("YYYY", "%Y")
                            .replace("yy", "%y")
                            .replace("MM", "%m")
                            .replace("dd", "%d")
                            .replace("HH", "%H")
                            .replace("mm", "%M")
                            .replace("ss", "%S");
                        dt.format(&fmt).to_string()
                    }
                }
            }
        }
        None => return Ok(value),
    };

    Ok(serde_json::Value::String(formatted))
}

/// Try to parse a datetime string from common formats.
fn try_parse_datetime(s: &str) -> Option<chrono::NaiveDateTime> {
    // ISO 8601 with timezone: 2024-01-15T10:30:00Z or 2024-01-15T10:30:00+00:00
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.naive_utc());
    }
    // ISO 8601 without timezone
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(dt);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(dt);
    }
    // Date only
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d.and_hms_opt(0, 0, 0).unwrap());
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%d/%m/%Y") {
        return Some(d.and_hms_opt(0, 0, 0).unwrap());
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%m/%d/%Y") {
        return Some(d.and_hms_opt(0, 0, 0).unwrap());
    }
    // Timestamp with milliseconds
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(dt);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return Some(dt);
    }
    None
}
