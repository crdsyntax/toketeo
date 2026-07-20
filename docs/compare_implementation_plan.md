# Plan de Implementación: Schema Compare + Data Compare + Sync Script Generator

## Visión General

Módulo completo de comparación entre dos bases de datos que cubre:

1. **Schema Compare** — Compara toda la estructura (tablas, columnas, índices, FKs, views, procedures, functions, triggers)
2. **Data Compare** — Compara registros usando hash por fila para detectar diferencias sin traer todos los datos
3. **Sync Script Generator** — Genera el SQL de sincronización basado en las diferencias encontradas

---

## Arquitectura

```
src-tauri/src/
├── models/
│   └── compare.rs                          # Todos los tipos de datos del módulo
│
├── application/
│   └── compare/
│       ├── mod.rs
│       ├── compare_service.rs               # Orquestador: schema compare, data compare, script gen
│       │
│       ├── schema/
│       │   ├── mod.rs
│       │   ├── types.rs                     # SchemaReport, ObjectDiff, etc.
│       │   ├── normalizer.rs                # Normalización de SQL (DEFINER, whitespace, comments)
│       │   ├── table_comparator.rs          # Columnas, engine, charset, collation, comment
│       │   ├── index_comparator.rs          # PRIMARY, UNIQUE, INDEX, FULLTEXT, SPATIAL
│       │   ├── fk_comparator.rs             # Foreign keys (referenced table, ON DELETE/UPDATE)
│       │   ├── constraint_comparator.rs     # CHECK, UNIQUE constraints
│       │   ├── view_comparator.rs           # Normalización + hash comparison
│       │   ├── routine_comparator.rs        # Procedures y Functions (normalize + hash)
│       │   └── trigger_comparator.rs        # BEFORE/AFTER, event type, body hash
│       │
│       ├── data/
│       │   ├── mod.rs
│       │   ├── types.rs                     # DataReport, TableDataDiff, RowDiff
│       │   ├── pk_resolver.rs              # Detectar PK o UNIQUE para comparación
│       │   ├── hash_generator.rs            # MD5/SHA2 de filas en chunks
│       │   ├── chunk_reader.rs              # Lectura paginada source/target
│       │   ├── row_comparator.rs            # Diff columna por columna para filas modificadas
│       │   └── diff_builder.rs              # Ensamblar DataReport final
│       │
│       ├── report/
│       │   ├── mod.rs
│       │   ├── types.rs                     # FullReport, ReportSection
│       │   └── generator.rs                 # Generación de reporte JSON
│       │
│       └── script_generator/
│           ├── mod.rs
│           ├── types.rs                     # SyncScript, ScriptStatement, ScriptOptions
│           └── generators/
│               ├── mod.rs
│               ├── mysql_generator.rs       # ALTER TABLE, CREATE/DROP INDEX, etc.
│               ├── postgres_generator.rs    # ALTER COLUMN, CREATE OR REPLACE, etc.
│               └── sqlite_generator.rs      # Recreación de tablas (limitaciones de SQLite)
│
├── presentation/tauri/
│   └── commands.rs                          # Nuevos commands: compare_schemas, compare_data, etc.
```

---

## Modelos de Datos

### models/compare.rs

