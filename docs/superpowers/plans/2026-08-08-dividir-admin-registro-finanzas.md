# Dividir ADMIN en Registro Académico y Finanzas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear los roles `REGISTRO` (Registro Académico) y `FINANZAS` (Administración
Financiera), y reasignarles los módulos académicos y de pagos respectivamente, manteniendo
`ADMIN` como super-rol con acceso a todo.

**Architecture:** Mismo patrón de tres capas usado en el proyecto anterior (aliviar a
ADMIN de Biblioteca/Parqueo/Eventos): middlewares Express nuevos (`requireRegistro`,
`requireFinance`) que aceptan `['ADMIN', <rol nuevo>]`, aplicados en bloque por archivo de
rutas backend; `Sidebar.tsx` y `RoleGuard` de cada página ganan el rol nuevo junto a
`ADMIN`; los checks inline `currentUser.role === 'ADMIN'` que controlan botones/paneles
dentro de esas páginas se amplían a `['ADMIN', <rol nuevo>].includes(currentUser.role)`.

**Tech Stack:** Express + Prisma (backend, sin migraciones — `role` es `String` libre),
React + TypeScript (frontend), scripts Node sueltos como pruebas de integración
(`scripts/test-role-access.mjs`).

## Global Constraints

- No se modifica el modelo de datos ni migraciones de Prisma — `role` ya es `String` libre.
- "Usuarios y Seguridad" (`/api/admin/users*`, `/api/users`), política MFA
  (`/api/security/mfa-policy`), y alta de staff de Biblioteca/Parqueo/Eventos
  (`/api/library/staff`, `/api/parking/staff`) se quedan exclusivamente en `ADMIN` — no
  reciben `REGISTRO` ni `FINANZAS`.
- `ADMIN` nunca pierde acceso a nada — siempre se agrega el rol nuevo, nunca se quita
  `'ADMIN'` de ningún arreglo en este proyecto.
- No se toca `SISTEMAS`, `DOCENTE`, `ESTUDIANTE`, `BIBLIOTECA`, `PARQUEO`, `EVENTOS`.
- Estilo del código existente: componentes/rutas en archivos densos de una sola línea por
  handler — seguir el mismo patrón, no reformatear ni extraer funciones nuevas.
- Este repo no tiene framework de pruebas de frontend. Verificación de frontend:
  `npx tsc --noEmit` + verificación manual en navegador/curl.
- Pruebas de backend: scripts Node contra un servidor corriendo
  (`node scripts/test-role-access.mjs`, requiere `TEST_ADMIN_PASSWORD` y las demás env vars
  de cuentas demo).
- Contraseña de todas las cuentas demo nuevas: `Demo123!` (mismo patrón que
  Biblioteca/Parqueo/Eventos en `prisma/seed.ts`).

---

### Task 1: Declarar los roles nuevos en todo el sistema

**Files:**
- Modify: `src/types/index.ts:1`
- Modify: `server.ts:67` (`defaultMfaRequiredRoles`), `server.ts:131` (`roleFromEmail`)
- Modify: `src/server/routes/admin.ts:27` (`allowedRoles`)
- Modify: `src/server/routes/auth.ts:305`, `src/server/routes/auth.ts:309`
  (`availableRoles`, dos ocurrencias)
- Modify: `src/pages/UsersPage.tsx:124` (`<select>` de creación de usuario)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `UserRole` incluye `'REGISTRO' | 'FINANZAS'`; `roleFromEmail` reconoce
  `@registro.uspg.edu.gt` → `'REGISTRO'` y `@finanzas.uspg.edu.gt` → `'FINANZAS'`; ambos
  roles requieren MFA por defecto; ambos son seleccionables al crear un usuario y al
  configurar la política de MFA. Los middlewares de la Tarea 2 dependen de que estos
  strings existan como valores válidos de rol.

- [ ] **Step 1: `src/types/index.ts:1`**

Reemplaza:

```ts
export type UserRole = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE' | 'BIBLIOTECA' | 'PARQUEO' | 'EVENTOS' | 'SISTEMAS';
```

por:

```ts
export type UserRole = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE' | 'BIBLIOTECA' | 'PARQUEO' | 'EVENTOS' | 'SISTEMAS' | 'REGISTRO' | 'FINANZAS';
```

- [ ] **Step 2: `server.ts:67`**

Reemplaza:

```ts
const defaultMfaRequiredRoles = ['ADMIN', 'DOCENTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'];
```

por:

```ts
const defaultMfaRequiredRoles = ['ADMIN', 'DOCENTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS', 'REGISTRO', 'FINANZAS'];
```

- [ ] **Step 3: `server.ts:131`**

En `roleFromEmail`, dentro de la cadena de `if (value.endsWith(...))`, agrega dos
condiciones nuevas justo antes del `return null;` final:

```ts
if (value.endsWith('@registro.uspg.edu.gt')) return 'REGISTRO'; if (value.endsWith('@finanzas.uspg.edu.gt')) return 'FINANZAS';
```

(La función completa queda con la misma estructura de una línea, solo con dos `if` más
antes del `return null;`.)

- [ ] **Step 4: `src/server/routes/admin.ts:27`**

Reemplaza:

```ts
const allowedRoles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'];
```

por:

```ts
const allowedRoles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS', 'REGISTRO', 'FINANZAS'];
```

