# Progreso del Sistema Académico USPG

Actualizado: 29 de julio de 2026.

## Estado actual

El proyecto funciona localmente en `http://localhost:3001` con React, Vite,
Express, Prisma y SQLite. La base de datos tiene 19 migraciones aplicadas.
Antes de producción se migrará a PostgreSQL.

## Funcionalidades completadas

- Inicio de sesión real con sesiones HttpOnly y contraseñas cifradas.
- Detección de rol mediante el dominio del correo institucional:
  - `@alumno.uspg.edu.gt`: estudiante.
  - `@catedratico.uspg.edu.gt`: catedrático.
  - `@administrador.uspg.edu.gt`: administrador.
- Cambio obligatorio de contraseña inicial.
- Logo institucional configurable y diseño adaptado por rol.
- Gestión de estudiantes, docentes, carreras, cursos y prerrequisitos.
- Ciclos académicos, aulas, horarios, secciones y control de conflictos.
- Inscripción con cupo, límite de créditos, fechas y prerrequisitos.
- Aulas virtuales preparadas para integración con Google Classroom.
- Calificaciones con esta distribución:
  - Zona: 30 puntos.
  - Primer parcial: 20 puntos.
  - Segundo parcial: 20 puntos.
  - Examen final: 30 puntos.
- Actas con borrador, publicación, cierre definitivo, auditoría y PDF.
- Pagos y solvencias:
  - Precios y cargos masivos por carrera.
  - Pagos parciales y completos.
  - Recibos oficiales descargables en PDF.
  - Estado de cuenta descargable en PDF con cargos, pagos y saldos.
  - Saldo vencido y estado de solvencia.
  - Becas y descuentos auditables aplicados por cargo.
  - Cargos por mora con aviso al estudiante.
  - Convenios de pago de 2 a 24 cuotas mensuales.
  - Comprobantes de transferencia cargados por el estudiante.
  - Validación administrativa antes de aplicar el pago y emitir recibo.
  - Control de referencias duplicadas y montos pendientes.
  - Bloqueo de inscripción por deuda vencida.
- Asistencia por sección y fecha:
  - Presente, ausente, tarde y justificado.
  - Tema y observación.
  - Porcentaje acumulado y alerta debajo del 80%.
  - Restricciones para cada rol.
- Desglose automático de la zona de 30 puntos:
  - Tareas, proyectos, laboratorios y actividades.
  - Valor, fecha de entrega y retroalimentación.
  - Validación para no superar 30 puntos por sección.
  - Calificación y publicación por actividad.
  - Consulta del detalle por el estudiante.
  - Actualización automática de la zona y el total del acta.
- Recuperaciones:
  - Solicitud del estudiante o de administración.
  - Elegibilidad únicamente con nota publicada menor a 61.
  - Autorización, rechazo, fecha programada y observaciones.
  - Cargo financiero opcional y validación de pago completo.
  - Registro de la nota por el docente asignado.
  - Conservación de la nota ordinaria y auditoría completa.
- Notificaciones institucionales:
  - Campana persistente por usuario con estados leído/no leído.
  - Enlaces directos al módulo relacionado.
  - Avisos automáticos para notas, actividades, pagos y recuperaciones.
  - Envíos masivos por rol desde administración.
  - Bandeja de salida con reintentos y seguimiento de errores.
  - Correo SMTP preparado; queda pendiente recibir credenciales de TI.
- Solicitudes estudiantiles:
  - Constancias de estudios, certificaciones de notas y cierre de pensum.
  - Seguimiento desde solicitud hasta entrega o rechazo.
  - Prevención de trámites duplicados, observaciones y auditoría.
  - Avisos automáticos al estudiante y a administración.
- Expedientes de inscripción:
  - Cinco requisitos documentales con carga de PDF, PNG o JPG.
  - Acceso protegido al archivo para estudiante y administración.
  - Aprobación, rechazo con observación y reemplazo de documentos.
  - Indicadores de expediente cargado, aprobado y completo.
- Preparación para PostgreSQL:
  - Adaptadores seleccionables para SQLite y PostgreSQL.
  - Esquema PostgreSQL derivado y entorno Docker local opcional.
  - Variables de producción y verificación previa al despliegue.
  - Guía de cambio controlado sin afectar la base local.
