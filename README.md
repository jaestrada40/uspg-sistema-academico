<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Sistema Académico USPG

Sistema académico por roles con React, Express, Prisma y SQLite para desarrollo local.

View your app in AI Studio: https://ai.studio/apps/e4d97e24-8a8f-49c7-bdea-70d00ba72687

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Crea la base y carga los usuarios iniciales:
   `npm run db:migrate -- --name initial`
   `npm run db:seed`
3. Ejecuta la aplicación:
   `npm run dev`

## Accesos iniciales

Todos usan temporalmente la contraseña `Demo123!`:

- Administrador: `cmendoza@administrador.uspg.edu.gt`
- Docente: `luismena@catedratico.uspg.edu.gt`
- Estudiante: `jaestrada@alumno.uspg.edu.gt`

Las contraseñas se almacenan con `scrypt`; las sesiones usan tokens aleatorios guardados como hash y cookies `HttpOnly`.

## Preparación para PostgreSQL

La aplicación selecciona el motor con `DATABASE_PROVIDER`. El desarrollo normal
continúa usando SQLite, mientras PostgreSQL se prepara en paralelo.

Para levantar una base PostgreSQL local de prueba:

```bash
docker compose -f docker-compose.postgresql.yml up -d
npm run db:postgres:prepare
```

Después configura temporalmente:

```env
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://uspg:desarrollo_uspg@localhost:5432/uspg_academico"
```

En una base vacía de desarrollo se puede crear la estructura con:

```bash
npm run db:postgres:push
npm run db:postgres:generate
npm run db:seed
```

`db:postgres:push` es únicamente para preparar una base vacía de prueba. En el
servidor real primero se debe respaldar SQLite, generar una migración PostgreSQL
versionada, importar los datos, comparar conteos y totales financieros, y luego
cambiar el tráfico. Nunca debe ejecutarse `db push` sobre una base PostgreSQL de
producción que ya contenga información.

Para volver al desarrollo SQLite se restauran las variables de `.env` y se corre:

```bash
npm run db:generate
```

Las variables esperadas en el servidor están documentadas en
`.env.production.example`. Antes de desplegar se validan con:

```bash
npm run production:check
```

## Despliegue con Coolify

El archivo `docker-compose.coolify.yml` incluye la aplicación y PostgreSQL 17 con
volumen persistente. En Coolify seleccione **Docker Compose**, indique ese archivo y
configure como mínimo `APP_URL`, `POSTGRES_PASSWORD`, `PARKING_QR_SECRET`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`.

El servicio expone el puerto `3000` y publica su verificación de salud en
`/api/health`. Las credenciales de Google Classroom pueden quedar vacías inicialmente.
Los archivos `.env` nunca deben subirse; configure los secretos como variables de
ejecución en Coolify.
