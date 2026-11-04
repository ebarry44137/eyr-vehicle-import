# Cierres por fecha seleccionada

La vista previa y `create_finance_closing` respetan `Hasta` en la zona `America/Guatemala`. Un corte histórico excluye el inicio del día siguiente; un corte de hoy llega hasta el instante real del cálculo. Se rechazan fechas finales futuras. `closed_at` conserva el momento real de creación.

El banco mantiene su base existente: `created_at`, la fecha de registro del movimiento. La fecha contable del formulario (`payment_date`) no cambia retroactivamente esta base. La apertura viene del último checkpoint válido o de la conciliación activa; el rango Desde/Hasta define el resultado contable, y los movimientos bancarios comienzan en ese checkpoint mostrado.

`finance_closings.bank_cutoff_exclusive` distingue cierres nuevos de los anteriores. Los anteriores conservan sus valores y su límite inclusivo; los nuevos excluyen su límite superior, que el siguiente corte incluye exactamente una vez. No se reescriben importes ni se crean cierres al instalar esta migración.

El RPC nuevo `finance_next_closing_preview(date,date)` recibe ambas fechas y devuelve metadatos del cálculo. La firma sin argumentos se conserva para clientes anteriores. Los permisos financieros y el bloqueo transaccional del cierre siguen vigentes. Las salidas aduanales ahora figuran también en el contador de salidas de la vista previa.

Las liquidaciones netas de fletes siguen afectando únicamente la utilidad. Registrar una entrada bancaria es una operación distinta, que requiere confirmar la recepción y evitar duplicarla con el saldo conciliado.

## Validación

- `tests/finance-closing-date.test.mjs`: PostgreSQL local con PGlite, funciones anteriores reales y cifras ficticias; corte de octubre, microsegundos, medianoche, cierre consecutivo, apertura, compromisos, permisos, superposición, fecha futura y compatibilidad RPC.
- `tests/finance-closing-date-browser.cjs`: componente FinanceDashboard real con API en memoria; fechas enviadas a vista previa y creación, formato Guatemala en navegador Tokio, cancelar sin escritura y confirmación exitosa.
- Build Vite de producción.

Las pruebas no generan cierres ni movimientos en producción.
