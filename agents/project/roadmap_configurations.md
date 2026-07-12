
# Phase 12: Settings & Safety Engine

## Objetivo

Permitir que cada usuario configure el comportamiento de Toketeo sin comprometer seguridad, rendimiento ni experiencia.

---

## Backend (Rust)

### SQLite

Nueva tabla:

```sql id="lxv9o4"
app_settings
```

Campos:

```txt id="td0yhc"
key
value
updated_at
```

---

### Settings Service

Nueva crate:

```txt id="9fq8c4"
settings-engine
```

Responsabilidades:

```txt id="m0fr95"
Cargar configuraciones
Persistir configuraciones
Validar valores
Exponer configuración al frontend
```

---

## Frontend

Nueva sección:

```txt id="hdkj3l"
Settings
```

Categorías:

```txt id="39w2el"
General
Connections
Editor
Safety
Execution
Explorer
Performance
Notifications
Gamification
```

---

# General

### Startup Behavior

```txt id="pk9n9i"
[ ] Restore previous session

[ ] Reconnect previous connections

[ ] Open last active tab
```

---

### Autosave

```txt id="mjifui"
[ ] Autosave query tabs

Interval:

30s
60s
120s
300s
```

---

# Connections

### Idle Connection Timeout

```txt id="8vtqyn"
5 min
15 min
30 min
1 hour
Never
```

---

### Auto Disconnect Idle Sessions

```txt id="vnlkqy"
[ ] Enabled
```

---

### Maximum Open Connections

```txt id="gzv0j4"
1
5
10
20
50
```

---

### Auto Reconnect

```txt id="vwdbng"
[ ] Reconnect lost connections
```

---

# Editor

### SQL Formatting

```txt id="4gshnm"
[ ] Format before execution
```

---

### Auto Complete

```txt id="3v4xtg"
[ ] Enable suggestions
```

---

### SQL Linter

```txt id="9hn1ei"
[ ] Enable linting
```

---

### Highlight Dangerous Statements

```txt id="l7b7zx"
[ ] Highlight dangerous queries
```

---

# Safety

## Confirmation Before Data Modification

```txt id="0u6qde"
[ ] Confirm INSERT

[ ] Confirm UPDATE

[ ] Confirm DELETE

[ ] Confirm TRUNCATE

[ ] Confirm DROP
```

---

## Dangerous Query Detection

Detectar:

```txt id="t2bgv9"
DELETE without WHERE

UPDATE without WHERE

TRUNCATE

DROP TABLE

DROP DATABASE

ALTER DROP COLUMN
```

---

### Show Warning Toast

```txt id="j34vdd"
[ ] Enabled
```

Ejemplo:

```txt id="rj4mrt"
⚠ WARNING

You are about to execute:

DROP TABLE users
```

---

### Require Explicit Confirmation

```txt id="ol66i7"
[ ] Type object name to continue
```

Ejemplo:

```txt id="7hzvaz"
Type:

users

to confirm
```

---

### Production Protection

```txt id="8jtx5u"
[ ] Extra confirmation for production connections
```

---

### Read Only Override Protection

```txt id="n7o3rv"
[ ] Prevent disabling read-only mode
```

---

# Execution

### Query Timeout

```txt id="q9f5r3"
10 sec
30 sec
60 sec
120 sec
Unlimited
```

---

### Maximum Returned Rows

```txt id="qj2eq6"
100
500
1000
5000
10000
```

---

### Auto Commit

```txt id="3zk2n4"
[ ] Enabled
```

---

### Require Transaction For Mutations

```txt id="8hgr09"
[ ] Force transaction mode
```

Si detecta:

```sql id="yj5u0f"
UPDATE
DELETE
INSERT
```

Toketeo obliga:

```sql id="puxh31"
BEGIN
...
COMMIT
```

---

# Explorer

### Metadata Cache TTL

```txt id="2cfdfh"
1 min
5 min
10 min
30 min
```

---

### Auto Refresh Metadata

```txt id="sjh0ud"
[ ] Enabled
```

---

### Expand Schema Automatically

```txt id="t1o09z"
[ ] Enabled
```

---

# Performance

### Result Streaming

```txt id="jkzfxm"
[ ] Stream large result sets
```

---

### Parallel Metadata Loading

```txt id="zbb3kq"
[ ] Enabled
```

---

### Cache Query Results

```txt id="ikjmnf"
[ ] Enabled
```

---

# Notifications

### Query Success Toast

```txt id="n9qvpk"
[ ] Enabled
```

---

### Query Error Toast

```txt id="a4v9vl"
[ ] Enabled
```

---

### Achievement Notifications

```txt id="3ijw0m"
[ ] Enabled
```

---

### Sound Effects

```txt id="qwmxyr"
[ ] Enabled
```

---

# Gamification

### Enable RPG System

```txt id="bdt1kk"
[ ] Enabled
```

---

### Achievement Toasts

```txt id="pbfupv"
[ ] Enabled
```

---

### XP Gain Notifications

```txt id="5vmb7e"
[ ] Enabled
```

---

### Show Progress Bar

```txt id="kr8kpv"
[ ] Enabled
```

---

# Enterprise Safety Features

### Block DROP DATABASE

```txt id="pbg9c0"
[ ] Enabled
```

---

### Block TRUNCATE

```txt id="ehv0ry"
[ ] Enabled
```

---

### Block DELETE Without WHERE

```txt id="p5d57f"
[ ] Enabled
```

---

### Block UPDATE Without WHERE

```txt id="z07lh7"
[ ] Enabled
```

---

### Block SELECT *

```txt id="oc4k4e"
[ ] Enabled
```

No bloquea.

Solo warning.

---

### Force LIMIT

```txt id="w9t0i3"
[ ] Enabled
```

Si detecta:

```sql id="g84mn6"
SELECT ...
```

sin:

```sql id="4u4x2p"
LIMIT
```

muestra advertencia.

---

### Audit Dangerous Operations

```txt id="qq6g4v"
[ ] Enabled
```

Registra:

```txt id="xj4l93"
timestamp
connection
database
query
user
```

---

## Resultado

```txt id="6i06wd"
Configuración persistente

Seguridad de ejecución

Protección para producción

Control de conexiones

Control de rendimiento

Personalización del editor

Protección contra errores humanos
```


## Critical Constraints (Must Not Break)

* Engine fidelity must be preserved (no cross-db normalization)
* PostgreSQL must remain engine-correct (no forced MariaDB-style assumptions)
* No SELECT * in generated queries
* No UI state loss on navigation
* No implicit query execution without explicit user action