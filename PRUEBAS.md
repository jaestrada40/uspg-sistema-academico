# Pruebas por rol

Última ejecución: 29 de julio de 2026.

## Administrador

Se recorrieron 20 pantallas con la sesión administrativa activa: inicio,
estudiantes, docentes, carreras, cursos, ciclos, secciones, inscripción, pagos,
solicitudes, expediente, notas, actividades, recuperaciones, asistencia,
horarios, aulas virtuales, historial, reportes, notificaciones y perfil.

Resultado: todas mostraron su encabezado esperado y no se registraron errores en
la consola del navegador.

## Catedrático

La sesión independiente confirmó que el servidor rechaza con `403` el acceso a:

- Finanzas.
- Solicitudes estudiantiles.
- Expedientes de inscripción.

## Estudiante

La sesión independiente confirmó acceso correcto a:

- Finanzas y cuenta propia.
- Solicitudes propias.
- Expediente propio.

También confirmó que los precios masivos por carrera permanecen restringidos a
administración con respuesta `403`.

## Repetir pruebas

```bash
npm run test:roles
```

Las cuentas de catedrático y estudiante usan las credenciales iniciales locales.
Para incluir una sesión administrativa independiente sin guardar su contraseña:

```bash
TEST_ADMIN_PASSWORD="valor-local" npm run test:roles
```

No se debe guardar esa variable en Git ni compartirla por chat.
