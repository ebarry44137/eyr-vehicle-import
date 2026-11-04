# Registro puntual de ganancia neta de fletes

## Estado y alcance

Autorización explícita recibida del usuario. Migración 20261103233952 aplicada en Supabase E&R y partida real registrada mediante referencia idempotente. La validación transaccional confirmó el incremento exacto de utilidad, sin cambios en otras columnas de resultados, saldo bancario ni cantidad de cierres. Los importes reales permanecen solo en la base privada. Esta rama conserva el despliegue automático desactivado; el frontend se publica mediante integración en main.

El caso actual solo dispone de la ganancia final después de los costos USA y Guatemala. No se reconstruyen ventas, remesas, costos ni pagos históricos desconocidos. Tampoco se crea un expediente aduanal. El importe real solicitado se registra aparte mediante una operación de datos autorizada, no se incluye en el código ni en estas pruebas públicas.

## Integración preparada

- `eyr_finance_private.freight_net_settlements`: importe en GTQ, mes de imputación, concepto, referencia única por organización, nota, origen del registro, fecha de creación y anulación documentada. RLS activado y sin acceso directo de anon/authenticated.
- Se imputa al último día del mes para seleccionar el período de resultados; es una regla de imputación mensual, no una fecha inventada de depósito.
- La utilidad neta de `finance_period_summary` suma esa partida por organización y período. Facturado, por cobrar, cobrado, costos y resultados de caja conservan su cálculo previo. La utilidad bruta sigue representando los servicios existentes; la ganancia liquidada de fletes aparece por separado.
- El cálculo original de resultados permanece en una función privada con sus verificaciones de usuario/organización. La fachada pública conserva los mismos parámetros y columnas y usa SECURITY INVOKER.
- Los cierres nuevos conservan la partida en `finance_closings.freight_net_profit_gtq`, junto al resultado neto ya ajustado. No se alteran cierres anteriores ni se crea uno automáticamente.
- Las funciones bancarias, sus conciliaciones y movimientos permanecen intactos. Una ganancia liquidada no crea un ingreso bancario.
- La referencia única impide repetir una misma carga. La liquidación es inmutable; una corrección requiere anulación documentada. El mismo bloqueo por organización del motor de cierres impide insertar o corregir una liquidación mientras se está cerrando. Los meses ya incluidos en un cierre activo requieren revisión previa.
- En Finanzas se agrega una sección de consulta de ganancias liquidadas. Muestra total del rango y los registros recientes con su mes; avisa si uno está fuera del rango. No hay formulario de cobro ni de entrada bancaria.

## Procedimiento de activación y comprobación

1. Verificar proyecto `jbrgbqlyohlnwdnwhort` y organización activa E&R.
2. Verificar que las funciones originales siguen coincidiendo con las bases revisadas. Aplicar únicamente la nueva migración, sin ejecutar indiscriminadamente las migraciones históricas del repositorio.
3. Registrar la partida real mediante una transacción que tome el bloqueo `finance_closing:<organization_id>`, resuelva E&R por su slug y utilice una referencia idempotente. Verificar importe/mes si ya existe una fila. La fecha de creación es la real; el mes de imputación es el indicado por el usuario.
4. Consultar resultados de octubre antes/después bajo permisos financieros: la diferencia neta debe ser exactamente la partida; todas las columnas de caja, cobros y banco deben permanecer iguales. Noviembre no incorpora la partida de octubre.
5. Publicar el frontend aprobado y comprobar la sección con datos de prueba. El cierre real queda para revisión y generación por el usuario en su flujo habitual.

## Validación

`npm run build` correcto; persiste el aviso anterior de bundle grande.

`tests/freight-net-settlements.test.mjs` aplica la migración en PGlite con las definiciones reales revisadas del resumen y del cierre, tablas mínimas y un movimiento bancario simulado. Comprueba siete escenarios: conservación de resultados sin partidas, imputación de ganancia exclusivamente a octubre, permisos, aislamiento entre organizaciones, duplicados/inmutabilidad, conservación de la ganancia en el cierre y exclusión de noviembre/rechazo de cambios en meses cerrados. Los importes son ficticios. Este fixture no reemplaza la comprobación posterior en Supabase.

Ejecutar con `FINANCE_PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node --test tests/freight-net-settlements.test.mjs` (`@electric-sql/pglite@0.5.13` instalado aparte).

`tests/freight-net-settlements-browser.cjs` verifica la tarjeta, cambio octubre/noviembre, error de carga y pantallas 320/390/768/1440 con API e importes ficticios. Usar `FINANCE_PLAYWRIGHT_MODULE` y `FINANCE_CHROMIUM_PATH` si Playwright/Chromium están instalados fuera del proyecto.


## Recepciones bancarias confirmadas

La migración `freight_bank_receipt` permite vincular una recepción bancaria confirmada a la liquidación existente. `bank_received_on` conserva la fecha confirmada sin inventar una hora y `bank_recorded_at` conserva el momento real de registro. El importe de la recepción es el mismo de la liquidación. No crea ventas, cobros de expedientes ni una segunda utilidad.

El dashboard bancario y el motor de cierres incluyen esta recepción una vez; la tarjeta de fletes muestra fecha e importe bancario del rango. La utilidad conserva su imputación de fin de mes. La conciliación original y los cierres previos no se modifican. Se rechazan fechas futuras y fechas que afecten conciliaciones o cierres activos. Una recepción registrada no se puede editar o anular silenciosamente.

Los movimientos anteriores mantienen su base de fecha de registro; las recepciones de fletes usan la fecha confirmada, con límites de calendario de Guatemala. Los campos nuevos y la función de agregación son privados. Esta migración no registra dinero por sí sola: el asiento requiere la confirmación expresa del usuario.

Pruebas: `tests/freight-bank-receipt.test.mjs` usa cifras ficticias para comprobar banco, disponibilidad, cortes antes/después de la recepción, utilidad sin duplicación, cierre siguiente, permisos y auditoría. `tests/freight-net-settlements-browser.cjs` verifica la fecha bancaria y el importe en la tarjeta real.
