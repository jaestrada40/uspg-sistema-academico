# Cambiar rol de un usuario existente

## Contexto

"Usuarios y Seguridad" permite crear cuentas con un rol fijo, resetear contraseña/MFA y
activar/desactivar, pero no reasignar el rol de una cuenta ya creada. Tras dividir ADMIN en
`REGISTRO`/`FINANZAS`, esto se volvió una limitación real: mover a alguien de rol requiere
borrar y recrear la cuenta. El dueño del sistema pidió esta capacidad.

## Alcance

- Nueva ruta `PATCH /api/admin/users/:id/role` (`requireAdmin`).
- Sin restricciones de qué rol a qué rol (cualquiera de los 9 roles a cualquier otro),
  excepto que un ADMIN no puede cambiar su propio rol.
- Efectos: actualiza `user.role`, registra `auditLog` (`USER_ROLE_CHANGED`), notifica al
  usuario por el sistema de notificaciones interno. No fuerza cambio de contraseña, no
  cierra sesiones activas (el rol se relee de la base de datos en cada request).
- Frontend: la columna "Rol" del directorio en `UsersPage.tsx` pasa de texto a `<select>`,
  deshabilitado para la propia cuenta del usuario autenticado, dispara el cambio al
  seleccionar (sin botón "guardar" separado).

## Fuera de alcance

- No se valida que el dominio del correo coincida con el rol nuevo (igual que
  `POST /api/admin/users` hoy tampoco lo valida).
- No se cierran sesiones activas ni se fuerza reautenticación.
- No se agregan restricciones de qué combinaciones de rol son válidas.
