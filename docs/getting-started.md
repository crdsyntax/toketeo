# Getting Started

Welcome to the Toketeo development environment. Follow these steps to set up the project locally.

## Prerequisites
-   **Bun**: Install from [bun.sh](https://bun.sh/).
-   **Environment**: Node.js (v20+ recommended).

## Setup Steps

### 1. Repository
Clone and navigate to the project directory:
```bash
git clone https://github.com/crdsyntax/toketeo.git
cd toketeo
```

### 2. Dependencies
Install backend dependencies:
```bash
bun install
```
Install frontend dependencies:
```bash
cd frontend
bun install
cd ..
```

### 3. Environment Configuration
Create a `.env` file based on the available configuration:
```env
PORT=3000
# JWT_SECRET is required
JWT_SECRET=super-secret-key-123
```

### 4. Running the Project

#### Development
Toketeo runs as an Electron application. Start the development environment:
```bash
bun run electron:dev
```
This script concurrently starts the backend server and the frontend development server (Vite).

#### Production Build
To create a local production build, use the packaging scripts:
-   **Linux**: `bun run electron:pack`
-   **Windows**: `bun run electron:pack:win`

The build artifacts will be available in the `dist-electron/` folder.
