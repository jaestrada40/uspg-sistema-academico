# Operación, respaldos y recuperación

## Crear y verificar un respaldo

```bash
npm run backup:create
npm run backup:verify -- backups/NOMBRE_DEL_ARCHIVO.db
```

En PostgreSQL el archivo termina en `.dump`. Cada respaldo incluye un manifiesto
`.json` con fecha, tamaño y huella SHA-256. Una copia no se considera válida
hasta superar `backup:verify`.

## Política recomendada

- Respaldo diario conservado por 30 días.
- Respaldo semanal conservado por 6 meses.
- Una copia cifrada fuera del servidor principal.
- Prueba de restauración mensual en un entorno aislado.
- Registrar responsable, fecha, resultado y conteos verificados.

## Recuperación de SQLite

1. Detener la aplicación.
2. Copiar y verificar la base actual antes de reemplazarla.
3. Verificar el respaldo elegido con `backup:verify`.
4. Copiar el respaldo verificado a la ruta configurada en `DATABASE_URL`.
5. Ejecutar `npm run db:generate`, iniciar la aplicación y comprobar `/api/health`.
6. Comparar usuarios, estudiantes, cargos, pagos, recibos y auditoría.

## Recuperación de PostgreSQL

La restauración debe hacerse primero en una base vacía de recuperación, nunca
directamente sobre producción:

```bash
createdb uspg_recuperacion
pg_restore --exit-on-error --no-owner --dbname uspg_recuperacion backups/ARCHIVO.dump
```

Después se comparan conteos y totales financieros. El cambio de tráfico se hace
solo cuando administración confirma la integridad. Las credenciales y archivos
de respaldo no deben almacenarse en Git.

## Controles de seguridad activos

- Contraseñas derivadas con `scrypt` y sales individuales.
- Sesiones aleatorias almacenadas como hash y cookies `HttpOnly`.
- Cookies `Secure` en producción y `SameSite=Lax`.
- Bloqueo temporal después de cinco intentos fallidos de acceso.
- Autorización por rol y propiedad del registro en cada API sensible.
- Auditoría para operaciones académicas, financieras y documentales.
- Validación de tipos, tamaño y acceso en documentos cargados.
- Cabeceras contra MIME sniffing, iframes y fuga de referencias.

## Antes del despliegue

```bash
npm run production:check
npm run lint
npm run build
npm audit --omit=dev
```

La alerta actual de React Router corresponde al modo RSC/Server Actions. Esta
aplicación usa React Router únicamente en modo SPA y no expone esas acciones.
Debe actualizarse cuando exista una versión compatible corregida y volver a
ejecutarse la auditoría.