```rust
use serde::{Deserialize, Serialize};

// ============================================================
// Schema Compare Types
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CompareStatus {
    Equal,      // ✔ Igual
    Modified,   // ⚠ Modificado
    Missing,    // ❌ Existe en A, no en B
    New,        // ➕ No existe en A, sí en B
}

/// Reporte completo de Schema Compare.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SchemaReport {
    pub source_name: String,
    pub target_name: String,
    pub compared_at: String,
    pub tables: Vec<ObjectDiff>,
    pub views: Vec<ObjectDiff>,
    pub procedures: Vec<ObjectDiff>,
    pub functions: Vec<ObjectDiff>,
    pub triggers: Vec<ObjectDiff>,
    pub indexes: Vec<IndexDiff>,
    pub foreign_keys: Vec<FkDiff>,
    pub constraints: Vec<ConstraintDiff>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// Diferencia genérica de un objeto de esquema.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObjectDiff {
    pub name: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Diferencia detallada de una tabla (columnas + metadatos).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDiff {
    pub status: CompareStatus,
    pub columns: Vec<ColumnDiffDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charset_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collation_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_changed: Option<(String, String)>,
}

/// Diferencia detallada de una columna.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDiffDetail {
    pub name: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_nullable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_nullable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_default: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_default: Option<String>,
}

/// Diferencia de índice.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns_changed: Option<(Vec<String>, Vec<String>)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_changed: Option<(bool, bool)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_changed: Option<(String, String)>,
}

/// Diferencia de foreign key.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FkDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referenced_table: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_delete: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_update: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<(Vec<String>, Vec<String>)>,
}

/// Diferencia de constraint (CHECK, UNIQUE).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConstraintDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraint_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition_changed: Option<(String, String)>,
}

/// Diferencia de vista (comparación por hash normalizado).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ViewDiff {
    pub name: String,
    pub status: CompareStatus,
    pub source_hash: String,
    pub target_hash: String,
}

/// Diferencia de routine (procedure o function).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoutineDiff {
    pub name: String,
    pub routine_type: String, // "PROCEDURE" | "FUNCTION"
    pub status: CompareStatus,
    pub source_hash: String,
    pub target_hash: String,
}

/// Diferencia de trigger.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_changed: Option<(String, String)>,   // (BEFORE, AFTER)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_changed: Option<(String, String)>,     // (INSERT, UPDATE, DELETE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_hash_changed: Option<(String, String)>, // (hash_a, hash_b)
}

// ============================================================
// Data Compare Types
// ============================================================

/// Reporte completo de Data Compare.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DataReport {
    pub tables: Vec<TableDataDiff>,
}

/// Diferencia de datos por tabla.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDataDiff {
    pub table: String,
    pub status: CompareStatus,
    pub source_count: u64,
    pub target_count: u64,
    pub rows_equal: u64,
    pub rows_modified: u64,
    pub rows_only_in_source: u64,
    pub rows_only_in_target: u64,
    pub pk_columns: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub column_diffs: Vec<RowColumnDiff>,
}

/// Diferencia de una columna específica en una fila modificada.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RowColumnDiff {
    pub pk_value: String,
    pub column: String,
    pub source_value: Option<serde_json::Value>,
    pub target_value: Option<serde_json::Value>,
}

// ============================================================
// Script Generator Types
// ============================================================

/// Script de sincronización generado.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncScript {
    pub statements: Vec<ScriptStatement>,
    pub target_db_type: String,
}

/// Una sentencia SQL del script.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptStatement {
    pub id: String,
    pub sql: String,
    pub description: String,
    pub diff_type: String,
    pub object_name: String,
    pub object_type: String,
    pub selected: bool,
}

/// Opciones de generación del script.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptOptions {
    pub include_creates: bool,
    pub include_alters: bool,
    pub include_drops: bool,
    pub include_indexes: bool,
    pub include_constraints: bool,
    pub include_views: bool,
    pub include_routines: bool,
    pub wrap_in_transaction: bool,
}

impl Default for ScriptOptions {
    fn default() -> Self {
        Self {
            include_creates: true,
            include_alters: true,
            include_drops: true,
            include_indexes: true,
            include_constraints: true,
            include_views: true,
            include_routines: true,
            wrap_in_transaction: true,
        }
    }
}
```

---

## Schema Compare — Detalle por Comparator

### normalizer.rs

Normaliza SQL para evitar falsos positivos en la comparación de views, procedures, functions y triggers.

```rust
use sha2::{Sha256, Digest};

/// Normaliza un statement SQL para comparación.
/// Elimina diferencias cosméticas que no afectan la lógica.
pub fn normalize_sql(sql: &str) -> String {
    let mut s = sql.trim().to_string();

    // 1. Eliminar DEFINER=user@host
    let re_definer = Regex::new(r"(?i)\s*DEFINER\s*=\s*\S+@\S+").unwrap();
    s = re_definer.replace_all(&s, "").to_string();

    // 2. Eliminar ALGORITHM=...
    let re_algorithm = Regex::new(r"(?i)\s*ALGORITHM\s*=\s*\w+").unwrap();
    s = re_algorithm.replace_all(&s, "").to_string();

    // 3. Eliminar SQL SECURITY DEFINER/INVOKER
    let re_security = Regex::new(r"(?i)\s*SQL\s+SECURITY\s+(?:DEFINER|INVOKER)").unwrap();
    s = re_security.replace_all(&s, "").to_string();

    // 4. Eliminar comentarios de línea (-- ...)
    let re_line_comment = Regex::new(r"(?m)--[^\n]*").unwrap();
    s = re_line_comment.replace_all(&s, "").to_string();

    // 5. Eliminar comentarios de bloque (/* ... */)
    let re_block_comment = Regex::new(r"(?s)/\*.*?\*/").unwrap();
    s = re_block_comment.replace_all(&s, "").to_string();

    // 6. Colapsar espacios múltiples a uno
    let re_spaces = Regex::new(r"\s+").unwrap();
    s = re_spaces.replace_all(&s, " ").to_string();

    // 7. Eliminar saltos de línea
    s = s.replace('\n', " ").replace('\r', "");

    // 8. Trim final
    s.trim().to_string()
}

/// Calcula SHA256 de un SQL normalizado.
pub fn hash_sql(sql: &str) -> String {
    let normalized = normalize_sql(sql);
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

### table_comparator.rs

Compara la estructura completa de una tabla entre source y target.

**Flujo:**

1. `source.fetch_columns(source_table, source_schema)` → `target.fetch_columns(target_table, target_schema)`
2. Para cada columna, comparar: `name`, `type`, `isNullable`, `defaultValue`
3. Para MySQL/PostgreSQL: parsear DDL para extraer `ENGINE`, `CHARSET`, `COLLATION`, `COMMENT`
4. Construir `TableDiff` con `ColumnDiffDetail` por cada columna

**Detected DiffTypes:**

| Status | Condición |
|--------|-----------|
| `Equal` | Todas las columnas coinciden en tipo, nullable, default |
| `Modified` | Al menos una columna tiene tipo/nullable/default diferente |
| `Missing` | Tabla existe en source pero no en target |
| `New` | Tabla no existe en source pero sí en target |

**Comparación de metadatos de tabla (MySQL):**

```sql
-- Para obtener engine, charset, collation, comment
SHOW TABLE STATUS WHERE Name = 'table_name';
-- O parsear el DDL:
CREATE TABLE t (...) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabla de usuarios';
```

**Comparación de metadatos de tabla (PostgreSQL):**

```sql
-- Para obtener comment
SELECT obj_description(c.oid) as table_comment
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'table_name' AND n.nspname = 'schema_name';

