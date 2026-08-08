# Cobro de parqueo por periodicidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un estudiante pague su parqueo por mes, trimestre, semestre o con un pase de un solo día, y que la barrera niegue el acceso a vehículos con saldo de parqueo vencido, reutilizando el módulo financiero existente (`CareerFee`/`FinancialCharge`) y el QR dinámico existente.

**Architecture:** Se agrega `ParkingFeeSchedule` (análogo a `CareerFee` pero institucional) y dos campos opcionales en `FinancialCharge` (`vehicleId`, `parkingFeeScheduleId`). Los cargos de parqueo viven en la misma tabla y se pagan con los mismos endpoints (`/api/finances/payments`, `/api/finances/card-payment-demo`) que ya usan matrícula y cuotas académicas — solo se distinguen por tener `vehicleId`. El control de acceso agrega una sola query de solvencia dentro de `POST /api/parking/access`.

**Tech Stack:** Express + Prisma (SQLite dev / Postgres prod) en `src/server/routes/*.ts`, React + Vite SPA en `src/pages/*.tsx`, sin frameworks de testing — verificación manual con `tsc --noEmit` y `curl`/servidor real, igual que el resto del proyecto.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-08-cobro-parqueo-por-periodo-design.md`.
- El proyecto **no tiene suite de tests automatizada**. Cada tarea reemplaza "escribe el test que falla" por "verifica manualmente con `npx tsc --noEmit` y, cuando aplique, con el servidor real (`npm run dev`) usando `curl` contra `http://127.0.0.1:3000`, como se hizo en el resto de este proyecto."
- Todo cargo de parqueo se identifica por `FinancialCharge.vehicleId != null`. No se agrega un campo `category` separado (YAGNI).
- `POST /api/parking/manual-barrier` **nunca** debe llevar el chequeo de solvencia — es la apertura de emergencia. Esto es intencional, no un olvido.
- Un vehículo sin ningún cargo generado nunca se bloquea — el chequeo de acceso solo actúa sobre morosidad real (`dueDate < hoy` y `status != 'PAGADO'`).
- El "kiosco" es una vista de software que reutiliza `card-payment-demo` (requiere que el usuario autenticado sea `ESTUDIANTE`); no hay integración de hardware real de pago ni cambios al modelo de autorización de roles.
- Estilo de código: seguir el patrón denso ya usado en `src/server/routes/*.ts` y `src/pages/*.tsx` (funciones de una línea, sin reformatear archivos existentes más allá de lo necesario).
- Commits: uno por tarea, mensajes en español siguiendo el estilo del historial (`git log --oneline`).

---

## File Structure

- **Modify:** `prisma/schema.prisma` — nuevo modelo `ParkingFeeSchedule`, campos nuevos en `FinancialCharge` y `ParkingConfig`.
- **Create:** una migración Prisma (`prisma migrate dev`) con el nombre `add_parking_fee_schedules`.
- **Modify:** `src/server/routes/parking.ts` — guarda de borrado de vehículo, chequeo de solvencia en `/api/parking/access`, endpoints de tarifas y pase diario.
- **Modify:** `src/server/routes/finance.ts` — `financeView` expone `vehicleId`/`vehiclePlate`.
- **Modify:** `src/pages/FinancesPage.tsx` — formulario de tarifa de parqueo (Finanzas) + insignia de placa en la lista de cargos.
- **Modify:** `src/pages/ParkingPage.tsx` — botón de "comprar pase de un día" por vehículo.
- **Create:** `src/pages/ParkingKioskPage.tsx` — vista de kiosco.
- **Modify:** `src/App.tsx`, `src/components/layout/Sidebar.tsx` — registrar la ruta del kiosco.

---

### Task 1: Esquema de datos y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Test: manual (`npx prisma migrate dev`, `npx tsc --noEmit`)

**Interfaces:**
- Produces: modelo `ParkingFeeSchedule { id, periodType, amount, cycleId, dueDate, createdBy, assignedCount, charges, createdAt }`; `FinancialCharge.vehicleId?: string`, `FinancialCharge.parkingFeeScheduleId?: string`; `ParkingConfig.dailyRate: number`.

- [ ] **Step 1: Agregar el modelo `ParkingFeeSchedule`**

En `prisma/schema.prisma`, después del modelo `CareerFee` (busca `model CareerFee` y ubica el cierre `}` de ese bloque), agrega:

```prisma
model ParkingFeeSchedule {
  id            String            @id @default(cuid())
  periodType    String            @map("period_type")
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

- [ ] **Step 2: Agregar la relación inversa en `AcademicCycle`**

Busca `model AcademicCycle` y, junto a sus otras relaciones inversas (busca una línea como `sections Section[]` o similar dentro de ese modelo), agrega:

```prisma
  parkingFeeSchedules ParkingFeeSchedule[]
```

- [ ] **Step 3: Extender `FinancialCharge`**

En `model FinancialCharge` (`prisma/schema.prisma:373`), dentro del bloque, agrega estos campos junto a `careerFeeId`/`careerFee`:

```prisma
  vehicleId            String?             @map("vehicle_id")
  vehicle              ParkingVehicle?     @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  parkingFeeScheduleId String?             @map("parking_fee_schedule_id")
  parkingFeeSchedule   ParkingFeeSchedule? @relation(fields: [parkingFeeScheduleId], references: [id], onDelete: SetNull)
