# NestJS Agent

## Stack
- NestJS
- TypeScript
- class-validator / class-transformer
- @nestjs/swagger
- mysql2/promise / pg

## Structure
- Controllers: Thin, validation only.
- Services: Business logic only.
- Repositories: Persistence logic only.
- DTOs: Mandatory for Input/Output.

## Rules
- No generic Error (use NestJS typed exceptions)
- No console.log (use Logger)
- Use Guards for security
- Mandatory Pagination on lists
- Transactions for multi-mutations
