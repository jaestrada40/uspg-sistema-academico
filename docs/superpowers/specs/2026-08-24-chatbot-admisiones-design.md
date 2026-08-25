# Chatbot público de admisiones + captura de leads

## Contexto y problema

La universidad quiere replicar, dentro de su propio sitio, algo como el bot de
WhatsApp de otra universidad (UNIS): un asistente que responde preguntas
libres de aspirantes (carreras, costos, requisitos, becas) y que además
permita registrarse sin fricción. Hoy el proyecto ya tiene un asistente
conversacional (`AcademicAssistant` + `/api/assistant`), pero es **solo para
usuarios ya autenticados** y responde sobre sus propios datos académicos
(Gemini + reglas, en `src/server/routes/notifications.ts` /
`notificationsService.ts`).

Se necesita un flujo público y separado, para visitantes anónimos del sitio
institucional (hoy en WordPress), que:

1. Responda preguntas institucionales generales (no datos de un usuario).
2. Capture datos de contacto como "lead" aunque el visitante no se registre.
3. Permita crear una cuenta ligera de "aspirante" desde el propio chat.
4. Dé a Admisiones un panel tipo pipeline de ventas para dar seguimiento.

El sitio WordPress actual está caído/no gestionado en este momento; este
proyecto se venderá como una solución nueva, así que la pieza de admisiones
vive completa en `uspg-sistema-academico` y WordPress solo enlaza a ella.

## Decisiones ya tomadas (brainstorming)

