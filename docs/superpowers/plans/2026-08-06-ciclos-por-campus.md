# Ciclos académicos por campus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que los ciclos académicos, las aulas y los docentes pertenezcan a un campus específico, para que el ciclo activo que ve cada usuario corresponda a su propio campus en vez de a un único ciclo global mal nombrado ("Segundo Semestre 2026 · Campus Central").

**Architecture:** Se agrega `campusId` (obligatorio) a `AcademicCycle`, `Classroom` y `Teacher`. El campus de una `Section` se infiere transitivamente vía `section.cycle.campusId` — no se le agrega campo propio. La resolución de "ciclo actual" pasa de un único `isCurrent=true` global a como máximo uno por campus; estudiantes y docentes lo resuelven automáticamente según su propio campus, y los roles sin campus fijo (ADMIN, SISTEMAS, BIBLIOTECA, PARQUEO, EVENTOS) lo eligen manualmente desde el selector del header, que ahora muestra el campus de cada opción.

**Tech Stack:** Prisma 7 (SQLite en desarrollo, PostgreSQL en producción), Express, React 19, TypeScript. Sin framework de test unitario — el proyecto verifica con `tsc --noEmit` (`npm run lint`) y scripts de integración en `scripts/test-*.mjs` que golpean un servidor real vía `fetch`.

## Global Constraints

- No modificar ninguna migración ya aplicada en producción (rompería el checksum de `prisma migrate deploy` en el próximo despliegue). Todo cambio de esquema es una migración **nueva**.
- Todo dato existente se migra a `CAMPUS-CENTRAL` (id real en producción, código `CC`) — es el único campus con actividad real hoy.
- El nombre del ciclo activo pierde el sufijo `· Campus Central`; el campus se muestra como badge/etiqueta separada en la UI, nunca concatenado al nombre.
- Seguir el patrón de testing existente: sin Jest/Vitest, verificación vía `npm run lint` + scripts de integración con `node:assert` contra un servidor real.
- Seguir el patrón ya establecido en `FinancesPage.tsx` para obtener la lista de campus en pantallas de administración: `fetch('/api/academic-structure')` gateado por `currentUser.role === 'ADMIN'`, no agregar estado global nuevo a `AppContext` para esto.

---

## Task 1: Esquema y migración SQLite (desarrollo)

**Files:**
- Modify: `prisma/schema.prisma` (modelos `Teacher`, `AcademicCycle`, `Classroom`, `Campus`)
- Create: `prisma/migrations/<timestamp>_add_campus_to_cycle_classroom_teacher/migration.sql`

**Interfaces:**
- Produces: campo `campusId: string` (obligatorio) en los modelos Prisma `AcademicCycle`, `Classroom`, `Teacher`; relación inversa `Campus.cycles`, `Campus.classrooms`, `Campus.teachers`.

- [ ] **Step 1: Editar `prisma/schema.prisma` — modelo `Teacher`**

Ubicar (por `grep -n "model Teacher"`, línea ~129):

```prisma
model Teacher {
  code               String    @id
  name               String
  email              String    @unique
  phone              String
  specialty          String
  academicDegree     String    @map("academic_degree")
  assignedSectionIds String    @default("[]") @map("assigned_section_ids")
  status             String    @default("Activo")
  maxHoursPerWeek    Int       @map("max_hours_per_week")
  userId             String    @unique @map("user_id")
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sections           Section[]
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@map("teachers")
}
```

Reemplazar por:

```prisma
model Teacher {
  code               String    @id
  name               String
  email              String    @unique
  phone              String
  specialty          String
  academicDegree     String    @map("academic_degree")
  assignedSectionIds String    @default("[]") @map("assigned_section_ids")
  status             String    @default("Activo")
  maxHoursPerWeek    Int       @map("max_hours_per_week")
  userId             String    @unique @map("user_id")
  campusId           String    @map("campus_id")
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  campus             Campus    @relation(fields: [campusId], references: [id], onDelete: Restrict)
  sections           Section[]
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@index([campusId])
  @@map("teachers")
}
```

- [ ] **Step 2: Editar `prisma/schema.prisma` — modelo `AcademicCycle`**

Ubicar (línea ~269):

```prisma
model AcademicCycle {
  id                      String    @id
  year                    Int
  name                    String
  startDate               DateTime  @map("start_date")
  endDate                 DateTime  @map("end_date")
  enrollmentStartDate     DateTime  @map("enrollment_start_date")
  enrollmentEndDate       DateTime  @map("enrollment_end_date")
  gradeSubmissionDeadline DateTime  @map("grade_submission_deadline")
  status                  String
  isCurrent               Boolean   @default(false) @map("is_current")
  sections                Section[]
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  @@map("academic_cycles")
}
```

Reemplazar por:

```prisma
model AcademicCycle {
  id                      String    @id
  year                    Int
  name                    String
  startDate               DateTime  @map("start_date")
  endDate                 DateTime  @map("end_date")
  enrollmentStartDate     DateTime  @map("enrollment_start_date")
  enrollmentEndDate       DateTime  @map("enrollment_end_date")
  gradeSubmissionDeadline DateTime  @map("grade_submission_deadline")
  status                  String
  isCurrent               Boolean   @default(false) @map("is_current")
  campusId                String    @map("campus_id")
  campus                  Campus    @relation(fields: [campusId], references: [id], onDelete: Restrict)
  sections                Section[]
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  @@index([campusId])
  @@map("academic_cycles")
}
```

- [ ] **Step 3: Editar `prisma/schema.prisma` — modelo `Classroom`**

Ubicar (línea ~290):

```prisma
model Classroom {
  id                 String    @id
  code               String    @unique
  building           String
  capacity           Int
  type               String
  status             String
  hasProjector       Boolean   @default(false) @map("has_projector")
  hasAirConditioning Boolean   @default(false) @map("has_air_conditioning")
  sections           Section[]
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@map("classrooms")
}
```

Reemplazar por:

```prisma
model Classroom {
  id                 String    @id
  code               String    @unique
  building           String
  capacity           Int
  type               String
  status             String
  hasProjector       Boolean   @default(false) @map("has_projector")
  hasAirConditioning Boolean   @default(false) @map("has_air_conditioning")
  campusId           String    @map("campus_id")
  campus             Campus    @relation(fields: [campusId], references: [id], onDelete: Restrict)
  sections           Section[]
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@index([campusId])
  @@map("classrooms")
}
```

- [ ] **Step 4: Editar `prisma/schema.prisma` — modelo `Campus` (relaciones inversas)**

Ubicar (línea ~206):

```prisma
model Campus {
  id            String      @id
  code          String      @unique
  name          String
  address       String?
  status        String      @default("Activo")
  students      Student[]
  financialFees CareerFee[]
  curriculumPlans CurriculumPlan[]
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@map("campuses")
}
```

Reemplazar por:

```prisma
model Campus {
  id            String      @id
  code          String      @unique
  name          String
  address       String?
  status        String      @default("Activo")
  students      Student[]
  financialFees CareerFee[]
  curriculumPlans CurriculumPlan[]
  cycles        AcademicCycle[]
  classrooms    Classroom[]
  teachers      Teacher[]
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@map("campuses")
}
```

- [ ] **Step 5: Crear la migración SQLite**

Crear el directorio `prisma/migrations/<timestamp>_add_campus_to_cycle_classroom_teacher/` donde `<timestamp>` sigue el formato `YYYYMMDDHHMMSS` usado por las migraciones existentes (ej. `20260806120000`), mayor que la última migración existente (`20260805050000_assign_curriculum_plan_campus`).

Crear `migration.sql` con exactamente este contenido — generado con `prisma migrate diff` contra una base con datos reales y verificado aplicándolo sobre una copia con los 7 ciclos, 4 docentes y 4 aulas de referencia sin errores:

```sql
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_academic_cycles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "enrollment_start_date" DATETIME NOT NULL,
    "enrollment_end_date" DATETIME NOT NULL,
    "grade_submission_deadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "academic_cycles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_academic_cycles" ("created_at", "end_date", "enrollment_end_date", "enrollment_start_date", "grade_submission_deadline", "id", "is_current", "name", "start_date", "status", "updated_at", "year", "campus_id") SELECT "created_at", "end_date", "enrollment_end_date", "enrollment_start_date", "grade_submission_deadline", "id", "is_current", "name", "start_date", "status", "updated_at", "year", 'CAMPUS-CENTRAL' FROM "academic_cycles";
DROP TABLE "academic_cycles";
ALTER TABLE "new_academic_cycles" RENAME TO "academic_cycles";
CREATE INDEX "academic_cycles_campus_id_idx" ON "academic_cycles"("campus_id");
CREATE TABLE "new_assistant_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_assistant_conversations" ("created_at", "id", "title", "updated_at", "user_id") SELECT "created_at", "id", "title", "updated_at", "user_id" FROM "assistant_conversations";
DROP TABLE "assistant_conversations";
ALTER TABLE "new_assistant_conversations" RENAME TO "assistant_conversations";
CREATE INDEX "assistant_conversations_user_id_updated_at_idx" ON "assistant_conversations"("user_id", "updated_at");
CREATE TABLE "new_classrooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "has_projector" BOOLEAN NOT NULL DEFAULT false,
    "has_air_conditioning" BOOLEAN NOT NULL DEFAULT false,
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "classrooms_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_classrooms" ("building", "capacity", "code", "created_at", "has_air_conditioning", "has_projector", "id", "status", "type", "updated_at", "campus_id") SELECT "building", "capacity", "code", "created_at", "has_air_conditioning", "has_projector", "id", "status", "type", "updated_at", 'CAMPUS-CENTRAL' FROM "classrooms";
DROP TABLE "classrooms";
ALTER TABLE "new_classrooms" RENAME TO "classrooms";
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");
CREATE INDEX "classrooms_campus_id_idx" ON "classrooms"("campus_id");
CREATE TABLE "new_curriculum_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" DATETIME NOT NULL,
    "effective_to" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "total_credits" INTEGER NOT NULL,
    "duration_semesters" INTEGER NOT NULL,
    "career_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "curriculum_plans_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "curriculum_plans_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_curriculum_plans" ("campus_id", "career_id", "code", "created_at", "duration_semesters", "effective_from", "effective_to", "id", "name", "status", "total_credits", "updated_at", "version") SELECT "campus_id", "career_id", "code", "created_at", "duration_semesters", "effective_from", "effective_to", "id", "name", "status", "total_credits", "updated_at", "version" FROM "curriculum_plans";
DROP TABLE "curriculum_plans";
ALTER TABLE "new_curriculum_plans" RENAME TO "curriculum_plans";
CREATE UNIQUE INDEX "curriculum_plans_code_key" ON "curriculum_plans"("code");
CREATE INDEX "curriculum_plans_career_id_status_idx" ON "curriculum_plans"("career_id", "status");
CREATE INDEX "curriculum_plans_campus_id_status_idx" ON "curriculum_plans"("campus_id", "status");
CREATE TABLE "new_institution_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "logo_data_url" TEXT,
    "mfa_required_roles" TEXT NOT NULL DEFAULT '["ADMIN","DOCENTE","BIBLIOTECA","PARQUEO","EVENTOS","SISTEMAS"]',
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_institution_config" ("id", "logo_data_url", "mfa_required_roles", "name", "short_name", "updated_at") SELECT "id", "logo_data_url", "mfa_required_roles", "name", "short_name", "updated_at" FROM "institution_config";
DROP TABLE "institution_config";
ALTER TABLE "new_institution_config" RENAME TO "institution_config";
CREATE TABLE "new_teachers" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "academic_degree" TEXT NOT NULL,
    "assigned_section_ids" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "max_hours_per_week" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teachers_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_teachers" ("academic_degree", "assigned_section_ids", "code", "created_at", "email", "max_hours_per_week", "name", "phone", "specialty", "status", "updated_at", "user_id", "campus_id") SELECT "academic_degree", "assigned_section_ids", "code", "created_at", "email", "max_hours_per_week", "name", "phone", "specialty", "status", "updated_at", "user_id", 'CAMPUS-CENTRAL' FROM "teachers";
DROP TABLE "teachers";
ALTER TABLE "new_teachers" RENAME TO "teachers";
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");
CREATE INDEX "teachers_campus_id_idx" ON "teachers"("campus_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Clean up the misleading campus suffix typed manually into the cycle name.
UPDATE "academic_cycles" SET "name" = 'Segundo Semestre 2026' WHERE "name" = 'Segundo Semestre 2026 · Campus Central';
```

- [ ] **Step 6: Verificar contra una base con datos reales**

```bash
rm -f /tmp/verify_campus.db
touch /tmp/verify_campus.db
DATABASE_URL="file:/tmp/verify_campus.db" DATABASE_PROVIDER=sqlite node scripts/setup-fresh-database.mjs
DATABASE_URL="file:/tmp/verify_campus.db" DATABASE_PROVIDER=sqlite npx prisma generate
DATABASE_URL="file:/tmp/verify_campus.db" DATABASE_PROVIDER=sqlite npx tsx prisma/seed.ts
```

