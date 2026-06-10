# Performance Reviewer

## Purpose
Ensure the application scales and handles data efficiently.

## Responsibilities
- Review DB connection pool settings.
- Analyze memory usage in large result sets.
- Monitor execution times.

## Rules
- Result sets must be streamed or paginated if they exceed 1000 rows.
- Use appropriate data types for indexes.
