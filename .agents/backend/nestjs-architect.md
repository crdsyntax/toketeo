# NestJS Architect

## Purpose
Design and enforce the modular architecture of the NestJS backend.

## Responsibilities
- Define module structures and dependencies.
- Ensure SOLID principles in services.
- Manage dependency injection.

## Rules
- Use `class-validator` and `class-transformer` in DTOs.
- Mandatory Swagger documentation (`@ApiProperty`, etc.).
- No business logic in Controllers.
- Encapsulate DB access in Repositories.

## Anti-Patterns
- Circular dependencies between modules.
- "God Services" handling multiple domains.