Esto siembra datos con el esquema **anterior** (sin `campusId`). Ahora insertar el campus y aplicar la migración manualmente (simula lo que hará `prisma migrate deploy` en un entorno real):

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/verify_campus.db');
db.prepare(\"INSERT INTO campuses (id, code, name, status, created_at, updated_at) VALUES ('CAMPUS-CENTRAL','CC','Campus Central','Activo',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)\").run();
const fs = require('fs');
db.exec(fs.readFileSync('prisma/migrations/<timestamp>_add_campus_to_cycle_classroom_teacher/migration.sql', 'utf8'));
console.log('OK');
console.log(db.prepare('SELECT id, name, campus_id FROM academic_cycles').all());
console.log(db.prepare('SELECT code, campus_id FROM teachers').all());
"
rm -f /tmp/verify_campus.db
```

Expected: imprime `OK`, cada ciclo/docente tiene `campus_id = 'CAMPUS-CENTRAL'`, ningún ciclo se llama `... · Campus Central`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/<timestamp>_add_campus_to_cycle_classroom_teacher"
git commit -m "feat: agrega campus a ciclos, aulas y docentes (SQLite)"
```

---

## Task 2: Esquema y migración PostgreSQL (producción)

**Files:**
- Modify: `prisma/postgresql/schema.prisma` (regenerado, no editado a mano)
- Create: `prisma/postgresql/migrations/0012_add_campus_to_cycle_classroom_teacher/migration.sql`

**Interfaces:**
- Consumes: `prisma/schema.prisma` del Task 1 (fuente de verdad; `prisma/postgresql/schema.prisma` se regenera desde ahí).
- Produces: mismas columnas `campusId` que Task 1, aplicadas vía SQL nativo de PostgreSQL (sin table rebuild).

- [ ] **Step 1: Regenerar el schema de PostgreSQL**

```bash
npm run db:postgres:prepare
```

Esto ejecuta `scripts/prepare-postgresql-schema.mjs`, que traduce `prisma/schema.prisma` (ya editado en Task 1) a `prisma/postgresql/schema.prisma` cambiando el provider a `postgresql`. No se edita a mano.

- [ ] **Step 2: Crear la migración PostgreSQL**

Crear `prisma/postgresql/migrations/0012_add_campus_to_cycle_classroom_teacher/migration.sql` (siguiente número tras `0011_assign_curriculum_plan_campus`) con exactamente este contenido — verificado aplicándolo sobre una restauración real del dump de producción (7 ciclos, 1 docente real, sin errores):

```sql
-- AlterTable
ALTER TABLE "academic_cycles" ADD COLUMN "campus_id" TEXT;
ALTER TABLE "classrooms" ADD COLUMN "campus_id" TEXT;
ALTER TABLE "teachers" ADD COLUMN "campus_id" TEXT;

-- Backfill: only Campus Central has real activity today.
UPDATE "academic_cycles" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;
UPDATE "classrooms" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;
UPDATE "teachers" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;

-- Clean up the misleading campus suffix typed manually into the cycle name.
UPDATE "academic_cycles" SET "name" = 'Segundo Semestre 2026' WHERE "name" = 'Segundo Semestre 2026 · Campus Central';

-- Enforce NOT NULL now that every row has a value.
ALTER TABLE "academic_cycles" ALTER COLUMN "campus_id" SET NOT NULL;
ALTER TABLE "classrooms" ALTER COLUMN "campus_id" SET NOT NULL;
ALTER TABLE "teachers" ALTER COLUMN "campus_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "academic_cycles_campus_id_idx" ON "academic_cycles"("campus_id");
CREATE INDEX "classrooms_campus_id_idx" ON "classrooms"("campus_id");
CREATE INDEX "teachers_campus_id_idx" ON "teachers"("campus_id");

-- AddForeignKey
ALTER TABLE "academic_cycles" ADD CONSTRAINT "academic_cycles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

No incluir ningún cambio a `assistant_conversations` ni a `institution_config` aunque `prisma migrate diff` los reporte — son drift preexistente entre el esquema versionado y la base real, sin relación con este cambio.

- [ ] **Step 3: Verificar contra el dump real de producción**

Requiere el archivo `uspg_academico.dump` (generado previamente desde Hostinger; si no existe, pedir al usuario que indique dónde está o regenerarlo). No commitear nunca este archivo (ya está en `.gitignore` como `*.dump`).

```bash
docker run -d --name verify-campus-pg -e POSTGRES_USER=uspg -e POSTGRES_PASSWORD=verify_pw -e POSTGRES_DB=uspg_academico -p 5440:5432 postgres:17-alpine
sleep 3
docker cp uspg_academico.dump verify-campus-pg:/tmp/uspg_academico.dump
docker exec verify-campus-pg pg_restore -U uspg -d uspg_academico --no-owner --no-privileges /tmp/uspg_academico.dump
docker cp prisma/postgresql/migrations/0012_add_campus_to_cycle_classroom_teacher/migration.sql verify-campus-pg:/tmp/campus_migration.sql
docker exec verify-campus-pg psql -U uspg -d uspg_academico -f /tmp/campus_migration.sql
docker exec verify-campus-pg psql -U uspg -d uspg_academico -c "SELECT id, name, campus_id FROM academic_cycles ORDER BY start_date;"
docker exec verify-campus-pg psql -U uspg -d uspg_academico -c "SELECT code, campus_id FROM teachers;"
docker stop verify-campus-pg && docker rm verify-campus-pg
```

Expected: todos los `ALTER`/`UPDATE`/`CREATE INDEX` corren sin error; el ciclo `CYC-2026-2` se llama `Segundo Semestre 2026` sin sufijo; todos los `campus_id` son `CAMPUS-CENTRAL`.

- [ ] **Step 4: Commit**

```bash
git add prisma/postgresql/schema.prisma "prisma/postgresql/migrations/0012_add_campus_to_cycle_classroom_teacher"
git commit -m "feat: agrega campus a ciclos, aulas y docentes (PostgreSQL)"
```

---

## Task 3: Tipos de TypeScript del frontend

**Files:**
- Modify: `src/types/index.ts:42-52` (`Teacher`), `src/types/index.ts:81-92` (`AcademicCycle`), `src/types/index.ts:113-122` (`Classroom`)

**Interfaces:**
- Produces: `Teacher.campusId: string`, `AcademicCycle.campusId: string`, `Classroom.campusId: string` — usados por Tasks 6–10.

- [ ] **Step 1: Agregar `campusId` a `Teacher`**

Ubicar:

```typescript
export interface Teacher {
  code: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  academicDegree: string;
  assignedSectionIds: string[];
  status: 'Activo' | 'Inactivo';
  maxHoursPerWeek: number;
}
```

Reemplazar por:

```typescript
export interface Teacher {
  code: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  academicDegree: string;
  assignedSectionIds: string[];
  status: 'Activo' | 'Inactivo';
  maxHoursPerWeek: number;
  campusId: string;
}
```

- [ ] **Step 2: Agregar `campusId` y `campusName` a `AcademicCycle`**

Ubicar:

```typescript
export interface AcademicCycle {
  id: string;
  year: number;
  name: string; // e.g. "Primer Semestre 2026"
  startDate: string;
  endDate: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  gradeSubmissionDeadline: string;
  status: 'Planificado' | 'Inscripciones abiertas' | 'En curso' | 'Finalizado';
  isCurrent: boolean;
}
```

Reemplazar por:

```typescript
export interface AcademicCycle {
  id: string;
  year: number;
  name: string; // e.g. "Primer Semestre 2026"
  startDate: string;
  endDate: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  gradeSubmissionDeadline: string;
  status: 'Planificado' | 'Inscripciones abiertas' | 'En curso' | 'Finalizado';
  isCurrent: boolean;
  campusId: string;
  campusName?: string;
}
```

`campusName` es opcional porque solo lo llena el servidor (Task 4); el frontend nunca lo construye.

- [ ] **Step 3: Agregar `campusId` a `Classroom`**

Ubicar:

```typescript
export interface Classroom {
  id: string;
  code: string; // e.g. "AULA-102"
  building: string; // e.g. "Edificio Central"
  capacity: number;
  type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual';
  status: 'Disponible' | 'Mantenimiento' | 'Ocupada';
  hasProjector: boolean;
  hasAirConditioning: boolean;
}
```

Reemplazar por:

```typescript
export interface Classroom {
  id: string;
  code: string; // e.g. "AULA-102"
  building: string; // e.g. "Edificio Central"
  capacity: number;
  type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual';
  status: 'Disponible' | 'Mantenimiento' | 'Ocupada';
  hasProjector: boolean;
  hasAirConditioning: boolean;
  campusId: string;
}
```

- [ ] **Step 4: Verificar**

```bash
npm run lint
```

Expected: falla en varios archivos (`CyclesPage.tsx`, `TeachersPage.tsx`, `SchedulesPage.tsx`, `AppContext.tsx`) porque ahora falta `campusId` al construir estos objetos — **eso es esperado**, se resuelve en los tasks siguientes. Confirmar que los únicos errores nuevos son "Property 'campusId' is missing" en esos archivos, no otros.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: agrega campusId a los tipos AcademicCycle, Teacher y Classroom"
```

---

## Task 4: Backend — ciclo activo por campus (`academic.ts`)

**Files:**
- Modify: `src/server/routes/academic.ts:14` (`cycleView`), `src/server/routes/academic.ts:426-462` (rutas `/api/cycles`)

**Interfaces:**
- Consumes: `AcademicCycle.campusId` (Task 1/2, ya en base de datos).
- Produces: `GET /api/cycles` incluye `campusName` y `campusCode` en cada ciclo; `POST`/`PATCH /api/cycles` solo desactivan `isCurrent` de otros ciclos **del mismo campus**, y solo retiran inscripciones de estudiantes **del mismo campus** al activar un ciclo.

- [ ] **Step 1: Ampliar `cycleView` con el nombre y código del campus**

Ubicar (línea 14):

```typescript
  const cycleView = (cycle: any) => ({ ...cycle, startDate: cycle.startDate.toISOString().slice(0, 10), endDate: cycle.endDate.toISOString().slice(0, 10), enrollmentStartDate: cycle.enrollmentStartDate.toISOString().slice(0, 10), enrollmentEndDate: cycle.enrollmentEndDate.toISOString().slice(0, 10), gradeSubmissionDeadline: cycle.gradeSubmissionDeadline.toISOString().slice(0, 10) });
```

Reemplazar por:

```typescript
  const cycleView = (cycle: any) => ({ ...cycle, startDate: cycle.startDate.toISOString().slice(0, 10), endDate: cycle.endDate.toISOString().slice(0, 10), enrollmentStartDate: cycle.enrollmentStartDate.toISOString().slice(0, 10), enrollmentEndDate: cycle.enrollmentEndDate.toISOString().slice(0, 10), gradeSubmissionDeadline: cycle.gradeSubmissionDeadline.toISOString().slice(0, 10), campusName: cycle.campus?.name, campusCode: cycle.campus?.code });
```

- [ ] **Step 2: Incluir el campus en la consulta de `GET /api/cycles`**

Ubicar (línea 426):

```typescript
  app.get('/api/cycles', requireUser, async (_req, res) => res.json((await prisma.academicCycle.findMany({ orderBy: { startDate: 'desc' } })).map(cycleView)));
```

Reemplazar por:

```typescript
  app.get('/api/cycles', requireUser, async (_req, res) => res.json((await prisma.academicCycle.findMany({ orderBy: { startDate: 'desc' }, include: { campus: true } })).map(cycleView)));
```

- [ ] **Step 3: Acotar `POST /api/cycles` al campus del ciclo nuevo**

Ubicar (línea 427-437):

```typescript
  app.post('/api/cycles', requireAdmin, async (req, res) => {
    const data = req.body;
    if (new Date(data.startDate) >= new Date(data.endDate) || new Date(data.enrollmentStartDate) > new Date(data.enrollmentEndDate)) return void res.status(400).json({ message: 'Las fechas del ciclo no son válidas.' });
    const id = `CYC-${data.year}-${Date.now().toString().slice(-5)}`;
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ data: { isCurrent: false } });
      const created = await tx.academicCycle.create({ data: { ...data, id, startDate: new Date(data.startDate), endDate: new Date(data.endDate), enrollmentStartDate: new Date(data.enrollmentStartDate), enrollmentEndDate: new Date(data.enrollmentEndDate), gradeSubmissionDeadline: new Date(data.gradeSubmissionDeadline) } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CYCLE', entityId: id, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json(cycleView(cycle));
  });
```

Reemplazar por:

```typescript
  app.post('/api/cycles', requireAdmin, async (req, res) => {
    const data = req.body;
    if (new Date(data.startDate) >= new Date(data.endDate) || new Date(data.enrollmentStartDate) > new Date(data.enrollmentEndDate)) return void res.status(400).json({ message: 'Las fechas del ciclo no son válidas.' });
    if (!data.campusId) return void res.status(400).json({ message: 'Selecciona el campus del ciclo.' });
    const id = `CYC-${data.year}-${Date.now().toString().slice(-5)}`;
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ where: { campusId: data.campusId }, data: { isCurrent: false } });
      const created = await tx.academicCycle.create({ data: { ...data, id, startDate: new Date(data.startDate), endDate: new Date(data.endDate), enrollmentStartDate: new Date(data.enrollmentStartDate), enrollmentEndDate: new Date(data.enrollmentEndDate), gradeSubmissionDeadline: new Date(data.gradeSubmissionDeadline) }, include: { campus: true } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CYCLE', entityId: id, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json(cycleView(cycle));
  });
```

- [ ] **Step 4: Acotar `PATCH /api/cycles/:id` al campus del ciclo, incluyendo el retiro automático de inscripciones**

Ubicar (línea 439-462):

```typescript
  app.patch('/api/cycles/:id', requireAdmin, async (req, res) => {
    const current = await prisma.academicCycle.findUnique({ where: { id: req.params.id } });
    if (!current) return void res.status(404).json({ message: 'Ciclo no encontrado.' });
    const data = req.body;
    if (current.status === 'Finalizado') return void res.status(409).json({ message: 'Un ciclo finalizado no puede editarse.' });
    const start = data.startDate ? new Date(data.startDate) : current.startDate;
    const end = data.endDate ? new Date(data.endDate) : current.endDate;
    const enrollmentStart = data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : current.enrollmentStartDate;
    const enrollmentEnd = data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : current.enrollmentEndDate;
    const gradeDeadline = data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : current.gradeSubmissionDeadline;
    if ([start, end, enrollmentStart, enrollmentEnd, gradeDeadline].some((date) => Number.isNaN(date.getTime())) || start >= end || enrollmentStart > enrollmentEnd || gradeDeadline < end) return void res.status(400).json({ message: 'Revisa las fechas: las clases, inscripciones y límite de actas deben mantener un orden válido.' });
    if (data.status === 'Finalizado' && current.isCurrent) return void res.status(409).json({ message: 'Primero establece otro ciclo como activo antes de finalizar este ciclo.' });
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ where: { id: { not: current.id } }, data: { isCurrent: false } });
      const saved = await tx.academicCycle.update({ where: { id: current.id }, data: { ...data, id: undefined, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined, enrollmentStartDate: data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : undefined, enrollmentEndDate: data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : undefined, gradeSubmissionDeadline: data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : undefined } });
      if (data.isCurrent) {
        const openEnrollments = await tx.enrollment.findMany({ where: { status: 'Inscrito', section: { cycleId: { not: current.id }, cycle: { isCurrent: false } } }, select: { id: true } });
        if (openEnrollments.length) await tx.enrollment.updateMany({ where: { id: { in: openEnrollments.map((e) => e.id) } }, data: { status: 'Retirado' } });
      }
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'CYCLE', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ before: current.status, after: saved.status }) } });
      return saved;
    });
    res.json(cycleView(cycle));
  });
```

Reemplazar por (dos cambios: `updateMany` de desactivación acotado a `campusId: current.campusId`, y el retiro de inscripciones acotado a estudiantes de ese mismo campus):

```typescript
  app.patch('/api/cycles/:id', requireAdmin, async (req, res) => {
    const current = await prisma.academicCycle.findUnique({ where: { id: req.params.id } });
    if (!current) return void res.status(404).json({ message: 'Ciclo no encontrado.' });
    const data = req.body;
    if (current.status === 'Finalizado') return void res.status(409).json({ message: 'Un ciclo finalizado no puede editarse.' });
    const start = data.startDate ? new Date(data.startDate) : current.startDate;
    const end = data.endDate ? new Date(data.endDate) : current.endDate;
    const enrollmentStart = data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : current.enrollmentStartDate;
    const enrollmentEnd = data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : current.enrollmentEndDate;
    const gradeDeadline = data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : current.gradeSubmissionDeadline;
    if ([start, end, enrollmentStart, enrollmentEnd, gradeDeadline].some((date) => Number.isNaN(date.getTime())) || start >= end || enrollmentStart > enrollmentEnd || gradeDeadline < end) return void res.status(400).json({ message: 'Revisa las fechas: las clases, inscripciones y límite de actas deben mantener un orden válido.' });
    if (data.status === 'Finalizado' && current.isCurrent) return void res.status(409).json({ message: 'Primero establece otro ciclo como activo antes de finalizar este ciclo.' });
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ where: { id: { not: current.id }, campusId: current.campusId }, data: { isCurrent: false } });
      const saved = await tx.academicCycle.update({ where: { id: current.id }, data: { ...data, id: undefined, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined, enrollmentStartDate: data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : undefined, enrollmentEndDate: data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : undefined, gradeSubmissionDeadline: data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : undefined }, include: { campus: true } });
      if (data.isCurrent) {
        const openEnrollments = await tx.enrollment.findMany({ where: { status: 'Inscrito', student: { campusId: current.campusId }, section: { cycleId: { not: current.id }, cycle: { isCurrent: false, campusId: current.campusId } } }, select: { id: true } });
        if (openEnrollments.length) await tx.enrollment.updateMany({ where: { id: { in: openEnrollments.map((e) => e.id) } }, data: { status: 'Retirado' } });
      }
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'CYCLE', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ before: current.status, after: saved.status }) } });
      return saved;
    });
    res.json(cycleView(cycle));
  });
```

Este último cambio es una corrección de correctitud, no solo de alcance: antes de este task, activar el ciclo de un campus retiraba inscripciones de estudiantes de **cualquier** campus cuya sección no perteneciera al nuevo ciclo. Ahora solo retira inscripciones de estudiantes del mismo campus que el ciclo que se está activando.

- [ ] **Step 5: Verificar**

```bash
npm run lint
```

Expected: sin nuevos errores en `academic.ts` (los de Task 3 sobre otros archivos siguen presentes, se resuelven en tasks siguientes).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/academic.ts
git commit -m "feat: acota el ciclo activo y el retiro de inscripciones al campus correspondiente"
```

---

## Task 5: Backend — asistente académico usa el ciclo del campus del estudiante

**Files:**
- Modify: `src/server/routes/notifications.ts:122`

**Interfaces:**
- Consumes: `student.campusId` (ya existe en `Student`, disponible en la variable `student` de esa misma función).

- [ ] **Step 1: Acotar la búsqueda del ciclo actual por campus**

Ubicar (línea 122):

```typescript
      const currentCycle = await prisma.academicCycle.findFirst({ where: { isCurrent: true } });
```

Reemplazar por:

```typescript
      const currentCycle = await prisma.academicCycle.findFirst({ where: { isCurrent: true, campusId: student.campusId } });
```

Nota: en esta línea, `student` todavía no está definido — esta búsqueda ocurre **antes** de cargar el `student` completo más abajo en la misma función (`prisma.student.findUnique(...)`, unas líneas después). Verificar el orden real en el archivo: si `currentCycle` se calcula antes que `student`, mover la línea de `currentCycle` a **después** de la carga de `student`, manteniendo el resto de la función igual (varias líneas más abajo ya usan `currentCycle` para filtrar `enrollments`, así que debe seguir estando disponible en ese punto).

- [ ] **Step 2: Verificar el orden real y ajustar si hace falta**

```bash
grep -n "const currentCycle\|const student = await prisma.student.findUnique" src/server/routes/notifications.ts
```

Confirmar que la línea de `student = await prisma.student.findUnique(...)` aparece **antes** que la línea de `currentCycle`. Si no es así, reordenar (mover la declaración de `currentCycle` justo después de la de `student`, antes de su primer uso).

- [ ] **Step 3: Verificar**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/notifications.ts
git commit -m "fix: el asistente académico usa el ciclo activo del campus del estudiante"
```

---

## Task 6: Frontend — `AppContext.tsx` resuelve el ciclo por campus

**Files:**
- Modify: `src/context/AppContext.tsx:231-236` (`currentCycle`, `setCurrentCycleId`), `src/context/AppContext.tsx:299-312` (`addCycle`, `updateCycle`)

**Interfaces:**
- Consumes: `currentUser.role`, `currentUser` (necesita exponer el campus del usuario — ver Step 0), `cycles: AcademicCycle[]` (con `campusId` desde Task 3).
- Produces: `currentCycle: AcademicCycle | undefined` ahora resuelto por campus; el resto de la app (`Dashboard`, `SectionsPage`, `GradesControlPage`, etc.) sigue consumiéndolo igual, sin cambios en su forma.

- [ ] **Step 0: Confirmar si `currentUser` expone el campus del estudiante/docente**

```bash
grep -n "interface.*User\b\|campusId" src/types/index.ts src/server/routes/auth.ts | head -20
```

El objeto de sesión (`res.locals.authUser` / la respuesta de `/api/auth/me` y `/api/auth/login`) debe incluir `campusId` para que el cliente pueda resolver el ciclo correcto sin pedirle al estudiante que lo elija. Si no lo incluye:
- Ubicar en `src/server/routes/auth.ts` la función que arma el objeto `user` devuelto en login/`/me` (buscar `carnetOrCode` como referencia, ya que se arma junto a otros campos derivados de `Student`/`Teacher`).
- Agregar `campusId: student?.campusId ?? teacher?.campusId ?? null` a esa construcción.
- Agregar `campusId?: string | null` a la interfaz `User` en `src/types/index.ts` (buscar `interface User` — no confundir con el modelo Prisma `User`, es el tipo del frontend para el usuario autenticado).

- [ ] **Step 1: Cambiar la resolución de `currentCycle`**

Ubicar (línea ~231):

```typescript
  // Current Cycle
  const currentCycle = cycles.find((c) => c.isCurrent) || cycles[0];

  const setCurrentCycleId = async (id: string) => {
    if (!(await updateCycle(id, { isCurrent: true }))) return;
    showToast(`Ciclo activo cambiado a: ${cycles.find((c) => c.id === id)?.name || id}`, 'info');
  };
```

Reemplazar por:

```typescript
  // Current Cycle
  const hasFixedCampus = currentUser.role === 'ESTUDIANTE' || currentUser.role === 'DOCENTE';
  const currentCycle = hasFixedCampus
    ? cycles.find((c) => c.isCurrent && c.campusId === currentUser.campusId) || cycles.find((c) => c.campusId === currentUser.campusId) || cycles[0]
    : cycles.find((c) => c.isCurrent) || cycles[0];

  const setCurrentCycleId = async (id: string) => {
    if (!(await updateCycle(id, { isCurrent: true }))) return;
    showToast(`Ciclo activo cambiado a: ${cycles.find((c) => c.id === id)?.name || id}`, 'info');
  };
```

Para ESTUDIANTE/DOCENTE, `currentCycle` queda fijo al campus del usuario y no cambia con `setCurrentCycleId` (esa función solo la usa el selector del header, oculto para esos roles en Task 7). Para el resto de roles, el comportamiento es igual al actual: el primer ciclo marcado `isCurrent`, sin filtro de campus, y `setCurrentCycleId` sigue permitiendo cambiarlo manualmente.

- [ ] **Step 2: Acotar el reseteo local de `isCurrent` en `addCycle` al campus del ciclo creado**

Ubicar (línea ~299):

```typescript
  const addCycle = async (newCycleData: Omit<AcademicCycle, 'id'>) => {
    const response = await fetch('/api/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => result.isCurrent ? [...prev.map((cycle) => ({ ...cycle, isCurrent: false })), result] : [...prev, result]); showToast(`Ciclo ${result.name} creado correctamente`, 'success'); return true;
  };
```

Reemplazar por:

```typescript
  const addCycle = async (newCycleData: Omit<AcademicCycle, 'id'>) => {
    const response = await fetch('/api/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => result.isCurrent ? [...prev.map((cycle) => cycle.campusId === result.campusId ? { ...cycle, isCurrent: false } : cycle), result] : [...prev, result]); showToast(`Ciclo ${result.name} creado correctamente`, 'success'); return true;
  };
```

- [ ] **Step 3: Acotar el reseteo local de `isCurrent` en `updateCycle` al campus del ciclo actualizado**

Ubicar (línea ~309):

```typescript
  const updateCycle = async (id: string, cycleData: Partial<AcademicCycle>) => {
    const response = await fetch(`/api/cycles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => prev.map((cycle) => result.isCurrent ? { ...cycle, isCurrent: cycle.id === id } : cycle.id === id ? result : cycle)); showToast('Ciclo académico actualizado', 'success'); return true;
  };