- [ ] **Step 5: `src/server/routes/auth.ts:305` y `:309`**

En ambas líneas, reemplaza:

```ts
['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS']
```

por:

```ts
['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS', 'REGISTRO', 'FINANZAS']
```

(Son dos ocurrencias idénticas del mismo arreglo literal, una en el `GET` y otra en el
`PUT` de `/api/security/mfa-policy`; edita ambas.)

- [ ] **Step 6: `src/pages/UsersPage.tsx:124`**

Reemplaza:

```tsx
<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="rounded-lg border px-3 py-2 text-xs"><option>ADMIN</option><option>DOCENTE</option><option>ESTUDIANTE</option><option>BIBLIOTECA</option><option>PARQUEO</option><option>EVENTOS</option><option>SISTEMAS</option></select>
```

por:

```tsx
<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="rounded-lg border px-3 py-2 text-xs"><option>ADMIN</option><option>DOCENTE</option><option>ESTUDIANTE</option><option>BIBLIOTECA</option><option>PARQUEO</option><option>EVENTOS</option><option>SISTEMAS</option><option>REGISTRO</option><option>FINANZAS</option></select>
```

- [ ] **Step 7: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts server.ts src/server/routes/admin.ts src/server/routes/auth.ts src/pages/UsersPage.tsx
git commit -m "feat: declara los roles REGISTRO y FINANZAS en el sistema"
```

---

### Task 2: Middlewares `requireRegistro` y `requireFinance`

**Files:**
- Modify: `src/server/middleware/auth.ts`
- Modify: `src/server/types.ts:70-76`

**Interfaces:**
- Consumes: `UserRole` de la Tarea 1 (no es una dependencia de tipos estricta, los
  middlewares comparan contra strings literales).
- Produces: `requireRegistro: express.RequestHandler` (permite `ADMIN`, `REGISTRO`) y
  `requireFinance: express.RequestHandler` (permite `ADMIN`, `FINANZAS`), exportados desde
  `createAuthMiddleware` igual que `requireLibraryStaff`/`requireParkingStaff`. Las Tareas
  3-6 destructuran estos nombres desde `middleware`.

- [ ] **Step 1: `src/server/types.ts:70-76`**

Reemplaza:

```ts
export type AuthMiddleware = {
  requireAdmin: express.RequestHandler;
  requireUser: express.RequestHandler;
  requireLibraryStaff: express.RequestHandler;
  requireParkingStaff: express.RequestHandler;
  requireSystems: express.RequestHandler;
};
```

por:

```ts
export type AuthMiddleware = {
  requireAdmin: express.RequestHandler;
  requireUser: express.RequestHandler;
  requireLibraryStaff: express.RequestHandler;
  requireParkingStaff: express.RequestHandler;
  requireSystems: express.RequestHandler;
  requireRegistro: express.RequestHandler;
  requireFinance: express.RequestHandler;
};
```

- [ ] **Step 2: `src/server/middleware/auth.ts`**

Después de la definición de `requireSystems` (justo antes del `return { requireAdmin,
requireUser, requireLibraryStaff, requireParkingStaff, requireSystems };` final), agrega:

```ts
  const requireRegistro: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'REGISTRO'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Registro Académico.' });

  const requireFinance: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'FINANZAS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Administración Financiera.' });
```

Y actualiza el `return` final de la función a:

```ts
  return { requireAdmin, requireUser, requireLibraryStaff, requireParkingStaff, requireSystems, requireRegistro, requireFinance };
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/server/middleware/auth.ts src/server/types.ts
git commit -m "feat: agrega middlewares requireRegistro y requireFinance"
```

---

### Task 3: Aplicar `requireFinance` en `finance.ts`

**Files:**
- Modify: `src/server/routes/finance.ts`
- Test: `scripts/test-role-access.mjs` (ejecutado manualmente en esta tarea; la extensión
  formal del script es la Tarea 12)

**Interfaces:**
- Consumes: `requireFinance` de la Tarea 2.
- Produces: nada nuevo — mismas rutas, mismo comportamiento para `ADMIN`, ahora también
  accesibles para `FINANZAS`.

- [ ] **Step 1: Actualizar la destructuración de middleware**

En `src/server/routes/finance.ts:15`, reemplaza:

```ts
const { requireUser, requireAdmin } = middleware;
```

por:

```ts
const { requireUser, requireFinance } = middleware;
```

- [ ] **Step 2: Reemplazar `requireAdmin` por `requireFinance` en cada ruta**

Este archivo tiene exactamente 10 ocurrencias del identificador `requireAdmin` (contando la
línea de destructuración del Step 1, que ya cambiaste). Reemplaza el identificador
`requireAdmin` por `requireFinance` en las **9 rutas restantes** que lo usan como segundo
argumento de middleware (`app.get`/`app.post`/`app.patch`), en las líneas correspondientes a:
`GET /api/finances/career-fees`, `POST /api/finances/career-fee-schedules`, `POST
/api/finances/career-fees`, `POST /api/finances/charges`, `POST /api/finances/adjustments`,
`POST /api/finances/late-fees`, `POST /api/finances/agreements`, `POST
/api/finances/payments`, `PATCH /api/finances/transfer-proofs/:id/review`. No toques
ninguna ruta que use `requireUser` sin `requireAdmin` (esas permanecen abiertas a
cualquier usuario autenticado, ej. `GET /api/finances` para que el estudiante vea su
propio saldo).

- [ ] **Step 3: Verificar que no queda ningún `requireAdmin` en el archivo**

Run: `grep -c "requireAdmin" src/server/routes/finance.ts`
Expected: `0`

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/finance.ts
git commit -m "feat: aplica requireFinance a las rutas de finanzas"
```

