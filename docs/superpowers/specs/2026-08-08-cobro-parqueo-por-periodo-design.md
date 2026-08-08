# Cobro de parqueo por periodicidad

## Contexto

Hoy el módulo de parqueo (`src/server/routes/parking.ts`, modelos `Parking*` en
`prisma/schema.prisma`) es puramente de control de acceso: vehículos, códigos
de acceso, QR dinámico firmado con expiración corta (`verifyDynamicParkingPass`),
visitas y eventos. No existe ningún concepto financiero — no hay `amount`,
`fee` ni `charge` asociado a parqueo en ningún modelo ni ruta.

El módulo financiero (`src/server/routes/finance.ts`) ya resuelve un problema
análogo para cuotas académicas: `CareerFee` define una tarifa (con
periodicidad, monto, ciclo) y al crearla genera un `FinancialCharge` por cada
estudiante activo elegible. El estudiante ve y paga esos cargos desde su
pantalla de Pagos, con pago demo de tarjeta (`/api/finances/card-payment-demo`)
o registrado por caja (`/api/finances/payments`).

Este diseño extiende ese mismo mecanismo al parqueo, con la diferencia de que
el cargo es por vehículo, no por estudiante, y de que el control de acceso
físico ahora depende de la solvencia del vehículo.

## Objetivo

Permitir que el estudiante pague su parqueo por mes, trimestre o semestre (o
compre un pase de un solo día para uso ocasional), y que la barrera de acceso
niegue la entrada a vehículos con saldo de parqueo vencido — sin agregar
fricción a los vehículos al día.

Fuera de alcance explícito: integración con hardware real de pago (lector de
tarjeta físico, aceptador de efectivo) o con un procesador de pagos real. El
"kiosco" es una vista de software (tablet/pantalla) que reutiliza el pago demo
de tarjeta y el registro de caja que ya existen.

## Modelo de datos

### `ParkingFeeSchedule` (nuevo)

Análogo a `CareerFee`, pero institucional (no atado a una carrera):

```prisma
model ParkingFeeSchedule {
  id            String            @id @default(cuid())
  periodType    String            @map("period_type") // MENSUAL | TRIMESTRAL | SEMESTRAL
  amount        Float
  cycleId       String            @map("cycle_id")
  cycle         AcademicCycle     @relation(fields: [cycleId], references: [id], onDelete: Restrict)
  dueDate       DateTime          @map("due_date")
  createdBy     String            @map("created_by")
  assignedCount Int               @default(0) @map("assigned_count")
  charges       FinancialCharge[]
  createdAt     DateTime          @default(now()) @map("created_at")

  @@index([cycleId])
  @@map("parking_fee_schedules")
}
```

Al crear un `ParkingFeeSchedule` (`POST /api/parking/fee-schedules`,
`requireFinance`), se genera un `FinancialCharge` para cada `ParkingVehicle`
con `status: 'ACTIVO'` y dueño (`ownerId`) con `role: 'ESTUDIANTE'` y `active: true`,
igual que `career-fee-schedules` genera cargos para `activeStudents`.

Un ciclo solo puede tener un `ParkingFeeSchedule` por `periodType` (evita
duplicados, igual que la validación existente en `career-fee-schedules`).

### `FinancialCharge` (extendido)

```prisma
model FinancialCharge {
  // ...campos existentes...
  vehicleId            String?              @map("vehicle_id")
  vehicle              ParkingVehicle?       @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  parkingFeeScheduleId String?              @map("parking_fee_schedule_id")
  parkingFeeSchedule   ParkingFeeSchedule?  @relation(fields: [parkingFeeScheduleId], references: [id], onDelete: SetNull)

  @@index([vehicleId, status])
}
```

`vehicleId` es el discriminador: si está presente, el cargo es de parqueo; si
no, es un cargo académico (comportamiento actual sin cambios). No se agrega un
campo `category` separado — sería redundante.

El pase de un día **no** usa `ParkingFeeSchedule`: es un `FinancialCharge`
ad-hoc con `vehicleId` seteado, `parkingFeeScheduleId: null`, concepto
`"Pase de parqueo - {fecha DD/MM/AAAA}"`, `dueDate` = la fecha futura elegida
por el estudiante, `amount` = `ParkingConfig.dailyRate` (nuevo campo, ver
abajo).

### `ParkingConfig` (extendido)

```prisma
model ParkingConfig {
  // ...campos existentes...
  dailyRate Float @default(0) @map("daily_rate")
}
```

Si `dailyRate` es `0`, la compra de pase diario se deshabilita en la UI (sin
tarifa configurada, no se ofrece la opción).

### Efecto colateral: `DELETE /api/parking/vehicles/:id`

Con `onDelete: Restrict` en `vehicleId`, borrar un vehículo con cargos
asociados (pagados o no) falla a nivel de base de datos. El endpoint debe
verificar esto antes y responder `409` con un mensaje claro
("No se puede eliminar un vehículo con historial de cobros de parqueo.") en
vez de dejar que el error de Prisma llegue crudo. Es el mismo criterio que ya
aplica `FinancialCharge.student` sobre `Student`.

## Flujo de pago

### Planes por periodo (mensual/trimestral/semestral)

