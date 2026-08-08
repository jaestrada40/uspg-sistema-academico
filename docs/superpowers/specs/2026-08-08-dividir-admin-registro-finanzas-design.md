# Dividir ADMIN en Registro Académico y Administración Financiera

## Contexto y disparador

Tras aliviar a ADMIN de Biblioteca/Parqueo/Eventos ([[2026-08-07-aliviar-admin-modulos-operativos-design]]),
ADMIN sigue siendo dueño único de todo el bloque académico-administrativo: ~19 módulos
académicos (estudiantes, docentes, cursos, ciclos, secciones, notas, asistencia, etc.) más
Pagos y Solvencias. El dueño del sistema quiere separar el día a día académico del
financiero en dos roles operativos nuevos, manteniendo ADMIN como super-rol para casos
excepcionales.

Este es el primero de tres proyectos relacionados:
1. **Este documento** — dividir ADMIN en `REGISTRO` y `FINANZAS`.
2. *(futuro)* Reportes financieros — vista nueva de ingresos/morosidad dentro de Financiero.
3. *(futuro)* Flujo de solicitud/aprobación entre `REGISTRO` y `FINANZAS` para pedirse
   información puntual sin acceso directo permanente.

Los proyectos 2 y 3 dependen de que los roles de este documento existan, pero no se
diseñan ni implementan aquí.

## Alcance

**Dentro de alcance:**
- Dos roles nuevos: `REGISTRO` (Registro Académico) y `FINANZAS` (Administración
  Financiera), agregados a `UserRole` junto a los siete roles existentes.
- Dominios de correo `@registro.uspg.edu.gt` y `@finanzas.uspg.edu.gt`, mapeados en
  `roleFromEmail` (`server.ts`).
- Ambos roles se agregan a `defaultMfaRequiredRoles` (MFA obligatorio, igual que ADMIN,
  DOCENTE, BIBLIOTECA, PARQUEO, EVENTOS, SISTEMAS).
- Reasignación de middlewares backend y `RoleGuard`/`Sidebar.tsx` frontend para los
  módulos académicos (→ `REGISTRO`) y Pagos y Solvencias (→ `FINANZAS`), agregando el rol
  nuevo junto a `ADMIN` en cada caso (ADMIN nunca pierde acceso, es super-rol).
- Cuentas demo `REGISTRO`/`FINANZAS` en `prisma/seed.ts`, contraseña `Demo123!`, igual que
  las de Biblioteca/Parqueo/Eventos.
- Extensión de `scripts/test-role-access.mjs` con casos para los dos roles nuevos.

**Fuera de alcance:**
- Reportes financieros (proyecto 2) — Pagos y Solvencias pasa a `FINANZAS` tal cual existe
  hoy, sin construir vistas nuevas.
- Flujo de solicitud/aprobación entre roles (proyecto 3).
- "Usuarios y Seguridad" y toda gestión de cuentas (`/api/admin/users*`, `/api/users`),
  configuración de política MFA (`/api/security/mfa-policy`), y las rutas de alta de staff
  de Biblioteca/Parqueo/Eventos (`/api/library/staff`, `/api/parking/staff`) — se quedan
  exclusivamente en ADMIN, sin cambios. Ninguno de los dos roles nuevos gestiona usuarios.
- No se modifica el modelo de datos ni se agregan migraciones de Prisma — `role` ya es un
  `String` libre en el esquema (validado a nivel de aplicación vía `UserRole` y arreglos de
  roles), no un enum de base de datos.
- No se toca `SISTEMAS`, `DOCENTE`, `ESTUDIANTE`, `BIBLIOTECA`, `PARQUEO`, `EVENTOS` — sin
  cambios en sus permisos.

## Reparto de módulos

| Módulo / dominio | Dueño nuevo |
|---|---|
| Estudiantes, Docentes, Carreras, Cursos y Prerrequisitos, Organizar Pensum, Ciclos Académicos, Campus y Planes, Aulas | `REGISTRO` |
| Secciones, Inscripción de Cursos, Control de Notas, Control de Asistencia, Recuperaciones, Actividades de Zona, Horarios y Aulas, Historial Académico | `REGISTRO` |
| Solicitudes y Trámites, Expediente, Plan de Estudios, Mi Avance Académico, Notificaciones (difusión), Reportes Académicos | `REGISTRO` |
| Institución, Parámetros, Auditoría, Aulas (`/api/institution`, `/api/parameters`, `/api/academic-parameters`, `/api/audit-logs`, `/api/classrooms`) | `REGISTRO` |
| Pagos y Solvencias | `FINANZAS` |
| Usuarios y Seguridad, política MFA, alta de cuentas Biblioteca/Parqueo/Eventos | Solo `ADMIN` (sin cambios) |