---

### Task 4: Aplicar `requireRegistro` en `academic.ts`

**Files:**
- Modify: `src/server/routes/academic.ts`

**Interfaces:**
- Consumes: `requireRegistro` de la Tarea 2.
- Produces: nada nuevo — mismas rutas, ahora también accesibles para `REGISTRO`.

- [ ] **Step 1: Actualizar la destructuración de middleware**

En `src/server/routes/academic.ts:15`, reemplaza:

```ts
const { requireAdmin, requireUser } = middleware;
```

por:

```ts
const { requireRegistro, requireUser } = middleware;
```

- [ ] **Step 2: Reemplazar `requireAdmin` por `requireRegistro` en cada ruta**

Este archivo tiene 28 ocurrencias del identificador `requireAdmin` como segundo argumento
de middleware, cubriendo estas rutas (todas deben cambiar): `/api/academic-structure/campuses`
(GET y POST), `/api/academic-structure/campuses/:id` (PATCH), `/api/academic-structure/plans`
(GET y POST), `/api/academic-structure/plans/:id` (PATCH), `/api/curriculum-plans/organizer`
(GET), `/api/curriculum-plans/:id/layout` (PUT), `/api/students` (GET y POST),
`/api/students/:carnet` (PATCH), `/api/teachers` (GET y POST), `/api/teachers/:code`
(PATCH), `/api/careers` (GET y POST), `/api/careers/:code` (PATCH),
`/api/courses/import` (POST), `/api/courses` (GET y POST), `/api/courses/:code` (PATCH),
`/api/cycles` (GET y POST), `/api/cycles/:id` (PATCH), `/api/sections` (GET y POST),
`/api/sections/:id` (PATCH y DELETE), `/api/virtual-classrooms/:id/sync` (POST),
`/api/student-requests/:id` (PATCH), `/api/enrollment-documents/:id/review` (PATCH). No
toques ninguna ruta que use únicamente `requireUser`.

- [ ] **Step 3: Verificar que no queda ningún `requireAdmin` en el archivo**

Run: `grep -c "requireAdmin" src/server/routes/academic.ts`
Expected: `0`

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/academic.ts
git commit -m "feat: aplica requireRegistro a las rutas académicas"
```

---

### Task 5: Aplicar `requireRegistro` en `grades.ts`, `notifications.ts` y `reports.ts`

**Files:**
- Modify: `src/server/routes/grades.ts`
- Modify: `src/server/routes/notifications.ts`
- Modify: `src/server/routes/reports.ts`

**Interfaces:**
- Consumes: `requireRegistro` de la Tarea 2.
- Produces: nada nuevo.

- [ ] **Step 1: `src/server/routes/grades.ts`**

En la línea 14, reemplaza:

```ts
const { requireUser, requireAdmin } = middleware;
```

por:

```ts
const { requireUser, requireRegistro } = middleware;
```

Luego reemplaza el identificador `requireAdmin` por `requireRegistro` en las 2 rutas que lo
usan: `POST /api/recoveries/:id/authorize` y `POST /api/recoveries/:id/reject`. No toques
ningún otro middleware de este archivo (`requireUser` con checks inline de rol como
`DOCENTE`/`ESTUDIANTE` no cambian).

- [ ] **Step 2: `src/server/routes/notifications.ts`**

En la línea 11, reemplaza:

```ts
const { requireAdmin, requireUser } = middleware;
```

por:

```ts
const { requireRegistro, requireUser } = middleware;
```

Luego reemplaza el identificador `requireAdmin` por `requireRegistro` en las 3 rutas que lo
usan: `POST /api/notifications/broadcast`, `GET /api/notifications/outbox`, `POST
/api/notifications/outbox/:id/retry`.

- [ ] **Step 3: `src/server/routes/reports.ts`**

En la línea 51, reemplaza:

```ts
const { requireAdmin } = middleware;
```

por:

```ts
const { requireRegistro } = middleware;
```

Luego reemplaza el identificador `requireAdmin` por `requireRegistro` en las 2 rutas que lo
usan: `GET /api/reports/pdf`, `GET /api/reports/xlsx`.

- [ ] **Step 4: Verificar que no queda ningún `requireAdmin` en estos tres archivos**

Run: `grep -c "requireAdmin" src/server/routes/grades.ts src/server/routes/notifications.ts src/server/routes/reports.ts`
Expected: `0` en los tres.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/grades.ts src/server/routes/notifications.ts src/server/routes/reports.ts
git commit -m "feat: aplica requireRegistro a recuperaciones, notificaciones y reportes"
```

---

### Task 6: Aplicar `requireRegistro` a rutas seleccionadas de `admin.ts`

**Files:**
- Modify: `src/server/routes/admin.ts`