```

Y agrega este índice junto a los `@@index` existentes del modelo:

```prisma
  @@index([vehicleId, status])
```

- [ ] **Step 4: Agregar la relación inversa en `ParkingVehicle` y `dailyRate` en `ParkingConfig`**

En `model ParkingVehicle` (busca `model ParkingVehicle`), junto a `visits ParkingVisit[]`, agrega:

```prisma
  charges    FinancialCharge[]
```

En `model ParkingConfig` (`prisma/schema.prisma:813`), agrega:

```prisma
  dailyRate Float @default(0) @map("daily_rate")
```

- [ ] **Step 5: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name add_parking_fee_schedules`
Expected: migración creada en `prisma/migrations/`, aplicada sin errores, cliente Prisma regenerado.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida (sin errores). Los tipos nuevos (`prisma.parkingFeeSchedule`, `charge.vehicleId`, etc.) ya están disponibles para las siguientes tareas.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: agrega modelo ParkingFeeSchedule y vincula FinancialCharge a vehículos"
```

---

### Task 2: Bloquear borrado de vehículo con cargos y agregar chequeo de solvencia en el acceso

**Files:**
- Modify: `src/server/routes/parking.ts:64-70` (borrado de vehículo)
- Modify: `src/server/routes/parking.ts` (`POST /api/parking/access`, ~línea 101)
- Test: manual (servidor real + `curl`)

**Interfaces:**
- Consumes: `prisma.financialCharge` (Task 1).
- Produces: ninguna nueva función pública; cambia el comportamiento HTTP de `DELETE /api/parking/vehicles/:id` (ahora puede responder `409`) y de `POST /api/parking/access` (ahora puede rechazar por `PARQUEO_MOROSO`).

- [ ] **Step 1: Bloquear el borrado de vehículos con cargos asociados**

En `src/server/routes/parking.ts`, dentro de `app.delete('/api/parking/vehicles/:id', ...)`, después de la validación de "no puedes quitar este vehículo" y antes del chequeo de `parkingVisit` con estado `DENTRO`, agrega:

```ts
    if (await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id } })) return void res.status(409).json({ message: 'No puedes eliminar un vehículo con historial de cobros de parqueo.' });
```

El bloque completo del handler debe quedar así (mismo cuerpo existente + la línea nueva insertada en el orden indicado):

```ts
  app.delete('/api/parking/vehicles/:id', requireUser, async (req, res) => {
    const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) return void res.status(404).json({ message: 'Vehículo no encontrado.' });
    if (!['PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes quitar este vehículo.' });
    if (await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id } })) return void res.status(409).json({ message: 'No puedes eliminar un vehículo con historial de cobros de parqueo.' });
    if (await prisma.parkingVisit.findFirst({ where: { vehicleId: vehicle.id, status: 'DENTRO' } })) return void res.status(409).json({ message: 'No puedes quitar un vehículo mientras aparece dentro del campus.' });
    await prisma.parkingVehicle.delete({ where: { id: vehicle.id } });
    res.json({ ok: true });
  });
```

- [ ] **Step 2: Agregar el chequeo de solvencia dentro de `POST /api/parking/access`**

En el mismo archivo, localiza `app.post('/api/parking/access', ...)`. Justo después de la línea que rechaza cuando `!vehicle && !guest` (`if (!vehicle && !guest) return void await reject(...)`) y **antes** de la línea que revisa el aforo (`if (occupancy >= config.totalCapacity) ...`), inserta:

```ts
    if (vehicle) { const overdue = await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id, dueDate: { lt: new Date() }, status: { not: 'PAGADO' } } }); if (overdue) return void await reject(403, 'Saldo de parqueo vencido — regulariza tu pago para ingresar.', vehicle.id); }
```

Este chequeo solo aplica cuando hay `vehicle` (identificado por QR o placa); los invitados de evento (`guest`) no tienen cargos de parqueo y no se ven afectados.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificación manual con servidor real**

Run: `npm run dev` (en background) y luego, en otra terminal:

```bash
curl -s -c /tmp/park-cookies.txt -X POST http://127.0.0.1:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"jaestradag@alumno.uspg.edu.gt","password":"Demo123!"}' -o /dev/null -w "login: %{http_code}\n"
curl -s -b /tmp/park-cookies.txt http://127.0.0.1:3000/api/parking -o /dev/null -w "parking: %{http_code}\n"
```

Expected: ambos `200`. Esto confirma que la ruta sigue funcionando sin cargos de parqueo presentes todavía (nadie queda bloqueado por defecto). La verificación del bloqueo real por morosidad se hace en la Tarea 6, una vez exista un cargo vencido de prueba.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/parking.ts
git commit -m "feat: bloquea acceso de vehículos con saldo de parqueo vencido y borrado con historial de cobros"
```

---

### Task 3: Endpoint de tarifas de parqueo por periodo (Finanzas)