El reparto es intencionalmente desbalanceado (`REGISTRO` ≈ 19 módulos, `FINANZAS` = 1):
refleja que el sistema es fundamentalmente académico con un módulo financiero acotado. No
se fuerzan módulos académicos hacia `FINANZAS` solo por equilibrar.

## Backend — nuevos middlewares

En `src/server/middleware/auth.ts`, junto a `requireAdmin`/`requireLibraryStaff`/
`requireParkingStaff`/`requireSystems` existentes, se agregan dos middlewares nuevos con el
mismo patrón:

```ts
const requireRegistro: express.RequestHandler = (_req, res, next) =>
  ['ADMIN', 'REGISTRO'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Registro Académico.' });

const requireFinance: express.RequestHandler = (_req, res, next) =>
  ['ADMIN', 'FINANZAS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Administración Financiera.' });
```

Aplicación por archivo:

- **`src/server/routes/finance.ts`** — todas las rutas que hoy usan `requireAdmin` cambian
  a `requireFinance`. Las rutas `requireUser` sin restricción de rol (ej. `GET
  /api/finances` para que el propio estudiante consulte su saldo) no cambian.
- **`src/server/routes/academic.ts`, `src/server/routes/grades.ts`,
  `src/server/routes/notifications.ts`, `src/server/routes/reports.ts`** — todas las rutas
  que hoy usan `requireAdmin` cambian a `requireRegistro`.
- **`src/server/routes/admin.ts`** — ruta por ruta:
  - `GET/POST /api/admin/users*`, `GET /api/users` → se quedan en `requireAdmin` (sin
    cambio).
  - `PUT /api/institution`, `GET /api/parameters`, `GET /api/academic-parameters`, `GET
    /api/audit-logs`, `GET/POST/PATCH /api/classrooms*` → cambian a `requireRegistro`.
- **`src/server/routes/library.ts`, `src/server/routes/parking.ts`,
  `src/server/routes/auth.ts`** — sin cambios (ya se quedan en `requireAdmin` puro por el
  proyecto anterior: alta de staff y política MFA).

## Frontend

- **`src/components/layout/Sidebar.tsx`** — cada ítem de navegación de los módulos listados
  en "Reparto de módulos" gana `'REGISTRO'` (o `'FINANZAS'` para Pagos) en su arreglo
  `roles`, sin quitar `'ADMIN'`.
- **`RoleGuard`** en cada página correspondiente — mismo criterio: se agrega el rol nuevo,
  `'ADMIN'` se mantiene.
- No se tocan los checks inline `currentUser.role === 'ADMIN'` que sean específicamente de
  gestión de usuarios (fuera de alcance); los que sean de acceso a datos académicos o
  financieros en general deben extenderse para incluir también `REGISTRO`/`FINANZAS` según
  corresponda — se detallan en el plan de implementación, no aquí.

## Datos demo y pruebas

- `prisma/seed.ts` — agregar un usuario `REGISTRO` (ej. `email: 'coordinacion@registro.uspg.edu.gt'`)
  y uno `FINANZAS` (ej. `email: 'tesoreria@finanzas.uspg.edu.gt'`), contraseña `Demo123!`,
  siguiendo el mismo patrón que los usuarios `BIBLIOTECA`/`PARQUEO`/`EVENTOS` ya seedeados.
- `scripts/test-role-access.mjs` — agregar cuentas `REGISTRO`/`FINANZAS` al mapa `accounts`
  y casos de prueba: acceso permitido a su propio dominio (ej. `REGISTRO` → `GET
  /api/students: 200`), acceso denegado al dominio del otro (ej. `REGISTRO` → `GET
  /api/finances/career-fees: 403`, `FINANZAS` → `GET /api/students: 403` si aplica una
  ruta académica protegida por `requireRegistro`), y confirmar que `ADMIN` sigue con 200 en
  ambos dominios (super-rol, sin regresión).
- `server.ts` — agregar `REGISTRO`/`FINANZAS` al arreglo `defaultMfaRequiredRoles` y a los
  `allowedRoles`/`availableRoles` usados en `admin.ts`/`auth.ts` para que aparezcan como
  opción al crear usuarios y en la política de MFA.

## Pruebas

- Backend: `npm run test:roles` extendido, cubriendo los nuevos casos anteriores.
- Frontend: verificación manual (no hay framework de pruebas de frontend en este repo) —
  sesión `REGISTRO` ve solo sus ~19 módulos + Perfil; sesión `FINANZAS` ve solo Pagos y
  Solvencias + Perfil; sesión `ADMIN` sigue viendo todo (excepto Biblioteca/Parqueo/Eventos,
  ya removidos en el proyecto anterior).
- `npx tsc --noEmit` limpio.