- **No** clonar contenido/diseño de ningún sitio de otra institución.
- **No** modificar WordPress más allá de un botón/enlace ("Solicita
  información" / "Chatea con admisiones") que abra la página nueva en pestaña
  aparte. Sin iframe, sin plugin PHP.
- La pieza nueva es una **página pública** (`/admisiones`, sin login) dentro
  de este mismo React app — cubre todo el ciclo: contenido informativo + chat
  + captura de lead + registro de aspirante.
- Las respuestas del bot salen de una **base de conocimiento editable**
  (`ChatbotKnowledgeItem`), no de datos inventados ni de datos académicos
  reales de otros usuarios.
- El "registro" desde el chat crea una **cuenta `User` con rol `ASPIRANTE`**,
  ligera (nombre, correo, teléfono, contraseña) — **no** crea un `Student`
  completo (eso exige carrera, plan, campus, carnet, etc.; lo hace Admisiones
  después, a mano, cuando el proceso se formaliza).
- `role` en `User` ya es `String` libre — no hace falta migrar a enum para
  añadir `ASPIRANTE`.

## Arquitectura

```
WordPress (uspg.edu.gt)
   └─ botón "Solicita información" → enlace externo
                                          │
                                          ▼
        uspg-sistema-academico  (mismo backend/frontend actual)
        ┌───────────────────────────────────────────────┐
        │ Página pública /admisiones (sin auth)          │
        │  - Contenido institucional (carreras, costos…) │
        │  - Chat (usa /api/public/assistant)             │
        │  - Formulario de lead / registro aspirante      │
        └───────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
        /api/public/assistant   /api/public/leads
        /api/public/register
                    │                    │
                    ▼                    ▼
          Gemini + ChatbotKnowledgeItem   PublicLead / User(ASPIRANTE)
```

Reutiliza: Express app existente, Prisma, Redis rate limiter, patrón Gemini
de `notificationsService.ts`, hashing scrypt de auth, `AuditLog`.

Nuevo: rutas públicas, tablas de conocimiento/lead/conversación anónima,
página `/admisiones`, panel de leads en Admin.

## Modelo de datos (Prisma)

### `ChatbotKnowledgeItem`
Contenido institucional editable, inyectado como contexto a Gemini.

- `id` (cuid)
- `category` (String) — ej. `CARRERA`, `COSTOS`, `ADMISION`, `BECAS`, `GENERAL`
- `title` (String)
- `content` (String, texto largo)
- `active` (Boolean, default true)
- `createdAt` / `updatedAt`

### `PublicLead`
- `id` (cuid)
- `name` (String)
- `email` (String?)
- `phone` (String?)
- `careerInterest` (String?)
- `status` (String, default `NUEVO`) — `NUEVO | CONTACTADO | EN_PROCESO | MATRICULADO | DESCARTADO`
- `notes` (String?)
- `source` (String, default `CHATBOT`)
- `conversationId` (String?, FK a `PublicChatConversation`)
- `userId` (String?, FK a `User`, se llena si el lead termina registrándose)
- `assignedToUserId` (String?, FK a `User`, staff de Admisiones)
- `createdAt` / `updatedAt`

### `PublicChatConversation`
- `id` (cuid)
- `anonToken` (String, único) — identificador opaco guardado en localStorage del visitante
- `createdAt` / `updatedAt`
- `messages` `PublicChatMessage[]`

### `PublicChatMessage`
- `id` (cuid)
- `conversationId` (FK)
- `role` (`user` | `assistant`)
- `content` (String)
- `createdAt`

### `User` (existente)
- Sin cambios de esquema. Se usa `role = "ASPIRANTE"`.

## Endpoints nuevos (`src/server/routes/public.ts`)

Todos sin `requireUser`. Todos con rate limiting por IP + `anonToken`.

- `POST /api/public/assistant`
  - body: `{ anonToken, question, history? }`
  - crea/recupera `PublicChatConversation` por `anonToken`
  - arma prompt con `ChatbotKnowledgeItem` activos + historial reciente
  - llama a Gemini (mismo helper que el asistente autenticado, reutilizado o
    extraído a función compartida); si falla, fallback por reglas simples
    (saludo, "no tengo ese dato, ¿te contacto un asesor?")
  - guarda mensajes, responde `{ answer, links? }`

- `POST /api/public/leads`
  - body: `{ anonToken?, name, email?, phone?, careerInterest? }`
  - exige al menos `name` + (`email` o `phone`)
  - crea o actualiza `PublicLead` (upsert por `email`/`phone` si ya existe)
  - vincula a la conversación si hay `anonToken`

- `POST /api/public/register`
  - body: `{ name, email, phone, careerInterest?, password }`
  - valida formato de correo/teléfono y fuerza de contraseña (mismas reglas
    que el registro existente, si las hay; si no, mínimo 8 caracteres)
  - crea `User` con `role: 'ASPIRANTE'`, hash scrypt igual que el resto
  - crea/actualiza `PublicLead` con `userId` y `status: 'EN_PROCESO'`
  - inicia sesión igual que el login normal (cookie HttpOnly)

- `GET /api/public/knowledge` (opcional, para precargar la página con
  contenido estático sin pasar por el chat) — devuelve `ChatbotKnowledgeItem`
  activos agrupados por categoría.

## Endpoints de administración (protegidos, rol ADMIN o nuevo permiso Admisiones)

- CRUD de `ChatbotKnowledgeItem` en `src/server/routes/admin.ts`
- `GET /api/admin/leads` — listado con filtro por estado
- `PATCH /api/admin/leads/:id` — cambiar estado/notas/asignado (con `AuditLog`)

## Frontend

- `src/pages/public/AdmisionesPage.tsx` — ruta pública nueva (fuera del
  layout autenticado), con secciones informativas + el chat.
- `src/components/public/PublicChatWidget.tsx` — variante del patrón de
  `AcademicAssistant.tsx` pero sin `currentUser`, usando `anonToken` en
  `localStorage`, apuntando a `/api/public/*`.
- Formulario de registro de aspirante embebido en la página/chat (no un
  modal genérico de auth existente, porque pide menos campos).
- Nueva sección en Admin: `LeadsPanel` (tabla + cambio de estado), reutiliza
  estilos de tablas ya existentes en el módulo de administración.

## Seguridad

- Rate limiting con Redis (reusa infra existente) por IP y por `anonToken`:
  ej. 20 mensajes/10 min en `/api/public/assistant`, 5 intentos/hora en
  `/api/public/register`.
- Honeypot en el formulario de lead/registro (campo oculto que un bot
  llenaría); si viene lleno, se descarta silenciosamente sin dar pista.
- Prompt de Gemini restringido explícitamente al contenido de
  `ChatbotKnowledgeItem`; instrucción de no inventar cifras ni exponer datos
  de otros usuarios; si la pregunta no tiene respuesta en la base, el bot
  ofrece dejar el contacto en vez de alucinar.
- `anonToken` generado con `crypto.randomBytes(32)`, igual patrón que los
  tokens de sesión actuales — no derivable ni secuencial.
- Cuentas `ASPIRANTE`: mismo hash scrypt+sal, misma cookie de sesión
  HttpOnly/SameSite=Lax/Secure que ya usa el sistema.
- Toda alta de lead→cuenta y cambio de estado en el pipeline queda en
  `AuditLog`.
- CORS: la página vive en el mismo dominio del backend; WordPress solo
  enlaza (no hace fetch cross-origin), así que no se amplía la superficie
  CORS existente.

## Testing

- Pruebas de servicio: CRUD de `ChatbotKnowledgeItem`, creación/upsert de
  `PublicLead`, registro de `ASPIRANTE`, transición de estados del pipeline.
- `scripts/test-public-assistant.mjs` (nuevo, mismo patrón que
  `scripts/test-assistant.mjs`): simula conversación completa contra el
  servidor local — pregunta de carreras → costos → captura de lead →
  registro de aspirante.
- Prueba de rate limiting: confirma bloqueo tras exceder el límite por
  IP/`anonToken`.
- Verificación manual en navegador de `/admisiones`: chat completo, lead sin
  registrarse, registro de aspirante — antes de dar la tarea por terminada.

## Fuera de alcance (explícito)

- No se clona ni se replica contenido/diseño de `uspg.edu.gt` ni de ninguna
  otra institución.
- No se construye plugin de WordPress ni se modifica el WP actual más allá
  del botón/enlace.
- El chat no crea `Student` completo ni matrícula real; eso sigue siendo un
  proceso manual de Admisiones a partir del `PublicLead`/`ASPIRANTE`.
- No se agrega CAPTCHA visible de entrada; solo si se detecta abuso real.