-- Para obtener tablespace
SELECT spcname FROM pg_class c JOIN pg_tablespace t ON c.reltablespace = t.oid WHERE c.relname = 'table_name';
```

### index_comparator.rs

Compara todos los índices de una tabla.

**Flujo:**

1. `source.fetch_indexes(source_table, source_schema)` → agrupa por `name`
2. `target.fetch_indexes(target_table, target_schema)` → agrupa por `name`
3. Para cada índice, comparar: columnas (nombre + orden), isUnique, type
4. Detectar índices que existen en source pero no en target (`Missing`)
5. Detectar índices nuevos en target (`New`)

**Formato de `fetch_indexes()` existente:**

```json
{
    "name": "idx_users_email",
    "column": "email",
    "isUnique": true,
    "isPrimary": false,
    "type": "btree"
}
```

**Nota:** Un índice puede tener múltiples columnas (una fila por columna en el resultado). Se deben agrupar por `name` y ordenar por `attnum` (Postgres) o `seq_in_index` (MySQL).

**Campos a comparar por índice:**

| Campo | Descripción |
|-------|-------------|
| `columns` | Lista de columnas en orden |
| `isUnique` | UNIQUE vs non-unique |
| `type` | btree, hash, gin, gist, fulltext, spatial |
| `isPrimary` | PRIMARY KEY |

### fk_comparator.rs

Compara foreign keys entre source y target.

**Flujo:**

1. `source.fetch_foreign_keys(source_table, source_schema)` → agrupa por `constraintName`
2. `target.fetch_foreign_keys(target_table, target_schema)` → agrupa por `constraintName`
3. Para cada FK, comparar: referencedTable, columns, ON DELETE, ON UPDATE

**Problema:** `fetch_foreign_keys()` actual NO retorna `ON DELETE` ni `ON UPDATE`.

**Solución:** Query adicional desde `fk_comparator.rs` usando `driver.execute()`:

**MySQL:**
```sql
SELECT
    rc.CONSTRAINT_NAME,
    rc.UPDATE_RULE,
    rc.DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS rc
WHERE rc.TABLE_NAME = ?
  AND rc.CONSTRAINT_SCHEMA = IFNULL(?, DATABASE())
```

**PostgreSQL:**
```sql
SELECT
    conname,
    CASE confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
    END as on_delete,
    CASE confupdtype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
    END as on_update
FROM pg_constraint
WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = ?)
  AND contype = 'f'
```

**SQLite:** No soporta ON DELETE/UPDATE en PRAGMA foreign_key_list, pero se puede parsear del DDL.

**Campos a comparar por FK:**

| Campo | Descripción |
|-------|-------------|
| `referencedTable` | Tabla padre |
| `columns` | Columnas FK → columnas padre |
| `onDelete` | CASCADE, RESTRICT, SET NULL, SET DEFAULT, NO ACTION |
| `onUpdate` | CASCADE, RESTRICT, SET NULL, SET DEFAULT, NO ACTION |

### view_comparator.rs

Compara vistas usando normalización + hash.

**Flujo:**

1. `source.fetch_views(source_schema)` → lista de nombres
2. `target.fetch_views(target_schema)` → lista de nombres
3. Detectar missing/new por diferencia de conjuntos
4. Para cada vista en ambos lados:
   - `source.fetch_ddl(view_name, "VIEW", source_schema)`
   - `target.fetch_ddl(view_name, "VIEW", target_schema)`
   - `normalize_sql(ddl)` → `hash_sql(normalized)`
   - Comparar hashes

**El normalizador elimina:**
- `DEFINER=user@host`
- `ALGORITHM=TEMPTABLE/UNDEFINED/MERGE`
- `SQL SECURITY DEFINER/INVOKER`
- Comentarios SQL
- Espacios múltiples

### routine_comparator.rs

Compara procedures y functions.

**Flujo:**

1. `source.fetch_procedures(source_schema)` + `source.fetch_functions(source_schema)`
2. `target.fetch_procedures(target_schema)` + `target.fetch_functions(target_schema)`
3. Para cada routine:
   - `source.fetch_ddl(name, "PROCEDURE"/"FUNCTION", schema)`
   - `target.fetch_ddl(name, "PROCEDURE"/"FUNCTION", schema)`
   - `normalize_sql(ddl)` → `hash_sql(normalized)`
   - Comparar hashes

**El normalizador elimina:**
- `DEFINER=user@host`
- `SQL SECURITY DEFINER/INVOKER`
- Comentarios
- Espacios múltiples

### trigger_comparator.rs

Compara triggers.

**Flujo:**

1. `source.fetch_triggers(source_schema)` → lista de nombres
2. `target.fetch_triggers(target_schema)` → lista de nombres
3. Para cada trigger:
   - `source.fetch_ddl(trigger_name, "TRIGGER", schema)`
   - `target.fetch_ddl(trigger_name, "TRIGGER", schema)`
   - Parsear DDL para extraer: `BEFORE`/`AFTER`, `INSERT`/`UPDATE`/`DELETE`
   - `normalize_sql(body)` → `hash_sql(normalized)` para comparar el código
   - Comparar timing, event, body hash

**Parsing del DDL del trigger:**

```sql
-- Estructura: CREATE TRIGGER name {BEFORE|AFTER} {INSERT|UPDATE|DELETE} ON table ...
-- Se puede extraer con regex:
-- AFTER → timing = "AFTER"
-- INSERT → event = "INSERT"
-- El body se extrae desde BEGIN...END (o FROM...FOR EACH ROW)
```

### constraint_comparator.rs

Compara CHECK y UNIQUE constraints.

**Flujo:**

1. `source.fetch_constraints(source_table, source_schema)` → lista de constraints
2. `target.fetch_constraints(target_table, target_schema)` → lista de constraints
3. Para cada constraint:
   - Comparar nombre
   - Comparar tipo (CHECK, UNIQUE, PRIMARY KEY — PK ya se compara en table_comparator)
   - Si es CHECK: comparar definición (con normalización)

**Formato de `fetch_constraints()` existente:**

```json
{
    "name": "users_email_check",
    "type": "CHECK"
}
```

**Nota:** El formato actual no retorna la definición del CHECK. Se necesita query adicional:

**MySQL:**
```sql
SELECT CHECK_clause, CHECK_NAME
FROM information_schema.CHECK_CONSTRAINTS
WHERE TABLE_NAME = ? AND CONSTRAINT_SCHEMA = IFNULL(?, DATABASE())
```

**PostgreSQL:**
```sql
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = ?)
  AND contype = 'c'  -- CHECK
