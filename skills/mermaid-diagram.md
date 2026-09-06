---
name: mermaid-diagram
description: Generates standardized Mermaid ER and architecture diagrams from introspected database metadata.
target_agents:
  - database-engineer
  - backend-engineer
required_tools:
  - read
version: 1.0
---

# Mermaid Diagram Generator Skill

## Purpose
Enables specialists to generate clean, deterministic Mermaid entity-relationship diagrams and architecture graphs.

## Syntax Guidelines
1. **Entity-Relationship Diagrams (`erDiagram`)**:
   - Quote entity names if they contain special characters or spaces.
   - Specify relationships clearly:
     - `||--o{` (one to zero-or-more)
     - `||--||` (one to exactly-one)
     - `}|--|{` (many to many)
   - Include column data types and key constraints (`PK`, `FK`, `UK`).

2. **Diagram Formatting**:
   - Always wrap output in standard ````mermaid``` code blocks.
   - Keep node labels concise to avoid text clipping in UI previews.