```

Reemplazar por:

```typescript
  const updateCycle = async (id: string, cycleData: Partial<AcademicCycle>) => {
    const response = await fetch(`/api/cycles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => prev.map((cycle) => result.isCurrent && cycle.campusId === result.campusId ? { ...cycle, isCurrent: cycle.id === id } : cycle.id === id ? result : cycle)); showToast('Ciclo académico actualizado', 'success'); return true;
  };
```

- [ ] **Step 4: Verificar**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/server/routes/auth.ts src/types/index.ts
git commit -m "feat: resuelve el ciclo actual por el campus del usuario en sesión"
```

---

## Task 7: Frontend — `TopHeader.tsx` muestra el campus de cada ciclo

**Files:**
- Modify: `src/components/layout/TopHeader.tsx:98-132` (selector de ciclo)

**Interfaces:**
- Consumes: `currentCycle.campusName` (Task 4, ya viene del servidor en cada ciclo), `currentUser.role` (ya disponible vía `useApp()`).

- [ ] **Step 1: Reemplazar el bloque completo del selector de ciclo**

Ubicar (línea 98-132, todo el bloque "Active Cycle Selector Badge"):

```typescript
        {/* Active Cycle Selector Badge */}
        <div className="relative">
          <button
            onClick={() => setShowCycleMenu(!showCycleMenu)}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#333333] hover:border-[#800020] transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-[#800020]" />
            <span className="hidden sm:inline">{currentCycle?.name}</span>
            <span className="sm:hidden">{currentCycle?.name.split(' ')[0]}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
          </button>

          {showCycleMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-xl z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-[#7D8490] border-b border-[#E2E8F0] mb-1">
                Seleccionar Ciclo Activo
              </div>
              {cycles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCurrentCycleId(c.id);
                    setShowCycleMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    c.isCurrent ? 'bg-[#800020]/10 text-[#800020] font-bold' : 'text-[#333333] hover:bg-slate-100'
                  }`}
                >
                  <span>{c.name}</span>
                  {c.isCurrent && <Check className="h-3.5 w-3.5 text-[#800020]" />}
                </button>
              ))}
            </div>
          )}
        </div>
```

Reemplazar por (para ESTUDIANTE/DOCENTE muestra el badge fijo sin desplegable; para el resto, mismo desplegable de antes con el campus como subtítulo de cada opción):

```typescript
        {/* Active Cycle Selector Badge */}
        {(currentUser.role === 'ESTUDIANTE' || currentUser.role === 'DOCENTE') ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#333333]">
            <Calendar className="h-3.5 w-3.5 text-[#800020]" />
            <span className="hidden sm:inline">{currentCycle?.name}{currentCycle?.campusName ? ` · ${currentCycle.campusName}` : ''}</span>
            <span className="sm:hidden">{currentCycle?.name.split(' ')[0]}</span>
          </div>
        ) : (
        <div className="relative">
          <button
            onClick={() => setShowCycleMenu(!showCycleMenu)}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#333333] hover:border-[#800020] transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-[#800020]" />
            <span className="hidden sm:inline">{currentCycle?.name}{currentCycle?.campusName ? ` · ${currentCycle.campusName}` : ''}</span>
            <span className="sm:hidden">{currentCycle?.name.split(' ')[0]}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
          </button>

          {showCycleMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-xl z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-[#7D8490] border-b border-[#E2E8F0] mb-1">
                Seleccionar Ciclo Activo
              </div>
              {cycles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCurrentCycleId(c.id);
                    setShowCycleMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    c.isCurrent ? 'bg-[#800020]/10 text-[#800020] font-bold' : 'text-[#333333] hover:bg-slate-100'
                  }`}
                >
                  <span className="text-left">
                    <span className="block">{c.name}</span>
                    {c.campusName && <span className="block text-[10px] font-normal text-[#7D8490]">{c.campusName}</span>}
                  </span>
                  {c.isCurrent && <Check className="h-3.5 w-3.5 text-[#800020]" />}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
```

- [ ] **Step 2: Verificar manualmente**

```bash
npm run lint
npm run dev
```

Iniciar sesión como estudiante: confirmar que el badge de ciclo ya no es clicable y muestra el nombre + campus. Iniciar sesión como admin: confirmar que el desplegable sigue funcionando y cada opción muestra su campus debajo del nombre.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/TopHeader.tsx
git commit -m "feat: el header muestra el campus de cada ciclo y lo fija para estudiantes y docentes"
```

---

## Task 8: Frontend — selector de campus en `CyclesPage.tsx`

**Files:**
- Modify: `src/pages/CyclesPage.tsx`

**Interfaces:**
- Consumes: `GET /api/academic-structure` (endpoint existente, ya usado igual en `FinancesPage.tsx:118`), `AcademicCycle.campusId` (Task 3).

- [ ] **Step 1: Agregar el estado de campus disponibles, siguiendo el patrón de `FinancesPage.tsx`**

Ubicar el inicio del componente (línea ~17-18):

```typescript
export const CyclesPage: React.FC = () => {
  const { cycles, addCycle, updateCycle, setCurrentCycleId } = useApp();
```

Reemplazar por:

```typescript
export const CyclesPage: React.FC = () => {
  const { currentUser, cycles, addCycle, updateCycle, setCurrentCycleId } = useApp();
  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);
```

Agregar `useEffect` al import de React en la línea 1 si no está ya (verificar con `grep -n "^import React" src/pages/CyclesPage.tsx`).

- [ ] **Step 2: Agregar `campusId` al estado inicial del formulario**

Ubicar (línea ~25-33):

```typescript
  const [formData, setFormData] = useState<Omit<AcademicCycle, 'id'>>({
    year: 2026,
    name: 'Segundo Semestre 2026',
    startDate: '2026-07-13',
    endDate: '2026-11-27',
    enrollmentStartDate: '2026-06-15',
    enrollmentEndDate: '2026-07-08',
    gradeSubmissionDeadline: '2026-12-08',
    status: 'Planificado',
    isCurrent: false,
  });
```

Reemplazar por:

```typescript
  const [formData, setFormData] = useState<Omit<AcademicCycle, 'id'>>({
    year: 2026,
    name: 'Segundo Semestre 2026',
    startDate: '2026-07-13',
    endDate: '2026-11-27',
    enrollmentStartDate: '2026-06-15',
    enrollmentEndDate: '2026-07-08',
    gradeSubmissionDeadline: '2026-12-08',
    status: 'Planificado',
    isCurrent: false,
    campusId: '',
  });
```

- [ ] **Step 3: Agregar el selector de campus al formulario**

Ubicar (línea ~188-198, el campo "Nombre del Ciclo" dentro del `<form>`):

```typescript
              <div>
                <label className="block font-bold text-[#333333] mb-1">Nombre del Ciclo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Primer Semestre 2027"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>
```

Agregar inmediatamente después (antes del siguiente `<div>` de "Inicio de Inscripciones"):

```typescript
              <div>
                <label className="block font-bold text-[#333333] mb-1">Campus</label>
                <select
                  required
                  value={formData.campusId}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </div>
```

- [ ] **Step 4: Precargar `campusId` al abrir el modal de edición**

`openEdit` (línea ~57-61) ya hace `setFormData(cycle)`, spread completo del ciclo seleccionado:

```typescript
  const openEdit = (cycle: AcademicCycle) => {
    setSelectedCycle(cycle);
    setFormData(cycle);
    setShowEditModal(true);
  };
```

`campusId` queda incluido automáticamente porque `AcademicCycle` ya lo tiene (Task 3) — no requiere cambio en esta función.

- [ ] **Step 5: Verificar**

```bash
npm run lint
```

Expected: sin errores de "Property 'campusId' is missing" en `CyclesPage.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CyclesPage.tsx
git commit -m "feat: agrega selector de campus al formulario de ciclos académicos"
```

---

## Task 9: Frontend — selector de campus en `TeachersPage.tsx`

**Files:**
- Modify: `src/pages/TeachersPage.tsx`

**Interfaces:**
- Consumes: `GET /api/academic-structure` (mismo patrón que Task 8), `Teacher.campusId` (Task 3).

- [ ] **Step 1: Agregar el estado de campus disponibles**

Ubicar (línea ~25-26):

```typescript
export const TeachersPage: React.FC = () => {
  const { teachers, sections, addTeacher, updateTeacher, toggleTeacherStatus } = useApp();
```

Reemplazar por:

```typescript
export const TeachersPage: React.FC = () => {
  const { currentUser, teachers, sections, addTeacher, updateTeacher, toggleTeacherStatus } = useApp();
  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);
```

Confirmar que `useEffect` está importado (línea 1: `import React, { useState, useMemo } from 'react';` — agregar `useEffect` a esa lista).

- [ ] **Step 2: Agregar `campusId` al estado inicial del formulario y a la validación**

Ubicar (línea ~39-50):

```typescript
  const [formData, setFormData] = useState<Partial<Teacher>>({
    code: '',
    name: '',
    email: '',
    phone: '',
    specialty: '',
    academicDegree: '',
    status: 'Activo',
    maxHoursPerWeek: 20,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredTeachers = useMemo(() => {
```

Reemplazar por:

```typescript
  const [formData, setFormData] = useState<Partial<Teacher>>({
    code: '',
    name: '',
    email: '',
    phone: '',
    specialty: '',
    academicDegree: '',
    status: 'Activo',
    maxHoursPerWeek: 20,
    campusId: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredTeachers = useMemo(() => {
```

- [ ] **Step 3: Validar y enviar `campusId` al crear**

Ubicar (línea ~68-78):

```typescript
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.code?.trim()) errors.code = 'El código es obligatorio';
    if (!formData.name?.trim()) errors.name = 'El nombre es obligatorio';
    if (!formData.email?.trim()) errors.email = 'El correo es obligatorio';
    else if (!formData.email.toLowerCase().endsWith('@catedratico.uspg.edu.gt')) errors.email = 'Debe usar un correo @catedratico.uspg.edu.gt';
    if (!formData.specialty?.trim()) errors.specialty = 'La especialidad es obligatoria';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
```

Reemplazar por:

```typescript
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.code?.trim()) errors.code = 'El código es obligatorio';
    if (!formData.name?.trim()) errors.name = 'El nombre es obligatorio';
    if (!formData.email?.trim()) errors.email = 'El correo es obligatorio';
    else if (!formData.email.toLowerCase().endsWith('@catedratico.uspg.edu.gt')) errors.email = 'Debe usar un correo @catedratico.uspg.edu.gt';
    if (!formData.specialty?.trim()) errors.specialty = 'La especialidad es obligatoria';
    if (!formData.campusId) errors.campusId = 'Selecciona el campus';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
```

Ubicar (línea ~84-94):

```typescript
    const newTeacher: Teacher = {
      code: formData.code!,
      name: formData.name!,
      email: formData.email!,
      phone: formData.phone || '+502 0000-0000',
      specialty: formData.specialty!,
      academicDegree: formData.academicDegree || 'Licenciado',
      assignedSectionIds: [],
      status: 'Activo',
      maxHoursPerWeek: formData.maxHoursPerWeek || 20,
    };
```

Reemplazar por:

```typescript
    const newTeacher: Teacher = {
      code: formData.code!,
      name: formData.name!,
      email: formData.email!,
      phone: formData.phone || '+502 0000-0000',
      specialty: formData.specialty!,
      academicDegree: formData.academicDegree || 'Licenciado',
      assignedSectionIds: [],
      status: 'Activo',
      maxHoursPerWeek: formData.maxHoursPerWeek || 20,
      campusId: formData.campusId!,
    };
```

- [ ] **Step 4: Agregar el selector de campus al formulario de creación**

Ubicar (línea ~337-347, dentro del modal de creación):

```typescript
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Especialidad *</label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  placeholder="ej. Inteligencia Artificial"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.specialty && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.specialty}</p>}
              </div>
```

Agregar inmediatamente después:

```typescript
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus *</label>
                <select
                  value={formData.campusId || ''}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
                {formErrors.campusId && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.campusId}</p>}
              </div>
```

- [ ] **Step 5: Agregar el selector de campus al formulario de edición**

Ubicar (línea ~407-415, dentro del modal de edición, sin bloque de error porque ese formulario no muestra `formErrors`):

```typescript
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Especialidad</label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>
```

Agregar inmediatamente después:

```typescript
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus</label>
                <select
                  value={formData.campusId || ''}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </div>
```

- [ ] **Step 6: Precargar `campusId` al editar**

`openEdit` (línea ~110-113) ya hace `setFormData(teacher)`, spread completo del docente seleccionado:

```typescript
  const openEdit = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFormData(teacher);
    setShowEditModal(true);
  };
```

`campusId` queda incluido automáticamente porque `Teacher` ya lo tiene (Task 3) — no requiere cambio en esta función.

- [ ] **Step 7: Reiniciar `campusId` al cerrar el formulario**

Ubicar `resetForm` (línea ~120-130):

```typescript
  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      email: '',
      phone: '',
      specialty: '',
      academicDegree: '',
      status: 'Activo',
      maxHoursPerWeek: 20,
    });
    setFormErrors({});
  };
```

Reemplazar por:

```typescript
  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      email: '',
      phone: '',
      specialty: '',
      academicDegree: '',
      status: 'Activo',
      maxHoursPerWeek: 20,
      campusId: '',
    });
    setFormErrors({});
  };
```

Sin este cambio, tras crear un docente y abrir el modal de nuevo, quedaría preseleccionado el campus del docente anterior en vez de pedirlo de nuevo.

- [ ] **Step 8: Verificar**

```bash
npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/TeachersPage.tsx
git commit -m "feat: agrega selector de campus al formulario de docentes"
```

---

## Task 10: Frontend — selector de campus en `SchedulesPage.tsx` (aulas)

**Files:**
- Modify: `src/pages/SchedulesPage.tsx`

**Interfaces:**
- Consumes: `GET /api/academic-structure` (mismo patrón), `Classroom.campusId` (Task 3), `addClassroom` de `AppContext` (firma sin cambios: recibe un objeto `Classroom`-shaped, ahora con `campusId` obligatorio incluido).

- [ ] **Step 1: Agregar el estado de campus disponibles**

Ubicar el inicio del componente (buscar `export const SchedulesPage` y la desestructuración de `useApp()`):

```bash
grep -n "export const SchedulesPage\|const { currentUser" src/pages/SchedulesPage.tsx | head -5
```

Agregar junto a esa desestructuración (siguiendo el mismo patrón de Task 8/9):

```typescript
  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);
```

Confirmar que `useEffect` está importado desde `react` en este archivo; agregarlo al import si falta.

- [ ] **Step 2: Agregar `campusId` al estado `newClassroom`**

Ubicar (línea ~28-33):

```typescript
  const [newClassroom, setNewClassroom] = useState<{ code: string; building: string; capacity: number; type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual' }>({
    code: '',
    building: 'Edificio Central USPG',
    capacity: 35,
    type: 'Teórica',
  });
```

Reemplazar por:

```typescript
  const [newClassroom, setNewClassroom] = useState<{ code: string; building: string; capacity: number; type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual'; campusId: string }>({
    code: '',
    building: 'Edificio Central USPG',
    capacity: 35,
    type: 'Teórica',
    campusId: '',
  });
```

- [ ] **Step 3: Enviar `campusId` al crear el aula**

Ubicar (línea ~62-75):

```typescript
  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.code) return;

    if (!(await addClassroom({
      id: `AULA-${Date.now()}`,
      code: newClassroom.code,
      building: newClassroom.building,
      capacity: newClassroom.capacity,
      type: newClassroom.type,
      status: 'Disponible',
      hasProjector: false,
      hasAirConditioning: false,
    }))) return;

    setShowAddClassroomModal(false);
  };
```

Reemplazar por:

```typescript
  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.code || !newClassroom.campusId) return;

    if (!(await addClassroom({
      id: `AULA-${Date.now()}`,
      code: newClassroom.code,
      building: newClassroom.building,
      capacity: newClassroom.capacity,
      type: newClassroom.type,
      status: 'Disponible',
      hasProjector: false,
      hasAirConditioning: false,
      campusId: newClassroom.campusId,
    }))) return;

    setShowAddClassroomModal(false);
  };
```

- [ ] **Step 4: Agregar el selector de campus al formulario del modal**

Ubicar (línea ~267-277, el campo "Edificio / Módulo"):

```typescript
            <div>
              <label className="block font-bold text-[#333333] mb-1">Edificio / Módulo</label>
              <input
                type="text"
                value={newClassroom.building}
                onChange={(e) => setNewClassroom({ ...newClassroom, building: e.target.value })}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
              />
            </div>
```

Agregar inmediatamente después:

```typescript
            <div>
              <label className="block font-bold text-[#333333] mb-1">Campus *</label>
              <select
                required
                value={newClassroom.campusId}
                onChange={(e) => setNewClassroom({ ...newClassroom, campusId: e.target.value })}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
              >
                <option value="">Selecciona campus</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </select>
            </div>
```

- [ ] **Step 5: Verificar**

```bash
npm run lint
```

Expected: cero errores de tipo en todo el proyecto (última pieza que faltaba desde Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/pages/SchedulesPage.tsx
git commit -m "feat: agrega selector de campus al formulario de aulas"
```

---

## Task 11: Script de verificación de integración y regresión final

**Files:**
- Create: `scripts/test-campus-cycles.mjs`
- Modify: `package.json` (nuevo script `test:campus-cycles`)

**Interfaces:**
- Consumes: servidor real corriendo en `http://127.0.0.1:3000` (o `TEST_BASE_URL`), credenciales de un usuario ADMIN (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`), mismo patrón que `scripts/test-roles.mjs`.

- [ ] **Step 1: Escribir el script de integración**

Crear `scripts/test-campus-cycles.mjs`:

```javascript
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const email = process.env.TEST_ADMIN_EMAIL || 'admin@administrador.uspg.edu.gt';
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password) {
  console.log('SKIP Ciclos por campus: configura TEST_ADMIN_PASSWORD para ejecutar el flujo contra datos reales.');
  process.exit(0);
}

const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password }) });
assert.equal(login.status, 200, 'Login de administrador debe funcionar');
const cookie = login.headers.get('set-cookie');

const structureResponse = await fetch(`${baseUrl}/api/academic-structure`, { headers: { Cookie: cookie } });
assert.equal(structureResponse.status, 200);
const { campuses } = await structureResponse.json();
assert.ok(campuses.length >= 1, 'Debe existir al menos un campus');
const centralCampus = campuses.find((campus) => campus.code === 'CC') || campuses[0];

const cyclesResponse = await fetch(`${baseUrl}/api/cycles`, { headers: { Cookie: cookie } });
assert.equal(cyclesResponse.status, 200);
const cycles = await cyclesResponse.json();
assert.ok(cycles.length > 0, 'Deben existir ciclos');
for (const cycle of cycles) {
  assert.ok(cycle.campusId, `El ciclo ${cycle.id} debe tener campusId`);
  assert.ok(!cycle.name.includes('·'), `El nombre del ciclo ${cycle.id} no debe incluir el campus incrustado`);
}

const createResponse = await fetch(`${baseUrl}/api/cycles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    year: 2099, name: 'Ciclo de prueba QA', campusId: centralCampus.id,
    startDate: '2099-01-10', endDate: '2099-05-30',
    enrollmentStartDate: '2099-01-01', enrollmentEndDate: '2099-01-09',
    gradeSubmissionDeadline: '2099-06-05', status: 'Planificado', isCurrent: false,
  }),
});
assert.equal(createResponse.status, 201, 'Crear un ciclo nuevo con campusId debe funcionar');
const created = await createResponse.json();
assert.equal(created.campusId, centralCampus.id);
assert.equal(created.campusName, centralCampus.name);

