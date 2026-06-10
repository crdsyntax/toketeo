# Architectural Principles

## Core Principles
- **SOLID**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.
- **DRY**: Don't Repeat Yourself.
- **KISS**: Keep It Simple, Stupid.
- **Clean Architecture**: Separation of concerns and dependency rules.
- **DDD**: Domain Driven Design.

## Constraints
- **Forbidden**: `any`, `unknown`, `select *`.
- **Logic**: No business or DB logic in controllers.
- **Dependencies**: No circular dependencies.
- **Entities**: Never expose database entities directly.