- Seguridad y recuperación:
  - Bloqueo temporal después de cinco intentos fallidos de acceso.
  - Cabeceras HTTP defensivas, CSP, HSTS y cookies seguras en producción.
  - Protección de operaciones contra solicitudes de origen cruzado y abuso de API.
  - Validación estricta de HTTPS y longitud de secretos antes del despliegue.
  - Respaldos consistentes para SQLite y PostgreSQL con SHA-256.
  - Verificación de integridad y procedimiento documentado de recuperación.
  - React Router actualizado a 8.3.0 sin `react-router-dom`, RSC ni acciones de Router.
  - React y React DOM actualizados a 19.2.7; Node 22.22 o superior requerido.
  - Rama de respaldo previa: `backup/pre-react-router-8.3.0`.
  - Verificación conjunta disponible con `npm run verify:release`.
- Pruebas por rol:
  - Recorrido visual de 20 pantallas administrativas sin errores de consola.
  - Matriz automatizada de permisos para estudiante y catedrático.
  - Verificación de acceso propio y rechazo de módulos restringidos.
  - Script reutilizable `npm run test:roles`.
- Optimización web:
  - Carga diferida independiente para cada pantalla.
  - Paquete inicial reducido de 906 KB a 305 KB aproximadamente.
  - Gráficos separados del núcleo y descargados solo cuando se necesitan.
  - Caché anual para recursos versionados y revalidación del HTML.
- Pensum oficial de Ingeniería en Sistemas:
  - 55 cursos, 200 créditos y 8 semestres importados desde documentos reales.
  - Prerrequisitos oficiales y cursos provisionales conservados como migrados.
  - Malla visual por estudiante con estados aprobado, en curso, disponible y bloqueado.
  - Avance de cursos y créditos, además de requisitos de graduación.
- Estructura académica formal:
  - Campus persistentes y asignación de campus por estudiante.
  - Planes académicos versionados por carrera, vigencia, créditos y semestres.
  - Relación fija entre cada versión del pensum y sus cursos para conservar historiales.
  - Campus Central y plan SIS-2026B-CC asignados a estudiantes de Ingeniería en Sistemas.
  - Selección de campus y pensum al registrar o editar estudiantes.
  - Malla calculada desde el plan asignado, mostrando campus y versión.
- Matrícula y cuotas automáticas:
  - Generador administrativo de matrícula y mensualidades por ciclo académico.
  - Alcance configurable por carrera, campus y versión de pensum.
  - Fechas mensuales calculadas desde la primera cuota y cantidad indicada.
  - Asignación masiva a estudiantes activos dentro del alcance seleccionado.
  - Incorporación automática de cargos faltantes cuando un estudiante se inscribe después.
  - Restricción única y validación previa para evitar cargos o calendarios duplicados.
  - Validación de que el curso inscrito pertenezca al pensum del estudiante.
- Estado de cuenta histórico:
  - Consulta por rango de fecha inicial y final.
  - Cálculo contable de saldo anterior, cargos, abonos y saldo final.
  - Libro cronológico con cargos, pagos, becas y descuentos.
  - Saldo acumulado después de cada movimiento.
  - PDF oficial con el mismo período y los mismos cálculos de la pantalla.
  - Separación entre historial contable y obligaciones actualmente pendientes.
- Administración de campus y planes:
  - Pantalla administrativa incorporada al menú principal.
  - Registro y edición de campus, dirección, estado y estudiantes asignados.
  - Consulta de versiones de pensum con vigencia, cursos y alumnos vinculados.
  - Creación de nuevas versiones copiando la asignación de cursos de un plan anterior.
  - Activación, planificación y cierre de pensums sin borrar historiales existentes.
  - Auditoría de creación y cambios de campus y planes académicos.
  - Solo campus y planes activos aparecen al asignar estudiantes o generar cuotas.