const missingCampusResponse = await fetch(`${baseUrl}/api/cycles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    year: 2099, name: 'Ciclo sin campus QA',
    startDate: '2099-01-10', endDate: '2099-05-30',
    enrollmentStartDate: '2099-01-01', enrollmentEndDate: '2099-01-09',
    gradeSubmissionDeadline: '2099-06-05', status: 'Planificado', isCurrent: false,
  }),
});
assert.equal(missingCampusResponse.status, 400, 'Crear un ciclo sin campusId debe rechazarse');

await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
console.log('PASS Ciclos por campus: listado con campus, nombre sin sufijo incrustado, creación con y sin campus.');
```

- [ ] **Step 2: Registrar el script en `package.json`**

Ubicar (buscar `"test:assistant"` en la sección `scripts`):

```bash
grep -n '"test:assistant"' package.json
```

Agregar inmediatamente después de esa línea:

```json
    "test:campus-cycles": "node scripts/test-campus-cycles.mjs",
```

- [ ] **Step 3: Ejecutar el script contra una copia local con datos reales**

```bash
docker run -d --name final-verify-pg -e POSTGRES_USER=uspg -e POSTGRES_PASSWORD=verify_pw -e POSTGRES_DB=uspg_academico -p 5441:5432 postgres:17-alpine
sleep 3
docker cp uspg_academico.dump final-verify-pg:/tmp/uspg_academico.dump
docker exec final-verify-pg pg_restore -U uspg -d uspg_academico --no-owner --no-privileges /tmp/uspg_academico.dump
docker cp prisma/postgresql/migrations/0012_add_campus_to_cycle_classroom_teacher/migration.sql final-verify-pg:/tmp/campus_migration.sql
docker exec final-verify-pg psql -U uspg -d uspg_academico -f /tmp/campus_migration.sql
DATABASE_URL="postgresql://uspg:verify_pw@localhost:5441/uspg_academico" DATABASE_PROVIDER=postgresql npm run db:postgres:generate
```

Fijar una contraseña conocida para el admin (mismo patrón usado en verificaciones anteriores de esta conversación):

```bash
node -e "
const { scryptSync, randomBytes } = require('crypto');
const salt = randomBytes(16).toString('hex');
console.log(salt + ':' + scryptSync('VerifyLocal#2026', salt, 64).toString('hex'));
"
```

Copiar el hash resultante y ejecutar (reemplazando `<HASH>`):

```bash
docker exec final-verify-pg psql -U uspg -d uspg_academico -c "UPDATE users SET password_hash = '<HASH>' WHERE email = 'admin@administrador.uspg.edu.gt';"
```

Levantar el servidor y correr el script:

```bash
DATABASE_URL="postgresql://uspg:verify_pw@localhost:5441/uspg_academico" DATABASE_PROVIDER=postgresql APP_URL="http://localhost:3000" PARKING_QR_SECRET="3a97cad9443d461abf18ca5da084f9d55aab065416488540d84634b61b047707" MFA_ENCRYPTION_KEY="AVlNHL6wSDV5B0cn8bluoTVeId6VL0EKikNnQku0uvs=" nohup npm run dev > /tmp/final-verify.log 2>&1 &
sleep 5
TEST_BASE_URL="http://127.0.0.1:3000" TEST_ADMIN_PASSWORD="VerifyLocal#2026" npm run test:campus-cycles
```

Expected: `PASS Ciclos por campus: ...`.

- [ ] **Step 4: Correr toda la batería de regresión existente**

```bash
npm run lint
TEST_BASE_URL="http://127.0.0.1:3000" TEST_ADMIN_PASSWORD="VerifyLocal#2026" npm run test:roles
npm run test:assistant
```

Expected: los tres pasan sin fallos. `test:roles` confirma que no se rompió ningún permiso por rol al tocar `academic.ts`; `test:assistant` confirma que el cambio de `notifications.ts` (Task 5) no rompió el contrato del asistente.

- [ ] **Step 5: Limpiar el entorno de verificación**

```bash
pkill -f "tsx server.ts"
docker stop final-verify-pg && docker rm final-verify-pg
rm -f /tmp/final-verify.log
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test-campus-cycles.mjs package.json
git commit -m "test: agrega verificación de integración para ciclos por campus"
```

---

## Nota sobre trabajo pendiente previo

Antes de este plan, quedaron sin commitear (y sin relación con este feature): paginación en Historial Académico, certificación en PDF, y la corrección de elegibilidad de recuperaciones (`Pagination.tsx`, `AcademicHistoryPage.tsx`, `grades.ts`, `notifications.ts`). Confirmar con el usuario si se commitean por separado antes o después de ejecutar este plan, para no mezclar ambos cambios en el mismo commit.
