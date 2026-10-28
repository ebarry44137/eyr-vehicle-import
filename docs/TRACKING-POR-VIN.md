# Seguimiento integral por VIN — diagnóstico y alcance

## Experiencia solicitada

Un visitante ingresa el VIN en la página pública y consulta el estado de su operación desde la recepción en Estados Unidos hasta la entrega en Guatemala. La respuesta presenta etapa actual, fecha del último avance e historial de hitos confirmados. Se incorpora un acceso de seguimiento en la portada.

Este documento define la integración. El seguimiento todavía no está implementado ni publicado.

## Bases comprobadas en el código

| Fuente | Evidencia disponible | Límite actual |
| --- | --- | --- |
| Recepción USA | `usa_yard_receptions`: VIN, yarda, `received_at`, vínculo `import_management_id`. El colaborador registra la recepción con `usa-yard-manager`. | `PENDING_REVIEW` y `LINKED` describen revisión/vinculación; no prueban carga ni salida marítima. |
| Gestión de Importaciones | `import_managements` usa estados como `EMBARCADO`, `TRÁNSITO_MARÍTIMO`, `ARRIBÓ_GUATEMALA`, `CONTROL_ADUANAL`, `LIBERADO`, `ENTREGADO`, `CANCELADO`. | Debe verificarse en la base si existen historial, fechas y asociación de contenedor. No interpretar automáticamente `EMBARCADO` como dos eventos distintos. |
| Aduanas | `customs_cases` registra hitos como `docs_collected_at`, `declaration_signed_at`, `iva_form_sent_at`, `iva_paid_at`, `port_exit_at`, `envelope_ready_at` y `delivered_at`. | Hay que comprobar el vínculo real entre expediente y operación. Retiro de puerto y entrega al cliente son hechos distintos. |
| Portal del cliente | Consume `list_portal_operations_v3957` y `portal_operation_detail_v3957`. Presenta estados normalizados, embarque, ETA, naviera y contenedor. | Estas funciones pertenecen al portal autenticado; no se expondrán públicamente sin un contrato mínimo independiente. Sus definiciones no están incluidas en las migraciones presentes. |

## Recorrido propuesto

1. Recibido en yarda USA.
2. Cargado en contenedor, cuando exista registro explícito de carga.
3. Despachado desde USA, cuando se confirme la salida.
4. En tránsito a Guatemala.
5. Arribó a Guatemala.
6. Documentación y gestión aduanal.
7. Liberado / retirado de puerto, según el hecho registrado.
8. En entrega, si existe un evento operativo que lo respalde.
9. Entregado al cliente.

La secuencia orienta la presentación; no completa automáticamente hitos anteriores. Un estado sin fecha histórica confirmada no genera una fecha inventada. Una operación exclusivamente aduanal inicia donde corresponda y no se presenta como si E&R hubiera transportado el vehículo desde USA.

## Integración operativa

- Vincular recepción, gestión, contenedor/viaje y expediente mediante sus IDs dentro de la misma organización; usar el VIN para búsqueda y validación, no como única clave de unión universal.
- Un VIN puede tener más de una operación a lo largo del tiempo. Identificar el viaje correcto, gestionar ambigüedades y evitar mezclar operaciones canceladas o anteriores con la activa.
- Reutilizar las acciones donde el equipo ya registra avances; generar la proyección de seguimiento desde esos eventos. Añadir únicamente los hitos que hoy no existan, como carga en contenedor si no está registrada.
- Conservar fecha efectiva y fecha de registro, responsable interno, fuente y referencia del evento; evitar duplicados al sincronizar. Corregir o anular un evento debe actualizar el resultado público sin borrar el rastro de auditoría.
- No mostrar porcentaje ficticio ni fechas estimadas como hechos. La ETA solo aparece como estimación cuando exista una fuente operativa.

## Consulta pública

- VIN completo y coincidencia exacta; sin búsquedas parciales ni listados públicos de vehículos.
- Un endpoint específico devuelve solo la identificación mínima del vehículo, etapas públicas, fechas confirmadas y última actualización. No concede lectura pública directa de tablas internas ni reutiliza permisos de administrador en el navegador.
- La organización E&R se resuelve desde configuración confiable del servidor, no desde un `organization_id` elegido por el visitante.
- No devolver nombres de clientes, teléfonos, documentos, fotografías internas, costos, saldos, usuarios responsables, observaciones privadas ni claves internas.
- Validar formato, limitar frecuencia de consultas y tamaño de respuesta. Definir estados claros para VIN no encontrado, operación ambigua y servicio temporalmente no disponible.
- El portal autenticado conserva la información detallada asociada al cliente.

## Siguiente verificación necesaria

Acceso de lectura al proyecto correcto de Supabase para inspeccionar columnas, restricciones, funciones del portal, historial de eventos y vínculos entre recepción, gestión y expediente. No ejecutar migraciones ni desplegar funciones durante esta inspección.

Después del diagnóstico de base: preparar migración y contrato del endpoint, conectar los eventos de los módulos existentes y construir la consulta pública con pruebas de aislamiento por organización, VIN repetido, correcciones y operaciones aduanales parciales. Todo continúa fuera de producción hasta autorización.
