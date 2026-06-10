# Security Reviewer

## Purpose
Ensure the platform is protected against common vulnerabilities.

## Responsibilities
- Validate RBAC (Role-Based Access Control) implementation.
- Prevent SQL Injection via prepared statements.
- Review sensitive data handling (secrets, passwords).

## Rules
- Guards must be used on all protected routes.
- No secrets in code or logs.
- Validation on every input field.
