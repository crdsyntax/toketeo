Estas no las pondría como fases técnicas independientes. Las trataría como un sistema de **Feature Unlocks por nivel**, conectado a la gamificación.

---

# Phase 13: Progression Unlock System

## Objetivo

Convertir el progreso RPG en acceso gradual a funcionalidades avanzadas.

El usuario no recibe todo desde el primer día.

Debe progresar para desbloquear herramientas más poderosas.

---

## Backend (Rust)

### Feature Engine

Nueva crate:

```txt
feature-engine
```

Responsabilidades:

```txt
Evaluar nivel actual
Resolver features desbloqueadas
Emitir eventos de unlock
Persistir progreso
```

---

### SQLite

Tabla:

```sql
feature_unlocks
```

Campos:

```txt
feature_id
required_level
name
description
enabled
```

---

### API

Endpoints:

```txt
GET /api/features

GET /api/features/unlocked

GET /api/features/locked
```

---

### Evento

```rust
FeatureUnlocked {
    feature_id: String
}
```

---

## Frontend

Mostrar funciones bloqueadas.

Ejemplo:

```txt
AI Query Assistant

🔒 Unlock at Level 10
```

---

Cuando se desbloquee:

```txt
═══════════════════════
 NEW FEATURE UNLOCKED

 AI Query Assistant

 Level 10 Reached
═══════════════════════
```

---

# Unlock Tier 1

## Level 5

### Advanced Theming

```txt
Required Level:
5
```

---

### Desbloquea

```txt
Custom RGB themes

Custom editor colors

Custom result grid colors

Custom sidebar colors

Custom terminal colors
```

---

### UI

Nueva sección:

```txt
Settings
 └── Themes
```

---

### Configuración

```txt
Primary Color

Secondary Color

Accent Color

Background Color

Custom Monaco Theme
```

---

# Unlock Tier 2

## Level 10

### AI Query Assistant

```txt
Required Level:
10
```

---

### Desbloquea

```txt
Explain Query

Optimize Query

Generate Query

Convert SQL Dialects

Generate ORM Models
```

---

### Integraciones futuras

```txt
OpenAI

Local LLM

Ollama

Claude

Gemini
```

---

### UI

Nueva pestaña:

```txt
AI Assistant
```

---

### Ejemplos

```txt
Explain this query

Optimize this query

Generate PostgreSQL query
```

---

# Unlock Tier 3

## Level 15

### Data Visualizer

```txt
Required Level:
15
```

---

### Desbloquea

```txt
Bar Charts

Line Charts

Pie Charts

Area Charts

Scatter Plots
```

---

### UI

Nueva pestaña:

```txt
Visualize
```

---

### Ejemplo

Consulta:

```sql
SELECT month, sales
FROM sales
```

↓

Gráfico automático.

---

### Tecnologías

```txt
ECharts

Plotly

Apache ECharts
```

---

# Unlock Tier 4

## Level 20

### Query Scheduler

```txt
Required Level:
20
```

---

### Desbloquea

```txt
Scheduled Queries

Recurring Jobs

Database Reports

Automated Exports
```

---

### Scheduler Types

```txt
Every hour

Every day

Every week

Cron expression
```

---

### Ejemplos

```txt
Export sales report daily

Backup table weekly

Health check every hour
```

---

### SQLite

Nueva tabla:

```sql
scheduled_jobs
```

---

Campos:

```txt
id
name
query
cron
enabled
last_execution
```

---

# Unlock Tier 5

## Level 30

### Cross-DB Sync

```txt
Required Level:
30
```

---

### Desbloquea

```txt
Multi-Database Queries

Cross-Engine Transfers

Data Synchronization

Migration Workflows
```

---

### Ejemplos

```txt
PostgreSQL → MariaDB

MariaDB → SQL Server

MongoDB → PostgreSQL

SQLite → PostgreSQL
```

---

### UI

Nueva sección:

```txt
Cross DB
```

---

### Flujos

```txt
Source DB
      ↓
Transform
      ↓
Target DB
```

---

### Casos de uso

```txt
Migraciones

Sincronización

ETL

Replicación ligera
```

---

# Future Unlocks

## Level 40

```txt
Stored Procedure Studio
```

---

## Level 50

```txt
Database Observatory
```

Monitoreo en tiempo real.

---

## Level 75

```txt
Cluster Manager
```

Administración de múltiples servidores.

---

## Level 100

```txt
Archmage DBA
```

Título máximo.

Desbloquea:

```txt
Todas las funciones

Todos los temas

Todos los efectos

Todos los títulos
```

---

### Regla importante

Las funcionalidades deben estar visibles desde el nivel 1, pero bloqueadas.

Ejemplo:

```txt
🔒 AI Query Assistant
Unlock at Level 10

🔒 Data Visualizer
Unlock at Level 15

🔒 Query Scheduler
Unlock at Level 20
```

Porque ver lo que falta por desbloquear genera mucho más engagement que ocultarlo completamente.
