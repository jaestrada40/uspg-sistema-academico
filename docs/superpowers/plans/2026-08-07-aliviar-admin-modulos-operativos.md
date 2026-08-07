# Aliviar a ADMIN de módulos operativos delegados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN deja de operar Biblioteca, Parqueo y Eventos (en backend y en UI); conserva
solo lo académico-administrativo. Las tres acciones puramente administrativas que vivían
dentro de esos módulos (crear cuenta Biblioteca, crear cuenta Parqueo/Eventos, configurar
aforo) se resuelven así: las dos de creación de cuenta ya existen de forma genérica en
"Usuarios y Seguridad" (`/api/admin/users` con selector de rol), así que los botones
duplicados dentro de Biblioteca/Parqueo se eliminan sin pérdida de funcionalidad; la
configuración de aforo no tiene equivalente en otro lugar, así que se migra a "Usuarios y
Seguridad".

**Architecture:** Cambio de control de acceso en tres capas: middlewares Express
(`requireLibraryStaff`, `requireParkingStaff`), navegación (`Sidebar.tsx`), y guardas de
página (`RoleGuard` + checks inline `currentUser.role === 'ADMIN'`) en `LibraryPage.tsx`,
`ParkingPage.tsx`, `EventsPage.tsx`. La única pieza nueva de UI es un formulario de aforo en
`UsersPage.tsx` que reutiliza el endpoint `PATCH /api/parking/config` sin modificarlo.

**Tech Stack:** Express + Prisma (backend), React + TypeScript (frontend), scripts Node
sueltos como pruebas de integración contra un servidor corriendo (`scripts/test-role-access.mjs`).

## Global Constraints

- No se modifica el modelo de datos ni migraciones de Prisma.
- No se tocan las rutas de creación de cuentas (`requireAdmin` en `admin.ts`,
  `POST /api/library/staff`, `POST /api/parking/staff`) — quedan intactas en el backend,
  solo se elimina la UI duplicada que las disparaba desde dentro de Biblioteca/Parqueo.
- No se crean sub-roles nuevos. No se toca `SISTEMAS`, `DOCENTE`, `ESTUDIANTE`.
- Estilo del código existente: componentes en un solo archivo grande, JSX en línea sin
  extraer subcomponentes — seguir el mismo patrón, no refactorizar más allá de lo pedido.
- Este repo no tiene framework de pruebas de frontend (sin vitest/jest/testing-library).
  La verificación de frontend es `npx tsc --noEmit` + verificación manual en navegador.
- Las pruebas de backend son scripts Node contra un servidor corriendo
  (`node scripts/test-role-access.mjs`, requiere `TEST_ADMIN_PASSWORD` u otras env vars,
  si no están seteadas la prueba correspondiente se salta con `SKIP`).

---

### Task 1: Bloquear a ADMIN en los middlewares de Biblioteca y Parqueo

**Files:**
- Modify: `src/server/middleware/auth.ts:67-71`
- Modify: `scripts/test-role-access.mjs`
- Test: `scripts/test-role-access.mjs` (ejecutado con `npm run test:roles`)

**Interfaces:**
- Consumes: nada nuevo — `requireLibraryStaff`/`requireParkingStaff` ya existen y ya se
  usan en `library.ts`/`parking.ts`.
- Produces: mismo nombre y firma de ambos middlewares, solo cambia qué roles aceptan.

- [ ] **Step 1: Extender el script de pruebas con los casos que deben fallar hoy (RED)**

Abre `scripts/test-role-access.mjs`. Hoy el loop principal solo hace `GET`. Cambia la firma
de los casos para aceptar un método opcional, y añade los nuevos casos.

Reemplaza el bloque `accounts`/`cases` completo por:

```js
const accounts = {
  ADMIN: { username: process.env.TEST_ADMIN_EMAIL || 'admin@administrador.uspg.edu.gt', password: process.env.TEST_ADMIN_PASSWORD || 'Demo123!' },
  DOCENTE: { username: process.env.TEST_TEACHER_EMAIL || 'luismena@catedratico.uspg.edu.gt', password: process.env.TEST_TEACHER_PASSWORD || 'Demo123!' },
  ESTUDIANTE: { username: process.env.TEST_STUDENT_EMAIL || 'jaestradag@alumno.uspg.edu.gt', password: process.env.TEST_STUDENT_PASSWORD || 'Demo123!' },
  SISTEMAS: { username: process.env.TEST_SYSTEMS_EMAIL || 'sistemas@sistemas.uspg.edu.gt', password: process.env.TEST_SYSTEMS_PASSWORD || 'Demo123!' },
  BIBLIOTECA: { username: process.env.TEST_LIBRARY_STAFF_EMAIL || 'alopez@biblioteca.uspg.edu.gt', password: process.env.TEST_LIBRARY_STAFF_PASSWORD || 'Demo123!' },
  PARQUEO: { username: process.env.TEST_PARKING_STAFF_EMAIL || 'rpaz@parqueo.uspg.edu.gt', password: process.env.TEST_PARKING_STAFF_PASSWORD || 'Demo123!' },
  EVENTOS: { username: process.env.TEST_EVENTS_STAFF_EMAIL || 'sruiz@eventos.uspg.edu.gt', password: process.env.TEST_EVENTS_STAFF_PASSWORD || 'Demo123!' },
};
const cases = {
  ADMIN: [
    ['/api/students', 200], ['/api/finances', 200], ['/api/student-requests', 200],
    ['/api/library/books/no-existe/copies', 403, 'POST'],
    ['/api/parking/offline-manifest', 403],
  ],
  DOCENTE: [
    ['/api/finances', 403], ['/api/student-requests', 403], ['/api/enrollment-documents', 403],
  ],
  ESTUDIANTE: [
    ['/api/finances', 200], ['/api/student-requests', 200], ['/api/enrollment-documents', 200], ['/api/finances/career-fees', 403],
  ],
  SISTEMAS: [
    ['/api/systems/overview', 200], ['/api/finances', 403], ['/api/students', 403],
  ],
  BIBLIOTECA: [
    ['/api/library', 200], ['/api/finances', 403],
  ],
  PARQUEO: [
    ['/api/parking', 200], ['/api/parking/offline-manifest', 200], ['/api/finances', 403],
  ],
  EVENTOS: [
    ['/api/parking', 200], ['/api/parking/offline-manifest', 200], ['/api/finances', 403],
  ],
};
```

Luego, en el loop `for (const [path, expected] of cases[role])`, cambia la desestructuración
y el `fetch` para soportar el tercer elemento (método):

```js
  for (const [path, expected, method = 'GET'] of cases[role]) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { Cookie: cookie } });
    const ok = response.status === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${role} ${method} ${path}: ${response.status} (esperado ${expected})`);
    if (!ok) failures++;
  }
```

- [ ] **Step 2: Confirmar que las pruebas nuevas fallan hoy (antes del cambio de middleware)**

Levanta el servidor en una terminal aparte (`npm run dev`, o el comando que uses
normalmente) y corre, en otra terminal:

```bash
TEST_ADMIN_PASSWORD=Demo123! npm run test:roles
```

Expected: `FAIL ADMIN POST /api/library/books/no-existe/copies: 200 (esperado 403)` (o el
código que devuelva hoy la ruta, distinto de 403) y `FAIL ADMIN GET
/api/parking/offline-manifest: 200 (esperado 403)`. Los demás casos existentes deben seguir
en PASS. Si el usuario BIBLIOTECA/PARQUEO/EVENTOS no tiene la contraseña `Demo123!` en tu
base local, el script imprime `SKIP` para ese rol — está bien, lo relevante en este paso es
ver fallar los casos de ADMIN.

- [ ] **Step 3: Quitar `ADMIN` de los middlewares (GREEN)**

En `src/server/middleware/auth.ts`, reemplaza:

```ts
  const requireLibraryStaff: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'BIBLIOTECA'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Biblioteca.' });

  const requireParkingStaff: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Parqueo.' });
```

por:

```ts
  const requireLibraryStaff: express.RequestHandler = (_req, res, next) =>
    ['BIBLIOTECA'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Biblioteca.' });

  const requireParkingStaff: express.RequestHandler = (_req, res, next) =>
    ['PARQUEO', 'EVENTOS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Parqueo.' });