**Files:**
- Modify: `src/server/routes/parking.ts`
- Test: manual (servidor real + `curl`)

**Interfaces:**
- Consumes: `middleware.requireFinance` (ya existe en `src/server/middleware/auth.ts:103`, hoy no destructurado en `parking.ts`).
- Produces: `POST /api/parking/fee-schedules` → `201 { schedule: ParkingFeeSchedule, assignedCount: number }`; `GET /api/parking/fee-schedules` → `200 ParkingFeeSchedule[]` con `amount`, `periodType`, `dueDate`, `assignedCount`, `cycleId`.

- [ ] **Step 1: Exponer `requireFinance` en `registerParkingRoutes`**

En `src/server/routes/parking.ts`, cambia:

```ts
  const { requireUser, requireAdmin, requireParkingStaff } = middleware;
```

por:

```ts
  const { requireUser, requireAdmin, requireParkingStaff, requireFinance } = middleware;
```

- [ ] **Step 2: Agregar los endpoints de tarifas**

`FinancialCharge.studentCarnet` es un campo requerido (`String`, no opcional), así que cada cargo de parqueo debe resolver el carné del `Student` vinculado al `owner` del vehículo antes de crearse — la relación inversa `User -> Student` se llama `student` (confirmado en `prisma/schema.prisma`, campo `student Student?` dentro de `model User`).

Inmediatamente después del bloque `app.patch('/api/parking/config', ...)` (antes de `app.post('/api/parking/events', ...)`), agrega:

```ts
  app.get('/api/parking/fee-schedules', requireUser, requireFinance, async (_req, res) => {
    res.json(await prisma.parkingFeeSchedule.findMany({ orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] }));
  });

  app.post('/api/parking/fee-schedules', requireUser, requireFinance, async (req, res) => {
    const periodType = String(req.body.periodType || '').trim().toUpperCase();
    const amount = Number(req.body.amount);
    const cycleId = String(req.body.cycleId || '').trim();
    const dueDate = new Date(`${req.body.dueDate}T12:00:00Z`);
    if (!['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL'].includes(periodType) || !Number.isFinite(amount) || amount <= 0 || !cycleId || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente periodicidad, monto, ciclo y vencimiento.' });
    const cycle = await prisma.academicCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return void res.status(404).json({ message: 'Ciclo académico no encontrado.' });
    const duplicate = await prisma.parkingFeeSchedule.findFirst({ where: { cycleId, periodType } });
    if (duplicate) return void res.status(409).json({ message: 'Ya existe una tarifa de parqueo con esa periodicidad para este ciclo.' });
    const activeVehicles = await prisma.parkingVehicle.findMany({
      where: { status: 'ACTIVO', owner: { role: 'ESTUDIANTE', active: true, student: { isNot: null } } },
      select: { id: true, owner: { select: { student: { select: { carnet: true } } } } },
    });
    const eligible = activeVehicles.filter((v) => v.owner.student?.carnet);
    const concept = `Parqueo ${periodType.charAt(0) + periodType.slice(1).toLowerCase()} - ${cycle.name}`;
    const created = await prisma.$transaction(async (tx) => {
      const schedule = await tx.parkingFeeSchedule.create({ data: { periodType, amount, cycleId, dueDate, createdBy: res.locals.authUser.name, assignedCount: eligible.length } });
      if (eligible.length) await tx.financialCharge.createMany({ data: eligible.map((v) => ({ studentCarnet: v.owner.student!.carnet, vehicleId: v.id, parkingFeeScheduleId: schedule.id, concept, amount, dueDate, cycleId })) });
      await tx.auditLog.create({ data: { action: 'CREATE_PARKING_FEE_SCHEDULE', entityType: 'PARKING', entityId: schedule.id, actorId: res.locals.authUser.id, details: JSON.stringify({ periodType, amount, cycleId, vehicles: eligible.length }) } });
      return schedule;
    });
    res.status(201).json({ schedule: created, assignedCount: eligible.length });
  });
```

Esto solo genera cargos para vehículos cuyo dueño (`User`) tiene un `Student` vinculado.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificación manual**

Con el servidor corriendo y sesión de un usuario `FINANZAS` o `ADMIN`:

```bash
curl -s -b /tmp/park-cookies.txt -X POST http://127.0.0.1:3000/api/parking/fee-schedules -H "Content-Type: application/json" -d '{"periodType":"MENSUAL","amount":150,"cycleId":"<UN_CYCLE_ID_REAL>","dueDate":"2026-09-05"}' -w "\n%{http_code}\n"
```

(Sustituye `<UN_CYCLE_ID_REAL>` por un `id` real de `AcademicCycle` — consíguelo con `curl -s -b /tmp/park-cookies.txt http://127.0.0.1:3000/api/cycles | head -c 300`.)

