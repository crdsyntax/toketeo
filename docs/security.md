# Security & Authentication

Toketeo implements a robust security layer based on modern standards to protect database credentials and application access.

## JWT Authentication

All backend endpoints (except for the login and initial system checks) are protected by **JSON Web Tokens (JWT)**.

-   **Passport Strategy**: Uses `passport-jwt` to validate the `Authorization` header in every request.
-   **Secret Management**: The `JWT_SECRET` is defined in the `.env` file and must be kept secure.

## Desktop Automatic Login

To provide a seamless desktop experience, Toketeo implements a silent authentication flow:

1.  **Backend Bypass**: For the local desktop user, the `AuthController` allows a login for the `root` user without requiring a password initially (this can be configured).
2.  **Frontend AuthProvider**: Upon application launch, the `AuthProvider` component checks if a token exists. If not, it automatically calls the `/auth/login` endpoint to obtain a new JWT.
3.  **Token Persistence**: The token is stored in the Zustand global store and is automatically injected into all Axios requests via interceptors.

## Data Protection

-   **Local Persistence**: Connections and sensitive data are stored in a local SQLite database (`app.db`).
-   **SSH Security**: SSH private keys are never transmitted over the network; they are used locally by the backend to establish tunnels.
-   **Environment Isolation**: Supports different environments (Production, Staging, Development, Local) to help users distinguish between sensitive and non-sensitive connections.

## Audit Logging

Every critical action is logged in the `AuditLog`:
-   Database connections.
-   Query executions.
-   User logins.
-   Data exports.

This ensures that there is a complete trail of all activities performed through the application.