```

---

## Data Compare — Detalle por Componente

### pk_resolver.rs

Detecta la clave primaria (o UNIQUE key) para poder hacer hash por fila.

```rust
pub async fn resolve_pk(
    driver: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<Option<Vec<String>>> {
    // 1. fetch_columns() → buscar isPrimaryKey = true
    let cols = driver.fetch_columns(table, schema.map(String::from)).await?;
    let pks: Vec<String> = cols.iter()
        .filter(|c| c.get("isPrimaryKey").and_then(|v| v.as_bool()).unwrap_or(false))
        .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
        .collect();
    if !pks.is_empty() {
        return Ok(Some(pks));
    }

    // 2. fetch_indexes() → buscar isPrimary = true
    let idxs = driver.fetch_indexes(table, schema.map(String::from)).await?;
    let primary_idx_cols: Vec<String> = idxs.iter()
        .filter(|i| i.get("isPrimary").and_then(|v| v.as_bool()).unwrap_or(false))
        .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
        .collect();
    if !primary_idx_cols.is_empty() {
        return Ok(Some(primary_idx_cols));
    }

    // 3. fetch_constraints() → buscar PRIMARY KEY
    let constraints = driver.fetch_constraints(table, schema.map(String::from)).await?;
    let has_pk = constraints.iter()
        .any(|c| c.get("type").and_then(|v| v.as_str()).unwrap_or("").contains("PRIMARY"));
    if has_pk {
        // Si detectamos PK pero no las columnas, usar un fallback
        // En la práctica esto no debería pasar si fetch_columns funciona correctamente
    }

    // 4. Sin PK → None
    Ok(None)
}
```

### hash_generator.rs

Genera hashes MD5/SHA2 de cada fila para comparación eficiente.

**Estrategia:** En lugar de traer todos los datos y comparar en Rust, se genera el hash directamente en la base de datos usando `driver.execute()`. Esto es mucho más eficiente para tablas grandes.

**Queries por motor:**

**MySQL/MariaDB:**
```sql
SELECT
    pk_col,
    MD5(CONCAT_WS('||',
        COALESCE(CAST(col1 AS CHAR), 'NULL'),
        COALESCE(CAST(col2 AS CHAR), 'NULL'),
        ...
    )) as row_hash
FROM table_name
ORDER BY pk_col
LIMIT ? OFFSET ?
```

**PostgreSQL:**
```sql
SELECT
    pk_col,
    MD5(
        COALESCE(col1::text, 'NULL') || '||' ||
        COALESCE(col2::text, 'NULL') || '||' ||
        ...
    ) as row_hash
FROM table_name
ORDER BY pk_col
LIMIT ? OFFSET ?
```

**SQL Server:**
```sql
SELECT
    pk_col,
    CONVERT(VARCHAR(32), HASHBYTES('MD5',
        CONCAT_WS('||',
            COALESCE(CAST(col1 AS NVARCHAR(MAX)), 'NULL'),
            COALESCE(CAST(col2 AS NVARCHAR(MAX)), 'NULL'),
            ...
        )
    ), 2) as row_hash
FROM table_name
ORDER BY pk_col
OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
```

**SQLite:**
```sql
SELECT
    pk_col,
    hex(md5(
        COALESCE(CAST(col1 AS TEXT), 'NULL') || '||' ||
        COALESCE(CAST(col2 AS TEXT), 'NULL') || '||' ||
        ...
    )) as row_hash
FROM table_name
ORDER BY pk_col
LIMIT ? OFFSET ?
```

### chunk_reader.rs

Lee filas en chunks para no cargar toda la tabla en memoria.

```rust
pub struct ChunkReader {
    chunk_size: usize,
}

impl ChunkReader {
    pub fn new(chunk_size: usize) -> Self {
        Self { chunk_size }
    }

    /// Lee un chunk de filas desde la posición dada.
    /// Retorna (rows, next_offset).
    pub async fn read_chunk(
        &self,
        driver: &dyn DbDriver,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
    ) -> AppResult<(Vec<serde_json::Value>, Option<serde_json::Value>)> {
        let mut rows = driver.fetch_rows(
            table, schema, columns, pk_column,
            last_key, self.chunk_size + 1,
        ).await?;

        let has_more = rows.len() > self.chunk_size;
        if has_more {
            rows.pop(); // Quitar la fila extra usada para detectar has_more
        }

        let next_key = rows.last()
            .and_then(|r| r.get(pk_column))
            .cloned();

        Ok((rows, if has_more { next_key } else { None }))
    }
}
```

### row_comparator.rs

Para filas que tienen hashes diferentes, compara columna por columna.

```rust
pub async fn compare_row_columns(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_table: &str,
    target_table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    pk_columns: &[String],
    pk_values: &serde_json::Value,
) -> AppResult<Vec<RowColumnDiff>> {
    // 1. Construir WHERE clause para ambos sides
    // 2. SELECT * WHERE pk = ? en source
    // 3. SELECT * WHERE pk = ? en target
    // 4. Para cada columna: comparar valores
    // 5. Retornar solo las columnas que difieren
}
```

### diff_builder.rs

Ensambla el `DataReport` final a partir de los resultados del hash comparison.

```rust
pub fn build_data_report(
    table: &str,
    pk_columns: Vec<String>,
    source_hashes: HashMap<String, String>,
    target_hashes: HashMap<String, String>,
    source_rows: HashMap<String, serde_json::Value>,
    target_rows: HashMap<String, serde_json::Value>,
    column_diffs: Vec<RowColumnDiff>,
) -> TableDataDiff {
    let only_in_source: u64 = source_hashes.keys()
        .filter(|k| !target_hashes.contains_key(*k))
        .count() as u64;
    let only_in_target: u64 = target_hashes.keys()
        .filter(|k| !source_hashes.contains_key(*k))
        .count() as u64;
    let modified: u64 = source_hashes.iter()
        .filter(|(k, h)| target_hashes.get(*k).map(|th| th != *h).unwrap_or(false))
        .count() as u64;
    let equal = source_hashes.len() as u64 - modified - only_in_source;

    let status = if only_in_source == 0 && only_in_target == 0 && modified == 0 {
        CompareStatus::Equal
    } else {
        CompareStatus::Modified
    };

    TableDataDiff {
        table: table.to_string(),
        status,
        source_count: source_hashes.len() as u64,
        target_count: target_hashes.len() as u64,
        rows_equal: equal,
        rows_modified: modified,
        rows_only_in_source: only_in_source,
        rows_only_in_target: only_in_target,
        pk_columns,
        column_diffs,
    }
}
```

---

## Script Generator — Detalle por Motor

### mysql_generator.rs

```rust
pub fn generate(diff: &SchemaReport, options: &ScriptOptions) -> Vec<ScriptStatement> {
    let mut stmts = Vec::new();

    for obj in &diff.tables {
        match obj.status {
            CompareStatus::New => {
                if options.include_creates {
                    // Generar CREATE TABLE desde el DDL del source
                    stmts.push(ScriptStatement {
                        sql: format!("-- Create table {}\n{}", obj.name, create_table_sql),
                        description: format!("Create table {}", obj.name),
                        diff_type: "create".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                    });
                }
            }
            CompareStatus::Missing => {
                if options.include_drops {
                    stmts.push(ScriptStatement {
                        sql: format!("DROP TABLE IF EXISTS `{}`;", obj.name),
                        description: format!("Drop table {}", obj.name),
                        diff_type: "drop".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                    });
                }
            }
            CompareStatus::Modified => {
                if options.include_alters {
                    // Generar ALTER TABLE por cada columna modificada
                    for col in &table_diff.columns {
                        match col.status {
                            CompareStatus::Modified => {
                                // ALTER TABLE ... MODIFY COLUMN
                                stmts.push(ScriptStatement {
                                    sql: format!(
                                        "ALTER TABLE `{}` MODIFY COLUMN `{}` {}{};",
                                        obj.name, col.name, col.target_type.as_ref().unwrap(),
                                        if col.target_nullable.unwrap_or(true) { "" } else { " NOT NULL" }
                                    ),
                                    description: format!(
                                        "Modify column {}.{}", obj.name, col.name
                                    ),
                                    diff_type: "alter".into(),
                                    object_name: col.name.clone(),
                                    object_type: "column".into(),
                                    selected: true,
                                });
                            }
                            CompareStatus::New => {
                                // ALTER TABLE ... ADD COLUMN
                                stmts.push(ScriptStatement {
                                    sql: format!(
                                        "ALTER TABLE `{}` ADD COLUMN `{}` {};",
                                        obj.name, col.name, col.target_type.as_ref().unwrap()
                                    ),
                                    description: format!(
                                        "Add column {}.{}", obj.name, col.name
                                    ),
                                    diff_type: "alter_add".into(),
                                    object_name: col.name.clone(),
                                    object_type: "column".into(),
                                    selected: true,
                                });
                            }
                            CompareStatus::Missing => {
                                // ALTER TABLE ... DROP COLUMN
                                stmts.push(ScriptStatement {
                                    sql: format!(
                                        "ALTER TABLE `{}` DROP COLUMN `{}`;",
                                        obj.name, col.name
                                    ),
                                    description: format!(
                                        "Drop column {}.{}", obj.name, col.name
                                    ),
                                    diff_type: "alter_drop".into(),
                                    object_name: col.name.clone(),
                                    object_type: "column".into(),
                                    selected: true,
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Índices
    if options.include_indexes {
        for idx in &diff.indexes {
            match idx.status {
                CompareStatus::New => {
                    let cols = idx.columns_changed.as_ref().map(|c| &c.1).unwrap();
                    let unique = if idx.unique_changed.as_ref().map(|u| u.1).unwrap_or(false) {
                        "UNIQUE "
                    } else { "" };
                    stmts.push(ScriptStatement {
                        sql: format!(
                            "CREATE {}INDEX `{}` ON `{}` (`{}`);",
                            unique, idx.name, idx.table, cols.join("`, `")
                        ),
                        description: format!("Create index {}", idx.name),
                        diff_type: "create_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        sql: format!("DROP INDEX `{}` ON `{}`;", idx.name, idx.table),
                        description: format!("Drop index {}", idx.name),
                        diff_type: "drop_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                CompareStatus::Modified => {
                    // DROP + CREATE
                    let cols = idx.columns_changed.as_ref()
                        .map(|c| &c.1)
                        .or(idx.columns_changed.as_ref().map(|c| &c.0))
                        .unwrap();
                    let unique = idx.unique_changed.as_ref().map(|u| u.1).unwrap_or(false);
                    let unique_kw = if unique { "UNIQUE " } else { "" };
                    stmts.push(ScriptStatement {
                        sql: format!(
                            "DROP INDEX `{}` ON `{}`;\nCREATE {}INDEX `{}` ON `{}` (`{}`);",
                            idx.name, idx.table, unique_kw, idx.name, idx.table, cols.join("`, `")
                        ),
                        description: format!("Recreate index {}", idx.name),
                        diff_type: "recreate_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Foreign Keys
    if options.include_constraints {
        for fk in &diff.foreign_keys {
            match fk.status {
                CompareStatus::New => {
                    let cols = fk.columns.as_ref().map(|c| &c.1).unwrap();
                    let ref_table = fk.referenced_table.as_ref().map(|r| &r.1).unwrap();
                    let on_delete = fk.on_delete.as_ref().map(|d| &d.1).unwrap_or(&"NO ACTION".to_string());
                    let on_update = fk.on_update.as_ref().map(|u| &u.1).unwrap_or(&"NO ACTION".to_string());
                    stmts.push(ScriptStatement {
                        sql: format!(
                            "ALTER TABLE `{}` ADD CONSTRAINT `{}` FOREIGN KEY (`{}`) REFERENCES `{}`(`{}`) ON DELETE {} ON UPDATE {};",
                            fk.table, fk.name, cols.join("`, `"), ref_table, cols[0], on_delete, on_update
                        ),
                        description: format!("Add foreign key {}", fk.name),
                        diff_type: "add_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        sql: format!("ALTER TABLE `{}` DROP FOREIGN KEY `{}`;", fk.table, fk.name),
                        description: format!("Drop foreign key {}", fk.name),
                        diff_type: "drop_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                CompareStatus::Modified => {
                    // DROP + ADD
                    stmts.push(ScriptStatement {
                        sql: format!(
                            "ALTER TABLE `{}` DROP FOREIGN KEY `{}`;\n-- Re-add with new definition",
                            fk.table, fk.name
                        ),
                        description: format!("Recreate foreign key {}", fk.name),
                        diff_type: "recreate_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Views
    if options.include_views {
        for view in &diff.views {
            match view.status {
                CompareStatus::New | CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        sql: format!("-- TODO: Recreate view {} (requires DDL from source)", view.name),
                        description: format!("Recreate view {}", view.name),
                        diff_type: "create_view".into(),
                        object_name: view.name.clone(),
                        object_type: "view".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        sql: format!("DROP VIEW IF EXISTS `{}`;", view.name),
                        description: format!("Drop view {}", view.name),
                        diff_type: "drop_view".into(),
                        object_name: view.name.clone(),
                        object_type: "view".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    stmts
}
```

### postgres_generator.rs

Diferencias clave con MySQL:

| Operación | MySQL | PostgreSQL |
|-----------|-------|------------|
| Modificar columna | `MODIFY COLUMN` | `ALTER COLUMN ... TYPE` + `ALTER COLUMN ... SET/DROP NOT NULL` |
| Agregar columna | `ADD COLUMN` | `ADD COLUMN` (igual) |
| Eliminar columna | `DROP COLUMN` | `DROP COLUMN` (igual) |
| Crear vista | `CREATE VIEW` | `CREATE OR REPLACE VIEW` |
| Crear función | `DROP + CREATE` | `CREATE OR REPLACE FUNCTION` |
| FK | `ADD CONSTRAINT ... FOREIGN KEY` | `ADD CONSTRAINT ... FOREIGN KEY` (igual) |
| Index | `CREATE INDEX` | `CREATE INDEX` (igual) |

### sqlite_generator.rs

SQLite tiene severely limited ALTER TABLE support. Solo soporta:
- `ALTER TABLE ... RENAME TO`
- `ALTER TABLE ... ADD COLUMN`

Para otros cambios, se necesita recrear la tabla:

```sql
-- Ejemplo: modificar tipo de columna en SQLite
BEGIN TRANSACTION;
CREATE TABLE new_table (...);
INSERT INTO new_table SELECT ... FROM old_table;
DROP TABLE old_table;
ALTER TABLE new_table RENAME TO old_table;
COMMIT;
```

---

## Tauri Commands

```rust
// ============================================================
// Schema Compare
// ============================================================

#[tauri::command]
pub async fn compare_schemas(
    source_conn_id: String,
    target_conn_id: String,
    source_schema: Option<String>,
    target_schema: Option<String>,
    tables: Option<Vec<String>>,  // Si None, comparar todas las tablas
    state: State<'_, AppState>,
) -> Result<SchemaReport, String> {
    let source = state.get_connection(&source_conn_id).await.map_err(|e| e.to_string())?;
    let target = state.get_connection(&target_conn_id).await.map_err(|e| e.to_string())?;

    CompareService::compare_schemas(
        source.as_ref(), target.as_ref(),
        source_schema.as_deref(), target_schema.as_deref(),
        tables.as_deref(),
    ).await.map_err(|e| e.to_string())
}

// ============================================================
// Data Compare
// ============================================================

#[tauri::command]
pub async fn compare_data(
    source_conn_id: String,
    target_conn_id: String,
    source_schema: Option<String>,
    target_schema: Option<String>,
    tables: Vec<String>,
    chunk_size: Option<usize>,
    state: State<'_, AppState>,
) -> Result<DataReport, String> {
    let source = state.get_connection(&source_conn_id).await.map_err(|e| e.to_string())?;
    let target = state.get_connection(&target_conn_id).await.map_err(|e| e.to_string())?;

    CompareService::compare_data(
        source.as_ref(), target.as_ref(),
        source_schema.as_deref(), target_schema.as_deref(),
        &tables, chunk_size.unwrap_or(10000),
    ).await.map_err(|e| e.to_string())
}

// ============================================================
// Generate Sync Script
// ============================================================

#[tauri::command]
pub async fn generate_sync_script(
    schema_report: SchemaReport,
    data_report: Option<DataReport>,
    target_db_type: String,
    options: ScriptOptions,
    state: State<'_, AppState>,
) -> Result<SyncScript, String> {
    CompareService::generate_script(
        &schema_report, data_report.as_ref(),
        &target_db_type, &options,
    ).map_err(|e| e.to_string())
}
```

---

## Flujo de Usuario

```
1. Usuario abre pestaña "Compare"
2. Selecciona Source DB → Target DB
3. (Opcional) Selecciona schema específico en cada lado
4. Clic en "Compare Schema"
   → Se ejecuta compare_schemas()
   → Se muestra reporte con tree view expandible:
     ▼ TABLAS (120)
         ✔ users (Equal)
         ⚠ orders (Modified)
             ▼ Columnas
                 id: INT → BIGINT
                 phone: ➕ VARCHAR(20)
         ➕ audit_log (New)
         ❌ legacy_data (Missing)
     ▼ ÍNDICES (330)
         ✔ idx_users_email (Equal)
         ⚠ idx_orders_date (Modified)
     ▼ FOREIGN KEYS (45)
         ✔ fk_orders_user (Equal)
     ▼ VISTAS (40)
         ⚠ v_active_users (Modified)
     ▼ PROCEDURES (80)
         ✔ sp_update_stock (Equal)
         ⚠ sp_process_order (Modified)

5. (Opcional) Clic en "Compare Data"
   → Se ejecuta compare_data() para tablas seleccionadas
   → Se muestra:
     ▼ users (150,000 rows)
         ✔ 149,998 iguales
         ⚠ 1 modificado (ID=24: email cambiado)
         ❌ 1 solo en source (ID=999)
         ➕ 1 solo en target (ID=1000)

6. Clic en "Generate Script"
   → Se muestra SQL generado con checkboxes:
     [x] ALTER TABLE orders MODIFY COLUMN id BIGINT
     [x] ALTER TABLE orders ADD COLUMN phone VARCHAR(20)
     [ ] CREATE TABLE audit_log (...)
     [x] DROP TABLE legacy_data
   → Usuario selecciona qué incluir
   → Clic en "Copy" o "Execute"
```

---

## Orden de Implementación

| # | Fase | Archivos | Dependencias | Estimación | Estado |
|---|------|----------|--------------|------------|------------|
| 1 | Tipos | `models/compare.rs` | Ninguna | 0.5 días | ✅ COMPLETADO |
| 2 | Normalizador SQL | `schema/normalizer.rs` + tests | Ninguna | 0.5 días | ✅ COMPLETADO |
| 3 | Table Comparator | `schema/table_comparator.rs` + tests | Fase 1 | 1 día | ✅ COMPLETADO |
| 4 | Index Comparator | `schema/index_comparator.rs` + tests | Fase 1 | 1 día | ✅ COMPLETADO |
| 5 | FK Comparator | `schema/fk_comparator.rs` + tests | Fase 1 | 1 día | ✅ COMPLETADO |
| 6 | View Comparator | `schema/view_comparator.rs` + tests | Fase 2 | 0.5 días | ✅ COMPLETADO |
| 7 | Routine Comparator | `schema/routine_comparator.rs` + tests | Fase 2 | 0.5 días | ✅ COMPLETADO |
| 8 | Trigger Comparator | `schema/trigger_comparator.rs` + tests | Fase 2 | 0.5 días | ✅ COMPLETADO |
| 9 | Constraint Comparator | `schema/constraint_comparator.rs` + tests | Fase 1 | 0.5 días | ✅ COMPLETADO |
| 10 | Compare Service (Schema) | `compare_service.rs` | Fases 3-9 | 1 día | ⏳ PENDIENTE |
| 11 | PK Resolver | `data/pk_resolver.rs` | Fase 1 | 0.5 días | ⏳ PENDIENTE |
| 12 | Hash Generator | `data/hash_generator.rs` | Fase 11 | 1 día | ⏳ PENDIENTE |
| 13 | Chunk Reader | `data/chunk_reader.rs` | Ninguna | 0.5 días | ⏳ PENDIENTE |
| 14 | Row Comparator | `data/row_comparator.rs` | Fase 13 | 0.5 días | ⏳ PENDIENTE |
| 15 | Diff Builder | `data/diff_builder.rs` | Fases 12-14 | 0.5 días | ⏳ PENDIENTE |
| 16 | Compare Service (Data) | `compare_service.rs` | Fases 11-15 | 0.5 días | ⏳ PENDIENTE |
| 17 | Report Generator | `report/generator.rs` | Fase 16 | 0.5 días | ⏳ PENDIENTE |
| 18 | MySQL Script Gen | `script_generator/generators/mysql_generator.rs` | Fase 10 | 1 día | ⏳ PENDIENTE |
| 19 | PostgreSQL Script Gen | `script_generator/generators/postgres_generator.rs` | Fase 10 | 1 día | ⏳ PENDIENTE |
| 20 | SQLite Script Gen | `script_generator/generators/sqlite_generator.rs` | Fase 10 | 1 día | ⏳ PENDIENTE |
| 21 | Tauri Commands | `commands.rs` | Fases 17-20 | 0.5 días | ⏳ PENDIENTE |
| 22 | Integración Frontend | Nuevos componentes React | Fase 21 | 3-5 días | ⏳ PENDIENTE |

**Total estimado backend: ~14 días**
**Total estimado frontend: ~5 días**
**Total completo: ~19 días**

---

## Dependencias Existentes que se Reusan

| Componente | Fuente |
|------------|--------|
| `DbDriver::fetch_columns()` | Todos los drivers |
| `DbDriver::fetch_indexes()` | Todos los drivers |
| `DbDriver::fetch_foreign_keys()` | Todos los drivers |
| `DbDriver::fetch_constraints()` | Todos los drivers |
| `DbDriver::fetch_views/procedures/functions/triggers()` | Todos los drivers |
| `DbDriver::fetch_ddl()` | Todos los drivers |
| `DbDriver::fetch_tables()` | Todos los drivers |
| `DbDriver::execute()` | Para queries de hash |
| `DataReader::fetch_rows()` | Para chunk reading |
| `sha2` crate | Ya en Cargo.toml |
| `regex` crate | Ya en Cargo.toml |
| `SqlGeneratorService` | Referencia para SQL generation |
| `AppState::get_connection()` | Para obtener drivers |

---

## Notas de Implementación

### ON DELETE/UPDATE en Foreign Keys

`fetch_foreign_keys()` actual NO retorna `ON DELETE` ni `ON UPDATE`. Hay dos opciones:

**Opción A (Recomendada):** Query adicional desde `fk_comparator.rs` usando `driver.execute()`. Esto evita romper la interfaz `DbDriver` existente.

**Opción B:** Extender `fetch_foreign_keys()` para retornar `onDelete` y `onUpdate`. Requiere modificar todos los drivers (MySQL, PostgreSQL, SQLite, SQL Server).

### Multi-Column Indexes

`fetch_indexes()` actual retorna una fila por columna del índice. Se debe agrupar por `name` y ordenar las columnas correctamente (por `seq_in_index` en MySQL, por `attnum` en PostgreSQL).

### MySQL Engine/Charset/_collation

No se obtienen de `fetch_columns()`. Se necesitan queries adicionales:

```sql
-- MySQL
SHOW TABLE STATUS WHERE Name = 'table_name';
-- Retorna: Engine, Collation (que incluye charset)
```

O parsear el DDL retornado por `fetch_ddl()`.

### SQLite Limitaciones

SQLite no soporta:
- MODIFY COLUMN (solo ADD COLUMN y RENAME)
- DROP COLUMN (solo desde 3.35.0)
- ALTER TYPE
- Most ALTER operations

El script generator para SQLite debe generar recreación completa de tablas cuando sea necesario.

### Performance de Data Compare

Para tablas con millones de filas, el hash comparison puede ser lento. Optimizaciones:

1. **Paralelismo:** Comparar múltiples tablas en paralelo usando `tokio::join!`
2. **Límite de filas:** Permitir al usuario limitar la comparación a N filas
3. **Filtro:** Solo comparar filas modificadas después de una fecha
4. **Sampling:** Para tablas muy grandes, comparar solo una muestra
