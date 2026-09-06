# Redis Integration — Implementation Plan

## Overview

Agregar Redis como el 6to engine de bases de datos en Toketeo. Redis es un key-value store con estructuras de datos propias (strings, lists, sets, sorted sets, hashes), lo que requiere una adaptación significativa del modelo `DbDriver` existente — que fue diseñado para motores SQL y documentales.

Este plan sigue los principios arquitectónicos establecidos por los tech leaders:

- Backend: "each engine preserves native metadata structure" — Redis no se normaliza a un modelo SQL
- Frontend: "render differences, NOT normalize them" — la UI se adapta al engine, no al revés
- Separación estricta: Presentation → Application → Infrastructure → Domain

---

## Context

### What Redis Is

Redis es un almacén de datos en memoria con soporte para persistencia en disco. Sus características principales:

- **Key-value store** con keys compuestas por namespace (`user:123`, `session:abc`)
- **Estructuras de datos**: String, List, Set, Sorted Set, Hash, Stream, Bitmap, HyperLogLog
- **Sin schemas ni tablas**: los keys son libres, la estructura es definida por la aplicación
- **Comandos nativos**: `GET`, `SET`, `HGETALL`, `LRANGE`, `SMEMBERS`, `ZADD`, `SCAN`, etc.
- **Databases numéricas**: db0 a db15 por defecto (selectables con `SELECT 0`-`SELECT 15`)
- **Sin transacciones SQL**: `MULTI/EXEC` existe pero es diferente (no hay rollback parcial)
- **TTL nativo**: cada key puede tener un time-to-live

### How Redis Differs from Existing Engines

| Característica | SQL Engines | MongoDB | Redis |
|---|---|---|---|
| Schema | Sí | Sí (databases) | No |
| Tables/Collections | Sí | Sí | No (keys con namespace) |
| Columns/Fields | Sí | Sí (inferidos) | Depende de la estructura |
| JOINs | Sí | Lookup ($lookup) | No |
| Transacciones | Sí (ACID) | Sí (retryable) | MULTI/EXEC (sin rollback) |
| Pagination | LIMIT/OFFSET, keyset | skip/limit | SCAN cursor |
| DDL | CREATE TABLE, ALTER | createCollection | No |
| Query language | SQL | MQL | Comandos Redis |

### Mapping Strategy

El desafío es encajar Redis en el contrato `DbDriver` sin distorsionarlo. La estrategia:

| Concepto Redis | Se mapea a | Razón |
|---|---|---|
| Database number (0-15) | `schema` | Cada DB es un namespace aislado |
| Key namespace (prefijo antes de `:`) | `table` | Agrupación lógica de keys |
| Key completa | `row` (fila) | Una key = una fila de datos |
| Tipo de key + campos | `columns` | Estructura de la key |
| Valor de la key | `cell value` | Contenido |
| `INFO KEYSPACE` | `fetch_databases()` | Lista de databases activas |
| `SCAN` con pattern | `fetch_tables()` | Lista de namespaces/patrones |
| `TYPE` + `HGETALL`/`LRANGE`/etc. | `fetch_columns()` | Estructura de la key |
| Comando Redis libre | `execute()` | Equivalente a query SQL |

---

## Phase 1: Backend — Redis Driver

### 1.1 Dependencia

**Archivo:** `src-tauri/Cargo.toml`

```toml
fred = "9"
```

fred es una librería async para Redis en Rust con:
- Connection pooling nativo
- Soporte para Redis Cluster, Sentinel, y standalone
- Serialización serde
- Compatibilidad con tokio
- Soporte para todos los tipos de datos Redis

### 1.2 DbType Enum

**Archivo:** `src-tauri/src/db/mod.rs`

```rust
pub enum DbType {
    Postgres,
    Mariadb,
    Mysql,
    Sqlite,
    Mongodb,
    Sqlserver,
    Redis,    // ← nueva variante
}

impl std::fmt::Display for DbType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            // ... existentes ...
            DbType::Redis => "redis",
        };
        write!(f, "{}", s)
    }
}
```