**Interfaces:**
- Consumes: `requireRegistro` de la Tarea 2.
- Produces: nada nuevo. Las rutas de gestión de usuarios permanecen en `requireAdmin`
  (sin cambio) — este archivo queda con **ambos** middlewares en uso, a diferencia de los
  archivos de las Tareas 3-5 donde `requireAdmin` desaparece por completo.

- [ ] **Step 1: Actualizar la destructuración de middleware**

En `src/server/routes/admin.ts:12`, reemplaza:

```ts
const { requireAdmin } = middleware;
```

por:

```ts
const { requireAdmin, requireRegistro } = middleware;
```

- [ ] **Step 2: Cambiar el middleware solo en estas 7 rutas**

Reemplaza `requireAdmin` por `requireRegistro` **únicamente** en: `PUT /api/institution`,
`GET /api/parameters`, `GET /api/academic-parameters`, `GET /api/audit-logs`, `GET
/api/classrooms`, `POST /api/classrooms`, `PATCH /api/classrooms/:id`.

**No toques** estas rutas, que se quedan en `requireAdmin` sin cambio: `GET
/api/admin/users`, `POST /api/admin/users`, `POST /api/admin/users/:id/reset-password`,
`PATCH /api/admin/users/:id/toggle-active`, `POST /api/admin/users/:id/reset-mfa`, `GET
/api/users`.

- [ ] **Step 3: Verificar el conteo final**

Run: `grep -c "requireAdmin" src/server/routes/admin.ts`
Expected: `7` (la línea de destructuración, que ahora menciona ambos identificadores, más
las 6 rutas de gestión de usuarios que no se tocan).

Run: `grep -c "requireRegistro" src/server/routes/admin.ts`
Expected: `8` (la línea de destructuración más las 7 rutas cambiadas).

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/admin.ts
git commit -m "feat: aplica requireRegistro a institución, parámetros, auditoría y aulas"
```

---

### Task 7: Actualizar `Sidebar.tsx` con los roles nuevos

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:37-67`

**Interfaces:**
- Consumes: nada.
- Produces: nada — hoja de la UI.

- [ ] **Step 1: Reemplazar el arreglo `navItems` completo**

En `src/components/layout/Sidebar.tsx`, reemplaza el arreglo `navItems` (líneas 37-67) por:

```ts
  const navItems = [
    { path: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/estudiantes', label: 'Estudiantes', icon: Users, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/usuarios', label: 'Usuarios y Seguridad', icon: Users, roles: ['ADMIN'] },
    { path: '/docentes', label: 'Docentes', icon: GraduationCap, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/carreras', label: 'Carreras', icon: BookOpen, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/estructura-academica', label: 'Campus y Planes', icon: Building2, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/cursos', label: 'Cursos y Prerrequisitos', icon: BookCheck, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/organizar-pensum', label: 'Organizar Pensum', icon: Network, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/ciclos', label: 'Ciclos Académicos', icon: Calendar, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/secciones', label: 'Secciones', icon: Layers, roles: ['ADMIN', 'REGISTRO', 'DOCENTE'] },
    { path: '/inscripcion', label: 'Inscripción de Cursos', icon: ClipboardList, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE'] },
    { path: '/pagos', label: 'Pagos y Solvencias', icon: WalletCards, roles: ['ADMIN', 'FINANZAS', 'ESTUDIANTE'] },
    { path: '/solicitudes', label: 'Solicitudes y Trámites', icon: Files, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE'] },
    { path: '/expediente', label: 'Expediente', icon: FolderCheck, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE'] },
    { path: '/plan-estudios', label: 'Plan de Estudios', icon: BookOpen, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE'] },
    { path: '/malla', label: 'Mi Avance Académico', icon: Network, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE'] },
    { path: '/biblioteca', label: 'Biblioteca', icon: BookMarked, roles: ['BIBLIOTECA', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/parqueo', label: 'Parqueo Inteligente', icon: Building2, roles: ['PARQUEO', 'EVENTOS', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/eventos', label: 'Gestión de Eventos', icon: CalendarDays, roles: ['EVENTOS'] },
    { path: '/notas', label: 'Control de Notas', icon: FileCheck, roles: ['ADMIN', 'REGISTRO', 'DOCENTE'] },
    { path: '/actividades-zona', label: 'Actividades de Zona', icon: ListChecks, roles: ['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/recuperaciones', label: 'Recuperaciones', icon: RotateCcw, roles: ['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/asistencia', label: 'Control de Asistencia', icon: CalendarCheck, roles: ['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/horarios', label: 'Horarios y Aulas', icon: Clock, roles: ['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/aulas-virtuales', label: 'Mis Clases', icon: BookMarked, roles: ['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/historial', label: 'Historial Académico', icon: History, roles: ['ADMIN', 'REGISTRO', 'ESTUDIANTE', 'DOCENTE'] },
    { path: '/reportes', label: 'Reportes Académicos', icon: BarChart3, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/notificaciones', label: 'Notificaciones', icon: BellRing, roles: ['ADMIN', 'REGISTRO'] },
    { path: '/sistemas', label: 'Operación de Sistemas', icon: Wrench, roles: ['SISTEMAS'] },
    { path: '/perfil', label: 'Perfil y Configuración', icon: Settings, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS', 'REGISTRO', 'FINANZAS'] },
```

