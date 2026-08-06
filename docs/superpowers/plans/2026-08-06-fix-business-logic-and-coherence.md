# Fix Business Logic and Code Coherence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical business logic bugs and code coherence issues found in the USPG academic system.

**Architecture:** All fixes are in `server.ts` (backend) and a small set of React page/context files (frontend). No schema changes are needed — all bugs are logic errors in existing routes. The server.ts modularization (Task 8) is the largest change but is independent of the bug fixes.

**Tech Stack:** Node.js 22, Express 4, Prisma 7, TypeScript, React 19, Bun/npm.

## Global Constraints

- Run with PostgreSQL via Docker: `docker compose -f docker-compose.postgresql.yml up -d`
- Migrations: `npm run db:postgres:migrate:deploy` then `npm run db:seed`
- Dev server: `npm run dev`
- No new Prisma migrations needed — all changes are application logic only
- Preserve all existing API response shapes (don't break the frontend unexpectedly)
- TypeScript must compile without errors after each task

---

## File Map

| File | What changes |
|---|---|
| `server.ts` (lines 1923–1953) | Task 1: publish validation; Task 2: enrollment status + GPA on close |
| `server.ts` (line 1691–1702) | Task 3: library suspension auto-expiry |
| `server.ts` (all routes) | Task 8: split into route modules |
| `src/server/routes/` | Task 8: new files per domain |
| `src/server/middleware/auth.ts` | Task 8: extracted middleware |
| `src/services/api.ts` | Task 7: client API helper |
| `src/context/AppContext.tsx` | Task 7: use api.ts instead of raw fetch |
| `src/pages/*` | Task 7: use api.ts in components that call fetch directly |

---

## Task 1: Fix grade publish — require all students graded

**Files:**
- Modify: `server.ts:1923–1937`

**Interfaces:**
- Produces: `POST /api/grades/sections/:sectionId/publish` returns `400` if any gradeRecord has `status = 'En curso'`

- [ ] **Step 1: Find the publish endpoint**

  Open `server.ts` at line 1923. The route is `app.post('/api/grades/sections/:sectionId/publish', ...)`.

- [ ] **Step 2: Add the incomplete-grade guard**

  After line 1926 (where `section` is fetched), add a check that fetches gradeRecords and rejects if any are 'En curso'. Replace:

  ```typescript
  // existing line 1926:
  const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
  if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes publicar esta sección.' });
  if (section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta ya está cerrada.' });
  ```

  With:

  ```typescript
  const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { gradeRecords: { select: { status: true } } } });
  if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes publicar esta sección.' });
  if (section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta ya está cerrada.' });
  if (!section.gradeRecords.length) return void res.status(400).json({ message: 'No hay calificaciones registradas para publicar.' });
  if (section.gradeRecords.some((g) => g.status === 'En curso')) return void res.status(400).json({ message: 'Todos los estudiantes deben tener nota final antes de publicar el acta.' });
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  npx tsc --noEmit
  ```
  Expected: no errors related to this change.

- [ ] **Step 4: Test manually**
  - Start server: `npm run dev`
  - Login as DOCENTE
  - Try to publish a section that has students with `status='En curso'`
  - Expected: 400 with "Todos los estudiantes deben tener nota final..."
  - Grade all students, try again → should succeed

- [ ] **Step 5: Commit**

  ```bash
  git add server.ts
  git commit -m "fix: require all students graded before publishing acta"
  ```

---

## Task 2: Fix enrollment status transition and GPA recalculation on acta close

**The bug:** Prerequisites check `status='Completado'` on enrollments, but nothing ever sets that status. Enrollments stay `'Inscrito'` forever. Also, `student.gpa` is a static field never updated.

**Fix:** When an acta is closed, bulk-update all enrollments for students in that section to `'Completado'` (if approved) or `'Reprobado'` (if failed), then recalculate GPA for each affected student.

**Files:**
- Modify: `server.ts:1940–1953` (the `/close` endpoint)

**Interfaces:**
- Produces: After close, enrollments have `status='Completado'` or `status='Reprobado'`; `student.gpa` and `student.creditsEarned` are updated

- [ ] **Step 1: Find the close endpoint**

  Open `server.ts` at line 1940. Route: `app.post('/api/grades/sections/:sectionId/close', ...)`.

- [ ] **Step 2: Extend the section fetch to include gradeRecords with student and course data**

  The current fetch at line 1943 is:
  ```typescript
  const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { gradeRecords: true } });
  ```

  Change to:
  ```typescript
  const section = await prisma.section.findUnique({
    where: { id: req.params.sectionId },
    include: { gradeRecords: { include: { student: true } }, course: { select: { credits: true } } },
  });
  ```

- [ ] **Step 3: Replace the transaction block at line 1949 to also update enrollments and GPA**

  Current transaction (lines 1949–1952):
  ```typescript
  const closedAt = new Date();
  await prisma.$transaction([
    prisma.section.update({ where: { id: section.id }, data: { gradeActStatus: 'CERRADA', gradesClosedAt: closedAt, gradesClosedBy: user.name } }),
    prisma.auditLog.create({ data: { action: 'CLOSE', entityType: 'GRADES', entityId: section.id, actorId: user.id, details: JSON.stringify({ records: section.gradeRecords.length }) } }),
  ]);
  ```

  Replace with:
  ```typescript
  const closedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.section.update({ where: { id: section.id }, data: { gradeActStatus: 'CERRADA', gradesClosedAt: closedAt, gradesClosedBy: user.name } });

    // Transition enrollment statuses
    for (const grade of section.gradeRecords) {
      const newEnrollmentStatus = grade.status === 'Aprobado' ? 'Completado' : 'Reprobado';
      await tx.enrollment.updateMany({
        where: { studentCarnet: grade.studentCarnet, sectionId: section.id },
        data: { status: newEnrollmentStatus },
      });
    }

    // Recalculate GPA and credits for each student in this section
    const studentCarnets = [...new Set(section.gradeRecords.map((g) => g.studentCarnet))];
    for (const carnet of studentCarnets) {
      const allGrades = await tx.gradeRecord.findMany({
        where: { studentCarnet: carnet, section: { gradeActStatus: 'CERRADA' } },
        include: { section: { include: { course: { select: { credits: true } } } } },
      });
      const approved = allGrades.filter((g) => g.status === 'Aprobado');
      const creditsEarned = approved.reduce((sum, g) => sum + g.section.course.credits, 0);
      const totalWeighted = approved.reduce((sum, g) => sum + g.total * g.section.course.credits, 0);
      const gpa = creditsEarned > 0 ? Math.round((totalWeighted / creditsEarned) * 100) / 100 : 0;
      await tx.student.update({ where: { carnet }, data: { gpa, creditsEarned } });
    }

    await tx.auditLog.create({ data: { action: 'CLOSE', entityType: 'GRADES', entityId: section.id, actorId: user.id, details: JSON.stringify({ records: section.gradeRecords.length }) } });
  });
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 5: Test manually**
  - Close an acta that has Aprobado and Reprobado students
  - Check DB: `SELECT status FROM enrollments WHERE section_id = '<id>'` — should show 'Completado' and 'Reprobado'
  - Check DB: `SELECT gpa, credits_earned FROM students WHERE carnet = '<carnet>'` — should be updated
  - Try enrolling a student whose prerequisite was completed in the closed acta → should now succeed

- [ ] **Step 6: Commit**

  ```bash
  git add server.ts
  git commit -m "fix: transition enrollment status and recalculate GPA on acta close"
  ```

---

## Task 3: Fix library suspension auto-expiry

**The bug:** `user.librarySuspendedUntil` is stored in the DB but never auto-cleared. The loan creation check works (`borrower.librarySuspendedUntil > new Date()`), but the GET `/api/library` returns `suspendedUntil` as-is, so the UI keeps showing a student as suspended after the date has passed unless staff manually clicks "Levantar".

**Fix:** In the GET `/api/library` handler, before returning, clear expired suspensions from DB.

**Files:**
- Modify: `server.ts:1691–1702`

**Interfaces:**
- Produces: Users whose `librarySuspendedUntil < now()` get `librarySuspendedUntil = null` automatically on the next library page load

- [ ] **Step 1: Find the GET /api/library handler**

  Open `server.ts` at line 1691.

- [ ] **Step 2: Add auto-expiry logic before the main queries**

  After line 1694 (`await evaluateLibraryAlerts();`), add:

  ```typescript
  // Auto-clear expired suspensions
  await prisma.user.updateMany({
    where: { librarySuspendedUntil: { lt: new Date(), not: null } },
    data: { librarySuspendedUntil: null, librarySuspensionReason: null },
  });
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 4: Test**
  - Create a suspension with expiry in the past (manually update DB or use a 1-second expiry in test)
  - Load `/api/library` → user should have `suspendedUntil: null` in response
  - Verify the user can now borrow books

- [ ] **Step 5: Commit**

  ```bash
  git add server.ts
  git commit -m "fix: auto-clear expired library suspensions on page load"
  ```

---

## Task 4: Fix cycle activation — prevent orphaned enrollments

**The bug:** When admin activates a new cycle (setting `isCurrent=true`), enrollments in the old cycle stay `'Inscrito'` forever. Subsequent enrollment validity checks filter by `cycle.enrollmentStartDate/EndDate`, so existing enrollments are not affected directly, but the student's enrollment count in the "new" cycle query is wrong.

**Fix:** When a cycle is deactivated (another cycle becomes `isCurrent=true`), close all `'Inscrito'` enrollments in the deactivated cycle by setting them to `'Retirado'` if their section has no closed acta yet (i.e., acta was never finalized — the cycle was interrupted). Sections with closed actas already transitioned via Task 2.

**Files:**
- Modify: `server.ts` — the cycle update endpoint. Search for `app.patch('/api/cycles/:id'` or `setCurrentCycleId`.

- [ ] **Step 1: Find the cycle isCurrent update logic**

  Search in `server.ts`:
  ```
  grep -n "isCurrent" server.ts
  ```
  Find the PATCH cycle route where `isCurrent` is set to true and all others set to false.

- [ ] **Step 2: After setting the new current cycle, retire orphaned enrollments**

  In the PATCH `/api/cycles/:id` handler, after the transaction that sets `isCurrent`, add:

  ```typescript
  // If a new cycle was activated, retire open enrollments in the previously active cycles
  if (data.isCurrent) {
    const openEnrollments = await prisma.enrollment.findMany({
      where: {
        status: 'Inscrito',
        section: { cycleId: { not: req.params.id }, cycle: { isCurrent: false } },
      },
      select: { id: true },
    });
    if (openEnrollments.length) {
      await prisma.enrollment.updateMany({
        where: { id: { in: openEnrollments.map((e) => e.id) } },
        data: { status: 'Retirado' },
      });
    }
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 4: Test**
  - Create two cycles, activate the second
  - Verify `'Inscrito'` enrollments from cycle 1 are now `'Retirado'`
  - Verify `'Completado'` enrollments from cycle 1 (closed actas) are untouched

- [ ] **Step 5: Commit**

  ```bash
  git add server.ts
  git commit -m "fix: retire open enrollments when a new cycle is activated"
  ```

---

## Task 5: Fix attendance endpoint — block non-teacher, non-admin roles

**The bug:** `POST /api/attendance/sessions` uses `requireUser` (any authenticated user). Line 1786 blocks `ESTUDIANTE`. But admin staff (BIBLIOTECA, PARQUEO, EVENTOS, SISTEMAS) can POST attendance records, which makes no sense.

**Fix:** After the ESTUDIANTE block at line 1786, also block roles that have no academic function.

**Files:**
- Modify: `server.ts:1784–1804`

- [ ] **Step 1: Add role guard at line 1786**

  Replace:
  ```typescript
  if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Los estudiantes no pueden registrar asistencia.' });
  ```

  With:
  ```typescript
  if (!['ADMIN', 'DOCENTE'].includes(user.role)) return void res.status(403).json({ message: 'Solo catedráticos y administradores pueden registrar asistencia.' });
  ```

- [ ] **Step 2: Compile check**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add server.ts
  git commit -m "fix: restrict attendance session creation to ADMIN and DOCENTE roles"
  ```

---

## Task 6: Standardize API response helpers

**The problem:** Routes return `{ ok: true }`, `{ message }`, direct arrays, or inline objects with no consistent shape. Makes frontend error handling harder.

**Fix:** Add three small helper functions at the top of `server.ts` and use them in new/changed routes going forward. Do NOT mass-replace all existing routes (too risky, breaks nothing currently) — just establish the helpers for future use and apply to the routes touched in Tasks 1–5.

**Files:**
- Modify: `server.ts` (add helpers near line 315, after middleware definitions)

- [ ] **Step 1: Add response helpers after the middleware block (after line 315)**

  ```typescript
  const sendOk = (res: express.Response, data?: object) => res.json({ ok: true, ...data });
  const sendCreated = (res: express.Response, data: object) => res.status(201).json(data);
  const sendError = (res: express.Response, status: number, message: string) => res.status(status).json({ message });
  ```

- [ ] **Step 2: Apply `sendOk` to the routes changed in Tasks 1–5**

  In the publish route (Task 1), replace:
  ```typescript
  res.json({ ok: true, publishedAt });
  ```
  With:
  ```typescript
  sendOk(res, { publishedAt });
  ```

  In the close route (Task 2), replace:
  ```typescript
  res.json({ ok: true, closedAt, closedBy: user.name });
  ```
  With:
  ```typescript
  sendOk(res, { closedAt, closedBy: user.name });
  ```

  In the attendance route (Task 5), replace:
  ```typescript
  res.json({ ok: true, id: session.id });
  ```
  With:
  ```typescript
  sendOk(res, { id: session.id });
  ```

- [ ] **Step 3: Compile check**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add server.ts
  git commit -m "refactor: add sendOk/sendCreated/sendError helpers, apply to changed routes"
  ```

---

## Task 7: Client API service layer — consolidate fetch calls

**The problem:** Some pages call `fetch('/api/...')` directly with inconsistent error handling. AppContext is the right pattern but not all pages use it.

**Fix:** Create `src/services/api.ts` with typed helpers. Update the 3 pages that call fetch directly.

**Files:**
- Create: `src/services/api.ts`
- Modify: `src/pages/StudentsPage.tsx` (line ~62)
- Modify: `src/pages/GradesControlPage.tsx` (line ~50)
- Modify: `src/pages/CurriculumMapPage.tsx` (wherever direct fetch is used)

- [ ] **Step 1: Create `src/services/api.ts`**

  ```typescript
  const handleResponse = async <T>(res: Response): Promise<T> => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: `Error ${res.status}` }));
      throw new Error(body.message || `Error ${res.status}`);
    }
    return res.json() as Promise<T>;
  };

  export const apiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    return handleResponse<T>(res);
  };

  export const apiGet = <T>(path: string) => apiFetch<T>(path);

  export const apiPost = <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

  export const apiPatch = <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

  export const apiDelete = (path: string) =>
    apiFetch<{ ok: boolean }>(path, { method: 'DELETE' });
  ```

- [ ] **Step 2: Update StudentsPage.tsx — replace direct fetch at line ~62**

  Find the `fetch('/api/academic-structure')` call (around line 62). Replace:
  ```typescript
  fetch('/api/academic-structure').then(r => r.json()).then(data => { ... }).catch(() => { ... })
  ```
  With:
  ```typescript
  import { apiGet } from '../services/api';
  // ...
  apiGet<{ campuses: Campus[]; plans: AcademicPlan[] }>('/api/academic-structure')
    .then((data) => { ... })
    .catch((error) => showToast(error instanceof Error ? error.message : 'Error cargando estructura académica', 'error'));
  ```

- [ ] **Step 3: Update GradesControlPage.tsx — replace direct fetch at line ~50**

  Find the `fetch('/api/grades/sections/...')` call and replace with `apiGet`.

- [ ] **Step 4: Find and update CurriculumMapPage.tsx**

  Search: `grep -n "fetch(" src/pages/CurriculumMapPage.tsx` — replace all `fetch(` calls with `apiGet`/`apiPost`.

- [ ] **Step 5: Compile check**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/api.ts src/pages/StudentsPage.tsx src/pages/GradesControlPage.tsx src/pages/CurriculumMapPage.tsx
  git commit -m "refactor: introduce api.ts service layer, migrate direct fetch calls"
  ```

---

## Task 8: Fix TypeScript `as any` casts in form handlers

**The problem:** 7 instances of `as any` in form select handlers (CareersPage, CoursesPage, SchedulesPage, SectionsPage, StudentsPage). All are casting `e.target.value` to union types.

**Fix:** Use explicit cast to the specific union type instead of `any`.

**Files:**
- Modify: `src/pages/CareersPage.tsx`
- Modify: `src/pages/CoursesPage.tsx`
- Modify: `src/pages/SchedulesPage.tsx`
- Modify: `src/pages/SectionsPage.tsx`
- Modify: `src/pages/StudentsPage.tsx`

- [ ] **Step 1: Fix CareersPage.tsx**

  Search: `grep -n "as any" src/pages/CareersPage.tsx`

  For each occurrence like `modality: e.target.value as any`, replace with the actual type from `src/types/index.ts`, e.g.:
  ```typescript
  modality: e.target.value as 'Presencial' | 'Virtual' | 'Semipresencial'
  ```

- [ ] **Step 2: Fix CoursesPage.tsx**

  Search: `grep -n "as any" src/pages/CoursesPage.tsx`

  Replace `area: formData.area as any` with the correct union from types.

- [ ] **Step 3: Fix SchedulesPage.tsx, SectionsPage.tsx, StudentsPage.tsx**

  Same pattern — search for `as any` in each file and replace with the correct union type from `src/types/index.ts`.

- [ ] **Step 4: Compile check**

  ```
  npx tsc --noEmit
  ```
  Expected: 0 errors, 0 `any` warnings in these files.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/CareersPage.tsx src/pages/CoursesPage.tsx src/pages/SchedulesPage.tsx src/pages/SectionsPage.tsx src/pages/StudentsPage.tsx
  git commit -m "fix: replace as-any casts with proper union types in form handlers"
  ```

---

## Task 9: Split server.ts into route modules

**The problem:** `server.ts` is 2500+ lines with 131 routes — too large to maintain. This task extracts routes into domain modules.

**Note:** This is a pure refactor — zero behavior change. Test by running the full app after and verifying all routes still work.

**Files:**
- Create: `src/server/routes/auth.ts`
- Create: `src/server/routes/academic.ts`
- Create: `src/server/routes/admin.ts`
- Create: `src/server/routes/finance.ts`
- Create: `src/server/routes/library.ts`
- Create: `src/server/routes/parking.ts`
- Create: `src/server/routes/notifications.ts`
- Create: `src/server/routes/grades.ts`
- Create: `src/server/routes/attendance.ts`
- Create: `src/server/middleware/auth.ts` (extracted middleware)
- Modify: `server.ts` (reduced to imports + app setup only)

**Strategy:** Each module exports a function `registerRoutes(app, prisma, helpers)`. `server.ts` calls them all.

- [ ] **Step 1: Create `src/server/middleware/auth.ts`**

  Extract `requireAdmin`, `requireUser`, `requireLibraryStaff`, `requireParkingStaff`, `requireSystems`, `blockUntilMfaEnrollment` from `server.ts`. Export them. `server.ts` imports them.

  ```typescript
  // src/server/middleware/auth.ts
  import express from 'express';
  import type { PrismaClient } from '@prisma/client';

  export const createAuthMiddleware = (prisma: PrismaClient, hashToken: (t: string) => string, getMfaRequiredRoles: () => Promise<string[]>) => {
    const blockUntilMfaEnrollment = async (req: express.Request, res: express.Response, user: { role: string; mfaEnabled: boolean }) => {
      // ... copy exact implementation from server.ts
    };

    const requireAdmin: express.RequestHandler = async (req, res, next) => {
      // ... copy exact implementation
    };

    const requireUser: express.RequestHandler = async (req, res, next) => {
      // ... copy exact implementation
    };

    const requireLibraryStaff: express.RequestHandler = (req, res, next) =>
      ['ADMIN', 'BIBLIOTECA'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Biblioteca.' });

    const requireParkingStaff: express.RequestHandler = (req, res, next) =>
      ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Parqueo.' });

    const requireSystems: express.RequestHandler = (_req, res, next) =>
      res.locals.authUser?.role === 'SISTEMAS' ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Sistemas.' });

    return { requireAdmin, requireUser, requireLibraryStaff, requireParkingStaff, requireSystems };
  };
  ```

- [ ] **Step 2: Create `src/server/routes/grades.ts`**

  Extract all routes matching `/api/grades` and `/api/recoveries` from `server.ts`. Signature:

  ```typescript
  export const registerGradeRoutes = (app: express.Express, prisma: PrismaClient, middleware: ReturnType<typeof createAuthMiddleware>, helpers: { gradeView: Function; notifyByCarnet: Function; notifyUser: Function }) => {
    // paste all grade routes here
  };
  ```

- [ ] **Step 3: Create remaining route files**

  In the same pattern, create:
  - `src/server/routes/auth.ts` — all `/api/auth/` routes + session management
  - `src/server/routes/academic.ts` — `/api/students`, `/api/teachers`, `/api/careers`, `/api/courses`, `/api/sections`, `/api/cycles`, `/api/enrollments`, `/api/academic-structure`
  - `src/server/routes/admin.ts` — `/api/users`, `/api/classrooms`, `/api/audit-logs`, `/api/parameters`, `/api/institution`
  - `src/server/routes/finance.ts` — all `/api/finances/` routes
  - `src/server/routes/library.ts` — all `/api/library/` routes
  - `src/server/routes/parking.ts` — all `/api/parking/` routes
  - `src/server/routes/attendance.ts` — all `/api/attendance/` routes
  - `src/server/routes/notifications.ts` — all `/api/notifications` routes

- [ ] **Step 4: Reduce server.ts to orchestrator**

  `server.ts` becomes:
  ```typescript
  import 'dotenv/config';
  import express from 'express';
  // ... crypto, path, etc.
  import { createPrismaClient } from './src/server/prismaClient';
  import { createAuthMiddleware } from './src/server/middleware/auth';
  import { registerAuthRoutes } from './src/server/routes/auth';
  import { registerAcademicRoutes } from './src/server/routes/academic';
  // ... all route imports

  const app = express();
  const prisma = createPrismaClient();
  // ... setup helpers (hashToken, encryptMfa, etc.)
  const middleware = createAuthMiddleware(prisma, hashToken, getMfaRequiredRoles);

  // Register all routes
  registerAuthRoutes(app, prisma, middleware, helpers);
  registerAcademicRoutes(app, prisma, middleware, helpers);
  // ...

  app.listen(3000, () => console.log('Server running on port 3000'));
  ```

- [ ] **Step 5: Compile check**

  ```
  npx tsc --noEmit
  ```

- [ ] **Step 6: Smoke test all major endpoints**

  Start server with `npm run dev` and test:
  - `GET /api/health` → `{ ok: true }`
  - `POST /api/auth/login` with valid credentials → session cookie
  - `GET /api/students` → list of students
  - `GET /api/library` → library data

- [ ] **Step 7: Commit**

  ```bash
  git add server.ts src/server/routes/ src/server/middleware/
  git commit -m "refactor: split server.ts into domain route modules"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: publish validation (grade completeness)
- ✅ Task 2: enrollment status transition + GPA recalculation
- ✅ Task 3: library suspension auto-expiry
- ✅ Task 4: cycle activation orphaned enrollments
- ✅ Task 5: attendance role restriction
- ✅ Task 6: API response helpers
- ✅ Task 7: client fetch consolidation
- ✅ Task 8: TypeScript any fixes
- ✅ Task 9: server.ts modularization

**Not included (intentional):**
- Recovery exam bypassing closed acta: This is **intended behavior**. Recovery exams legitimately modify grades after closure — that's the whole point of the flow.
- Null plan enrollment bypass: If a student has no plan assigned, allowing any enrollment is a valid admin decision. Not a bug.
- Manual payment amount validation: Already exists at line 1443 (`amount > balance` check). Not a bug.
- Prisma query optimization: Out of scope for bug-fix work.
- GPA/cycle orphan issue for historically closed actas: Task 2 fixes future closures. Historical data can be fixed with a one-time migration script if needed.

**Type consistency:** All type references use existing Prisma models. No new types introduced.
