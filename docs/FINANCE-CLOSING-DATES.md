# Cierres por fecha seleccionada

La vista previa y `create_finance_closing` respetan `Hasta` en la zona `America/Guatemala`. Un corte histórico excluye el inicio del día siguiente; un corte de hoy llega hasta el instante real del cálculo. Se rechazan fechas finales futuras. `closed_at` conserva el momento real de creación.

Los movimientos anteriores conservan su base existente: `created_at`, la fecha de registro. Los gastos nuevos o expresamente ajustados usan `finance_expenses.bank_closing_date`, que el servidor asigna desde `expense_date`; su fecha real de creación permanece intacta. Los demás tipos de pagos conservan su regla anterior. La apertura viene del último checkpoint válido o de la conciliación activa; el rango Desde/Hasta define el resultado contable, y los movimientos bancarios comienzan en ese checkpoint mostrado.

`finance_closings.bank_cutoff_exclusive` distingue cierres nuevos de los anteriores. Los anteriores conservan sus valores y su límite inclusivo; los nuevos excluyen su límite superior, que el siguiente corte incluye exactamente una vez. No se reescriben importes ni se crean cierres al instalar esta migración.

El RPC nuevo `finance_next_closing_preview(date,date)` recibe ambas fechas y devuelve metadatos del cálculo. La firma sin argumentos se conserva para clientes anteriores. Los permisos financieros y el bloqueo transaccional del cierre siguen vigentes. Las salidas aduanales ahora figuran también en el contador de salidas de la vista previa.

Las liquidaciones netas de fletes siguen afectando únicamente la utilidad. Registrar una entrada bancaria requiere confirmar la recepción y evitar duplicarla con el saldo conciliado. Las recepciones confirmadas vinculadas a fletes usan su propia fecha bancaria, manteniendo aparte la auditoría real de registro.

## Validación

- `tests/finance-closing-date.test.mjs`: PostgreSQL local con PGlite, funciones anteriores reales y cifras ficticias; corte de octubre, microsegundos, medianoche, cierre consecutivo, apertura, compromisos, permisos, superposición, fecha futura y compatibilidad RPC.
- `tests/finance-closing-date-browser.cjs`: componente FinanceDashboard real con API en memoria; fechas enviadas a vista previa y creación, formato Guatemala en navegador Tokio, cancelar sin escritura y confirmación exitosa.
- Build Vite de producción.

Las pruebas no generan cierres ni movimientos en producción.


## Fecha elegida para gastos

La migración `expense_closing_dates` agrega una fecha de imputación al cierre y su auditoría. Su instalación conserva todos los importes anteriores: las filas existentes tienen fecha de cierre nula hasta una asignación autorizada o un cambio financiero validado. Los gastos bancarios nuevos usan automáticamente la fecha elegida en el formulario.

El motor excluye esas filas del cálculo por fecha de registro y las incorpora por fecha de gasto, exactamente una vez. El saldo bancario actual y la utilidad no se vuelven a descontar al asignar una fecha histórica a un gasto existente. La vista previa incluye los mismos importes y cantidades que el cierre real; el corte siguiente excluye lo consumido. Esta fecha sirve para imputación del cierre y no certifica una fecha distinta de transferencia bancaria.

Se conserva `created_at`, y `bank_closing_recorded_at` registra cuándo se asignó la fecha. Las validaciones exigen permisos financieros, organización activa, una fecha posterior a la conciliación y un período abierto. No se modifica ningún cierre anterior ni se genera uno al aplicar la migración.

`tests/expense-closing-date.test.mjs` usa importes ficticios y PostgreSQL local para comprobar gastos ingresados tarde, asignación de fecha, banco/utilidad sin duplicar, gastos nuevos, límites, permisos y el cierre posterior.