(Solo cambian las líneas de `estudiantes` a `notificaciones` inclusive, más `perfil` al
final; `usuarios`, `biblioteca`, `parqueo`, `eventos`, `sistemas`, y `dashboard` quedan
idénticos.)

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: agrega REGISTRO y FINANZAS a la navegación"
```

---

### Task 8: Agregar `REGISTRO` al `RoleGuard` de las páginas sin checks internos

**Files:**
- Modify: `src/pages/StudentsPage.tsx:198`
- Modify: `src/pages/TeachersPage.tsx:149`
- Modify: `src/pages/CareersPage.tsx:113`
- Modify: `src/pages/AcademicStructurePage.tsx:29`
- Modify: `src/pages/CoursesPage.tsx:195`
- Modify: `src/pages/CurriculumOrganizerPage.tsx:33`
- Modify: `src/pages/CyclesPage.tsx:73`
- Modify: `src/pages/GradesControlPage.tsx:130`
- Modify: `src/pages/ZoneActivitiesPage.tsx:69`
- Modify: `src/pages/AttendancePage.tsx:53`
- Modify: `src/pages/ReportsPage.tsx:103`
- Modify: `src/pages/NotificationsPage.tsx:43`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

Estas 12 páginas solo necesitan un cambio: agregar `'REGISTRO'` a su `RoleGuard
allowedRoles`. Ninguna tiene checks internos adicionales de `role === 'ADMIN'` (verificado
antes de escribir este plan).

- [ ] **Step 1: `StudentsPage.tsx:198`, `TeachersPage.tsx:149`, `CareersPage.tsx:113`,
  `CoursesPage.tsx:195`, `CyclesPage.tsx:73`**

En cada uno de estos 5 archivos, reemplaza:

```tsx
<RoleGuard allowedRoles={['ADMIN']}>
```

por:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'REGISTRO']}>
```

- [ ] **Step 2: `AcademicStructurePage.tsx:29`**

Reemplaza `allowedRoles={['ADMIN']}` por `allowedRoles={['ADMIN', 'REGISTRO']}` (es la
misma línea que arma todo el `return`, no cambies nada más de esa línea).

- [ ] **Step 3: `CurriculumOrganizerPage.tsx:33`**

Reemplaza `allowedRoles={['ADMIN']}` por `allowedRoles={['ADMIN', 'REGISTRO']}` (misma
línea del `return` extenso, no cambies nada más).

- [ ] **Step 4: `GradesControlPage.tsx:130`**

Reemplaza:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}>
```

por:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}>
```

- [ ] **Step 5: `ZoneActivitiesPage.tsx:69`**

Este archivo tiene DOS `RoleGuard`: uno en la línea 66 para la vista de estudiante
(`allowedRoles={['ESTUDIANTE']}`, **no tocar**) y otro en la línea 69 para la vista de
gestión (`allowedRoles={['ADMIN', 'DOCENTE']}`). Cambia solo la línea 69:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}>
```

por:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}>
```

- [ ] **Step 6: `AttendancePage.tsx:53`**

Igual que el paso anterior: este archivo tiene un `RoleGuard` en la línea 48 para la vista
de estudiante (`allowedRoles={['ESTUDIANTE']}`, **no tocar**) y otro en la línea 53 para la
vista de gestión. Cambia solo la línea 53:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}>
```

por:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}>
```

- [ ] **Step 7: `ReportsPage.tsx:103`, `NotificationsPage.tsx:43`**

En ambos, reemplaza `allowedRoles={['ADMIN']}` por `allowedRoles={['ADMIN', 'REGISTRO']}`.

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/pages/StudentsPage.tsx src/pages/TeachersPage.tsx src/pages/CareersPage.tsx src/pages/AcademicStructurePage.tsx src/pages/CoursesPage.tsx src/pages/CurriculumOrganizerPage.tsx src/pages/CyclesPage.tsx src/pages/GradesControlPage.tsx src/pages/ZoneActivitiesPage.tsx src/pages/AttendancePage.tsx src/pages/ReportsPage.tsx src/pages/NotificationsPage.tsx
git commit -m "feat: agrega REGISTRO al RoleGuard de las páginas académicas sin checks internos"
```

---

### Task 9: Agregar `REGISTRO` al `RoleGuard` y a los checks internos de las páginas mixtas

**Files:**
- Modify: `src/pages/SectionsPage.tsx`
- Modify: `src/pages/EnrollmentPage.tsx`
- Modify: `src/pages/StudentRequestsPage.tsx`
- Modify: `src/pages/EnrollmentDocumentsPage.tsx`
- Modify: `src/pages/StudyPlanPage.tsx`
- Modify: `src/pages/CurriculumMapPage.tsx`
- Modify: `src/pages/RecoveriesPage.tsx`
- Modify: `src/pages/SchedulesPage.tsx`
- Modify: `src/pages/AcademicHistoryPage.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

Estas 9 páginas tienen, además del `RoleGuard`, botones/paneles condicionados por el
literal exacto `currentUser.role === 'ADMIN'` en varios lugares del archivo. La cadena
`currentUser.role === 'ADMIN'` aparece **siempre igual, letra por letra**, en cada archivo
(verificado antes de escribir este plan) — es seguro reemplazar **todas** las ocurrencias
de ese literal exacto por `['ADMIN', 'REGISTRO'].includes(currentUser.role)` en cada uno de
estos 9 archivos, además de actualizar el `RoleGuard` por separado.