- Biblioteca:
  - Catálogo de libros con ISBN, autor, categoría y búsqueda rápida.
  - Inventario por ejemplar con código de barras o QR, ubicación, estado y condición.
  - Préstamos por carné, código institucional o correo, con vencimiento configurable.
  - Límite de tres préstamos activos, renovación única y bloqueo si existen reservas.
  - Devoluciones con actualización automática de disponibilidad.
  - Reservas de 48 horas para estudiantes y docentes cuando no hay ejemplares.
  - Alertas al usuario sobre préstamo y fecha de devolución.
  - Rol BIBLIOTECA aislado del sistema académico y creación de credenciales temporales.
  - Auditoría de libros, préstamos y devoluciones.
  - Solicitud de préstamo en línea con plazo de retiro de 48 horas.
  - Identificación QR del estudiante y confirmación presencial al entregar el ejemplar.
  - Escáner por cámara para identificar al alumno y el código QR del libro.
  - Bandeja operativa de solicitudes en línea para personal de Biblioteca.
  - Asignación y bloqueo de un ejemplar disponible al preparar la solicitud.
  - Aviso automático al alumno cuando el libro está listo para recoger.
  - Entrega confirmada escaneando la identificación del alumno y el ejemplar asignado.
  - Cancelación por alumno o personal con liberación inmediata del inventario.
  - Vencimiento automático de solicitudes y liberación de ejemplares después del plazo.
  - Recordatorio automático durante las 24 horas anteriores al vencimiento del préstamo.
  - Aviso único de atraso para préstamos vencidos, sin notificaciones duplicadas.
  - Asignación automática del ejemplar devuelto al primer usuario de la lista de espera.
  - Notificación inmediata cuando una reserva queda disponible para recoger.
  - Indicadores operativos de solicitudes pendientes, listas y préstamos vencidos.
  - Registro de ejemplares dañados o perdidos con detalle obligatorio y auditoría.
  - Suspensión temporal configurable del usuario por incidencias bibliotecarias.
  - Bloqueo de nuevos préstamos durante la suspensión y opción autorizada para levantarla.
  - Historial visible de préstamos, devoluciones, pérdidas, daños y suspensiones.
  - Métricas de libros más solicitados, préstamos vencidos y ejemplares fuera de circulación.
- Parqueo Inteligente:
  - Vehículos vinculados a usuarios institucionales y pase digital único.
  - Aforo en vivo, capacidad configurable y reserva mínima para uso regular.
  - Control operativo de dos entradas y una salida, con historial de movimientos.
  - Recomendación de entrada según la carga registrada durante los últimos 15 minutos.
  - Validación de placa o pase para impedir ingresos duplicados y sobrecupo.
  - Eventos con espacios reservados sin consumir toda la capacidad universitaria.
  - Invitados con pases de un solo uso y control de vigencia por horario del evento.
  - Roles independientes PARQUEO y EVENTOS con credenciales temporales.
  - Base preparada para lector QR, cámaras de placas y barreras físicas.
  - QR visual para vehículos e invitados, disponible desde teléfono o computadora.
  - Escáner por cámara incorporado al control de entrada y salida.
  - QR vehicular dinámico con vigencia de cinco minutos y renovación automática.
  - Bloqueo inmediato y reactivación de pases por el propietario o personal autorizado.
  - Bitácora de accesos autorizados y rechazados con motivo, entrada, placa y hora.
  - Tablero operativo por evento con cupo reservado, invitados, ingresos y vehículos dentro.
  - Búsqueda de invitados por nombre, placa o pase.
  - Regeneración y cancelación de pases individuales desde el tablero.
  - Cierre controlado del evento y liberación del cupo cuando ya no quedan vehículos dentro.
  - Alertas persistentes al alcanzar 80%, 90% y 100% de ocupación.
  - Detección de tres o más intentos rechazados durante diez minutos.
  - Alertas de eventos al utilizar 90% del cupo reservado.
  - Aviso diario por vehículos dentro después de las 22:00.
  - Notificación interna y correo al equipo de Administración, Parqueo y Eventos.
  - Confirmación manual de alertas atendidas sin perder su historial.
  - Modo de contingencia con lista local de placas autorizadas vigente por 12 horas.
  - Registro local de entradas y salidas mientras no existe conexión.
  - Sincronización idempotente que evita duplicar movimientos al recuperar internet.
  - Validación de autorizaciones antes de aceptar una entrada fuera de línea.
  - Apertura manual de barreras con motivo obligatorio, auditoría y alerta al equipo.
  - Caché de la interfaz para volver a abrir la operación después de una visita en línea.

## Próximo paso recomendado

Crear el repositorio privado `uspg-sistema-academico` en GitHub, conectarlo con Coolify
y realizar el primer despliegue de validación. Docker, PostgreSQL, volumen persistente,
variables obligatorias y verificación de salud ya están preparados.

## Pendientes posteriores

1. Integración completa con Google Classroom.
2. Migración efectiva a PostgreSQL cuando exista servidor destino.
3. Integración física del parqueo con lectores QR, cámaras y barreras.
4. Planes oficiales para las demás carreras cuando se reciban sus documentos.
5. Despliegue en un servidor real.
6. Antes del despliegue, actualización controlada de React Router 7.18.2 a 8.3.0 o superior y ejecución de la lista de validación descrita en `SECURITY.md`.

## Cómo continuar

Desde la carpeta del proyecto:

```bash
npm run dev
```

Para comprobar el estado antes de seguir:

```bash
npm run lint
npm run build
npx prisma migrate status
```

Al retomar, leer este archivo y continuar con la integración física de Parqueo Inteligente.
Google Classroom queda en espera de las credenciales de TI.
