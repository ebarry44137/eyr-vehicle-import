# Registro puntual de ganancia neta de fletes

## Estado y alcance

Preparado y probado, pendiente de autorización explícita para aplicar la migración en Supabase E&R y publicar en producción. La revisión automática rechazó el primer intento de aplicar DDL; se comprobó por lectura que no se creó la tabla. No hay ninguna liquidación real cargada por este cambio, ni se generó un cierre. Esta rama tiene el despliegue automático desactivado.

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

## Pasos de activación, una vez autorizados

1. Verificar proyecto `jbrgbqlyohlnwdnwhort` y organización activa E&R.
2. Verificar que las funciones originales siguen coincidiendo con las bases revisadas. Aplicar únicamente la nueva migración, sin ejecutar indiscriminadamente las migraciones históricas del repositorio.
3. Registrar la partida real mediante una transacción que tome el bloqueo `finance_closing:<organization_id>`, resuelva E&R por su slug y utilice una referencia idempotente. Verificar importe/mes si ya existe una fila. La fecha de creación es la real; el mes de imputación es el indicado por el usuario.
4. Consultar resultados de octubre antes/después bajo permisos financieros: la diferencia neta debe ser exactamente la partida; todas las columnas de caja, cobros y banco deben permanecer iguales. Noviembre no incorpora la partida de octubre.
5. Publicar el frontend aprobado y comprobar la sección con datos de prueba. No generar el cierre real: el usuario lo revisará en su flujo habitual.

## Validación

`npm run build` correcto; persiste el aviso anterior de bundle grande.

`tests/freight-net-settlements.test.mjs` aplica la migración en PGlite con las definiciones reales revisadas del resumen y del cierre, tablas mínimas y un movimiento bancario simulado. Comprueba siete escenarios: conservación de resultados sin partidas, imputación de ganancia exclusivamente a octubre, permisos, aislamiento entre organizaciones, duplicados/inmutabilidad, conservación de la ganancia en el cierre y exclusión de noviembre/rechazo de cambios en meses cerrados. Los importes son ficticios. Este fixture no reemplaza la comprobación posterior en Supabase.

Ejecutar con `FINANCE_PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node --test tests/freight-net-settlements.test.mjs` (`@electric-sql/pglite@0.5.13` instalado aparte).

`tests/freight-net-settlements-browser.cjs` verifica la tarjeta, cambio octubre/noviembre, error de carga y pantallas 320/390/768/1440 con API e importes ficticios. Usar `FINANCE_PLAYWRIGHT_MODULE` y `FINANCE_CHROMIUM_PATH` si Playwright/Chromium están instalados fuera del proyecto.