- [ ] **Step 1: `SectionsPage.tsx`**

- Línea 177: reemplaza `<RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}>` por `<RoleGuard
  allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}>`.
- Reemplaza las 3 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~187,
  ~305, ~306) por `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/SectionsPage.tsx` → `0`.

- [ ] **Step 2: `EnrollmentPage.tsx`**

- Línea 78: reemplaza `<RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}>` por `<RoleGuard
  allowedRoles={['ADMIN', 'REGISTRO', 'ESTUDIANTE']}>`.
- Reemplaza la única ocurrencia del literal `currentUser.role === 'ADMIN'` (línea ~89) por
  `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/EnrollmentPage.tsx` → `0`.

- [ ] **Step 3: `StudentRequestsPage.tsx`**

- Línea 25: reemplaza `allowedRoles={['ADMIN', 'ESTUDIANTE']}` por `allowedRoles={['ADMIN',
  'REGISTRO', 'ESTUDIANTE']}`.
- Reemplaza la única ocurrencia del literal `currentUser.role === 'ADMIN'` (línea ~29) por
  `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/StudentRequestsPage.tsx` → `0`.

- [ ] **Step 4: `EnrollmentDocumentsPage.tsx`**

- Línea 54: reemplaza `allowedRoles={['ADMIN', 'ESTUDIANTE']}` por `allowedRoles={['ADMIN',
  'REGISTRO', 'ESTUDIANTE']}`.
- Reemplaza las 3 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~49, ~61,
  ~63) por `['ADMIN', 'REGISTRO'].includes(currentUser.role)`. Una de esas ocurrencias
  está dentro de una expresión mayor, `(currentUser.role === 'ESTUDIANTE' ||
  currentUser.role === 'ADMIN')` — reemplaza solo el fragmento `currentUser.role ===
  'ADMIN'` dejando `currentUser.role === 'ESTUDIANTE' ||` intacto, resultando en
  `(currentUser.role === 'ESTUDIANTE' || ['ADMIN', 'REGISTRO'].includes(currentUser.role))`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/EnrollmentDocumentsPage.tsx` → `0`.

- [ ] **Step 5: `StudyPlanPage.tsx`**

- Línea 49: reemplaza `allowedRoles={['ADMIN', 'ESTUDIANTE']}` por `allowedRoles={['ADMIN',
  'REGISTRO', 'ESTUDIANTE']}`.
- Reemplaza las 2 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~36, ~51)
  por `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/StudyPlanPage.tsx` → `0`.

- [ ] **Step 6: `CurriculumMapPage.tsx`**

- Línea 21: reemplaza `allowedRoles={['ADMIN', 'ESTUDIANTE']}` por `allowedRoles={['ADMIN',
  'REGISTRO', 'ESTUDIANTE']}`.
- Reemplaza las 2 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~19, ~22)
  por `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/CurriculumMapPage.tsx` → `0`.

- [ ] **Step 7: `RecoveriesPage.tsx`**

- Línea 66: reemplaza `allowedRoles={['ADMIN', 'DOCENTE', 'ESTUDIANTE']}` por
  `allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE']}`.
- Reemplaza las 3 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~67-69).
  Dos de ellas están dentro de expresiones compuestas — reemplaza solo el fragmento
  `currentUser.role === 'ADMIN'` en cada una, dejando el resto de la expresión intacto:
  `(currentUser.role === 'ESTUDIANTE' || currentUser.role === 'ADMIN')` →
  `(currentUser.role === 'ESTUDIANTE' || ['ADMIN', 'REGISTRO'].includes(currentUser.role))`;
  `(currentUser.role === 'ADMIN' || currentUser.role === 'DOCENTE')` →
  `(['ADMIN', 'REGISTRO'].includes(currentUser.role) || currentUser.role === 'DOCENTE')`;
  la tercera ocurrencia (`authorizeId && currentUser.role === 'ADMIN' && ...` y
  `currentUser.role === 'ADMIN' && recovery.status === 'SOLICITADA' && ...`) se reemplaza
  igual, sustituyendo únicamente el fragmento `currentUser.role === 'ADMIN'` por
  `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/RecoveriesPage.tsx` → `0`.

- [ ] **Step 8: `SchedulesPage.tsx`**

- Línea 109: reemplaza `<RoleGuard allowedRoles={['ADMIN', 'DOCENTE', 'ESTUDIANTE']}>` por
  `<RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE', 'ESTUDIANTE']}>`.
- Reemplaza las 3 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~120,
  ~128, ~268) por `['ADMIN', 'REGISTRO'].includes(currentUser.role)`.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/SchedulesPage.tsx` → `0`.

- [ ] **Step 9: `AcademicHistoryPage.tsx`**

- Línea 57: reemplaza `<RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE', 'DOCENTE']}>` por
  `<RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'ESTUDIANTE', 'DOCENTE']}>`.
- Reemplaza las 3 ocurrencias del literal `currentUser.role === 'ADMIN'` (líneas ~46, ~78,
  ~83). La de la línea ~78 está en `(currentUser.role === 'ADMIN' || currentUser.role ===
  'DOCENTE')` — reemplaza solo el fragmento `currentUser.role === 'ADMIN'`, dejando ` ||
  currentUser.role === 'DOCENTE'` intacto.