Punto único de verdad. No se crea un segundo enum.

### 1.3 Redis Driver

**Archivo nuevo:** `src-tauri/src/db/redis.rs`

```rust
use fred::clients::RedisClient;
use fred::interfaces::ClientInterface;
use fred::types::RedisValue;

pub struct RedisDriver {
    client: RedisClient,
}
```

**Implementación de traits:**

#### `DbDriver`

| Método | Implementación Redis |
|---|---|
| `db_type()` | `DbType::Redis` |
| `fetch_databases()` | `INFO KEYSPACE` → parsear `db0`, `db1`, ... como databases |
| `fetch_schemas()` | `vec![]` — Redis no tiene schemas |
| `fetch_tables()` | `SCAN 0 MATCH * COUNT 100` → extraer namespace (parte antes de `:`) |
| `fetch_views()` | `vec![]` |
| `fetch_procedures()` | `vec![]` |
| `fetch_triggers()` | `vec![]` |
| `fetch_functions()` | `vec![]` |
| `fetch_columns()` | `TYPE key` → según tipo: `HGETALL` para hash, info de estructura para list/set/zset |
| `fetch_indexes()` | `vec![]` |
| `fetch_foreign_keys()` | `vec![]` |
| `fetch_constraints()` | `vec![]` |
| `fetch_ddl()` | `DUMP key` + `TTL key` + `TYPE key` → representación textual |
| `fetch_parameters()` | `vec![]` |
| `fetch_mongo_structure()` | Default (no aplica) |
| `execute()` | Parsear comando Redis libre → normalizar salida a `QueryResult` |
| `close()` | `client.quit()` |

#### `DataReader`

| Método | Implementación Redis |
|---|---|
| `fetch_rows()` | `SCAN` con cursor + `MGET`/`HGETALL`/`LRANGE`/etc. según tipo |
| `count_rows()` | `DBSIZE` o conteo manual por SCAN |

#### `DataWriter`

| Método | Implementación Redis |
|---|---|
| `upsert_rows()` | `SET` para strings, `HSET` para hashes, `LPUSH` para lists, `SADD` para sets |

#### `CapabilityProvider`

```rust
DriverCapabilities {
    supports_transactions: false,
    supports_savepoints: false,
    supports_upsert: true,
    upsert_strategy: Some(UpsertStrategy::Hset),
    supports_keyset_pagination: false,  // Redis usa SCAN, no keyset
    supports_streaming: true,
    supports_json: true,  // RedisJSON module opcional
    supports_arrays: true,
    supports_returning: false,
    max_batch_size: 1000,
}
```

### 1.4 Conversión de Valores

Función `redis_value_to_json()` similar a `bson_to_json()` en mongodb.rs:

```rust
fn redis_value_to_json(val: RedisValue) -> serde_json::Value {
    match val {
        RedisValue::String(s) => {
            // Intentar parsear como número
            if let Ok(n) = s.parse::<i64>() {
                serde_json::Value::Number(n.into())
            } else if let Ok(f) = s.parse::<f64>() {
                serde_json::json!(f)
            } else {
                serde_json::Value::String(s)
            }
        }
        RedisValue::Integer(n) => serde_json::Value::Number(n.into()),
        RedisValue::Double(f) => serde_json::json!(f),
        RedisValue::Boolean(b) => serde_json::Value::Bool(b),
        RedisValue::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(redis_value_to_json).collect())
        }
        RedisValue::Nil | RedisValue::Null => serde_json::Value::Null,
        _ => serde_json::Value::String(val.to_string()),
    }
}
```

### 1.5 Normalización de Salida de `execute()`

Redis no retorna tablas. El driver normaliza:

| Comando | Columnas | Filas |
|---|---|---|
| `GET key` | `value` | 1 |
| `MGET k1 k2 k3` | `key`, `value` | N |
| `HGETALL key` | `field`, `value` | N (campos del hash) |
| `LRANGE key 0 -1` | `index`, `value` | N |
| `SMEMBERS key` | `member` | N |
| `ZRANGE key 0 -1 WITHSCORES` | `member`, `score` | N |
| `INFO` | `key`, `value` | N (pares key-value) |
| `SCAN 0` | `cursor`, `key` | N |
| `KEYS *` | `key` | N |
| `DBSIZE` | `dbsize` | 1 |
| Errores | `(error)` | 1 |

### 1.6 DriverFactory

**Archivo:** `src-tauri/src/infrastructure/drivers/driver_factory.rs`

```rust
DbType::Redis => Ok(Arc::new(RedisDriver::new(url, pool_config).await?)),
```

### 1.7 ConnectionStringBuilder

**Archivo:** `src-tauri/src/infrastructure/database/connection_string_builder.rs`

Formato Redis:
```
redis://[:password@]host[:port][/db]
```

El campo `database` del config se mapea al número de database Redis (0-15).

### 1.8 Transaction Skip

**Archivos:**
- `src-tauri/src/state.rs` — agregar `DbType::Redis` junto a `DbType::Mongodb` en skip de transacciones
- `src-tauri/src/application/connection_service.rs` — skip `BEGIN` para Redis

### 1.9 Connection Test

**Archivo:** `src-tauri/src/presentation/tauri/commands.rs`

```rust
DbType::Redis => {
    // Ejecutar PING, verificar respuesta "PONG"
    let result = driver.execute("PING").await?;
    // Si result contiene "PONG", conexión exitosa
}
```

### 1.10 Explorer Service

**Archivo:** `src-tauri/src/application/explorer_service.rs`

- Para Redis: usar database number como contexto (`SELECT <db>` antes de operaciones)
- La barra de filtro de MongoDB tiene contraparte Redis: comandos libres
- Las tabs de DDL, FK, Constraints, Indexes se ocultan (no aplican a Redis)

### 1.11 UpsertStrategy::Hset

**Archivo:** `src-tauri/src/models/sync.rs`

```rust
pub enum UpsertStrategy {
    OnConflict,
    OnDuplicateKey,
    Merge,
    UpsertDoc,
    Hset,    // ← nueva variante para Redis
}
```

---

## Phase 2: Frontend — Adaptación UI

### 2.1 DatabaseType Enum

**Archivo:** `frontend/src/types/database.ts`

```typescript
export enum DatabaseType {
  MARIADB = 'mariadb',
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
  SQLSERVER = 'sqlserver',
  SQLITE = 'sqlite',
  REDIS = 'redis',       // ← nuevo
}
```

Nota: `MYSQL` también falta actualmente en el frontend (solo `MARIADB` existe).

### 2.2 Connection Wizard

**Archivo:** `frontend/src/components/connections/ConnectionWizard.tsx`

- Agregar Redis como opción de engine
- Icono: `⚡` (o personalizado)
- Color: amber/orange (`text-amber-500`)
- Default port: `6379`
- Campos: host, port, password (opcional), database number (0-15, opcional, default 0)
- Sin campos de schema/database name

### 2.3 Sidebar Colors

**Archivo:** `frontend/src/components/connections/ConnectionsSidebar.tsx`

```typescript
redis: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
```

### 2.4 DataTab — Redis Mode

**Archivo:** `frontend/src/components/explorer/tabs/DataTab.tsx`

Cuando `isRedis`:

- Reemplazar input de WHERE clause por input de patrón SCAN (`*`, `user:*`, `session:*`)
- Panel de Advanced → SCAN options (`COUNT`, `MATCH`)
- Tabla de resultados → renderiza columnas dinámicas según tipo de key:
  - String: columna `value`
  - Hash: columnas `field` y `value`
  - List: columnas `index` y `value`
  - Set: columna `member`
  - Sorted Set: columnas `member` y `score`
