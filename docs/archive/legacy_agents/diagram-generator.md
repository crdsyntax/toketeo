# Database Diagram Generator (React Flow)

## Objective

Generate a React Flow compatible graph using ONLY metadata received from the backend.

The AI MUST NEVER invent:

* tables
* columns
* schemas
* views
* relationships
* foreign keys
* indexes
* procedures
* triggers

If information is not present in the input metadata, it does not exist.

---

## Source of Truth

The ONLY valid source of information is the JSON payload provided by the backend.

Example:

```json
{
  "tables": [],
  "foreign_keys": [],
  "views": []
}
```

The AI must not use:

* prior knowledge
* database naming conventions
* assumptions
* heuristics
* guessed relationships

---

## Forbidden Behavior

Never infer relationships.

Example:

Tables:

```json
{
  "name": "users"
}
```

```json
{
  "name": "orders"
}
```

Even if:

```txt
orders.user_id
```

exists,

DO NOT create a relationship unless a foreign key is explicitly present.

---

Bad:

```txt
users ───── orders
```

Good:

```txt
No relationship generated.
```

---

## Foreign Keys

Relationships may ONLY be created from explicit foreign key metadata.

Example:

```json
{
  "table": "orders",
  "column": "user_id",
  "referenced_table": "users",
  "referenced_column": "id"
}
```

Output:

```txt
orders ───── users
```

---

If no foreign key exists:

```txt
No edge must be generated.
```

---

## Views

Views are independent nodes.

Do not attempt dependency analysis.

Do not inspect SQL definitions.

Do not infer source tables.

Only render:

```txt
View Name
```

---

## Procedures

Procedures are independent nodes.

No relationship inference.

No dependency inference.

---

## Triggers

Triggers may only be attached if trigger metadata explicitly identifies:

```json
{
  "trigger": "trg_users",
  "table": "users"
}
```

Otherwise:

```txt
Render as isolated node.
```

---

## Node Types

Allowed:

```txt
table
view
procedure
function
trigger
```

Unknown types:

```txt
generic
```

---

## Table Nodes

Render only fields received.

Example:

```json
{
  "name": "users",
  "columns": [
    {
      "name": "id",
      "is_primary_key": true
    },
    {
      "name": "email"
    }
  ]
}
```

Output:

```txt
users

PK id
email
```

---

## Positioning

Initial positioning must use deterministic grid placement.

Formula:

```txt
column = index % 4
row = floor(index / 4)

x = column * 350
y = row * 250
```

The AI must not attempt graph optimization.

The AI must not perform force-directed layouts.

The AI must not perform automatic clustering.

---

## Output Format

Output must strictly follow:

```json
{
  "nodes": [],
  "edges": []
}
```

Node:

```json
{
  "id": "users",
  "type": "table",
  "position": {
    "x": 0,
    "y": 0
  },
  "data": {
    "label": "users"
  }
}
```

Edge:

```json
{
  "id": "fk_orders_users",
  "source": "orders",
  "target": "users"
}
```

---

## Validation Rules

Before generating output:

### Rule 1

Every edge source must exist as a node.

### Rule 2

Every edge target must exist as a node.

### Rule 3

Duplicate nodes are forbidden.

### Rule 4

Duplicate edges are forbidden.

### Rule 5

Nodes without metadata must not be generated.

### Rule 6

Relationships without explicit FK metadata must not be generated.

### Rule 7

Columns not present in metadata must not be generated.

---

## Error Handling

If metadata is empty:

```json
{
  "nodes": [],
  "edges": []
}
```

No fallback generation.

No placeholders.

No fake examples.

---

## Golden Rule

The diagram is a visual representation of metadata.

It is NOT a database modeling assistant.

It is NOT an architecture inference engine.

It is NOT allowed to guess.

If the metadata does not explicitly contain an object or relationship, that object or relationship does not exist.