1. Finanzas, desde una nueva sección en la pantalla de Finanzas (junto a donde
   hoy gestionan `career-fee-schedules`), crea un `ParkingFeeSchedule`:
   ciclo, periodicidad, monto, fecha de vencimiento.
2. El sistema genera un `FinancialCharge` por cada vehículo activo elegible.
3. El estudiante ve estos cargos en su pantalla de **Pagos** existente,
   mezclados con sus cuotas académicas (mismo componente de lista — ya
   funciona por `studentCarnet`, y el cargo de parqueo también pertenece al
   `studentCarnet` del dueño del vehículo, solo que además trae `vehicleId`).
   La UI distingue visualmente los cargos de parqueo (ícono/etiqueta) usando
   la presencia de `vehicleId` en la respuesta de `/api/finances`.
4. El pago se hace exactamente igual que cualquier otro cargo: tarjeta demo
   en línea (`/api/finances/card-payment-demo`) o registrado en caja
   (`/api/finances/payments`). No se toca esa lógica.

### Pase de un día

1. Nuevo endpoint `POST /api/parking/vehicles/:id/day-pass`
   (`requireUser`, solo el dueño del vehículo o `ADMIN`/`REGISTRO`/`PARQUEO`
   staff en su representación): recibe `date` (fecha futura, no pasada).
2. Valida `dailyRate > 0` y que no exista ya un pase para esa fecha y vehículo
   (`@@unique` conceptual vía chequeo de duplicados, similar al de
   `career-fee-schedules`).
3. Crea el `FinancialCharge` ad-hoc descrito arriba.
4. El estudiante lo paga igual que cualquier cargo (tarjeta demo o kiosco).

### Modo kiosco

Nueva ruta de la SPA `/parqueo-kiosco` (nuevo `src/pages/ParkingKioskPage.tsx`),
pensada para una tablet fija en la caseta con una sesión de usuario ya
autenticada (staff de parqueo la deja abierta). Flujo: el estudiante ingresa
su carné o escanea su QR de identificación, la pantalla muestra sus vehículos
y saldo de parqueo pendiente, y puede pagar ahí mismo con el mismo flujo de
tarjeta demo. No hay backend nuevo — reutiliza `/api/finances` y
`/api/finances/card-payment-demo` con el `studentCarnet` consultado.

## Control de acceso

`verifyDynamicParkingPass` (`parking.ts:19`) sigue validando la firma y
expiración del QR sin cambios. Se agrega **un chequeo adicional** después de
esa validación, tanto en el escaneo de QR como en `POST /api/parking/access`
y `POST /api/parking/manual-barrier`:

```ts
const overdueCharge = await prisma.financialCharge.findFirst({
  where: { vehicleId, dueDate: { lt: new Date() }, status: { not: 'PAGADO' } },
});
if (overdueCharge) {
  // registrar ParkingAccessAttempt con reason: 'PARQUEO_MOROSO'
  // responder acceso denegado
}
```

- Un vehículo **sin ningún cargo** (nunca se le facturó, o está al día) entra
  sin fricción — el chequeo solo bloquea por morosidad real, nunca por
  ausencia de plan.
- Es una sola query indexada por `[vehicleId, status]` — no agrega latencia
  perceptible al escaneo en horas pico.
- El mensaje de rechazo en la barrera/kiosco es específico: "Saldo de
  parqueo vencido — regulariza tu pago para ingresar", distinto de los demás
  motivos de rechazo ya existentes (código inválido, vehículo suspendido,
  etc.).

## Manejo de errores

- `ParkingFeeSchedule` duplicado (mismo ciclo + periodicidad): `409`.
- Pase diario para fecha pasada o duplicada: `400` / `409`.
- Borrado de vehículo con cargos asociados: `409` con mensaje claro.
- El cobro de parqueo solo aplica a vehículos cuyo dueño es `ESTUDIANTE`; si
  el dueño es staff/docente, nunca se generan cargos para su vehículo.

## Pruebas

El proyecto no tiene suite automatizada — se valida igual que el resto del
módulo financiero, con el servidor real corriendo contra la base demo:

1. Crear un `ParkingFeeSchedule` desde Finanzas y confirmar que aparece un
   cargo nuevo en `/api/finances` para el estudiante dueño del vehículo.
2. Pagarlo (tarjeta demo) y confirmar que el estado pasa a `PAGADO`.
3. Simular un cargo vencido sin pagar y confirmar que
   `POST /api/parking/access` con el QR de ese vehículo responde acceso
   denegado con `reason: 'PARQUEO_MOROSO'`, mientras que un vehículo sin
   cargos o al día sigue entrando normalmente.
4. Comprar un pase de un día para una fecha futura y confirmar que no
   interfiere con los cargos de plan por periodo.
5. Intentar borrar un vehículo con cargos y confirmar el `409` con mensaje
   claro en vez de un error crudo de base de datos.

## Alcance explícitamente fuera de este diseño

- Hardware real de pago (lector de tarjeta, aceptador de efectivo).
- Procesador de pagos real (todo pago con tarjeta sigue siendo la demo que ya
  existe en el sistema).
- Facturación automática recurrente sin intervención de Finanzas (cada
  periodo se crea manualmente, igual que `career-fee-schedules` hoy).