- Botón "Execute Command" para ejecutar comandos Redis libres
- Ocultar tabs: DDL, FK, Constraints, Indexes

### 2.5 Query Editor

**Archivos:**
- `frontend/src/hooks/useQueryEditor.ts` — detectar `isRedis` mode
- `frontend/src/pages/QueryEditor.tsx` — usar `redisLanguage` para syntax highlighting
- `frontend/src/components/query/panels/SqlEditorPanel.tsx` — label "Redis Command" en vez de "SQL"

### 2.6 Redis Language para Monaco

**Archivo nuevo:** `frontend/src/lib/redisLanguage.ts`

Definición de syntax highlighting para comandos Redis:
- Comandos: `GET`, `SET`, `MGET`, `MSET`, `DEL`, `EXISTS`, `TYPE`, `TTL`, `PTTL`, `EXPIRE`, `PEXPIRE`
- Hashes: `HGET`, `HSET`, `HMGET`, `HMSET`, `HGETALL`, `HDEL`, `HEXISTS`, `HLEN`, `HKEYS`, `HVALS`
- Lists: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LLEN`, `LINDEX`, `LSET`
- Sets: `SADD`, `SMEMBERS`, `SISMEMBER`, `SREM`, `SCARD`, `SINTER`, `SUNION`, `SDIFF`
- Sorted Sets: `ZADD`, `ZRANGE`, `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREM`, `ZCARD`, `ZSCORE`
- Keys: `SCAN`, `KEYS`, `RENAME`, `OBJECT`, `DUMP`, `RESTORE`
- Server: `INFO`, `DBSIZE`, `PING`, `SELECT`, `FLUSHDB`, `FLUSHALL`
- Transacciones: `MULTI`, `EXEC`, `DISCARD`, `WATCH`

### 2.7 Schema Service

**Archivo:** `frontend/src/services/schema.service.ts`

Agregar funciones:
```typescript
getRedisDatabases(connectionId: string)    // fetch_databases
getRedisKeys(connectionId: string, db: string, pattern: string)  // fetch_tables
getRedisKeyInfo(connectionId: string, db: string, key: string)   // fetch_columns
```

### 2.8 Engine Capabilities

**Archivo:** `frontend/src/store/useAppStore.ts` (o donde se define `EngineCapabilities`)

```typescript
redis: {
  hasSchemas: false,
  hasViews: false,
  hasProcedures: false,
  hasTriggers: false,
  hasFunctions: false,
  hasIndexes: false,
  hasForeignKeys: false,
  hasConstraints: false,
  hasDDL: false,
  hasTransactions: false,
  supportsFilter: true,  // comandos Redis libres
  defaultPort: 6379,
}
```

---

## Phase 3: Sync (Opcional, Futuro)

### 3.1 Redis Extractor

**Archivo nuevo:** `src-tauri/src/application/sync/extractors/redis_extractor.rs`

Implementación de `DataExtractor` para Redis que extrae datos usando SCAN + TYPE-specific reads.

### 3.2 Sync Pairings

Redis puede participar en sync como:
- **Target**: datos de SQL/MongoDB → Redis (caché)
- **Source**: Redis → SQL/MongoDB (persistencia)

---

## Archivos Afectados

### Nuevos (3 archivos)

| Archivo | Descripción | Líneas estimadas |
|---|---|---|
| `src-tauri/src/db/redis.rs` | Driver completo Redis | 600-800 |
| `frontend/src/lib/redisLanguage.ts` | Monaco language definition | 150-200 |
| `src-tauri/src/application/sync/extractors/redis_extractor.rs` | Sync extractor (fase 3) | 100-150 |

### Modificados (16 archivos)

| Archivo | Cambio |
|---|---|
| `src-tauri/Cargo.toml` | Dependencia `fred = "9"` |
| `src-tauri/src/db/mod.rs` | `DbType::Redis` + `Display` |
| `src-tauri/src/models/sync.rs` | `UpsertStrategy::Hset` |
| `src-tauri/src/infrastructure/drivers/driver_factory.rs` | Factory arm para Redis |
| `src-tauri/src/infrastructure/database/connection_string_builder.rs` | URL format `redis://` |
| `src-tauri/src/state.rs` | Transaction skip para Redis |
| `src-tauri/src/application/connection_service.rs` | Skip `BEGIN` para Redis |
| `src-tauri/src/application/explorer_service.rs` | Contexto Redis (database number) |
| `src-tauri/src/presentation/tauri/commands.rs` | PING test + identifier quoting |
| `frontend/src/types/database.ts` | `REDIS = 'redis'` enum |
| `frontend/src/components/connections/ConnectionWizard.tsx` | Redis wizard step |
| `frontend/src/components/connections/ConnectionsSidebar.tsx` | Redis color/icon |
| `frontend/src/components/explorer/tabs/DataTab.tsx` | Redis mode UI |
| `frontend/src/hooks/useQueryEditor.ts` | Redis command mode |
| `frontend/src/components/query/panels/SqlEditorPanel.tsx` | Redis label |
| `frontend/src/services/schema.service.ts` | Redis service functions |

