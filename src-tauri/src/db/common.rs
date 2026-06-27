use chrono::{ DateTime, NaiveDate, NaiveTime, Utc };
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{ mysql::MySqlRow, Row };

pub type Decoder = fn(&MySqlRow, usize) -> Option<Value>;

pub fn decode_i64(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<i64>, _>(index).ok().flatten().map(Value::from)
}

pub fn decode_u8(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<u8>, _>(index).ok().flatten().map(|v| Value::from(v as i64))
}

pub fn decode_u16(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<u16>, _>(index).ok().flatten().map(|v| Value::from(v as i64))
}

pub fn decode_u32(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<u32>, _>(index).ok().flatten().map(|v| Value::from(v as i64))
}

pub fn decode_u64(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<u64>, _>(index)
        .ok()
        .flatten()
        .map(|v| {
            if v <= i64::MAX as u64 {
                Value::Number(serde_json::Number::from(v as i64))
            } else {
                Value::from(v.to_string())
            }
        })
}

pub fn decode_decimal(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<Decimal>, _>(index)
        .ok()
        .flatten()
        .map(|v| Value::from(v.to_string()))
}

pub fn decode_f64(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<f64>, _>(index).ok().flatten().map(Value::from)
}

pub fn decode_bool(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<bool>, _>(index).ok().flatten().map(Value::from)
}

pub fn decode_datetime_utc(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<DateTime<Utc>>, _>(index)
        .ok()
        .flatten()
        .map(|v| Value::from(v.format("%Y-%m-%d %H:%M:%S%.3f").to_string()))
}

pub fn decode_datetime(row: &MySqlRow, index: usize) -> Option<Value> {
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(index) {
        return Some(match v {
            Some(d) => Value::from(d.format("%Y-%m-%d %H:%M:%S").to_string()),
            None => Value::Null,
        });
    }

    if let Ok(v) = row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(index) {
        return Some(match v {
            Some(d) => Value::from(d.to_rfc3339()),
            None => Value::Null,
        });
    }

    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(index) {
        return Some(match v {
            Some(d) => Value::from(d.to_string()),
            None => Value::Null,
        });
    }

    None
}

pub fn decode_date(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<NaiveDate>, _>(index)
        .ok()
        .flatten()
        .map(|v| Value::from(v.format("%Y-%m-%d").to_string()))
}

pub fn decode_time(row: &MySqlRow, index: usize) -> Option<Value> {
    row.try_get::<Option<NaiveTime>, _>(index)
        .ok()
        .flatten()
        .map(|v| Value::from(v.format("%H:%M:%S").to_string()))
}

pub fn decode_string(row: &MySqlRow, index: usize) -> Option<Value> {
    if let Ok(v) = row.try_get::<Option<String>, _>(index) {
        if let Some(s) = v {
            return Some(Value::from(s));
        }
    }

    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(index) {
        if let Some(bytes) = v {
            return Some(Value::from(String::from_utf8_lossy(&bytes).to_string()));
        }
    }

    None
}

pub fn decode_bytes(row: &MySqlRow, index: usize) -> Option<Value> {
    let bytes = row.try_get::<Option<Vec<u8>>, _>(index).ok().flatten()?;

    Some(match String::from_utf8(bytes) {
        Ok(text) => Value::from(text),
        Err(_) => Value::from("<binary>"),
    })
}