Expected: `201` con el `schedule` creado y `assignedCount` reflejando los vehículos activos de estudiantes existentes en la base demo.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/parking.ts
git commit -m "feat: agrega endpoint de tarifas de parqueo por periodo para Finanzas"
```

---

### Task 4: Pase de un día y tarifa diaria en `ParkingConfig`

**Files:**
- Modify: `src/server/routes/parking.ts`
- Test: manual (servidor real + `curl`)

**Interfaces:**
- Consumes: `ParkingConfig.dailyRate` (Task 1).
- Produces: `POST /api/parking/vehicles/:id/day-pass` → `201 FinancialCharge`; `PATCH /api/parking/config` acepta ahora `dailyRate` opcional.

- [ ] **Step 1: Aceptar `dailyRate` en `PATCH /api/parking/config`**

Reemplaza el handler existente:

```ts
  app.patch('/api/parking/config', requireUser, requireAdmin, async (req, res) => {
    const totalCapacity = Number(req.body.totalCapacity), regularReserve = Number(req.body.regularReserve || 0); if (!Number.isInteger(totalCapacity) || totalCapacity < 1 || !Number.isInteger(regularReserve) || regularReserve < 0 || regularReserve >= totalCapacity) return void res.status(400).json({ message: 'Capacidad o reserva no válida.' }); res.json(await prisma.parkingConfig.upsert({ where: { id: 1 }, update: { totalCapacity, regularReserve }, create: { id: 1, totalCapacity, regularReserve } }));
  });
```

por:

```ts
  app.patch('/api/parking/config', requireUser, requireAdmin, async (req, res) => {
    const totalCapacity = Number(req.body.totalCapacity), regularReserve = Number(req.body.regularReserve || 0), dailyRate = Number(req.body.dailyRate ?? 0);
    if (!Number.isInteger(totalCapacity) || totalCapacity < 1 || !Number.isInteger(regularReserve) || regularReserve < 0 || regularReserve >= totalCapacity || !Number.isFinite(dailyRate) || dailyRate < 0) return void res.status(400).json({ message: 'Capacidad, reserva o tarifa diaria no válida.' });
    res.json(await prisma.parkingConfig.upsert({ where: { id: 1 }, update: { totalCapacity, regularReserve, dailyRate }, create: { id: 1, totalCapacity, regularReserve, dailyRate } }));
  });
```

- [ ] **Step 2: Agregar el endpoint de pase diario**

Inmediatamente después de `app.post('/api/parking/vehicles/:id/pass', ...)` (el que genera el QR dinámico), agrega:

```ts
  app.post('/api/parking/vehicles/:id/day-pass', requireUser, async (req, res) => {
    const vehicle = await prisma.parkingVehicle.findFirst({ where: { id: req.params.id, status: 'ACTIVO' }, include: { owner: { select: { role: true, student: { select: { carnet: true } } } } } });
    if (!vehicle) return void res.status(404).json({ message: 'Vehículo activo no encontrado.' });
    if (!['PARQUEO', 'ADMIN', 'REGISTRO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes comprar un pase para este vehículo.' });
    if (vehicle.owner.role !== 'ESTUDIANTE' || !vehicle.owner.student) return void res.status(400).json({ message: 'El pase diario solo aplica a vehículos de estudiantes.' });
    const config = await prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    if (config.dailyRate <= 0) return void res.status(409).json({ message: 'La tarifa diaria de parqueo todavía no está configurada.' });
    const date = new Date(`${req.body.date}T12:00:00Z`);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime()) || date < today) return void res.status(400).json({ message: 'Selecciona una fecha válida, hoy o en el futuro.' });
    const concept = `Pase de parqueo - ${date.toISOString().slice(0, 10)}`;
    const duplicate = await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id, concept } });
    if (duplicate) return void res.status(409).json({ message: 'Ya existe un pase para esa fecha y vehículo.' });
    const charge = await prisma.financialCharge.create({ data: { studentCarnet: vehicle.owner.student.carnet, vehicleId: vehicle.id, concept, amount: config.dailyRate, dueDate: date } });
    res.status(201).json(charge);
  });
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificación manual**

Con sesión de `ADMIN`, configura primero la tarifa diaria:

```bash
curl -s -b /tmp/park-cookies.txt -X PATCH http://127.0.0.1:3000/api/parking/config -H "Content-Type: application/json" -d '{"totalCapacity":200,"regularReserve":20,"dailyRate":20}' -w "\n%{http_code}\n"
```

Luego, con sesión del estudiante dueño de un vehículo activo (usa un `vehicleId` real obtenido de `GET /api/parking`):

```bash
curl -s -b /tmp/park-cookies.txt -X POST http://127.0.0.1:3000/api/parking/vehicles/<VEHICLE_ID>/day-pass -H "Content-Type: application/json" -d '{"date":"2026-09-13"}' -w "\n%{http_code}\n"
```