---

## Orden de Implementación

| Paso | Archivo | Dependencias | Estimación |
|------|---------|--------------|------------|
| 1 | `Cargo.toml` (fred) | Ninguna | 5 min |
| 2 | `db/mod.rs` (DbType::Redis) | Paso 1 | 10 min |
| 3 | `models/sync.rs` (UpsertStrategy::Hset) | Paso 2 | 5 min |
| 4 | `db/redis.rs` (driver completo) | Paso 2, 3 | 3-4 horas |
| 5 | `driver_factory.rs` | Paso 4 | 5 min |
| 6 | `connection_string_builder.rs` | Paso 2 | 15 min |
| 7 | `state.rs` + `connection_service.rs` | Paso 2 | 10 min |
| 8 | `commands.rs` (PING test) | Paso 4 | 15 min |
| 9 | `explorer_service.rs` | Paso 4 | 30 min |
| 10 | `database.ts` (frontend enum) | Paso 2 | 5 min |
| 11 | `ConnectionWizard.tsx` | Paso 10 | 30 min |
| 12 | `ConnectionsSidebar.tsx` | Paso 10 | 5 min |
| 13 | `redisLanguage.ts` | Ninguna | 30 min |
| 14 | `DataTab.tsx` + `useQueryEditor.ts` + `SqlEditorPanel.tsx` | Paso 10, 13 | 1 hora |
| 15 | `schema.service.ts` | Paso 8 | 15 min |

**Tiempo total estimado:** 6-8 horas

---

## Preguntas Abiertas

1. **¿Redis como source o target en sync?** Solo como target (caché) o también como source?
2. **¿RedisJSON module?** Si el usuario tiene RedisJSON, habilitar soporte para documentos JSON.
3. **¿Redis Cluster?** Soporte desde el inicio o solo standalone/sentinel primero?
4. **¿Key namespaces como "tables"?** Usar separator `:` (ej: `user:123` → table `user`) o solo SCAN con pattern?
5. **¿Comando Redis libre?** ¿Habilitar ejecución de cualquier comando Redis o solo comandos seguros (read-only)?

---

## Constraints

- Redis driver no debe bloquear la ejecución de otros engines
- Conexión Redis debe ser completamente independiente de pools SQL
- La UI de Redis no debe asumir estructura relacional
- Comandos Redis destructivos (`FLUSHDB`, `FLUSHALL`) requieren confirmación
- El driver debe manejar timeouts de conexión (Redis puede estar caído)
- Sin logging de passwords Redis
