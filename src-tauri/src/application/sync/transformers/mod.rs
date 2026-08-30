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
        let value = row
            .get(&mapping.source_column)
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        let transformed = if let Some(ref t) = mapping.transform {
            apply_transform(value, t)?
        } else {
            value
        };

        map.insert(
            mapping.destination_column.clone(),
            sanitize_json_value(transformed),
        );
    }

    Ok(serde_json::Value::Object(map))
}

/// Elimina null bytes (0x00) de todos los strings (valores y claves de
/// objetos) de un valor JSON. Previene errores `invalid byte sequence for
/// encoding "UTF8": 0x00` en targets que rechazan null bytes (PostgreSQL).
/// Punto único de saneo para TODOS los drivers antes de cualquier upsert.
pub fn sanitize_json_value(val: serde_json::Value) -> serde_json::Value {
    match val {
        serde_json::Value::String(s) => serde_json::Value::String(sanitize_string(&s)),
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.into_iter()
                .map(|(k, v)| (sanitize_string(&k), sanitize_json_value(v)))
                .collect(),
        ),
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(sanitize_json_value).collect())
        }
        other => other,
    }
}

fn sanitize_string(s: &str) -> String {
    if s.contains('\0') {
        s.replace('\0', "")
    } else {
        s.to_string()
    }
}

fn apply_transform(
    value: serde_json::Value,
    transform: &ColumnTransform,
) -> AppResult<serde_json::Value> {
    match transform {
        ColumnTransform::Trim => Ok(value
            .as_str()
            .map(|s| serde_json::Value::String(s.trim().to_string()))
            .unwrap_or(value)),
        ColumnTransform::Uppercase => Ok(value
            .as_str()
            .map(|s| serde_json::Value::String(s.to_uppercase()))
            .unwrap_or(value)),
        ColumnTransform::Lowercase => Ok(value
            .as_str()
            .map(|s| serde_json::Value::String(s.to_lowercase()))
            .unwrap_or(value)),
        ColumnTransform::DefaultValue { value: default } => {
            if value.is_null() {
                Ok(serde_json::Value::String(default.clone()))
            } else {
                Ok(value)
            }
        }
        ColumnTransform::Regex {
            pattern,
            replacement,
        } => {
            let s = value.as_str().unwrap_or("");
            let re = regex::Regex::new(pattern)
                .map_err(|e| crate::error::AppError::Validation(format!("Invalid regex: {e}")))?;
            let result = re.replace_all(s, replacement.as_str()).to_string();
            Ok(serde_json::Value::String(result))
        }
        ColumnTransform::Concat { parts } => Ok(serde_json::Value::String(parts.join(""))),
        ColumnTransform::Cast { target_type } => cast_value(value, target_type),
        ColumnTransform::DateFormat { format } => date_format(value, format),
    }
}

fn cast_value(value: serde_json::Value, target_type: &str) -> AppResult<serde_json::Value> {
    match target_type {
        "string" | "text" | "varchar" => Ok(serde_json::Value::String(match value {
            serde_json::Value::String(s) => s,
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Null => String::new(),
            other => other.to_string(),
        })),
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
                        let fmt = format
                            .replace("YYYY", "%Y")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_removes_null_bytes_from_scalars() {
        let val = serde_json::json!("a\0b\0c");
        assert_eq!(sanitize_json_value(val), serde_json::json!("abc"));
    }

    #[test]
    fn sanitize_recurses_into_objects_and_arrays() {
        let val = serde_json::json!({
            "ke\0y": "va\0lue",
            "arr": ["x\0", {"nested": "y\0z"}],
            "num": 42,
        });
        let cleaned = sanitize_json_value(val);
        let obj = cleaned.as_object().unwrap();
        assert!(obj.contains_key("key"));
        assert_eq!(obj["key"], serde_json::json!("value"));
        assert_eq!(obj["arr"][0], serde_json::json!("x"));
        assert_eq!(obj["arr"][1]["nested"], serde_json::json!("yz"));
        assert_eq!(obj["num"], serde_json::json!(42));
    }

    #[test]
    fn transform_rows_strips_null_bytes_through_mappings() {
        let row = serde_json::json!({ "name": "a\0b", "price": 10 });
        let mappings = vec![ColumnMapping {
            source_column: "name".into(),
            destination_column: "name".into(),
            transform: None,
        }];
        let out = transform_rows(vec![row], &mappings).unwrap();
        assert_eq!(out[0]["name"], serde_json::json!("ab"));
    }
}