- Verifica: `grep -c "currentUser.role === 'ADMIN'" src/pages/AcademicHistoryPage.tsx` → `0`.

- [ ] **Step 10: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add src/pages/SectionsPage.tsx src/pages/EnrollmentPage.tsx src/pages/StudentRequestsPage.tsx src/pages/EnrollmentDocumentsPage.tsx src/pages/StudyPlanPage.tsx src/pages/CurriculumMapPage.tsx src/pages/RecoveriesPage.tsx src/pages/SchedulesPage.tsx src/pages/AcademicHistoryPage.tsx
git commit -m "feat: agrega REGISTRO al RoleGuard y checks internos de las páginas académicas mixtas"
```

---

### Task 10: Agregar `FINANZAS` al `RoleGuard` y a los checks internos de `FinancesPage.tsx`

**Files:**
- Modify: `src/pages/FinancesPage.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Actualizar el `RoleGuard`**

En `src/pages/FinancesPage.tsx:183`, reemplaza:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}>
```

por:

```tsx
<RoleGuard allowedRoles={['ADMIN', 'FINANZAS', 'ESTUDIANTE']}>
```

- [ ] **Step 2: Reemplazar los checks internos**

Este archivo tiene 14 ocurrencias del literal exacto `currentUser.role === 'ADMIN'`.
Reemplaza **todas** por `['ADMIN', 'FINANZAS'].includes(currentUser.role)` — a diferencia
de las páginas académicas de la Tarea 9, aquí el rol que se agrega es `FINANZAS`, no
`REGISTRO`. Ninguna de las 14 ocurrencias está anidada dentro de una expresión con otro
rol (todas son standalone `currentUser.role === 'ADMIN' && ...` o `... ?
currentUser.role === 'ADMIN' ? ...`), así que el reemplazo literal es directo.

- [ ] **Step 3: Verificar el conteo**

Run: `grep -c "currentUser.role === 'ADMIN'" src/pages/FinancesPage.tsx`
Expected: `0`

Run: `grep -c "'FINANZAS'" src/pages/FinancesPage.tsx`
Expected: `15` (14 checks internos + 1 en el `RoleGuard`)

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/pages/FinancesPage.tsx
git commit -m "feat: agrega FINANZAS al RoleGuard y checks internos de Pagos y Solvencias"
```

---

### Task 11: Cuentas demo `REGISTRO` y `FINANZAS`

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: nada.
- Produces: dos usuarios nuevos en la base de datos sembrada, con `role: 'REGISTRO'` y
  `role: 'FINANZAS'`, contraseña `Demo123!` (aplicada por el mecanismo de hash ya existente
  del seed). La Tarea 12 depende de que estos correos existan.

- [ ] **Step 1: Ubicar el patrón de los usuarios demo existentes**

Abre `prisma/seed.ts` y busca los bloques que crean a `alopez@biblioteca.uspg.edu.gt`
(`id: 'USR-BIB-001'`), `rpaz@parqueo.uspg.edu.gt` (`id: 'USR-PAR-001'`) y
`sruiz@eventos.uspg.edu.gt` (`id: 'USR-EVT-001'`) — están cerca de la línea 46-58. Cada uno
sigue el mismo patrón: `id`, `name`, `email`, `role`, contraseña `Demo123!` vía
`hashPassword('Demo123!')`, y se registra con la misma función auxiliar que usan los demás
(`upsertUser` o el patrón directo que uses de referencia en ese bloque).

- [ ] **Step 2: Agregar los dos usuarios nuevos**

Siguiendo exactamente el mismo patrón (mismo estilo de objeto, mismo mecanismo de
creación/upsert, misma función de hash), agrega:

```ts
{ id: 'USR-REG-001', name: 'Marta Solís', email: 'msolis@registro.uspg.edu.gt', role: 'REGISTRO' }
```

y

```ts
{ id: 'USR-FIN-001', name: 'Jorge Aguilar', email: 'jaguilar@finanzas.uspg.edu.gt', role: 'FINANZAS' }
```

con contraseña `Demo123!` igual que los demás. Colócalos justo después del bloque de
`sruiz@eventos.uspg.edu.gt` para mantener el agrupamiento de "usuarios operativos" junto.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Re-sembrar la base de datos local y confirmar**

Run: `npm run db:seed`
Expected: el mensaje final `Base inicial creada. Usuarios demo usan la contraseña
Demo123!` sin errores.

Run (con el servidor corriendo en `http://127.0.0.1:3000`, reinícialo primero si no
recoge datos nuevos):
```bash
curl -s -i -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"msolis@registro.uspg.edu.gt","password":"Demo123!"}' | head -5
curl -s -i -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"jaguilar@finanzas.uspg.edu.gt","password":"Demo123!"}' | head -5
```
Expected: ambos devuelven `HTTP/1.1 200` (o `428` si la política de MFA los marca como
enrollment requerido, lo cual es correcto ya que se agregaron a `defaultMfaRequiredRoles`
en la Tarea 1 — en ese caso el `200`/`428` en sí ya confirma que el login y el rol
funcionan).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: agrega cuentas demo de Registro Académico y Finanzas"
```

---

### Task 12: Extender `scripts/test-role-access.mjs`

**Files:**
- Modify: `scripts/test-role-access.mjs`

**Interfaces:**
- Consumes: cuentas demo de la Tarea 11, middlewares de las Tareas 2-6.
- Produces: nada — es el arnés de pruebas final de este proyecto.

- [ ] **Step 1: Agregar las cuentas nuevas**

En el objeto `accounts`, agrega:

```js
  REGISTRO: { username: process.env.TEST_REGISTRO_EMAIL || 'msolis@registro.uspg.edu.gt', password: process.env.TEST_REGISTRO_PASSWORD || 'Demo123!' },
  FINANZAS: { username: process.env.TEST_FINANZAS_EMAIL || 'jaguilar@finanzas.uspg.edu.gt', password: process.env.TEST_FINANZAS_PASSWORD || 'Demo123!' },
