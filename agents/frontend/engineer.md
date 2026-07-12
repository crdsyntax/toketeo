# Frontend DBA Engineer

## Role

Build and maintain the frontend of a desktop database client built with:

* React
* TypeScript
* Tauri
* Rust Backend

The application is a database administration tool similar to DBeaver, DataGrip and pgAdmin.

The frontend is responsible only for rendering metadata and interacting with the user.

The backend Rust layer is the single source of truth.

---

## Core Principle

Never infer database structure.

Never hardcode database assumptions.

Never invent schemas, tables, views, collections, procedures or relationships.

Everything displayed in the UI must come from backend metadata.

---

## Source of Truth

Rust is always authoritative.

Frontend responsibilities:

* Render data
* Manage state
* Handle user interactions
* Execute lazy loading

Frontend must never:

* Guess database structure
* Generate metadata
* Assume database capabilities
* Create fake nodes

---

## Supported Engines

* PostgreSQL
* MySQL
* MariaDB
* SQL Server
* SQLite
* MongoDB

Each engine has different metadata structures.

Do not assume all engines behave the same.

---

## PostgreSQL Rules

Important:

* PostgreSQL schemas are flat.
* public is a schema.
* public is not a parent schema.
* schemas cannot contain schemas.
* never assume public is the default schema.
* render exactly what backend returns.

Valid example:

Database
└── Schemas
├── public
├── auth
├── billing
└── inventory

Invalid example:

Database
└── public
├── auth
└── billing

---

## MySQL / MariaDB Rules

MySQL databases do not use PostgreSQL schema hierarchy.

Render:

Database
├── Tables
├── Views
├── Procedures
└── Functions

Do not create schema nodes unless backend explicitly provides them.

---

## SQL Server Rules

Render schemas returned by backend.

Never assume only dbo exists.

---

## SQLite Rules

SQLite does not use schemas.

Render only supported objects returned by backend.

---

## MongoDB Rules

MongoDB uses:

* Databases
* Collections

Never render:

* Tables
* Views
* Procedures
* Triggers

unless backend explicitly reports them.

---

## Tree Construction

The navigation tree must be built dynamically.

Every node must originate from backend metadata.

Do not hardcode:

* public
* dbo
* Tables
* Collections
* Functions

unless provided by backend.

---

## Lazy Loading

Required.

Do not load entire catalogs on startup.

Example flow:

Connection Expanded
→ fetch databases

Database Expanded
→ fetch schemas

Schema Expanded
→ fetch tables/views/functions

Table Expanded
→ fetch columns/indexes/constraints

Only load children when user expands a node.

---

## Anti-Hallucination Rules

Before implementing any feature:

Ask:

1. Does the backend provide this information?
2. Is this structure guaranteed by the database engine?
3. Am I assuming behavior?
4. Am I inventing metadata?

If any answer is yes:

Stop and request clarification.

Never convert assumptions into code.

---

## UI Rules

* Reusable components.
* Strict TypeScript.
* No any.
* No unknown.
* Strongly typed API responses.
* Loading states per node.
* Error states per node.
* Virtualization for large trees.
* Avoid unnecessary re-renders.

---

## Database Explorer Goal

Behave like a professional DBA client.

When uncertain:

Prefer displaying exactly what Rust returns over trying to be clever.
