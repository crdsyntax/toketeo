# 🔱 TOKETEO - Database Administration Panel

Toketeo es un cliente de bases de datos multiplataforma y panel de administración avanzado construido con **NestJS**, **React** y **Electron**. Está diseñado para ofrecer una experiencia fluida, segura y eficiente en la gestión de múltiples motores de bases de datos.

![Toketeo Logo](./frontend/public/logo.svg)

## ✨ Características Principales

-   **Soporte Multi-motor**: MariaDB, MySQL, PostgreSQL, MongoDB y SQL Server.
-   **Túneles SSH**: Conexión segura a bases de datos remotas mediante saltos SSH integrados.
-   **Editor SQL Avanzado**: Basado en Monaco Editor (VS Code) con resaltado de sintaxis, autocompletado y múltiples pestañas.
-   **Explorador de Objetos**: Visualización detallada de tablas, vistas, columnas, índices, claves foráneas y DDL.
-   **Exportación**: Descarga de resultados en formato CSV.
-   **Logs en Tiempo Real**: Visualización de eventos del servidor mediante WebSockets.
-   **Auditoría**: Registro automático de acciones de usuario y ejecuciones de consultas.
-   **Multiplataforma**: Instaladores nativos para Linux (.deb) y Windows (.zip portable).

---

## 🛠️ Arquitectura Técnica

### Backend (NestJS)

El backend sigue una arquitectura modular y escalable, utilizando el runtime **Bun** para máxima velocidad.

#### Módulos Core:
-   **`connection`**: Gestiona las conexiones y el ciclo de vida de los drivers. Implementa un sistema de fábricas para instanciar el driver adecuado según el tipo de BD.
-   **`query`**: Ejecución de consultas asíncronas. Utiliza WebSockets (Socket.io) para manejar consultas pesadas sin bloquear la interfaz.
-   **`schema`**: Extracción de metadatos y generación de DDL.
-   **`auth`**: Seguridad basada en **JWT**. Incluye un flujo de login automático para el entorno de escritorio.
-   **`storage`**: Capa de persistencia local utilizando **SQLite** (vía `@libsql/client`) para guardar conexiones, historial y favoritos.
-   **`logs`**: Sistema de logging global que emite eventos en tiempo real hacia el frontend.

### Frontend (React + Zustand)

Interfaz moderna y reactiva construida con **Tailwind CSS**.

-   **Estado Global**: Gestionado con **Zustand**, permitiendo una persistencia selectiva en el almacenamiento local.
-   **Hooks Personalizados**:
    -   `useQueryEditor`: Lógica compleja para la gestión de pestañas, ejecución de SQL y manejo de resultados.
    -   `useExplorer`: Orquestación de la navegación por el esquema de la base de datos.
-   **Componentes**: Librería de componentes propia optimizada para una estética "Admin Dashboard" profesional.

---

## 🔐 Seguridad y Autenticación

Toketeo utiliza un sistema de **JWT (JSON Web Tokens)**. En la versión de escritorio, se ha implementado un `AuthProvider` que realiza un login automático silencioso al iniciar la aplicación, garantizando que todas las peticiones a la API estén firmadas sin requerir intervención manual del usuario local.

---

## 🚀 Instalación y Desarrollo

### Requisitos
-   [Bun](https://bun.sh/) (Runtime de JavaScript recomendado)

### Pasos
1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/crdsyntax/toketeo.git
    cd toketeo
    ```
2.  **Configurar variables de entorno**:
    Crea un archivo `.env` en la raíz (usa como base el ejemplo):
    ```env
    PORT=3000
    JWT_SECRET=tu-secreto-seguro
    ```
3.  **Instalar dependencias**:
    ```bash
    bun install
    cd frontend && bun install && cd ..
    ```
4.  **Ejecutar en modo desarrollo**:
    ```bash
    bun run electron:dev
    ```

---

## 📦 Compilación y Empaquetado

Toketeo utiliza `electron-builder` para generar binarios de producción.

### Linux (.deb)
```bash
bun run electron:pack
```
El instalador se generará en `dist-electron/`.

### Windows (.zip portable)
```bash
bun run electron:pack:win
```
El archivo comprimido se generará en `dist-electron/`.

---

## 📁 Estructura del Proyecto

```text
toketeo/
├── electron/          # Código del proceso principal de Electron
├── frontend/          # Aplicación React (Vite)
│   ├── src/
│   │   ├── components/ # Componentes UI reutilizables
│   │   ├── hooks/      # Lógica de negocio en React
│   │   ├── store/      # Estado global (Zustand)
│   │   └── types/      # Definiciones de TypeScript
├── src/               # Backend NestJS
│   ├── connection/    # Drivers y gestión de BD
│   ├── query/         # Ejecución de SQL y Gateways
│   ├── modules/       # Capa de almacenamiento local
│   └── main.ts        # Punto de entrada del servidor
├── package.json       # Scripts y dependencias
└── README.md          # Esta documentación
```

---

## ✒️ Autor
**crdsyntax** - *Desarrollo Integral* - [GitHub](https://github.com/crdsyntax)
