# UI Reviewer (Toketeo DBA Client)

## Purpose

Ensure a consistent, accessible, and semantically correct user experience in a database administration client built with:

* React
* TypeScript
* Tauri
* Rust backend (source of truth)

The UI is a metadata renderer, not a static design system.

---

## Core Responsibility

Validate that the UI correctly represents backend-provided database metadata without:

* inference
* structural assumptions
* UI-driven reinterpretation of database concepts

---

## Critical Rule

UI correctness is not only visual.

It is also semantic correctness of database metadata representation.

If UI misrepresents backend structure → it is a bug, even if visually correct.

---

## Database Semantics Rule

Reviewer must validate:

* schemas are not misrepresented as nested structures
* tables are not assumed under default schemas
* database objects are not grouped by frontend logic
* node hierarchy matches backend response exactly

---

## PostgreSQL Validation Rules

Must verify:

* schemas are flat entities
* public is not treated as special container
* no schema nesting exists
* UI does not imply hierarchy where none exists

Incorrect UI example:

Database
└── public
├── auth
└── billing

Correct UI example:

Database
└── Schemas
├── public
├── auth
└── billing

---

## Accessibility Rules

* All tree nodes must be keyboard navigable
* Expand/collapse must be accessible via keyboard
* ARIA roles must match tree semantics
* Focus state must be visible and consistent

---

## Visual Consistency Rules

Allowed:

* consistent spacing between nodes
* consistent indentation per tree depth
* uniform iconography per node type

Forbidden:

* visual grouping that implies false database hierarchy
* styling that suggests structural relationships not provided by backend

---

## State Consistency Validation

Reviewer must ensure:

* UI state reflects backend state accurately
* loading states are node-specific
* no global assumptions about schema structure
* no cached structural inference across nodes

---

## Error State Rules

Must validate:

* errors are scoped per node or request
* no global failure masking partial data
* backend errors are surfaced without reinterpretation

---

## Performance Awareness

Must ensure:

* large trees remain responsive
* virtualization is used where necessary
* lazy loading is respected
* no prefetching that assumes structure

---

## Anti-Inference Rule

Reviewer must explicitly reject UI that:

1. infers database structure not provided by backend
2. reorganizes metadata for perceived UX improvements
3. hides engine differences under unified UI patterns

---

## Review Checklist

### Structural Correctness

* [ ] UI matches backend metadata exactly
* [ ] No inferred hierarchy introduced
* [ ] No schema/table assumptions made

### Database Semantics

* [ ] PostgreSQL rules respected (flat schemas)
* [ ] Multi-engine differences preserved
* [ ] No normalization of metadata structure

### Accessibility

* [ ] Keyboard navigation works for full tree
* [ ] ARIA tree semantics correct
* [ ] Focus management implemented

### UI Integrity

* [ ] No misleading grouping of database objects
* [ ] Visual hierarchy matches backend hierarchy only
* [ ] Loading/error states scoped correctly

---

## Golden Rule

If the UI implies a database structure that does not exist in the backend response, it is invalid regardless of visual quality.
