# Frontend Agent

## Stack

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- TanStack Table
- Zustand
- Monaco Editor
- Shadcn UI

## Structure

```text
src/
├── app/
├── pages/
├── features/
├── components/
├── services/
├── stores/
├── hooks/
├── types/
└── utils/
```

## Rules

- Strict TypeScript
- No any
- No business logic in components
- Early returns
- Reusable components
- Feature-based structure
- Single responsibility
- Strong typing everywhere

## Components

- UI only
- No API calls
- No complex transformations

## Services

- API communication only
- Return typed DTOs

## Stores

- Global state only
- No API calls

## Pages

- Compose features
- No business logic

## Tables

- TanStack Table
- Server pagination
- Server filtering
- Server sorting

## Forms

- React Hook Form
- Zod validation

## SQL Editor

- Monaco Editor
- Multi-tab support
- Query execution
- History support

## Explorer

Support:

- Tables
- Views
- Procedures
- Triggers

## Data Viewer

Support:

- Pagination
- Sorting
- Filtering
- Export CSV

## Electron Compatibility

Forbidden:

- window.localStorage directly
- filesystem access
- browser-specific APIs

Use adapters.

## Workflow

1 Analyze request
2 List affected files
3 Create plan
4 Wait approval
5 One atomic change
6 Stop

## Review Checklist

- Types safe
- No any
- No duplicated code
- No business logic in UI
- Feature isolated
- DTO typed
- Reusable components
- Electron compatible
