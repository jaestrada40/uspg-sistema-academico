# Aliviar a ADMIN de módulos operativos delegados

## Contexto y disparador

Auditoría de roles del sistema (`src/types/index.ts`, `Sidebar.tsx`) mostró que `ADMIN`
tiene acceso a los 27 módulos del sistema, incluyendo tres que ya cuentan con un rol
operativo dedicado: `BIBLIOTECA`, `PARQUEO` y `EVENTOS`. Esto satura a ADMIN con tareas
del día a día (préstamos, control de acceso vehicular, gestión de eventos) que no le
corresponden — esos roles existen precisamente para asumir esa carga.

El dueño del sistema decidió: ADMIN deja de operar Biblioteca, Parqueo y Eventos, tanto en
la interfaz como en el backend. Sigue creando las cuentas de usuario para esos roles (eso
es aprovisionamiento, vive en "Usuarios y Seguridad" / "Docentes"), pero no opera los
módulos.

## Alcance

**Dentro de alcance:**
- Backend: los middlewares `requireLibraryStaff` y `requireParkingStaff` dejan de aceptar
  `ADMIN`.
- Frontend: `Sidebar.tsx` deja de mostrar Biblioteca, Parqueo y Gestión de Eventos a ADMIN.
- Frontend: `RoleGuard` de `LibraryPage.tsx`, `ParkingPage.tsx` y `EventsPage.tsx` deja de
  aceptar `ADMIN` — un ADMIN que entre por URL directa ve la pantalla de "Acceso
  Restringido", no el módulo.
- Frontend: los checks inline `currentUser.role === 'ADMIN'` que condicionan botones de
  gestión dentro de esas tres páginas (crear usuario operativo, configurar aforo, gestionar
  evento, etc.) se eliminan junto con el `RoleGuard`, para no dejar código muerto.

**Fuera de alcance:**
- Creación de cuentas `BIBLIOTECA`/`PARQUEO`/`EVENTOS` (`admin.ts`, `parking.ts` rutas de
  alta de staff) — ADMIN conserva esa capacidad, es gestión de usuarios, no operación del
  módulo.
- El módulo "Operación de Sistemas" (rol `SISTEMAS`) — no forma parte de este alivio, ya
  estaba aislado de ADMIN.
- No se crean sub-roles nuevos dentro del bloque académico-administrativo (matrículas,
  notas, pagos, reportes) — eso quedó descartado en la conversación de diseño; ADMIN sigue
  siendo dueño único de esa parte.
- No se toca `EventsPage.tsx` más allá de quitarle acceso a ADMIN — la página no tiene
  backend propio (aún es una vista sin endpoints reales) y eso no cambia en este trabajo.

## Cambios por capa

### 1. Backend — `src/server/middleware/auth.ts`

```ts
// antes
const requireLibraryStaff = (...) => ['ADMIN', 'BIBLIOTECA'].includes(role) ? next() : 403;
const requireParkingStaff = (...) => ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(role) ? next() : 403;

// después
const requireLibraryStaff = (...) => ['BIBLIOTECA'].includes(role) ? next() : 403;
const requireParkingStaff = (...) => ['PARQUEO', 'EVENTOS'].includes(role) ? next() : 403;
```

Esto bloquea automáticamente a ADMIN en todas las rutas de `library.ts` y `parking.ts` que
usan estos middlewares (préstamos, reservas, control de acceso vehicular, configuración de
aforo, alta de eventos operativos, etc.).

### 2. Frontend — `src/components/layout/Sidebar.tsx`

Quitar `'ADMIN'` del arreglo `roles` de los ítems `biblioteca`, `parqueo` y `eventos`.
El resto de los roles de esos ítems no cambia (`DOCENTE`/`ESTUDIANTE` siguen viendo
Biblioteca y Parqueo en modo consulta; `EVENTOS` sigue viendo Parqueo).

### 3. Frontend — `src/pages/LibraryPage.tsx`

- `RoleGuard allowedRoles={['ADMIN', 'BIBLIOTECA', 'ESTUDIANTE', 'DOCENTE']}` →
  `['BIBLIOTECA', 'ESTUDIANTE', 'DOCENTE']`.
- `staff = currentUser.role === 'ADMIN' || currentUser.role === 'BIBLIOTECA'` →
  `staff = currentUser.role === 'BIBLIOTECA'`.
- Botón "Usuario biblioteca" (`currentUser.role === 'ADMIN' && ...`) se elimina.

### 4. Frontend — `src/pages/ParkingPage.tsx`

- `RoleGuard allowedRoles={['ADMIN', 'PARQUEO', 'EVENTOS', 'ESTUDIANTE', 'DOCENTE']}` →
  `['PARQUEO', 'EVENTOS', 'ESTUDIANTE', 'DOCENTE']`.
- `staff = ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(currentUser.role)` →
  `['PARQUEO', 'EVENTOS'].includes(currentUser.role)`.
- Todos los checks puntuales `currentUser.role === 'ADMIN'` (botón "Aforo", botón "Usuario
  operativo", panel `CONFIG`) y las listas `['ADMIN', 'EVENTOS', 'PARQUEO']` /
  `['ADMIN','PARQUEO']` pierden `'ADMIN'`.

### 5. Frontend — `src/pages/EventsPage.tsx`

- `RoleGuard allowedRoles={['ADMIN', 'EVENTOS']}` → `['EVENTOS']`.

## Qué NO cambia

- `admin.ts`, rutas de creación de cuentas en `parking.ts` (`role: { in: ['PARQUEO',
  'EVENTOS'] }` para provisión de staff) — siguen usando `requireAdmin` sin modificación.
- Modelo de datos, migraciones de Prisma — este trabajo es solo de control de acceso en
  rutas/UI, no toca el esquema.
- Roles `DOCENTE`, `ESTUDIANTE`, `SISTEMAS` — sin cambios.

## Pruebas

- **Backend:** llamar directamente (curl/supertest) a un endpoint de `library.ts` y otro de
  `parking.ts` autenticado como `ADMIN` → esperar `403`. Repetir como `BIBLIOTECA`/
  `PARQUEO`/`EVENTOS` → esperar éxito, sin regresión.
- **Frontend:** con sesión ADMIN, confirmar que Biblioteca/Parqueo/Eventos ya no aparecen en
  el sidebar y que navegar a `/biblioteca`, `/parqueo`, `/eventos` por URL directa muestra
  "Acceso Restringido".
- **Regresión:** confirmar que BIBLIOTECA, PARQUEO, EVENTOS, DOCENTE y ESTUDIANTE conservan
  exactamente el mismo comportamiento que tenían antes en esos tres módulos.
