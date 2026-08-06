<div align="center">
  <img src="docs/assets/uspg-sistema-academico-dashboard.jpg" alt="Panel administrativo del Sistema Académico USPG" width="1200" />
</div>

# Sistema Académico USPG

Sistema académico por roles con React, Express, Prisma y SQLite para desarrollo local.

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
- Estudiante: `jaestradag@alumno.uspg.edu.gt`
- Sistemas: `sistemas@sistemas.uspg.edu.gt`

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

`db:postgres:push` es únicamente para preparar una base vacía de prueba. El
servidor usa migraciones PostgreSQL versionadas mediante
`db:postgres:migrate:deploy`; nunca ejecuta `db push` durante un reinicio.

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
`MFA_ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`.

Genere la llave de cifrado MFA una sola vez y consérvela en el almacén de secretos
de Coolify. Perderla impide descifrar los factores TOTP existentes:

```bash
openssl rand -base64 32
```

El servicio expone el puerto `3000` y publica su verificación de salud en
`/api/health`. Las credenciales de Google Classroom pueden quedar vacías inicialmente.
Los archivos `.env` nunca deben subirse; configure los secretos como variables de
ejecución en Coolify.

En el primer despliegue, abra la terminal del servicio `app` en Coolify y ejecute
una sola vez los siguientes comandos para cargar la institución, el pensum oficial
de Sistemas, la matrícula de validación y los cuatro roles:

```bash
npm run db:seed
VALIDATION_PASSWORD="una-contraseña-temporal-segura" npm run db:sync:systems-validation
```

Guarde `VALIDATION_PASSWORD` como secreto de Hostinger/Coolify; el comando la exige
en producción. Después del primer acceso, cambie inmediatamente todas las
contraseñas temporales y complete MFA para Administrador, Docente y Sistemas.
