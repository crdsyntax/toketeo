Plan: Refactorizar Cross-DB Sync para usuarios no técnicos
Problemas identificados
1. Demasiados conceptos técnicos: column mappings, transforms (Regex, Cast, DateFormat), filtros SQL WHERE, batch size, primary keys — requieren conocimiento profundo de bases de datos
2. Flujo confuso: pipeline → run → batch → row_error, sin una guía paso a paso
3. Sin detección inteligente: el usuario debe mapear columnas manualmente, no se auto-detectan
4. Sin wizard: la configuración se presenta toda de golpe en un formulario denso
5. Sin retroalimentación visual clara: el progreso es textual, no hay vista de "lo que va a pasar" antes de ejecutar
6. Sin pausa/reanudación/cancelación: los status existen pero no hay UI ni lógica
7. Sin programación automática: solo ejecución manual
8. Incremental sync no funcional: tiene el mismo código que full sync, checkpoints sin conectar
Fase 1: Simplificar el modelo conceptual
1.1 — Renombrar "Pipeline" a "Sincronización" (o "Sync Job")
- Ocultar los conceptos internos (batch, checkpoint, run) del usuario
- En la UI solo mostrar: nombre, origen → destino, tablas, programación
- Los runs/batches/errores se muestran como "historial de ejecuciones" colapsado
1.2 — Auto-detección de columnas por defecto
- Al seleccionar tabla origen, detectar columnas automáticamente
- Por defecto: sincronizar TODAS las columnas con el mismo nombre en destino
- El mapeo manual solo se muestra cuando es necesario (opción avanzada colapsada)
1.3 — Detección automática de primary keys
- Usar fetch_columns() para detectar PK automáticamente
- Eliminar el input manual de "Primary Key(s)"
1.4 — Batch size inteligente
- BuildEliminar el input de batch size·Big PickleOpenCode Zen
- Usar DriverCapabilities.max_batch_size para determinar el tamaño óptimo automáticamente
1.5 — Filtros simplificados
- Reemplazar el input de SQL WHERE con un builder visual simple: seleccionar columna → operador (=, >, <, contiene, empieza con) → valor
- Opción "Filtro avanzado (SQL)" colapsada para usuarios técnicos
Fase 2: Wizard de configuración guiado
2.1 — Reemplazar PipelineEditor.tsx (formulario único) con un wizard multi-paso
Paso 1: Conexiones
- Seleccionar conexión origen
- Seleccionar conexión destino
- Mostrar indicador visual de estado de conexión (✅ conectado / ❌ error)
- Botón "Probar conexiones"
Paso 2: Tablas
- Lista de tablas disponibles en origen (checkbox)
- Auto-detectar estructura al seleccionar
- Mostrar vista previa de datos (primeras 5 filas) al hacer clic en una tabla
- Para cada tabla seleccionada: columna destino (auto: mismo nombre) y toggle "cambiar nombre"
Paso 3: Vista previa y confirmación
- Mostrar resumen visual: origen → flecha → destino con tablas, columnas, filas estimadas
- Botón "Validar" que ejecuta validate_sync_config y muestra resultados en lenguaje natural
- ✅ "10 tablas listas para sincronizar"
- ⚠️ "La tabla 'users' tiene columnas diferentes entre origen y destino"
- ❌ "No se puede conectar con la base de datos origen"
Paso 4: Programación (opcional)
- "Ejecutar una vez ahora" (default)
- "Repetir cada: 1h, 6h, 12h, 24h, semanal"
- "Programación personalizada" → input cron (opción avanzada)
2.2 — Nuevo componente SyncWizard.tsx
- Contenedor del wizard con navegación (siguiente/anterior)
- Barra de progreso del wizard (paso 1 de 4)
- Resumen final antes de guardar
- Los componentes de cada paso van en frontend/src/components/sync/wizard/
Fase 3: Mejorar feedback visual
3.1 — Dashboard principal (CrossDbSyncPage.tsx)
- Vista de tarjetas: cada sincronización como una tarjeta con:
- Nombre, icono de BD origen → destino
- Estado con color (🟢 listo, 🔴 error, 🟡 en progreso, ⚪ inactivo)
- Última ejecución: "hace 2h" / "nunca" + resumen "1.234 filas, 0 errores"
- Botones: ▶️ ejecutar, 📋 historial, ⚙️ editar, 🗑️ eliminar
- Vista de lista alternativa (toggle)
- Botón "Nueva sincronización" que abre el wizard
3.2 — Progreso en tiempo real (SyncProgress.tsx)
- Reemplazar barra de progreso numérica con:
- Animación de transferencia (origen → destino con partículas/datos fluyendo)
- Tabla actual con spinner
- Contador grande: ✅ 1.234 / 10.000 filas
- Tiempo transcurrido y estimado
- Mini-logs en vivo (últimas 5 operaciones) en lugar de la tabla de batches
3.3 — Historial de ejecuciones (SyncHistory.tsx)
- Vista de timeline vertical
- Cada ejecución muestra: fecha, duración, ✅ filas sincronizadas / ❌ errores
- Hacer clic para expandir detalle (no abrir vista separada)
Fase 4: Conectar funcionalidades incompletas
4.1 — Incremental sync funcional
- En incremental_sync.rs: leer/escribir SyncCheckpoint desde storage
- Guardar last_processed_key al completar cada tabla
- En la siguiente ejecución, empezar desde el checkpoint
- Agregar indicador en UI: "🔄 Sincronización incremental" vs "🔁 Completa"
4.2 — Persistir SyncBatch y SyncRowError durante ejecución
- En full_sync.rs e incremental_sync.rs: llamar a storage.save_sync_batch() y storage.save_sync_row_error() después de cada batch
- Actualmente solo se guarda save_sync_run al final
4.3 — Pausa, reanudar y cancelar
- Agregar comando pause_sync(pipeline_id) — setear status a Paused
- Agregar comando cancel_sync(pipeline_id) — setear status a Cancelled
- En start_sync: verificar status en cada iteración de batch, si es Paused esperar, si es Cancelled terminar
- Botones en UI: ⏸️ Pausar, ▶️ Reanudar, ⏹️ Cancelar (solo visibles durante ejecución)
4.4 — Implementar DateFormat transform
- En transformers/mod.rs: convertir DateFormat a implementación real usando formato strftime
4.5 — Eliminar Concat y Regex del wizard (mover a "avanzado")
- Por defecto no se muestran
- Solo aparecen en modo "Avanzado" del mapeo de columnas
Fase 5: Simplificar el backend
5.1 — Crear sync_commands_router.rs
- Mover los 12 comandos de sync de commands.rs (1533 líneas) a un módulo separado
- commands.rs importa y re-exporta los comandos de sync
5.2 — Simplificar SyncTableConfig
- Hacer column_mappings, filters, primary_key opcionales en la UI
- Si no se especifican, auto-detectar al ejecutar
5.3 — Mejorar mensajes de validación
- En ValidationReport, agregar campo user_friendly_messages: Vec<String>
- Traducir errores técnicos a mensajes legibles:
- ❌ "Column 'email' missing in target" → "La columna 'email' no existe en la tabla destino"
- ⚠️ "Type mismatch: source VARCHAR(255), target TEXT" → "La columna 'nombre' es de tipo diferente entre origen y destino"
Fase 6: Auto-esquema (opcional, alta prioridad)
6.1 — Botón "Crear tabla destino automáticamente"
- Analizar esquema origen
- Generar CREATE TABLE en el dialecto destino
- Mostrar preview del SQL generado
- Ejecutar con un clic
6.2 — Sugerir column mapping inteligente
- Comparar nombres de columna (usando strsim para fuzzy matching)
- Si origen tiene user_email y destino tiene email, sugerir mapeo automático
- Marcar como sugerencia en la UI (no aplicado automáticamente)
Orden de implementación sugerido
#	Fase
1	Fase 1 — Simplificar modelo (auto-detección, defaults)
2	Fase 2 — Wizard de configuración
3	Fase 3 — Dashboard y feedback visual
4	Fase 4.1 — Incremental sync funcional
5	Fase 4.2-4.3 — Persistencia + pausa/cancelar
6	Fase 5 — Refactor backend
7	Fase 4.4-4.5, Fase 6 — Auto-esquema, DateFormat
Total estimado: 15-19 días hábiles