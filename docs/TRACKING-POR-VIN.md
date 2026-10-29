# Seguimiento por VIN: modal, avances y recepción en yarda

## Estado

Despliegue completo autorizado por el usuario. Migración aplicada en Supabase E&R (versión 20261029040604) y función pública desplegada. La publicación de la portada se realiza mediante integración de esta rama en `main`. El proyecto de la Iglesia no se modifica. La rama de trabajo conserva su despliegue automático desactivado en `vercel.json`.

## Experiencia

La portada incluye Seguimiento y Rastrear mi vehículo. Abren un modal con VIN completo (17 caracteres), estado informado, fechas reales registradas, ETA identificada como estimación y galería ampliable de recepción en yarda. Incluye navegación por teclado, cierre con Escape, foco y bloqueo del fondo, consulta sin resultados, ambigüedad, límite de consultas y servicio no disponible.

No simula un porcentaje ni completa etapas anteriores sin evidencia. `EMBARCADO` conserva una etiqueta propia; no inventa las fechas de carga ni salida. `customs_cases.delivered_at` significa “vehículo/documentos entregados” en el sistema existente: se muestra como entrega registrada en aduanas, sin afirmar por sí solo entrega final del vehículo. Esta última puede confirmarse con un avance específico o el estado ENTREGADO de la gestión.

## Operación

- Recepción y fechas aduanales se leen de sus registros habituales, sin copiar datos de clientes.
- En el detalle de una gestión o expediente se agregó un panel para registrar/corregir/retirar fechas reales: carga en contenedor, despacho desde USA, llegada a Guatemala, en entrega y entregado al cliente.
- En Yarda USA, un ADMIN puede seleccionar qué fotos de la recepción compartir. Por defecto ninguna está publicada. Antes de marcar debe revisar que sean fotos del vehículo sin documentos ni datos personales visibles. Se comparten los originales; no se elimina EXIF ni se difuminan datos automáticamente.
- Una recepción sin vínculo permite seleccionar fotos pero requiere vincular su gestión para registrar transporte. Las operaciones exclusivamente aduanales no ofrecen carga/salida USA ni fotos de yarda.
- Los nuevos avances no cambian los estados financieros, CRM ni cálculos existentes. Sus correcciones conservan auditoría y revisión para impedir sobrescribir cambios concurrentes.

## Datos y permisos

Proyecto inspeccionado: `jbrgbqlyohlnwdnwhort` (EyR Vehicle Import). Organización E&R comprobada: `00000000-0000-0000-0000-000000000001`.

La búsqueda usa organización y VIN exactos e índices funcionales. Recepción/gestión/aduanas se vinculan por IDs y se valida también organización/VIN; no se unen operaciones distintas solo porque tengan el mismo VIN. Una operación activa inequívoca tiene prioridad sobre antiguas cerradas; varios registros activos o varios históricos sin uno inequívoco devuelven ambigüedad. Se excluyen gestiones/recepciones canceladas.

La migración `supabase/migrations/20261029040604_vehicle_tracking_modal.sql` añade tres índices de búsqueda, un esquema privado con avances, selección de fotos, auditoría y límites, y tres RPC acotadas. No cambia las políticas de lectura de las tablas operativas existentes.

- `eyr_tracking_admin_v1`: usuario autenticado activo ADMIN/OPERADOR, organización activa y acceso operativo `can_full_office_v3821()`. Solo ADMIN publica fotos, solo de su recepción/organización.
- `eyr_tracking_snapshot_v1` y `eyr_tracking_limit_v1`: solo `service_role`. El navegador no puede ejecutarlas ni leer tablas privadas.
- La función pública `public-vehicle-tracking` valida VIN, cuerpo de hasta 2 KB y límites por minuto global (300), señal IP (20) y VIN (10). Guarda hashes con sal, no direcciones IP ni VIN en el contador. La señal IP no es autenticación y no sustituye el presupuesto global. Sin CAPTCHA en esta versión.
- Organización fija de servidor, CORS de orígenes autorizados, respuesta sin caché. Solo devuelve vehículo, estado, fechas y fotos seleccionadas. No devuelve clientes, documentos, saldos, costos, notas o usuarios.
- Las fotos aprobadas tienen enlaces firmados de hasta 120 segundos. Retirarlas impide enlaces nuevos; los ya emitidos pueden funcionar hasta vencer. La consulta se actualiza para renovar los enlaces. No hay bucket público ni rutas arbitrarias elegibles desde el navegador.