Expected: `201` con el `FinancialCharge` creado, `amount: 20`.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/parking.ts
git commit -m "feat: agrega pase de parqueo de un día y tarifa diaria configurable"
```

---

### Task 5: Exponer la placa del vehículo en `/api/finances`

**Files:**
- Modify: `src/server/routes/finance.ts:17,22` (`app.get('/api/finances', ...)` y `financeView`)
- Test: manual (`npx tsc --noEmit` + `curl`)

**Interfaces:**
- Produces: cada objeto de `GET /api/finances` (`charges[]`) ahora incluye `vehicleId?: string`, `vehiclePlate?: string`.

- [ ] **Step 1: Incluir `vehicle` en la consulta e incorporarlo a `financeView`**

En `src/server/routes/finance.ts:12`, cambia la línea de `financeView` para agregar `vehicleId` y `vehiclePlate` al objeto que retorna. Reemplaza:

```ts
  const financeView = (charge: any) => { const paid = charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0); const adjusted = (charge.adjustments || []).reduce((sum: number, item: any) => sum + item.amount, 0); const netAmount = Math.max(0, charge.amount - adjusted); const balance = Math.max(0, netAmount - paid); const status = balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE'; return { id: charge.id, concept: charge.concept, grossAmount: charge.amount, adjusted, amount: netAmount, paid, balance, dueDate: charge.dueDate, status, cycleId: charge.cycleId, studentCarnet: charge.studentCarnet, studentName: charge.student.name, adjustments: (charge.adjustments || []).map((item: any) => ({ id: item.id, type: item.type, amount: item.amount, reason: item.reason, createdAt: item.createdAt })), payments: charge.payments.map((payment: any) => ({ id: payment.id, receiptNumber: payment.receiptNumber, amount: payment.amount, method: payment.method, reference: payment.reference, paidAt: payment.paidAt })) }; };
```

por:

```ts
  const financeView = (charge: any) => { const paid = charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0); const adjusted = (charge.adjustments || []).reduce((sum: number, item: any) => sum + item.amount, 0); const netAmount = Math.max(0, charge.amount - adjusted); const balance = Math.max(0, netAmount - paid); const status = balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE'; return { id: charge.id, concept: charge.concept, grossAmount: charge.amount, adjusted, amount: netAmount, paid, balance, dueDate: charge.dueDate, status, cycleId: charge.cycleId, studentCarnet: charge.studentCarnet, studentName: charge.student.name, vehicleId: charge.vehicleId || undefined, vehiclePlate: charge.vehicle?.plate, adjustments: (charge.adjustments || []).map((item: any) => ({ id: item.id, type: item.type, amount: item.amount, reason: item.reason, createdAt: item.createdAt })), payments: charge.payments.map((payment: any) => ({ id: payment.id, receiptNumber: payment.receiptNumber, amount: payment.amount, method: payment.method, reference: payment.reference, paidAt: payment.paidAt })) }; };
```

- [ ] **Step 2: Incluir la relación `vehicle` en la query de `GET /api/finances`**

En `src/server/routes/finance.ts:22`, cambia:

```ts
    const charges = await prisma.financialCharge.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, adjustments: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { paidAt: 'desc' } } }, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] });
```

por:

```ts
    const charges = await prisma.financialCharge.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, vehicle: { select: { plate: true } }, adjustments: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { paidAt: 'desc' } } }, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] });
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Verificación manual**

Con sesión del mismo estudiante usado en la Tarea 4:

```bash
curl -s -b /tmp/park-cookies.txt http://127.0.0.1:3000/api/finances | grep -o '"vehiclePlate":"[^"]*"'
```

Expected: al menos una coincidencia con la placa del vehículo que compró el pase diario.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/finance.ts
git commit -m "feat: expone la placa del vehículo en los cargos financieros de parqueo"
```

---

### Task 6: Verificación end-to-end del bloqueo de acceso por morosidad

**Files:** ninguno (solo verificación manual; valida el trabajo de las Tareas 1, 2, 3 y 5 juntas)

**Interfaces:** N/A

- [ ] **Step 1: Crear un cargo de parqueo vencido de prueba**

Con el servidor corriendo, usa Prisma Studio o un script rápido para forzar un `dueDate` en el pasado sobre el cargo creado en la Tarea 4 (o crea uno nuevo). Opción rápida con `sqlite3` (ajusta la ruta si usas Postgres):

```bash
sqlite3 data/system.db "UPDATE financial_charges SET due_date = '2020-01-01 00:00:00' WHERE vehicle_id IS NOT NULL LIMIT 1;"
```

- [ ] **Step 2: Confirmar el rechazo en `/api/parking/access`**

Con sesión de un usuario `PARQUEO`, intenta registrar el ingreso del vehículo con el cargo vencido (usa su `plate` real):

```bash
curl -s -b /tmp/park-cookies.txt -X POST http://127.0.0.1:3000/api/parking/access -H "Content-Type: application/json" -d '{"plate":"<PLACA_DEL_VEHICULO>","entryGate":"ENTRADA_1"}' -w "\n%{http_code}\n"
```

Expected: `403` con mensaje `"Saldo de parqueo vencido — regulariza tu pago para ingresar."`.

- [ ] **Step 3: Confirmar que un vehículo sin cargos (o al día) sigue entrando normal**

Repite el mismo `curl` con la placa de un vehículo distinto que no tenga cargos de parqueo.

Expected: `201` (o `404` si la placa no existe — usa una placa real de la base demo), nunca `403` por `PARQUEO_MOROSO`.

- [ ] **Step 4: Confirmar que `manual-barrier` no se ve afectado**

```bash
curl -s -b /tmp/park-cookies.txt -X POST http://127.0.0.1:3000/api/parking/manual-barrier -H "Content-Type: application/json" -d '{"gate":"ENTRADA_1","reason":"Verificación de apertura manual sin bloqueo por saldo"}' -w "\n%{http_code}\n"
```

Expected: `201`, sin importar el estado de morosidad de ningún vehículo.

- [ ] **Step 5: Revertir el dato de prueba**

```bash
sqlite3 data/system.db "UPDATE financial_charges SET due_date = '2026-09-05 12:00:00' WHERE vehicle_id IS NOT NULL AND due_date = '2020-01-01 00:00:00';"
```

No hay commit en esta tarea — es solo verificación.

---

### Task 7: UI de Finanzas — tarifa de parqueo por periodo y placa en la lista de cargos

**Files:**
- Modify: `src/pages/FinancesPage.tsx`
- Test: manual (navegador)

**Interfaces:**
- Consumes: `POST /api/parking/fee-schedules`, `GET /api/parking/fee-schedules` (Task 3); `charge.vehicleId`/`charge.vehiclePlate` (Task 5).

- [ ] **Step 1: Agregar estado para el formulario de tarifa de parqueo**

En `src/pages/FinancesPage.tsx`, junto a la declaración existente (línea 59):

```ts
  const [scheduleForm, setScheduleForm] = useState({ careerId: careers[0]?.code || '', campusId: '', planId: '', enrollmentAmount: '', enrollmentDueDate: '', monthlyAmount: '', installments: '5', firstDueDate: '' });
