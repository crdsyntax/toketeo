# Development Workflow & Contributing

Thank you for contributing to Toketeo! Please follow these guidelines to keep the codebase clean and maintainable.

## Development Principles
-   **Strict Typing**: We use TypeScript with strict mode. Do not use `any` or `unknown` casts unless absolutely necessary and documented.
-   **SOLID**: Follow SOLID principles, especially Single Responsibility.
-   **KISS**: Keep It Simple, Stupid. Prefer explicit code over complex abstractions.
-   **Clean Architecture**: Backend controllers should only handle requests and invoke services. All business logic must reside in services.

## Workflow

### 1. Branching
-   Use descriptive branch names (e.g., `feature/sql-server-support`, `fix/csv-export-error`).
-   Keep pull requests focused on a single change.

### 2. Linting & Formatting
We use `eslint` and `prettier` to enforce code style. Before pushing:
```bash
bun run lint
```
(Ensure your editor is configured to format on save using Prettier).

### 3. Testing
-   **Unit Tests**: Located in `.spec.ts` files alongside the service or controller.
-   **E2E Tests**: Located in the `test/` directory. Run them with:
    ```bash
    bun run test:e2e
    ```

### 4. Adding a Feature
1.  **Research**: Check existing patterns for similar functionality.
2.  **Implementation**: Follow established modular structure.
3.  **Documentation**: If adding a new module or changing the build process, update the relevant file in the `docs/` folder.
4.  **Verification**: Ensure all tests pass and the application builds successfully for the target platform.