## Configuración y control de activación

Se aplicó únicamente esta migración y se desplegó `public-vehicle-tracking` con `verify_jwt=false`, porque la consulta por VIN es pública. No ejecutar indiscriminadamente las migraciones históricas del repositorio. No se agregó `supabase/config.toml` para evitar colisionar con la configuración local del equipo. Los valores predeterminados son exclusivos de E&R; se pueden ajustar con variables del servidor.

| Variable de servidor | Valor / condición |
| --- | --- |
| `TRACKING_PUBLIC_ENABLED` | Activo por defecto en esta publicación autorizada; `false` desactiva la consulta |
| `TRACKING_ORGANIZATION_ID` | Predeterminado: UUID E&R indicado arriba, nunca elegido por el visitante |
| `TRACKING_RATE_LIMIT_SALT` | Opcional: secreto de al menos 32 caracteres. Por defecto se deriva mediante SHA-256 de la credencial de servidor y un contexto exclusivo del seguimiento; nunca llega al navegador |
| `TRACKING_ALLOWED_ORIGINS` | Predeterminados: https://www.eyrsolutionsgt.com y https://eyrsolutionsgt.com. Sobrescritura opcional separada por coma, sin rutas ni barra final |
| `TRACKING_ALLOW_LOCALHOST` | Omitida/false en producción; true solo para prueba local explícita |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Entorno de la función, nunca variables `VITE_` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Reutilizar configuración de almacenamiento existente sin exponer credenciales |

Antes de publicar la web: verificar una operación de prueba autorizada de principio a fin en el proyecto correcto, selección/retiro de fotos, renovación de enlaces, permisos y respuesta sin datos privados. La publicación del frontend y la integración en `main` también fueron autorizadas. Deshabilitar `TRACKING_PUBLIC_ENABLED` desactiva la consulta sin afectar los módulos existentes; no borrar la auditoría para desactivar.

## Validación local

- `npm run build`: correcto; permanece el aviso previo de bundle principal grande. El modal público se carga en un fragmento separado.
- `node --test tests/tracking.test.mjs`: contrato público, normalización, fechas/ETA, no exposición de datos, CORS/configuración, límites, cuerpo inválido y fallas de imágenes.
- `tests/tracking-db.test.mjs`: aplica la migración real en Postgres local PGlite sobre un esquema mínimo; no se conecta a Supabase. Comprueba permisos de anon/authenticated, aislamiento de organizaciones, auditoría, revisiones, fechas futuras, fotos privadas/publicación/retiro, ambigüedad, solo aduanas y límites. La función de acceso operativo se simula en el fixture; no reemplaza una prueba integral del entorno real.
- Para DB: instalar `@electric-sql/pglite@0.5.13` en un directorio temporal y ejecutar `TRACKING_PGLITE_MODULE=/ruta/absoluta/node_modules/@electric-sql/pglite/dist/index.js node --test tests/tracking-db.test.mjs` (en PowerShell configurar `$env:TRACKING_PGLITE_MODULE` antes del comando).
- `node tests/tracking-browser.cjs` con Playwright instalado aparte y Chromium disponible (opcional `TRACKING_PLAYWRIGHT_MODULE` / `TRACKING_CHROMIUM_PATH`); `TRACKING_SCREENSHOT_DIR` permite guardar capturas. Navegador con respuestas simuladas: modal, foco/Escape, validación, historial, galería, resultados vacíos/ambiguos/429/503 y tamaños 320/390/768/1440. También panel de administración, selección de foto, guardar/retirar avance. Las capturas de demostración no contienen fotos ni operaciones reales.

La función fue compilada y desplegada por Supabase. Las imágenes reales continúan privadas hasta que el administrador las seleccione; las pruebas simuladas de galería no sustituyen la revisión de una foto real aprobada. La firma R2 se valida al seleccionar y consultar una foto de recepción autorizada.
