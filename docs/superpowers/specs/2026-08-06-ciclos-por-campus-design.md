# Ciclos académicos por campus

## Contexto y disparador

El ciclo académico activo en producción se llama `Segundo Semestre 2026 · Campus Central`,
con el nombre del campus incrustado manualmente en el texto. Es engañoso: en el modelo de
datos actual, `AcademicCycle` es global (sin `campusId`) y ese mismo ciclo aplica también a
los estudiantes de Campus Escuintla, aunque el nombre sugiera lo contrario. Los 6 ciclos
históricos anteriores (2022–2026) no tienen ningún sufijo de campus.

El dueño del sistema quiere que los ciclos sean realmente específicos por campus: cada campus
puede tener sus propias fechas de inscripción, inicio/fin de clases y fecha límite de notas.

## Alcance de "ciclo por campus"

- **Fechas distintas por campus.** Un ciclo pertenece a un único campus.
- **No** se separan secciones, inscripciones, notas ni asistencia por campus en esta fase.
  El campus de una sección se infiere transitivamente a través de `section.cycle.campusId`.
- Un docente pertenece a un único campus (no da clases en más de un campus a la vez).
- Un aula (`Classroom`) pertenece a un único campus.

## Modelo de datos

Cambios sobre `prisma/schema.prisma` (y su espejo en `prisma/postgresql/schema.prisma`,
regenerado por `scripts/prepare-postgresql-schema.mjs`):

- `AcademicCycle.campusId String` (obligatorio, FK a `Campus`, `onDelete: Restrict`).
- `Classroom.campusId String` (obligatorio, FK a `Campus`, `onDelete: Restrict`).
- `Teacher.campusId String` (obligatorio, FK a `Campus`, `onDelete: Restrict`).
- `Student.campusId` y `CurriculumPlan.campusId`: sin cambios, ya existen.
- `Section`: sin campo de campus propio.

### Regla de unicidad de "ciclo activo"

Hoy existe como máximo un `AcademicCycle` con `isCurrent = true` en todo el sistema. Pasa a
ser: como máximo un `isCurrent = true` **por campus**. No se modela como constraint de base
de datos (evita complejidad de índice parcial multi-motor SQLite/Postgres); se aplica a nivel
de aplicación, igual que hoy.

## Migración

Backfill en dos pasos (mismo patrón que usa el resto de migraciones del proyecto: agregar
columna opcional, rellenar datos, endurecer a obligatoria), **una migración para SQLite en
`prisma/migrations/` y su equivalente numerado en `prisma/postgresql/migrations/`**:

1. Agregar `campus_id` opcional a `academic_cycles`, `classrooms`, `teachers`.
2. `UPDATE` de las tres tablas: asignar el `id` de Campus Central (`CAMPUS-CENTRAL`) a todas
   las filas existentes.
3. Alterar las tres columnas a `NOT NULL`.
4. `UPDATE academic_cycles SET name = 'Segundo Semestre 2026' WHERE id = 'CYC-2026-2'`
   (quita el sufijo `· Campus Central` incrustado).

Esta migración es segura para producción: no borra datos, solo agrega columnas con backfill
determinista. Se verifica igual que las demás (`npm run db:setup` para SQLite fresco,
`db:postgres:migrate:deploy` para producción).

## Resolución de "ciclo actual" por rol

Hoy `AppContext.tsx` calcula un único `currentCycle` global:
`cycles.find(c => c.isCurrent) || cycles[0]`, consumido por casi toda la app (Dashboard,
Secciones, Notas, Inscripciones, Asistente académico).

Pasa a resolverse así:

- **Estudiante**: el ciclo con `isCurrent = true` cuyo `campusId` coincide con
  `student.campusId`. Se resuelve tanto en cliente (`AppContext`) como en servidor en cada
  endpoint que hoy hace `academicCycle.findFirst({ where: { isCurrent: true } })` sin filtro
  de campus (ej. el asistente académico en `notifications.ts`).
- **Docente**: igual, usando `teacher.campusId`.
- **Administración / Sistemas / Biblioteca / Parqueo / Eventos** (roles sin campus fijo):
  el selector del header lista todos los ciclos con `isCurrent = true` (uno por campus,
  potencialmente varios a la vez), cada uno mostrando su campus como etiqueta separada
  (ej. "Segundo Semestre 2026 — Central" / "Segundo Semestre 2026 — Escuintla"), y eligen
  manualmente cuál ven. El nombre del ciclo en base de datos vuelve a ser limpio, sin
  incrustar el campus como texto; el campus se muestra como badge/etiqueta en la UI, nunca
  concatenado al nombre.

## Cambios de código (checklist de impacto)

- `prisma/schema.prisma` + `prisma/postgresql/schema.prisma`: nuevos campos `campusId`.
- Migraciones nuevas (SQLite y Postgres) con el backfill descrito arriba.
- `src/context/AppContext.tsx`: `currentCycle` pasa a depender del rol/campus del usuario en
  sesión; para roles sin campus fijo, se mantiene la selección manual actual
  (`setCurrentCycleId`), pero ahora sobre un conjunto de ciclos potencialmente multi-campus.
- `src/server/routes/academic.ts`: al marcar un ciclo como `isCurrent = true`
  (`updateMany({ data: { isCurrent: false } })`), el `updateMany` que desactiva otros ciclos
  se acota a `where: { campusId: <mismo campus> }` en vez de desactivar todos los ciclos del
  sistema.
- `src/server/routes/notifications.ts` (asistente académico): el `academicCycle.findFirst`
  de la rama `ESTUDIANTE` agrega `campusId: student.campusId`.
- `src/components/layout/TopHeader.tsx`: el dropdown de ciclo agrega la etiqueta de campus
  junto a cada opción cuando hay más de un ciclo activo simultáneo.
- `src/pages/CyclesPage.tsx`: formulario de creación/edición de ciclo agrega selector de
  campus (obligatorio).
- `src/pages/TeachersPage.tsx`: formulario de docente agrega selector de campus (obligatorio).
- `src/pages/SchedulesPage.tsx`: el formulario de "nueva aula" (`addClassroom`) agrega
  selector de campus (obligatorio); es donde hoy se gestionan las aulas, no hay pantalla
  separada de "Aulas".
- `src/types/index.ts`: tipos `AcademicCycle`, `Teacher`, `Classroom` agregan `campusId`.

## Fuera de alcance

- Separar secciones, inscripciones, notas o asistencia por campus de forma explícita
  (campo propio en esas tablas). El campus se infiere vía el ciclo.
- Docentes que imparten clases en más de un campus simultáneamente.
- Cambiar la lógica de generación de matrícula/cuotas (`finance.ts`), que ya acepta
  `campusId` y `cycleId` como filtros independientes; queda igual, sin agregar validación
  cruzada entre ambos en esta fase.

## Plan de datos existentes

- Los 7 ciclos históricos (incluido el actual `CYC-2026-2`, renombrado) se asignan a
  `CAMPUS-CENTRAL`. Es un valor por defecto de la migración, no una restricción futura: desde
  la pantalla de Ciclos Académicos se puede reasignar cualquier ciclo (histórico o nuevo) al
  campus que corresponda, incluido Escuintla u otro campus que se cree después.
- El único docente real (`DOC-1042`, Luis Mena) y las aulas existentes se asignan a
  `CAMPUS-CENTRAL`, reflejando que es el único campus con actividad real hoy.
