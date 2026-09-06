# Plan: Integración de tokedb en toketeo (panel de runtime de bases de datos)

> Objetivo: operar bases de datos gestionadas por el runtime `tokedb` (MariaDB/MySQL/PostgreSQL/MongoDB/Redis/SQLite/SQL) desde **toketeo**, vía un **panel React** de runtime, comunicándose con el **binario `tokedb` como helper privilegiado** (no embebiendo la lib). El binario ya sabe delegar a WSL2 en Windows, así que toketeo no replica esa lógica fuera del contrato del helper.
> Vigente desde 2026-08-31. Estado: propuesta (sin código aplicado).

---

## 1. Contexto y hallazgos clave

`tokedb` (repo externo `D:\Documents\GitHub\tokedb`) es un runtime de procesos aislados en Rust para ejecutar motores de bases de datos (no Docker). Tiene su propio workspace (lib `tokedb-runtime` + app Tauri `src-tauri` + `frontend`) y su `IMPLEMENTATION_PLAN.md` con la **Fase 9 (integración con toketeo)** aún pendiente (`⏳`).

### Hallazgos que determinan la arquitectura

| Hallazgo | Evidencia |
|---|---|
| **La lib `tokedb-runtime` es independiente de Tauri** y su `RuntimeService` es `Clone + Send + Sync`, síncrono, sin requerir tokio externo. | `tokedb-runtime/src/lib.rs`, `service/mod.rs:29-32` |
| **En Windows la delegación a WSL2 NO está en la lib**, vive en el `src-tauri` de tokedb (`wsl.exe -d <distro> -u root -- sh -c '...; exec tokedb <args> --json'`, con `capture()`/`spawn()`). | `tokedb/src-tauri/src/main.rs:547-684` |
| **El binario expone salida `--json` tipada** para `images`, `inspect`, `logs`, `stats`, `volumes`, `create` y `list`. | `tokedb-runtime/src/cli/mod.rs` (líneas 209, 259, 275, 308, 324, 365...) |
| **toketeo corre actualmente en Windows** y no tiene aún nada de tokedb (ni path deps, ni commands, ni código). | auditoría toketeo (sin referencias a tokedb) |
| **`start` bloquea en primer plano** y `kill_on_parent_exit` mataría la DB si se cierra la terminal; el modo `--detach` es una mejora pendiente en el README de tokedb (mejora #1, costo Alto). | `tokedb/README.md` |

### Decisión de arquitectura (confirmada)

**Vía binario helper**: toketeo **no** embebe `tokedb-runtime`. En su lugar, la capa de backend de toketeo invoca el **binario `tokedb`** como subproceso/helper de la misma forma que ya lo hace el `src-tauri` de tokedb (local en Linux con root, vía `wsl.exe` en Windows). Esto:

- Reutiliza el manejo de **privilegios root** y la **delegación WSL2** ya implementada y probada en tokedb.
- No duplica lógica de runtime ni de delegación dentro de toketeo.
- Mantiene a toketeo agnóstico del formato de imagen/estado interno de tokedb (solo consume el contrato CLI `--json`).

**Flujo de control a implementar en toketeo:**

```
React (panel runtime) ──invoke──▶ [runtime_commands.rs] ──▶ [runtime_service.rs]
   ▲                                                              │
   └─ eventos de progreso (tauri emit) ◀─────────── HelperRunner (binario `tokedb`)
```

`runtime_service.rs` (toketeo) envuelve la invocación al helper. En el host actual (Windows) usa el mismo patrón WSL que tokedb; en Linux ejecuta el binario directamente. El contrato de datos con el frontend son **DTOs propios de toketeo** (`models/runtime.rs`) que se derivan del JSON del helper, para que el frontend no vea los tipos internos de tokedb.

---

## 2. Contrato del helper (lo que toketeo consume)

Binario `tokedb`, subcomandos y salida `--json` (fuente: `tokedb-runtime/src/cli/mod.rs` + `service/mod.rs`):

| Operación | Comando | Salida `--json` |
|---|---|---|
| Listar imágenes | `tokedb images --json` | `Vec<ImageSummary>` |
| Importar imagen | `tokedb import <path>` | — |
| Exportar imagen | `tokedb export <ref> <output>` | — |
| Pull imagen | `tokedb pull <ref> [--registry <src>]` | — (asíncrono/progreso) |
| Crear contenedor | `tokedb create <name> <image:tag> [--memory-mb ..] [--cpu-quota ..] [--pids-max ..] [--port H:P] [--env K=V] [--arg ..] --db-user <u> --db-password <p> --json` | `Container` |
| Arrancar | `tokedb start <name>` | — (bloquea; en helper → spawn background) |
| Detener | `tokedb stop <name>` | — |
| Listar contenedores | `tokedb list --json` | `Vec<Container>` |
| Inspeccionar | `tokedb inspect <name> --json` | `Container` |
| Logs | `tokedb logs <name> --json` (o `--json` w/ `read_logs`) | `ContainerLogs` |
| Stats | `tokedb stats <name> --json` | `ResourceUsage` |
| Destruir | `tokedb destroy <name>` | — |
| Volúmenes | `tokedb volume list --json` / `create <n> --json` / `remove <n>` / `backup <n> <dest>` | `Vec<Volume>` / `Volume` |
| Registry | `tokedb registry list --json` / `publish <ref>` | `Vec<LocalImageRef>` |
| Data root | `echo $TOKEDB_DATA_ROOT` (o `get_data_root`) | string |

> **Nota sobre `create --json` / `pull --json`**: confirmar en la implementación que `create` y `pull` emiten su `--json` (el CLI ya tiene ramas `if cli.json` para `create` y la consola tiene `pull` en background). Si alguna operación larga (pull) no escribe JSON, se usa el evento de progreso del helper (ver §6).

**Entorno del helper (heredado del patrón tokedb):**
- `TOKEDB_DATA_ROOT`: data root (en Windows se traduce a `/mnt/...`).
- `TOKEDB_WSL_DISTRO` (default `Ubuntu-24.04`), `TOKEDB_WSL_BINARY` (default `/usr/local/bin/tokedb`), `TOKEDB_WSL_USER` (default `root`).
- En Windows: `wsl.exe -d <distro> -u <user> -- sh -c '<export data_root>; exec <binary> <op> --json'`.

---

## 3. Estructura objetivo en toketeo

```
toketeo/src-tauri/src/
├── models/runtime.rs                 # DTOs IPC de toketeo (frontend no ve tipos de tokedb)
├── application/runtime_service.rs    # orquestación: envolver invocación al helper + parsear JSON → DTOs
└── presentation/tauri/runtime_commands.rs  # commands thin: validan input → delegan al service → DTOs

toketeo/frontend/src/
├── types/runtime.ts                  # espejo TS de models/runtime.rs
├── services/runtime.service.ts       # wrapper thin sobre tauriApi.invoke
├── store/runtimeStore.ts             # (Zustand) estado del panel: contenedores, imágenes, selección, polling
└── components/runtime/               # panel React
    ├── RuntimePanel.tsx              # layout (tabs: Contenedores / Imágenes / Volúmenes)
    ├── ContainersView.tsx            # tabla + acciones (create/start/stop/destroy/logs/stats/conectar)
    ├── ContainerCreateDialog.tsx     # wizard: imagen, recursos, puertos, db user/pass
    ├── ContainerDetailDrawer.tsx     # inspect + logs + stats + "Conectar a la DB"
    ├── ImagesView.tsx                # listar / pull / importar / exportar / eliminar
    └── VolumesView.tsx               # listar / crear / eliminar / backup
```

**Regla de capas identica a toketeo** (`agents/core/engineering.md`):
`React → IPC → Commands (thin) → Application (orquestación) → Helper (binario tokedb)`. Los commands **no** ejecutan lógica; el `runtime_service` orquesta y traduce a los DTOs propios; la lib del helper nunca se expone al frontend.

---

## 4. Pasos de implementación

> Cada paso sigue el flujo del AGENTS.md: **Analyze → Plan → List files → Wait approval → One change → Stop**, con verificación `cargo fmt/clippy/test` (backend) y `bun lint/tsc/test` (frontend). Una fase = un cambio atómico.

### Fase 1 — Backend mínimo (soporte del panel)
1. **DTOs** `src-tauri/src/models/runtime.rs` — mirror propio de lo que el frontend necesita:
   `RuntimeContainer { id, name, image, state, created_at, ports, resources }`, `RuntimeImageSummary`, `RuntimeVolume`, `RuntimeLogs`, `RuntimeStats`, `RuntimeEngineInfo`, `RuntimeCreateRequest`, `RuntimeErrorView`. `serde(rename_all="camelCase")`.
2. **HelperRunner** (dentro de `application/runtime_service.rs` o un `application/runtime_helper.rs`):
   - `fn run_capture(args) -> Result<RawJson>`: invoca el binario (Linux directo / Windows vía WSL, mismo patrón que `tokedb/src-tauri`).
   - `fn run_spawn(args)`: background para `start`/`pull`/`stop`.
   - Lectura de `TOKEDB_*` env con defaults; traducir data root a `/mnt/...` en Windows.
   - `UnsupportedPlatform`/errores tipados si WSL/tokedb no está disponible.
3. **`RuntimeService`** (`application/runtime_service.rs`): métodos por use-case que llaman el helper y **seleccionan/parsean el JSON en DTOs propios** (`images()`, `list()`, `inspect()`, `create()`, `start()`, `stop()`, `destroy()`, `logs()`, `stats()`, `volumes_*()`, `registry_*()`). Nunca expone `serde_json::Value` crudo al frontend.
4. **Commands** `presentation/tauri/runtime_commands.rs` — delgados, con `State<AppState>` (o estado estático de config del helper): `runtime_images`, `runtime_list`, `runtime_inspect`, `runtime_create`, `runtime_start`, `runtime_stop`, `runtime_destroy`, `runtime_logs`, `runtime_stats`, `runtime_volume_list/create/remove/backup`, `runtime_pull`, `runtime_import`, `runtime_export`, `runtime_get_engine_info`, `runtime_get_data_root`.
5. **Registro**: `presentation/tauri/mod.rs`, `commands/mod.rs` (re-export) y `lib.rs` `invoke_handler`.
   - **Dependencia**: agregar `serde_json` ya presente; no hace falta dependencia a `tokedb` (vía binario).
6. ✅ `cargo fmt/clippy/test`.

### Fase 2 — Frontend base del panel
7. `types/runtime.ts` — espejo TS de los DTOs.
8. `services/runtime.service.ts` — wrapper thin (`tauriApi.invoke<T>('runtime_list')` etc.).
9. `store/runtimeStore.ts` (Zustand) — `containers`, `images`, `volumes`, `selectedContainer`, `isLoading`, acciones (`refresh()`, `create()`, `toggleStart()`, `openLogs()`, ...), **polling** cada 5s de `runtime_list` + `runtime_images` (patrón del frontend de tokedb).
10. `components/runtime/RuntimePanel.tsx` + `ContainersView.tsx` + `ContainerCreateDialog.tsx` + `ContainerDetailDrawer.tsx`.
11. Registrar el panel en la navegación de toketeo (barra lateral / pestañas) con un `FeatureGate` similar al usado en `assistant`.
12. ✅ `bun lint`, `bunx tsc -b`, `bun test`.

### Fase 3 — Imágenes y volúmenes
13. `ImagesView.tsx` (listar/pull/importar/exportar/eliminar) y `VolumesView.tsx` (listar/crear/eliminar/backup).
14. Diálogo de pull/import con feedback de progreso (ver §6).
15. ✅ verificación.

### Fase 4 — Conectar a la DB del contenedor + pull request final
16. **Integración con conexiones de toketeo**: botón "Conectar" en un contenedor running → abre el diálogo de nueva conexión de toketeo relleno con `host=localhost`, `port=<host_port>`, `db_user`/password del contenedor, `type=<engine>`. Reutiliza el flujo `connect`/`ConnectionService` existente (NO duplica drivers).
17. **Eventos de progreso** vía `tauri::Emitter` o `Channel` para `pull`/`import`/`start` (ver §6).
18. ✅ verificación.

---

## 5. Frontend del panel (detalle de alcance)

Como el alcance acordado es el **panel React**, este es el entregable central. Patrón de un service/funcionalidad (siguiendo `frontend/src/services/sync.service.ts`):

```ts
// frontend/src/services/runtime.service.ts
import { tauriApi } from '@/lib/api';
import type { RuntimeContainer, RuntimeImageSummary } from '@/types/runtime';

export const runtimeService = {
  list: async (): Promise<RuntimeContainer[]> => tauriApi.invoke('runtime_list'),
  images: async (): Promise<RuntimeImageSummary[]> => tauriApi.invoke('runtime_images'),
  create: async (req: RuntimeCreateRequest): Promise<RuntimeContainer> =>
    tauriApi.invoke('runtime_create', { req }),
  start: async (name: string): Promise<void> => tauriApi.invoke('runtime_start', { name }),
  stop: async (name: string): Promise<void> => tauriApi.invoke('runtime_stop', { name }),
  destroy: async (name: string): Promise<void> => tauriApi.invoke('runtime_destroy', { name }),
  logs: async (name: string): Promise<RuntimeLogs> => tauriApi.invoke('runtime_logs', { name }),
  stats: async (name: string): Promise<RuntimeStats> => tauriApi.invoke('runtime_stats', { name }),
  // volume/pull/import/export/engineInfo/dataRoot...
};

// types/runtime.ts: interfaces en camelCase espejo de models/runtime.rs
// store/runtimeStore.ts: Zustand con polling y acciones
```

**Vistas y UX:**
- `RuntimePanel.tsx`: layout con pestañas (`Contenedores`, `Imágenes`, `Volúmenes`) y estado del helper (data root, engine info, advertencia si WSL no disponible).
- `ContainersView.tsx`: tabla `name · image · state · port · actions`; acciones contextuales `start/stop/destroy/logs/stats/conectar`; botón "Nuevo contenedor".
- `ContainerCreateDialog.tsx`: wizard paso a paso (imagen, recursos memory/cpu/pids, puertos, env/args, `db_user`/password) → `runtime_create`.
- `ContainerDetailDrawer.tsx`: pestañas `Inspect` (JSON/Metadata formateado), `Logs` (vista `ContainerLogs`) y `Stats` (refresh manual + auto), y el botón "Conectar a la DB".
- `ImagesView.tsx` y `VolumesView.tsx`: CRUD + pull/import/export + backup.

**Estados/reactividad:** polling de `list`/`images` cada 5s (como el frontend de tokedb) para reflejar transiciones Running/Stopped; `start` dispara el poll inmediato tras el retorno (start es background → no bloquear el UI).

---

## 6. Operaciones asíncronas (start/pull) — consideración crítica

- El helper `start` **bloquea** mientras la DB corre y depende de `kill_on_parent_exit`. Por eso el backend debe usar `run_spawn` (background, sin esperar) y **devolver de inmediato**; el panel detecta el estado vía `runtime_list` polling (state `Starting→Running`).
- `pull`/`import` pueden ser largos. Opciones para no congelar el UI:
  - (a) `runtime_pull` dispara `run_spawn` y el panel hace polling de `runtime_images` hasta que aparezca la imagen.
  - (b) Mejor (fase 4): el helper/tokedb emite progreso; toketeo lo re-emite por `tauri::Emitter` y el frontend se suscribe (`listen`). **Requiere mejora previa en tokedb** (`start --detach`, `pull` con feedback) — coordinar como dependencia externa.
- Dependencia en tokedb a solicitar si el UX lo exige: mejoras #1 (`start --detach`) y #4 (`--env/--args` ya soportado), y confirmar `create --json`/`pull --json` completos.

---

## 7. Reutilización y límites (lo que NO se duplica)

| Recurso | Origen | Uso en el plan |
|---|---|---|
| Delegación WSL2 + manejo root | binario `tokedb` (`wsl.rs`) | HelperRunner reutiliza el patrón, no copia lógica de runtime |
| Drivers/engines de toketeo (`ConnectionService`, `DbDriver`) | toketeo | Botón "Conectar" abre conexión de toketeo con los datos del contenedor; no se introducen drivers nuevos |
| `tauriApi.invoke`, Zustand, `FeatureGate` | toketeo frontend | Patrones estándar del panel |
| Formato de imagen/state de tokedb | tokedb | toketeo **no** lo conoce; solo consume CLI `--json` |

**Mantener la regla del plan F9 de tokedb:** el binario `tokedb` es el único con acceso root al runtime; toketeo nunca ejecuta namespaces/cgroups directamente.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `start` bloquea y muere con la terminal | `run_spawn` background + polling; solicitar `start --detach` en tokedb |
| Windows sin WSL2 / binario ausente | Detección temprana en `RuntimeService`; errores tipados y banner en el panel ("instala WSL2 / tokedb en TOKEDB_WSL_BINARY") |
| `create/pull` no emiten JSON completo | Validar contrato; de lo contrario usar eventos/spawn + polling |
| Duplicar lógica WSL | Reutilizar el patrón `wsl::capture/spawn` de tokedb en el HelperRunner, no la lib |
| Tipos de tokedb filtrados al frontend | `models/runtime.rs` propios; el service traduce |
| CI/pruebas | La integración real requiere WSL+root; unit tests con helper mock; verificación manual en WSL2 |

---

## 9. Definition of Done

- [ ] Backend: `models/runtime.rs`, `runtime_service.rs` (HelperRunner + traducción), `runtime_commands.rs` registrados; `cargo fmt/clippy/test` verdes.
- [ ] Commands devuelven **DTOs propios** de toketeo (nunca `serde_json::Value` crudo).
- [ ] Frontend: `types/runtime.ts`, `services/runtime.service.ts`, `store/runtimeStore.ts`, y el panel (Contenedores / Imágenes / Volúmenes) con polling; `bun lint`, `tsc -b`, `test` verdes.
- [ ] Acciones CRUD de contenedores (crear/arrancar/parar/destruir/logs/stats) funcionales vía helper en Linux/WSL.
- [ ] Botón "Conectar a la DB" rellena una nueva conexión de toketeo con los datos del contenedor.
- [ ] Nada de la lib `tokedb-runtime` queda acoplado a toketeo; toketeo solo usa el binario helper.

---

### Dependencias externas (posibles mejoras a solicitar en `tokedb`)
- Mejora #1 — `start --detach` (background a nivel runtime) para no depender del spawn del helper.
- Mejora #4 — exponer `--env`/`--args` en `create` (ya en `CommandSpec`, falta el flag CLI).
- Confirmar/implementar `create --json` y `pull` con salida emitida (si se quiere progreso real).

_End of plan. Mantener en sincronía con el estado real de `tokedb` (fases/progreso) y de toketeo._