```

- [ ] **Step 2: Agregar los casos de prueba**

En el objeto `cases`, agrega:

```js
  REGISTRO: [
    ['/api/students', 200], ['/api/finances/career-fees', 403],
  ],
  FINANZAS: [
    ['/api/finances/career-fees', 200], ['/api/students', 403],
  ],
```

- [ ] **Step 3: Ejecutar la suite completa**

Levanta el servidor si no está corriendo (`npm run dev > /tmp/dev-server.log 2>&1 &
disown`, `sleep 3`), luego:

```bash
TEST_ADMIN_PASSWORD=Demo123! TEST_ADMIN_EMAIL=cmendoza@administrador.uspg.edu.gt TEST_BASE_URL=http://127.0.0.1:3000 npm run test:roles
```

Expected: todas las líneas `PASS`, incluidas las nuevas de `REGISTRO`/`FINANZAS`. Si
`REGISTRO`/`FINANZAS` caen en la rama de "inscripción MFA obligatoria" (porque son cuentas
recién creadas sin MFA habilitado y ahora están en `defaultMfaRequiredRoles`), eso también
cuenta como `PASS` — es el mismo comportamiento que ya tienen `ADMIN`/`DOCENTE`/`SISTEMAS`
en este script.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-role-access.mjs
git commit -m "test: agrega casos de REGISTRO y FINANZAS a la matriz de permisos"
```

---

### Task 13: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

- [ ] **Step 1: Levantar el servidor**

Run: `npm run dev > /tmp/dev-server.log 2>&1 & disown`, `sleep 3`.

- [ ] **Step 2: Confirmar el sidebar de cada rol**

Inicia sesión como `msolis@registro.uspg.edu.gt` / `Demo123!` (completa el enrollment de
MFA si el flujo lo exige, o usa las herramientas de la app para omitirlo en local si ya
existe un mecanismo de prueba). Confirma que el menú muestra los ~19 módulos académicos y
**no** muestra Pagos, Biblioteca, Parqueo, Eventos, Operación de Sistemas, ni Usuarios y
Seguridad.

Repite con `jaguilar@finanzas.uspg.edu.gt` / `Demo123!`: el menú debe mostrar únicamente
Pagos y Solvencias (además de Inicio y Perfil).

Repite con la cuenta ADMIN existente (`cmendoza@administrador.uspg.edu.gt`): debe seguir
viendo todo lo que veía antes de este proyecto (todo lo académico + Pagos + Usuarios y
Seguridad; sigue sin ver Biblioteca/Parqueo/Eventos/Sistemas, removidos en el proyecto
anterior).

- [ ] **Step 3: Confirmar que REGISTRO puede operar, no solo ver**

Con la sesión de `msolis@registro.uspg.edu.gt`, entra a "Ciclos Académicos" o "Estudiantes"
y confirma que los botones de crear/editar están visibles y funcionan (no solo la tabla en
modo lectura).

- [ ] **Step 4: Confirmar que FINANZAS puede operar Pagos**

Con la sesión de `jaguilar@finanzas.uspg.edu.gt`, entra a "Pagos y Solvencias" y confirma
que puede buscar un estudiante, ver su estado de cuenta, y que los botones de registrar
cargo/pago/convenio están visibles.

- [ ] **Step 5: Confirmar aislamiento cruzado por backend**

```bash
REG_COOKIE=$(curl -s -i -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"msolis@registro.uspg.edu.gt","password":"Demo123!"}' | grep -i '^set-cookie' | sed 's/.*: //; s/;.*//')
curl -s -X POST http://127.0.0.1:3000/api/finances/charges -H "Content-Type: application/json" -H "Cookie: $REG_COOKIE" -d '{}'
```

Expected: `{"message":"Acción disponible únicamente para Administración Financiera."}` (403).

```bash
FIN_COOKIE=$(curl -s -i -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"jaguilar@finanzas.uspg.edu.gt","password":"Demo123!"}' | grep -i '^set-cookie' | sed 's/.*: //; s/;.*//')
curl -s -X POST http://127.0.0.1:3000/api/students -H "Content-Type: application/json" -H "Cookie: $FIN_COOKIE" -d '{}'
```

Expected: `{"message":"Acción disponible únicamente para Registro Académico."}` (403).

- [ ] **Step 6: Correr la suite de scripts de integración una vez más**

Run: `TEST_ADMIN_PASSWORD=Demo123! TEST_ADMIN_EMAIL=cmendoza@administrador.uspg.edu.gt TEST_BASE_URL=http://127.0.0.1:3000 npm run test:roles`
Expected: todas las líneas `PASS`.