```

- [ ] **Step 4: Confirmar que las pruebas pasan ahora**

Reinicia el servidor (para tomar el cambio) y corre de nuevo:

```bash
TEST_ADMIN_PASSWORD=Demo123! npm run test:roles
```

Expected: todas las líneas `PASS`, incluidas las nuevas de ADMIN, y (si tienes las
contraseñas configuradas) las de BIBLIOTECA/PARQUEO/EVENTOS en `200`. `0 prueba(s)
fallaron` o el script termina sin `process.exit(1)`.

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/auth.ts scripts/test-role-access.mjs
git commit -m "fix: bloquea a ADMIN en middlewares de Biblioteca y Parqueo"
```

---

### Task 2: Quitar Biblioteca, Parqueo y Eventos del menú de ADMIN

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:54-56`

**Interfaces:**
- Consumes: nada.
- Produces: nada — es una hoja de la UI, ningún otro archivo depende de esto.

- [ ] **Step 1: Editar los `roles` de los tres ítems de navegación**

En `src/components/layout/Sidebar.tsx`, reemplaza:

```ts
    { path: '/biblioteca', label: 'Biblioteca', icon: BookMarked, roles: ['ADMIN', 'BIBLIOTECA', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/parqueo', label: 'Parqueo Inteligente', icon: Building2, roles: ['ADMIN', 'PARQUEO', 'EVENTOS', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/eventos', label: 'Gestión de Eventos', icon: CalendarDays, roles: ['ADMIN', 'EVENTOS'] },
```

por:

```ts
    { path: '/biblioteca', label: 'Biblioteca', icon: BookMarked, roles: ['BIBLIOTECA', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/parqueo', label: 'Parqueo Inteligente', icon: Building2, roles: ['PARQUEO', 'EVENTOS', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/eventos', label: 'Gestión de Eventos', icon: CalendarDays, roles: ['EVENTOS'] },
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "fix: quita Biblioteca, Parqueo y Eventos del menú de ADMIN"
```

---

### Task 3: Bloquear la página de Biblioteca a ADMIN y quitar el alta de cuenta duplicada

**Files:**
- Modify: `src/pages/LibraryPage.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/users` ya existe y ya soporta `role: 'BIBLIOTECA'` desde la
  pantalla "Usuarios y Seguridad" — no se toca en esta tarea, solo se deja de duplicar en
  esta página.
- Produces: nada.

- [ ] **Step 1: Quitar `ADMIN` del `RoleGuard` y del cálculo de `staff`**

En `src/pages/LibraryPage.tsx:16`, reemplaza:

```ts
  const { currentUser, showToast } = useApp(); const staff = currentUser.role === 'ADMIN' || currentUser.role === 'BIBLIOTECA';
```

por:

```ts
  const { currentUser, showToast } = useApp(); const staff = currentUser.role === 'BIBLIOTECA';
```

En la línea 40, el `RoleGuard allowedRoles={['ADMIN', 'BIBLIOTECA', 'ESTUDIANTE', 'DOCENTE']}`
pasa a `RoleGuard allowedRoles={['BIBLIOTECA', 'ESTUDIANTE', 'DOCENTE']}` (deja el resto de
esa línea igual).

- [ ] **Step 2: Quitar el botón "Usuario biblioteca" de las acciones del header**

En la misma línea 40, dentro de `actions={staff ? <div ...>`, elimina este fragmento
completo (incluye el botón y su lógica):

```tsx
{currentUser.role === 'ADMIN' && <button onClick={() => setPanel('STAFF')} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-bold"><UserPlus className="h-4 w-4" />Usuario biblioteca</button>}
```

- [ ] **Step 3: Quitar el estado, la función y el panel de creación de staff**

- Línea 17: quita `[panel, setPanel] = useState<'BOOK' | 'LOAN' | 'STAFF' | 'INCIDENT' | null>(null)`
  → cámbialo a `useState<'BOOK' | 'LOAN' | 'INCIDENT' | null>(null)` (quita `'STAFF'` de la
  unión, deja el resto del `useState` de esa línea intacto — comparte línea con otros
  estados).
- Línea 18: quita `const [staffForm, setStaffForm] = useState({ name: '', email: '', code: '' });`
  y `const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);`
  de esa línea compartida (deja `bookForm` y `loanForm` intactos).
- Línea 34: borra la función completa `const createStaff = async (e: React.FormEvent) => { ... };`
- Línea 41: borra el bloque completo `{credential && <div ...>}` (tarjeta de credencial
  temporal).
- Línea 47: borra el bloque completo `{panel === 'STAFF' && <form onSubmit={createStaff} ...>}`.

- [ ] **Step 4: Quitar imports que quedaron sin uso**

En la línea 2, quita `UserPlus` de la lista de íconos importados de `lucide-react` (verifica
primero con `grep -n "UserPlus" src/pages/LibraryPage.tsx` que ya no queda ninguna
referencia). En la línea 9, borra el import `import { PasswordInput } from
'../components/common/PasswordInput';` (verifica con `grep -n "PasswordInput"
src/pages/LibraryPage.tsx` que ya no queda ninguna referencia).

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. Si aparece "declared but never read" para algún identificador que
hayas dejado a medias, complétalo según el paso correspondiente arriba.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LibraryPage.tsx
git commit -m "fix: bloquea Biblioteca a ADMIN y quita alta de cuenta duplicada"
```

---

### Task 4: Bloquear la página de Parqueo a ADMIN y quitar Aforo/alta de cuenta duplicados

**Files:**
- Modify: `src/pages/ParkingPage.tsx`

**Interfaces:**
- Consumes: `PATCH /api/parking/config` y `POST /api/admin/users` — sin cambios, se dejan
  de invocar desde esta página (el primero se reutiliza en la Tarea 5, el segundo ya existe
  en "Usuarios y Seguridad").
- Produces: nada.

- [ ] **Step 1: Quitar `ADMIN` del `RoleGuard` y del cálculo de `staff`**

En `src/pages/ParkingPage.tsx:12`, reemplaza:

```ts
  const { currentUser, showToast } = useApp(); const staff = ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(currentUser.role);
```

por:

```ts
  const { currentUser, showToast } = useApp(); const staff = ['PARQUEO', 'EVENTOS'].includes(currentUser.role);
```

En la línea 43, `RoleGuard allowedRoles={['ADMIN', 'PARQUEO', 'EVENTOS', 'ESTUDIANTE', 'DOCENTE']}`
pasa a `RoleGuard allowedRoles={['PARQUEO', 'EVENTOS', 'ESTUDIANTE', 'DOCENTE']}`.

- [ ] **Step 2: Quitar los botones "Aforo" y "Usuario operativo", y limpiar la lista `['ADMIN','EVENTOS','PARQUEO']`**

En la misma línea 43, dentro de `actions={<div ...>`:

- Cambia `{['ADMIN','EVENTOS','PARQUEO'].includes(currentUser.role) && <button onClick={() => setPanel('EVENT')} ...>Nuevo evento</button>}`
  a `{['EVENTOS','PARQUEO'].includes(currentUser.role) && <button onClick={() => setPanel('EVENT')} ...>Nuevo evento</button>}`
  (solo quita `'ADMIN'` de la lista, el resto del botón queda igual).
- Elimina por completo el fragmento del botón "Aforo":

```tsx
{currentUser.role === 'ADMIN' && <button onClick={() => { setConfig({ totalCapacity: String(data.config.totalCapacity), regularReserve: String(data.config.regularReserve) }); setPanel('CONFIG'); }} className="rounded-lg border bg-white px-4 py-2 text-xs font-bold"><Gauge className="mr-2 inline h-4 w-4"/>Aforo</button>}
```

- Elimina por completo el fragmento del botón "Usuario operativo":

```tsx
{currentUser.role === 'ADMIN' && <button onClick={() => setPanel('STAFF')} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-bold"><Users className="h-4 w-4"/>Usuario operativo</button>}
```

- [ ] **Step 3: Limpiar el check de "Bloquear pase / Quitar" en la tarjeta de vehículo**

En la línea 57 (bloque de tarjetas de vehículos), busca
`(item.ownerId === currentUser.id || ['ADMIN','PARQUEO'].includes(currentUser.role))` y
cámbialo a `(item.ownerId === currentUser.id || currentUser.role === 'PARQUEO')` — EVENTOS
nunca tuvo esta acción, así que solo se quita `ADMIN` de esta lista puntual.

En la línea 59, busca `{['ADMIN','EVENTOS','PARQUEO'].includes(currentUser.role) &&
<div className="flex gap-3">...Gestionar...+Invitado...</div>}` (dentro de "Eventos
programados") y cámbialo a `{['EVENTOS','PARQUEO'].includes(currentUser.role) && ...}`.

- [ ] **Step 4: Quitar el estado, las funciones y los paneles de Aforo y de alta de staff**

- Línea 13: en el `useState<'VEHICLE' | 'ACCESS' | 'EVENT' | 'GUEST' | 'EVENT_DASH' |
  'CONTINGENCY' | 'CONFIG' | 'STAFF' | null>(null)`, quita `'CONFIG'` y `'STAFF'` de la
  unión de tipos.
- Línea 13: quita `[credential, setCredential] = useState<any>(null)` de esa misma línea
  compartida (deja `data`/`panel`/`pendingRemove` intactos).
- Línea 14: quita `[staffForm, setStaffForm] = useState({ name: '', email: '', code: '',
  role: 'PARQUEO' })` de esa línea compartida.
- Línea 15: quita `const [config, setConfig] = useState({ totalCapacity: '200',
  regularReserve: '20' });` (deja `selectedEvent`/`guest`/`guestPass` intactos si comparten
  línea).
- Línea 26: borra la función completa `const saveStaff = async (e: React.FormEvent) =>
  { ... };`.
- Línea 29: borra la función completa `const saveConfig = async (e: React.FormEvent) =>
  { ... };`.
- Línea 44: borra el bloque completo `{credential && <div ...>}` (tarjeta de credencial
  temporal).
- Línea 53: borra el bloque completo `{panel === 'CONFIG' && currentUser.role === 'ADMIN'
  && <form onSubmit={saveConfig} ...>}`.
- Línea 55: borra el bloque completo `{panel === 'STAFF' && <form onSubmit={saveStaff}
  ...>}`.

- [ ] **Step 5: Quitar imports que quedaron sin uso**

Verifica con `grep -n "\bUsers\b" src/pages/ParkingPage.tsx` — si ya no queda ninguna
referencia fuera del import, quita `Users` de la lista de `lucide-react` en la línea 2.
`Gauge` se queda (sigue usado en la tarjeta de "Ruta recomendada ahora", línea 46).
Verifica con `grep -n "PasswordInput" src/pages/ParkingPage.tsx` y, si no queda ninguna
referencia, borra el import de la línea 9.

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ParkingPage.tsx
git commit -m "fix: bloquea Parqueo a ADMIN y quita Aforo/alta de cuenta duplicados"
```

---

### Task 5: Migrar la configuración de Aforo a "Usuarios y Seguridad"

**Files:**
- Modify: `src/pages/UsersPage.tsx`

**Interfaces:**
- Consumes: `GET /api/parking` (devuelve `{ config: { totalCapacity: number,
  regularReserve: number, entry1Name: string, entry2Name: string }, ... }`, sin cambios) y
  `PATCH /api/parking/config` (body `{ totalCapacity: number, regularReserve: number }`,
  protegido por `requireAdmin`, sin cambios — ver `src/server/routes/parking.ts:73`).
- Produces: nada — es hoja de la UI.

- [ ] **Step 1: Añadir estado y carga de la configuración de aforo**

En `src/pages/UsersPage.tsx`, después de la línea 20 (`const [pageSize, setPageSize] =
useState(20);`), añade:

```ts
  const [parkingConfig, setParkingConfig] = useState({ totalCapacity: '', regularReserve: '' });
  const [showParkingConfig, setShowParkingConfig] = useState(false);
```

Después de la función `load` (línea 27), añade:

```ts
  const loadParkingConfig = async () => { const response = await fetch('/api/parking'); if (response.ok) { const result = await response.json(); setParkingConfig({ totalCapacity: String(result.config.totalCapacity), regularReserve: String(result.config.regularReserve) }); } };
```

En el `useEffect(() => { void load(); }, []);` (línea 29), añade la llamada nueva:

```ts
  useEffect(() => { void load(); void loadParkingConfig(); }, []);
```

- [ ] **Step 2: Añadir el guardado de la configuración**

Después de `createUser` (justo antes de `resetPassword`, alrededor de la línea 55), añade:

```ts
  const saveParkingConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/parking/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalCapacity: Number(parkingConfig.totalCapacity), regularReserve: Number(parkingConfig.regularReserve) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message || 'No se pudo actualizar el aforo', 'error');
    showToast('Aforo actualizado', 'success');
    setShowParkingConfig(false);
  };
```

- [ ] **Step 3: Añadir el botón y el formulario en la UI**

En el `PageHeader` (línea 106), el prop `actions` hoy solo tiene el botón "Nuevo usuario".
Reemplaza:

```tsx
        actions={<button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Nuevo usuario</button>} />
```

por:

```tsx
        actions={<div className="flex gap-2"><button onClick={() => setShowParkingConfig((v) => !v)} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-bold"><Gauge className="h-4 w-4" />Aforo de parqueo</button><button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Nuevo usuario</button></div>} />
```

Justo después del bloque `{showCreate && <form onSubmit={createUser} ...>}` (línea 108),
añade el formulario de aforo:

```tsx
      {showParkingConfig && <form onSubmit={saveParkingConfig} className="grid gap-3 rounded-xl border border-[#800020]/20 bg-white p-5 md:grid-cols-3">
        <h3 className="font-bold md:col-span-3">Configuración del aforo de parqueo</h3>
        <label className="text-xs font-bold">Capacidad total<input required min="1" type="number" value={parkingConfig.totalCapacity} onChange={(e) => setParkingConfig({ ...parkingConfig, totalCapacity: e.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold">Reserva mínima para uso regular<input required min="0" type="number" value={parkingConfig.regularReserve} onChange={(e) => setParkingConfig({ ...parkingConfig, regularReserve: e.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
        <div className="flex items-end justify-end gap-2"><button type="button" onClick={() => setShowParkingConfig(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancelar</button><button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Guardar</button></div>
      </form>}
```

- [ ] **Step 4: Importar el ícono `Gauge`**

En la línea 2, añade `Gauge` a la lista de íconos importados de `lucide-react`.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Verificación manual**

Con el servidor corriendo y sesión ADMIN, entra a "Usuarios y Seguridad", haz clic en
"Aforo de parqueo", confirma que carga los valores actuales, cambia "Capacidad total" y
guarda. Luego entra (con otra sesión o cuenta PARQUEO) a "Parqueo Inteligente" y confirma
que el resumen de aforo refleja el nuevo valor.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UsersPage.tsx
git commit -m "feat: agrega configuración de aforo de parqueo a Usuarios y Seguridad"
```

---

### Task 6: Bloquear la página de Eventos a ADMIN

**Files:**
- Modify: `src/pages/EventsPage.tsx:132`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Quitar `ADMIN` del `RoleGuard`**

En `src/pages/EventsPage.tsx:132`, reemplaza:

```tsx
    <RoleGuard allowedRoles={['ADMIN', 'EVENTOS']}>
```

por:

```tsx
    <RoleGuard allowedRoles={['EVENTOS']}>
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/pages/EventsPage.tsx
git commit -m "fix: bloquea Gestión de Eventos a ADMIN"
```

---

### Task 7: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

- [ ] **Step 1: Levantar el servidor**

Run: `npm run dev` (o el comando habitual del proyecto) y déjalo corriendo.

- [ ] **Step 2: Iniciar sesión como ADMIN y confirmar el sidebar**

Entra con la cuenta ADMIN. Confirma que "Biblioteca", "Parqueo Inteligente" y "Gestión de
Eventos" **ya no aparecen** en el menú lateral. Confirma que "Usuarios y Seguridad" sigue
mostrando el botón "Nuevo usuario" y el nuevo botón "Aforo de parqueo".

- [ ] **Step 3: Confirmar el bloqueo por URL directa**

Con la sesión ADMIN activa, navega manualmente a `/biblioteca`, `/parqueo` y `/eventos`.
Confirma que cada una muestra la pantalla "Acceso Restringido" del `RoleGuard`, no el
módulo.

- [ ] **Step 4: Confirmar que los roles operativos no tuvieron regresión**

Inicia sesión con una cuenta BIBLIOTECA y confirma que Biblioteca funciona igual que antes
(préstamos, registro de libros). Inicia sesión con PARQUEO y con EVENTOS y confirma que
Parqueo Inteligente funciona igual (registro de vehículos, control de acceso, gestión de
eventos). Ninguna de las tres debe mostrar cambios visibles — solo perdieron acceso los
botones que eran exclusivos de ADMIN.

- [ ] **Step 5: Correr la suite de scripts de integración**

Run: `TEST_ADMIN_PASSWORD=Demo123! npm run test:roles`
Expected: todas las líneas `PASS`.

Si el proyecto usa otras contraseñas demo distintas a `Demo123!` en esta base de datos,
ajusta las variables de entorno según corresponda antes de correr el comando.
