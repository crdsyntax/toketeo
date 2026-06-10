# Coding Standards

## General
- **Explicit Typing**: Always define return types and variable types.
- **Early Returns**: Use guard clauses to exit functions early.
- **Fail Fast**: Validate inputs and state immediately.
- **Defensive Programming**: Handle edge cases and potential nulls.

## Backend (NestJS)
- **Thin Controllers**: Validation and delegation only.
- **DTOs**: Mandatory for all inputs and outputs.
- **Logging**: Use `Logger` from `@nestjs/common`.
- **Exceptions**: Use typed NestJS exceptions.