```

agrega:

```ts
  const [showParkingScheduleForm, setShowParkingScheduleForm] = useState(false);
  const [parkingScheduleForm, setParkingScheduleForm] = useState({ periodType: 'MENSUAL', amount: '', dueDate: '' });
```

- [ ] **Step 2: Agregar la función que llama al endpoint**

Cerca de la función existente que crea el `career-fee-schedule` (busca `const response = await fetch('/api/finances/career-fee-schedules'`, línea 136, y localiza el `async` que la envuelve), agrega una función hermana en el mismo bloque de funciones del componente:

```ts
  const createParkingSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('/api/parking/fee-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...parkingScheduleForm, cycleId: currentCycle.id, amount: Number(parkingScheduleForm.amount) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(`Tarifa de parqueo creada para ${result.assignedCount} vehículo(s).`, 'success');
    setShowParkingScheduleForm(false);
    setParkingScheduleForm({ periodType: 'MENSUAL', amount: '', dueDate: '' });
  };
```

- [ ] **Step 3: Agregar el formulario en el JSX**

Justo después del bloque `{showScheduleForm && ['ADMIN', 'FINANZAS'].includes(currentUser.role) && (...)}` (termina en la línea `220` con `)}`), agrega:

```tsx
        {['ADMIN', 'FINANZAS'].includes(currentUser.role) && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Tarifa de parqueo por periodo</h3><button onClick={() => setShowParkingScheduleForm((v) => !v)} className="text-xs font-bold text-[#800020]">{showParkingScheduleForm ? 'Cerrar' : '+ Nueva tarifa'}</button></div>
            {showParkingScheduleForm && (
              <form onSubmit={createParkingSchedule} className="grid gap-3 md:grid-cols-4">
                <select value={parkingScheduleForm.periodType} onChange={(event) => setParkingScheduleForm({ ...parkingScheduleForm, periodType: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="MENSUAL">Mensual</option><option value="TRIMESTRAL">Trimestral</option><option value="SEMESTRAL">Semestral</option></select>
                <input required min="0.01" step="0.01" type="number" value={parkingScheduleForm.amount} onChange={(event) => setParkingScheduleForm({ ...parkingScheduleForm, amount: event.target.value })} placeholder="Monto por periodo" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
                <input required type="date" value={parkingScheduleForm.dueDate} onChange={(event) => setParkingScheduleForm({ ...parkingScheduleForm, dueDate: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
                <button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Generar cargos a vehículos activos</button>
              </form>
            )}
          </div>
        )}
```

- [ ] **Step 4: Mostrar la placa del vehículo en la lista de cargos**

En la fila de la tabla de cargos (`src/pages/FinancesPage.tsx:289`), localiza:

```tsx
<td className="px-5 py-4"><p className="font-bold text-[#333333]">{charge.concept}</p><p className="text-[10px] text-[#64748B]">{charge.studentCarnet}{charge.adjusted > 0 ? ` · Ajuste ${money(charge.adjusted)}` : ''}</p></td>
```

y reemplázalo por:

```tsx
<td className="px-5 py-4"><p className="font-bold text-[#333333]">{charge.concept}{charge.vehiclePlate && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">🅿 {charge.vehiclePlate}</span>}</p><p className="text-[10px] text-[#64748B]">{charge.studentCarnet}{charge.adjusted > 0 ? ` · Ajuste ${money(charge.adjusted)}` : ''}</p></td>
```

- [ ] **Step 5: Agregar `vehicleId`/`vehiclePlate` a la interfaz `ChargeRecord`**

En la interfaz `ChargeRecord` (`src/pages/FinancesPage.tsx:15`), agrega los campos opcionales:

```ts
interface ChargeRecord {
  id: string;
  concept: string;
  amount: number;
  grossAmount: number;
  adjusted: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: 'PENDIENTE' | 'VENCIDO' | 'PAGADO';
  studentCarnet: string;
  studentName: string;
  vehicleId?: string;
  vehiclePlate?: string;
  payments: PaymentRecord[];
  adjustments: { id: string; type: string; amount: number; reason: string; createdAt: string }[];
}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 7: Verificación manual en navegador**

Run: `npm run dev`, entra como `FINANZAS`, abre "Pagos" (`FinancesPage`), crea una tarifa de parqueo mensual y confirma el toast de éxito con el conteo de vehículos asignados. Cambia a la cuenta del estudiante dueño de un vehículo y confirma que el cargo aparece con la insignia de placa (🅿).

- [ ] **Step 8: Commit**

```bash
git add src/pages/FinancesPage.tsx
git commit -m "feat: agrega formulario de tarifa de parqueo por periodo y placa en la lista de cargos"
```

---

### Task 8: UI de Parqueo — comprar pase de un día

**Files:**
- Modify: `src/pages/ParkingPage.tsx`
- Test: manual (navegador)

**Interfaces:**
- Consumes: `POST /api/parking/vehicles/:id/day-pass` (Task 4).

- [ ] **Step 1: Agregar estado del formulario de pase diario**

En `src/pages/ParkingPage.tsx:13`, junto a las declaraciones de estado existentes, agrega:

```ts
  const [dayPassDates, setDayPassDates] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Agregar la función de compra**

Junto a las funciones existentes como `refreshPass` (línea 27), agrega:

```ts
  const buyDayPass = async (vehicleId: string) => { const date = dayPassDates[vehicleId]; if (!date) return showToast('Selecciona una fecha', 'warning'); const result = await post(`/api/parking/vehicles/${vehicleId}/day-pass`, { date }); if (!result) return; showToast(`Pase creado. Págalo desde Pagos antes de esa fecha.`, 'success'); setDayPassDates((current) => ({ ...current, [vehicleId]: '' })); };
```

- [ ] **Step 3: Agregar el control en la tarjeta de cada vehículo propio**

En la sección de "Mis vehículos y pases digitales" (`src/pages/ParkingPage.tsx:51`), localiza el bloque que renderiza las acciones del dueño:

```tsx
{(item.ownerId === currentUser.id || currentUser.role === 'PARQUEO') && <div className="mt-3 flex gap-2"><button onClick={()=>changeVehicleStatus(item)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${item.status === 'ACTIVO' ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}`}>{item.status === 'ACTIVO' ? 'Bloquear pase' : 'Reactivar vehículo'}</button><button onClick={()=>removeVehicle(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Quitar</button></div>}
```

y reemplázalo por (agrega la fila de pase diario debajo de los botones existentes, sin quitar nada):

```tsx
{(item.ownerId === currentUser.id || currentUser.role === 'PARQUEO') && <div className="mt-3 flex gap-2"><button onClick={()=>changeVehicleStatus(item)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${item.status === 'ACTIVO' ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}`}>{item.status === 'ACTIVO' ? 'Bloquear pase' : 'Reactivar vehículo'}</button><button onClick={()=>removeVehicle(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Quitar</button></div>}
{item.ownerId === currentUser.id && item.status === 'ACTIVO' && <div className="mt-2 flex gap-2"><input type="date" min={new Date().toISOString().slice(0,10)} value={dayPassDates[item.id] || ''} onChange={(e)=>setDayPassDates((current)=>({...current,[item.id]:e.target.value}))} className="flex-1 rounded-lg border px-3 py-2 text-xs"/><button onClick={()=>buyDayPass(item.id)} className="whitespace-nowrap rounded-lg border border-[#800020] px-3 py-2 text-xs font-bold text-[#800020]">Pase de un día</button></div>}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 5: Verificación manual en navegador**

Entra como estudiante dueño de un vehículo activo, en "Parqueo Inteligente", selecciona una fecha futura en el nuevo control y confirma el toast de éxito. Verifica en "Pagos" que aparece el cargo `"Pase de parqueo - <fecha>"`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ParkingPage.tsx
git commit -m "feat: permite comprar un pase de parqueo de un día por vehículo"
```

---

### Task 9: Vista de kiosco

**Files:**
- Create: `src/pages/ParkingKioskPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: manual (navegador)

**Interfaces:**
- Consumes: `GET /api/finances` (con `?studentCarnet=`, ya soportado por `requireUser` cuando el rol es `ESTUDIANTE` — el propio estudiante consulta su cuenta), `POST /api/finances/card-payment-demo` (ya existe, requiere `role === 'ESTUDIANTE'`).
- Produces: nueva ruta `/parqueo-kiosco`.

**Nota de diseño (decisión tomada durante la planeación, no en el spec original):** el sistema no permite hoy que el staff de `PARQUEO` registre pagos (`requireFinance` solo admite `ADMIN`/`FINANZAS`) ni que pague en nombre de otro usuario. Para no tocar el modelo de autorización de roles, el "kiosco" es simplemente la vista de **Pagos** de siempre, pero en un layout simplificado pensado para pantalla táctil: el **propio estudiante** inicia sesión brevemente en la tablet (con su carné/contraseña) para pagar su parqueo con la demo de tarjeta ya existente, y la sesión se cierra automáticamente después de pagar o tras un tiempo de inactividad. No hay backend nuevo.

- [ ] **Step 1: Crear la página de kiosco**

Crea `src/pages/ParkingKioskPage.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, ParkingCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

const money = (value: number) => `Q${value.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ParkingKioskPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/finances');
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return showToast(data.message, 'error');
    setCharges((data.charges || []).filter((c: any) => c.vehiclePlate && c.balance > 0));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const pay = async (chargeId: string) => {
    setPayingId(chargeId);
    const response = await fetch('/api/finances/card-payment-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId, cardholder: currentUser.name, last4: '4242' }) });
    const data = await response.json();
    setPayingId(null);
    if (!response.ok) return showToast(data.message, 'error');
    setResult(data);
    await load();
  };

  if (currentUser.role !== 'ESTUDIANTE') return <div className="p-10 text-center text-sm">El kiosco de parqueo se usa desde una cuenta de estudiante.</div>;
  if (loading) return <div className="p-10 text-center text-sm">Cargando saldo de parqueo...</div>;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-[#F8FAFC] p-6">
      <div className="text-center"><ParkingCircle className="mx-auto h-10 w-10 text-[#800020]" /><h1 className="mt-2 text-lg font-black">Kiosco de Parqueo USPG</h1><p className="text-xs text-[#64748B]">Hola, {currentUser.name}</p></div>
      {result ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <p className="mt-2 text-sm font-bold text-green-900">Pago autorizado</p>
          <p className="mt-1 text-xs text-green-800">{result.concept} · {money(result.amount)}</p>
          <button onClick={() => setResult(null)} className="mt-4 rounded-lg border border-green-300 bg-white px-4 py-2 text-xs font-bold text-green-800">Listo</button>
        </div>
      ) : charges.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-[#64748B]">No tienes saldo de parqueo pendiente.</div>
      ) : (
        <div className="space-y-3">
          {charges.map((charge) => (
            <div key={charge.id} className="rounded-xl border bg-white p-4">
              <p className="text-xs font-bold">{charge.concept} · 🅿 {charge.vehiclePlate}</p>
              <p className="text-lg font-black">{money(charge.balance)}</p>
              <button disabled={payingId === charge.id} onClick={() => pay(charge.id)} className="mt-2 w-full rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{payingId === charge.id ? 'Procesando...' : 'Pagar con tarjeta'}</button>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center justify-center gap-1 text-center text-[10px] text-[#64748B]"><LockKeyhole className="h-3 w-3" />Pago de demostración — no se realiza ningún cobro real.</p>
    </div>
  );
};
```

- [ ] **Step 2: Registrar la ruta**

En `src/App.tsx`, junto a la línea 37 (`const ParkingPage = lazyPage(...)`), agrega:

```ts
const ParkingKioskPage = lazyPage(() => import('./pages/ParkingKioskPage'), 'ParkingKioskPage');
```

Y junto a la línea 92 (`<Route path="/parqueo" element={...} />`), agrega:

```tsx
          <Route path="/parqueo-kiosco" element={<ProtectedRoute><ParkingKioskPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Agregar el enlace en el menú**

En `src/components/layout/Sidebar.tsx:55`, junto a la entrada existente de `/parqueo`, agrega una entrada nueva (mismo array de navegación):

```ts
    { path: '/parqueo-kiosco', label: 'Kiosco de Parqueo', icon: ParkingCircle, roles: ['ESTUDIANTE'] },
```

Si `ParkingCircle` no está importado en `Sidebar.tsx`, agrégalo al import de `lucide-react` en la parte superior del archivo.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 5: Verificación manual en navegador**

Entra como estudiante, ve a "Kiosco de Parqueo" desde el menú, confirma que lista los cargos de parqueo pendientes con placa y que el botón "Pagar con tarjeta" muestra el resultado de demostración.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ParkingKioskPage.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: agrega vista de kiosco para pagar parqueo desde una tablet en la caseta"
```

---

## Spec Coverage Checklist

- Modelo de datos (`ParkingFeeSchedule`, `FinancialCharge.vehicleId`/`parkingFeeScheduleId`, `ParkingConfig.dailyRate`): Task 1.
- Borrado de vehículo bloqueado por historial de cobros: Task 2.
- Planes por periodo (mensual/trimestral/semestral), atados a ciclo, institucionales, generados por Finanzas para todos los vehículos activos: Task 3.
- Pase de un día, comprado con anticipación: Task 4.
- Cargos de parqueo visibles junto a los académicos, pagables con los mecanismos existentes: Task 5, Task 7.
- Control de acceso: bloqueo por morosidad real, sin fricción para vehículos al día o sin cargos, `manual-barrier` exento: Task 2, verificado en Task 6.
- Kiosco de software (sin hardware real): Task 9.
- Fuera de alcance (hardware real, procesador real, facturación automática recurrente): explícitamente no implementado en ninguna tarea.
