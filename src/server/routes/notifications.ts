import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, ServerHelpers, AuthMiddleware } from '../types';

export function registerNotificationRoutes(
  app: express.Application,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { requireAdmin, requireUser } = middleware;
  const { notifyUser, mailTransport, deliverOutboxEmail, answerWithGemini, assistantHistory } = helpers;

  // ── Notifications ──────────────────────────────────────────────────────────

  app.get('/api/notifications', requireUser, async (_req, res) => {
    const records = await prisma.appNotification.findMany({ where: { userId: res.locals.authUser.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(records.map((record) => ({ id: record.id, title: record.title, message: record.message, date: record.createdAt.toISOString(), read: record.isRead, type: record.type.toLowerCase(), link: record.link })));
  });

  app.patch('/api/notifications/:id/read', requireUser, async (req, res) => {
    const notification = await prisma.appNotification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== res.locals.authUser.id) return void res.status(404).json({ message: 'Notificación no encontrada.' });
    await prisma.appNotification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.json({ ok: true });
  });

  app.post('/api/notifications/broadcast', requireAdmin, async (req, res) => {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    const role = req.body.role ? String(req.body.role).toUpperCase() : undefined;
    if (title.length < 3 || message.length < 5 || (role && !['ADMIN', 'DOCENTE', 'ESTUDIANTE'].includes(role))) return void res.status(400).json({ message: 'Título, mensaje o rol inválido.' });
    const users = await prisma.user.findMany({ where: { active: true, ...(role ? { role } : {}) }, select: { id: true } });
    for (const user of users) await notifyUser(user.id, title, message, String(req.body.type || 'INFO').toUpperCase(), req.body.link ? String(req.body.link) : undefined);
    await prisma.auditLog.create({ data: { action: 'BROADCAST_NOTIFICATION', entityType: 'NOTIFICATION', entityId: randomUUID(), actorId: res.locals.authUser.id, details: JSON.stringify({ title, role: role || 'TODOS', recipients: users.length }) } });
    res.json({ ok: true, recipients: users.length, smtpConfigured: Boolean(mailTransport) });
  });

  app.get('/api/notifications/outbox', requireAdmin, async (_req, res) => {
    const records = await prisma.emailOutbox.findMany({ include: { notification: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ smtpConfigured: Boolean(mailTransport), records: records.map((record) => ({ id: record.id, recipientEmail: record.recipientEmail, recipientName: record.notification.user.name, subject: record.subject, status: record.status, attempts: record.attempts, lastError: record.lastError, sentAt: record.sentAt, createdAt: record.createdAt })) });
  });

  app.post('/api/notifications/outbox/:id/retry', requireAdmin, async (req, res) => {
    const record = await prisma.emailOutbox.findUnique({ where: { id: req.params.id } });
    if (!record) return void res.status(404).json({ message: 'Correo no encontrado.' });
    await deliverOutboxEmail(record.id);
    res.json(await prisma.emailOutbox.findUnique({ where: { id: record.id } }));
  });

  // ── Assistant ──────────────────────────────────────────────────────────────

  const assistantConversationForUser = async (userId: string, conversationId?: string) => {
    if (conversationId) {
      const existing = await prisma.assistantConversation.findFirst({ where: { id: conversationId, userId } });
      if (existing) return existing;
    }
    return prisma.assistantConversation.create({ data: { userId } });
  };

  app.get('/api/assistant/conversations', requireUser, async (_req, res) => {
    const userId = res.locals.authUser.id as string;
    const conversations = await prisma.assistantConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 20, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    res.json(conversations.map((conversation) => ({ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, preview: conversation.messages[0]?.content.slice(0, 120) || '' })));
  });

  app.post('/api/assistant/conversations', requireUser, async (_req, res) => {
    const conversation = await prisma.assistantConversation.create({ data: { userId: res.locals.authUser.id as string } });
    res.status(201).json({ id: conversation.id, title: conversation.title, messages: [] });
  });

  app.get('/api/assistant/conversations/:id', requireUser, async (req, res) => {
    const conversation = await prisma.assistantConversation.findFirst({ where: { id: req.params.id, userId: res.locals.authUser.id as string }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } } });
    if (!conversation) return void res.status(404).json({ message: 'Conversación no encontrada.' });
    res.json({ id: conversation.id, title: conversation.title, messages: conversation.messages.map((message) => ({ id: message.id, from: message.role === 'user' ? 'user' : 'bot', text: message.content, links: message.linksJson ? JSON.parse(message.linksJson) : undefined })) });
  });

  app.delete('/api/assistant/conversations/:id', requireUser, async (req, res) => {
    const result = await prisma.assistantConversation.deleteMany({ where: { id: req.params.id, userId: res.locals.authUser.id as string } });
    if (!result.count) return void res.status(404).json({ message: 'Conversación no encontrada.' });
    res.json({ ok: true });
  });

  app.post('/api/assistant', requireUser, async (req, res) => {
    const user = res.locals.authUser as { id: string; role: string; name: string; carnetOrCode: string | null };
    const originalQuestion = String(req.body?.question || '').trim();
    const question = originalQuestion.toLocaleLowerCase('es-GT');
    const conversation = await assistantConversationForUser(user.id, typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined);
    const storedHistory = await prisma.assistantMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: 8 });
    const history = assistantHistory(storedHistory.reverse().map((item) => ({ from: item.role, text: item.content })));
    if (!question) return void res.status(400).json({ message: 'Escribe una pregunta.' });
    if (originalQuestion.length > 1000) return void res.status(413).json({ message: 'La pregunta es demasiado larga. Resúmela e inténtalo de nuevo.' });
    let groundedContext = '';
    const links = (() => {
      const map: [RegExp, { label: string; path: string }][] = [
        [/horario|clase|seccion|sección/, { label: 'Ver horarios', path: '/horarios' }],
        [/tarea|asignaci[oó]n/, { label: 'Ver tareas y actividades', path: '/actividades-zona' }],
        [/aprob|reprob|ganad|perdid|cr[eé]dito|pensum|promedio|calific/, { label: 'Ver historial académico', path: '/historial' }],
        [/nota|calific|promedio|pensum|crédito/, { label: 'Ver historial académico', path: '/historial' }],
        [/pago|saldo|finanz|mora|cargo/, { label: 'Ver finanzas', path: '/pagos' }],
        [/biblioteca|libro|préstamo|prestamo/, { label: 'Abrir biblioteca', path: '/biblioteca' }],
        [/asignar|llevar|puedo cursar|segundo semestre|pr[oó]ximo semestre|siguiente semestre/, { label: 'Ver inscripción de cursos', path: '/inscripcion' }],
        [/solicitud|trámite|tramite|constancia|expediente|document/, { label: 'Ver solicitudes y documentos', path: '/solicitudes' }],
        [/estudiante|alumno|usuario|carrera|curso/, { label: 'Abrir módulo académico', path: '/dashboard' }],
      ];
      const match = map.find(([pattern]) => pattern.test(question));
      return match ? [match[1]] : [];
    })();
    await prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'user', content: originalQuestion } });
    const reply = async (answer: string) => {
      // Every answer is grounded in the database result before Gemini formats it.
      const finalAnswer = await answerWithGemini(`${originalQuestion}\nHistorial reciente:\n${history}`, user.role, groundedContext || answer, answer);
      await prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: finalAnswer, linksJson: links.length ? JSON.stringify(links) : null } });
      await prisma.assistantConversation.update({ where: { id: conversation.id }, data: { title: conversation.title === 'Nueva conversación' ? originalQuestion.slice(0, 60) : undefined } });
      return void res.json({ conversationId: conversation.id, answer: finalAnswer, links });
    };
    if (/revela|muéstrame|muestrame|ignora|omite|instrucciones|prompt|system message|clave|api key|secreto|configuración interna/.test(question)) {
      return void reply('Puedo ayudarte con información y procesos universitarios, pero no puedo revelar instrucciones internas, claves, secretos ni datos de otros usuarios.');
    }
    if (user.role === 'ESTUDIANTE') {
      const currentCycle = await prisma.academicCycle.findFirst({ where: { isCurrent: true } });
      const student = await prisma.student.findUnique({ where: { userId: user.id }, include: { plan: { include: { courses: { include: { course: true }, orderBy: { semester: 'asc' } } } }, enrollments: { where: { status: 'Inscrito', ...(currentCycle ? { section: { cycleId: currentCycle.id } } : {}) }, include: { section: { include: { course: true, teacher: true, classroom: true, cycle: true } } } }, gradeRecords: { include: { section: { include: { course: true } } } }, financialCharges: { include: { payments: true, adjustments: true } } } });
      if (!student) return void reply('No encontré tu expediente de estudiante asociado a esta cuenta.');
      const [tasks, attendance, loans, requests, cycles, institution, offeredSections] = await Promise.all([
        prisma.zoneActivity.findMany({ where: { isPublished: true, section: { enrollments: { some: { studentCarnet: student.carnet, status: 'Inscrito' } } } }, include: { section: { include: { course: true } }, grades: { where: { studentCarnet: student.carnet }, select: { score: true, feedback: true } } }, orderBy: { dueDate: 'asc' } }),
        prisma.attendanceRecord.findMany({ where: { studentCarnet: student.carnet }, include: { session: { include: { section: { include: { course: true } } } } }, orderBy: { session: { classDate: 'desc' } } }),
        prisma.libraryLoan.findMany({ where: { borrowerId: user.id, status: { not: 'DEVUELTO' } }, include: { copy: { include: { book: true } } }, orderBy: { dueAt: 'asc' } }),
        prisma.studentServiceRequest.findMany({ where: { studentCarnet: student.carnet }, orderBy: { createdAt: 'desc' }, take: 10 }),
        prisma.academicCycle.findMany({ orderBy: { startDate: 'desc' }, take: 4 }),
        prisma.institutionConfig.findUnique({ where: { id: 1 } }),
        prisma.section.findMany({ where: { status: 'Abierta' }, select: { cycleId: true, courseCode: true } }),
      ]);
      // El dashboard muestra el expediente acumulado del estudiante, no solo las
      // actas publicadas del ciclo actual. Esta misma fuente/lógica se usa aquí.
      const visibleGrades = student.gradeRecords;
      const approvedGrades = visibleGrades.filter((item) => item.status === 'Aprobado' || ((item.isPublished || item.section.gradeActStatus !== 'BORRADOR') && item.total >= 61));
      const failedGrades = visibleGrades.filter((item) => item.status === 'Reprobado' || ((item.isPublished || item.section.gradeActStatus !== 'BORRADOR') && item.total < 61));
      const approvedCodes = new Set(approvedGrades.map((item) => item.section.courseCode));
      const pendingPlanCourses = (student.plan?.courses || []).filter((item) => !approvedCodes.has(item.courseCode));
      const pendingBalance = student.financialCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.adjustments.reduce((a, item) => a + item.amount, 0) - charge.payments.reduce((a, item) => a + item.amount, 0)), 0);
      const verifiedContext = JSON.stringify({ estudiante: { carnet: student.carnet, nombre: student.name, carrera: student.careerName, plan: student.plan?.name }, cursosInscritos: student.enrollments.map((item) => ({ codigo: item.section.course.code, nombre: item.section.course.name, dias: item.section.scheduleDays, hora: item.section.scheduleTime, aula: item.section.classroom.code, docente: item.section.teacher.name })), calificacionesDelExpediente: visibleGrades.map((item) => ({ curso: item.section.course.name, total: Number(item.total), estado: item.status, visible: item.isPublished || item.section.gradeActStatus !== 'BORRADOR' })), promedioGeneral: Number(student.gpa), creditos: { aprobados: Number(student.creditsEarned), requeridos: Number(student.totalCreditsRequired), pendientes: Math.max(0, Number(student.totalCreditsRequired) - Number(student.creditsEarned)) }, pensumPendiente: pendingPlanCourses.map((item) => ({ curso: item.course.name, semestre: item.semester, creditos: item.course.credits })), tareas: tasks.map((item) => ({ nombre: item.name, curso: item.section.course.name, vence: item.dueDate, entregada: item.grades.length > 0, calificacion: item.grades[0]?.score ?? null })), asistencia: attendance.map((item) => ({ curso: item.session.section.course.name, fecha: item.session.classDate, estado: item.status })), pagos: { saldoPendiente: pendingBalance, cargos: student.financialCharges.map((item) => ({ concepto: item.concept, vencimiento: item.dueDate, estado: item.status })) }, biblioteca: loans.map((item) => ({ libro: item.copy.book.title, vence: item.dueAt, estado: item.status })), tramites: requests.map((item) => ({ tipo: item.type, estado: item.status, proposito: item.purpose })), calendario: cycles.map((item) => ({ nombre: item.name, inicio: item.startDate, fin: item.endDate, inscripcionDesde: item.enrollmentStartDate, inscripcionHasta: item.enrollmentEndDate })), institucion: institution ? { nombre: institution.name, siglas: institution.shortName } : null });
      groundedContext = verifiedContext;
      if (/pr[oó]ximo semestre|siguiente semestre|puedo llevar|puedo cursar|asignar|segundo semestre|siguiente ciclo/.test(question)) {
        const explicitSemester = question.match(/(primer|segundo) semestre/);
        const requestedCycle = explicitSemester ? cycles.find((cycle) => cycle.name.toLocaleLowerCase('es-GT').includes(`${explicitSemester[1]} semestre`)) : null;
        const nextCycle = requestedCycle || cycles.filter((cycle) => !currentCycle || cycle.startDate > currentCycle.startDate).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
        const candidates = nextCycle ? (student.plan?.courses || []).filter((item) => !approvedCodes.has(item.courseCode)).filter((item) => offeredSections.some((section) => section.cycleId === nextCycle.id && section.courseCode === item.courseCode)) : pendingPlanCourses;
        return void reply(candidates.length ? `Para ${nextCycle?.name || 'el próximo semestre'} aparecen disponibles en tu pensum:\n${candidates.map((item) => `• ${item.course.code} · ${item.course.name} · ${item.course.credits} créditos`).join('\n')}` : `No encontré cursos ofertados para ${requestedCycle?.name || 'el próximo semestre'} en tu pensum.`);
      }
      if (/promedio|gpa|rendimiento/.test(question)) {
        const average = Number(student.gpa);
        const description = average >= 85 ? 'rendimiento sobresaliente' : average >= 80 ? 'rendimiento muy bueno' : average >= 70 ? 'rendimiento bueno' : 'rendimiento en desarrollo';
        return void reply(`Tu promedio general es ${average.toFixed(1)} sobre 100, equivalente a un ${description}.`);
      }
      const approvedCredits = approvedGrades.reduce((sum, item) => sum + item.section.course.credits, 0);
      if (/cr[eé]dito|pensum|avance/.test(question)) return void reply(`Llevas ${approvedCredits} de ${student.totalCreditsRequired} créditos; te faltan ${Math.max(0, student.totalCreditsRequired - approvedCredits)}. Cursos aprobados: ${approvedGrades.length}; reprobados: ${failedGrades.length}; pendientes en el pensum: ${pendingPlanCourses.length}.`);
      if (/aprob|ganad/.test(question)) return void reply(approvedGrades.length ? `Cursos aprobados:\n${approvedGrades.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)}`).join('\n')}` : 'No tienes cursos aprobados registrados.');
      if (/reprob|perdid/.test(question)) return void reply(failedGrades.length ? `Cursos reprobados:\n${failedGrades.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)}`).join('\n')}` : 'No tienes cursos reprobados registrados.');
      if (/tarea|asignaci[oó]n/.test(question)) return void reply(tasks.length ? `Tareas y asignaciones publicadas:\n${tasks.map((item) => `• ${item.name} · ${item.section.course.name} · vence ${item.dueDate.toLocaleDateString('es-GT')} · ${item.grades.length ? 'entregada' : 'pendiente'}`).join('\n')}` : 'No hay tareas publicadas para tus cursos.');
      if (/biblioteca|libro|préstamo|prestamo/.test(question)) return void reply(loans.length ? `Tus préstamos de biblioteca:\n${loans.map((item) => `• ${item.copy.book.title} · vence ${item.dueAt.toLocaleDateString('es-GT')} · ${item.status}`).join('\n')}` : 'No tienes préstamos activos en biblioteca.');
      if (/docente|catedr/.test(question)) return void reply(student.enrollments.length ? `Docentes por curso:\n${student.enrollments.map((item) => `• ${item.section.course.name}: ${item.section.teacher.name}`).join('\n')}` : 'No tienes cursos inscritos actualmente.');
      if (/calendario|inicio de clases|fin de clases|examen|semestre|per[ií]odo acad/.test(question)) {
        return void reply(currentCycle ? `El ciclo académico actual es "${currentCycle.name}". Inicia el ${currentCycle.startDate.toLocaleDateString('es-GT')} y finaliza el ${currentCycle.endDate.toLocaleDateString('es-GT')}.` : 'No hay un ciclo académico actual configurado en el sistema.');
      }
      if (/horario|hora|clase|hoy|mañana|curso|materia|llevo|inscrit/.test(question) && !/nota|calific|promedio|pago|saldo|pensum|crédito|asist|recuper|biblioteca/.test(question)) {
        const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('es-GT', { weekday: 'long' }).toLocaleLowerCase('es-GT');
        const requestedDay = /mañana|manana/.test(question) ? tomorrow : /lunes/.test(question) ? 'lunes' : /martes/.test(question) ? 'martes' : /miércoles|miercoles/.test(question) ? 'miércoles' : /jueves/.test(question) ? 'jueves' : /viernes/.test(question) ? 'viernes' : /sábado|sabado/.test(question) ? 'sábado' : /domingo/.test(question) ? 'domingo' : null;
        const lines = student.enrollments.filter((item) => { if (!requestedDay) return true; try { return JSON.parse(item.section.scheduleDays).some((day: string) => day.toLocaleLowerCase('es-GT').includes(requestedDay)); } catch { return item.section.scheduleDays.toLocaleLowerCase('es-GT').includes(requestedDay); } }).map((item) => { let days = item.section.scheduleDays; try { days = JSON.parse(days).join(', '); } catch { /* legacy plain text */ } return `• ${item.section.course.code} · ${item.section.course.name}\n  ${days} · ${item.section.scheduleTime}\n  Aula: ${item.section.classroom.code} · Docente: ${item.section.teacher.name}`; });
        return void reply(lines.length ? `${requestedDay ? `Tus clases del ${requestedDay}` : 'Estos son tus cursos inscritos'}:\n${lines.join('\n')}` : requestedDay ? `No tienes clases programadas el ${requestedDay}.` : currentCycle ? `No tienes cursos inscritos en el ciclo actual (${currentCycle.name}).` : 'No hay un ciclo académico actual configurado.');
      }
      if (/nota|calificacion|calificación|ganad/.test(question)) {
        const lines = visibleGrades.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => `${item.section.course.code} ${item.section.course.name}: ${Number(item.total).toFixed(1)} · ${item.status}`);
        return void reply(lines.length ? `Tus calificaciones del expediente son:\n${lines.join('\n')}` : 'Todavía no tienes calificaciones registradas.');
      }
      if (/debo|pago|saldo|finanz/.test(question)) {
        const balance = student.financialCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
        return void reply(`Tu saldo pendiente registrado es Q${balance.toFixed(2)}.`);
      }
      if (/pensum|avance|credit/.test(question)) return void reply(`Llevas ${student.creditsEarned} de ${student.totalCreditsRequired} créditos; te faltan ${Math.max(0, student.totalCreditsRequired - student.creditsEarned)}. Cursos aprobados: ${approvedGrades.length}; reprobados: ${failedGrades.length}; pendientes en el pensum: ${pendingPlanCourses.length}.`);
      if (/tarea|asignaci[oó]n|pendiente/.test(question)) return void reply(tasks.length ? `Tareas y asignaciones publicadas:\n${tasks.map((item) => `• ${item.name} · ${item.section.course.name} · vence ${item.dueDate.toLocaleDateString('es-GT')} · ${item.grades.length ? 'entregada' : 'pendiente'}`).join('\n')}` : 'No hay tareas publicadas para tus cursos.');
      if (/docente|catedr/.test(question)) return void reply(student.enrollments.length ? `Docentes por curso:\n${student.enrollments.map((item) => `• ${item.section.course.name}: ${item.section.teacher.name}`).join('\n')}` : 'No tienes cursos inscritos actualmente.');
      if (/pr[oó]ximo semestre|siguiente semestre|puedo llevar|siguiente ciclo/.test(question)) {
        const nextCycle = cycles.find((cycle) => !currentCycle || cycle.id !== currentCycle.id);
        const candidates = nextCycle ? (student.plan?.courses || []).filter((item) => !approvedCodes.has(item.courseCode)).filter((item) => offeredSections.some((section) => section.cycleId === nextCycle.id && section.courseCode === item.courseCode)) : pendingPlanCourses;
        return void reply(candidates.length ? `Para ${nextCycle?.name || 'el próximo semestre'} aparecen disponibles en tu pensum:\n${candidates.map((item) => `• ${item.course.code} · ${item.course.name} · ${item.course.credits} créditos`).join('\n')}` : 'No encontré cursos ofertados para el próximo semestre en tu pensum.');
      }
      if (/asistencia|faltas|presencia/.test(question)) {
        const present = attendance.filter((item) => item.status === 'PRESENTE').length;
        return void reply(`Asistencia registrada: ${present} presente(s), ${attendance.length - present} ausencia(s) o tardanza(s), de ${attendance.length} registro(s).`);
      }
      if (/recuperaci|examen de recuper/.test(question)) {
        const recoveries = await prisma.recoveryExam.findMany({ where: { gradeRecord: { studentCarnet: student.carnet } }, include: { gradeRecord: { include: { section: { include: { course: true } } } } } });
        return void reply(recoveries.length ? `Recuperaciones:\n${recoveries.map((item) => `• ${item.gradeRecord.section.course.name}: ${item.status}${item.recoveryScore != null ? ` · nota ${item.recoveryScore}` : ''}`).join('\n')}` : 'No tienes recuperaciones registradas.');
      }
      if (/solicitud|trámite|tramite|constancia/.test(question)) {
        const studentRequests = await prisma.studentServiceRequest.findMany({ where: { studentCarnet: student.carnet }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, status: true, purpose: true } });
        return void reply(studentRequests.length ? `Tus solicitudes recientes:\n${studentRequests.map((item) => `• ${item.type} · ${item.status} · ${item.purpose}`).join('\n')}` : 'No tienes solicitudes registradas.');
      }
      if (/notificaci|aviso/.test(question)) {
        const notifications = await prisma.appNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { title: true, message: true, isRead: true } });
        return void reply(notifications.length ? `Tus notificaciones recientes:\n${notifications.map((item) => `• ${item.title}${item.isRead ? ' · leída' : ' · pendiente'}\n  ${item.message}`).join('\n')}` : 'No tienes notificaciones.');
      }
      if (/biblioteca|libro|préstamo|prestamo/.test(question)) {
        return void reply(loans.length ? `Tus préstamos de biblioteca:\n${loans.map((item) => `• ${item.copy.book.title} · vence ${item.dueAt.toLocaleDateString('es-GT')} · ${item.status}`).join('\n')}` : 'No tienes préstamos activos en biblioteca.');
      }
      const context = JSON.stringify({ estudiante: { nombre: student.name, carrera: student.careerName, promedio: student.gpa, creditosAprobados: student.creditsEarned, creditosRequeridos: student.totalCreditsRequired }, cursosInscritos: student.enrollments.map((item) => ({ codigo: item.section.course.code, nombre: item.section.course.name, horario: item.section.scheduleDays, hora: item.section.scheduleTime, docente: item.section.teacher.name })), notasPublicadas: student.gradeRecords.filter((item) => item.isPublished).map((item) => ({ curso: item.section.course.name, nota: item.total })), cargos: student.financialCharges.map((charge) => ({ concepto: charge.concept, monto: charge.amount, pagos: charge.payments.reduce((sum, payment) => sum + payment.amount, 0) })) });
      return void reply(await answerWithGemini(`${question}\nHistorial reciente:\n${history}`, user.role, context, 'Puedo ayudarte con cursos, horarios, notas, asistencia, pagos, recuperaciones, biblioteca, solicitudes y avance del pensum. Indícame qué necesitas consultar.'));
    }
    if (user.role === 'DOCENTE') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: user.id }, include: { sections: { include: { course: true, classroom: true, cycle: true } } } });
      if (!teacher) return void reply('No encontré tus secciones asignadas.');
      const lines = teacher.sections.map((item) => `${item.code} · ${item.course.code} ${item.course.name}: ${item.scheduleDays} ${item.scheduleTime}, aula ${item.classroom.code}, inscritos ${item.enrolledCount}`);
      const context = JSON.stringify({ docente: teacher.name, secciones: teacher.sections.map((item) => ({ codigo: item.code, curso: item.course.name, horario: item.scheduleDays, hora: item.scheduleTime, inscritos: item.enrolledCount })) });
      return void reply(await answerWithGemini(`${question}\nHistorial reciente:\n${history}`, user.role, context, /horario|seccion|sección|curso|clase/.test(question) ? `Tus secciones asignadas:\n${lines.join('\n') || 'No tienes secciones asignadas.'}` : `Tienes ${teacher.sections.length} secciones asignadas. Puedes preguntar por tus secciones, horarios, aulas o cantidad de inscritos.`));
    }
    if (user.role === 'ADMIN') {
      const [students, teachers, courses, sections, careers, pendingDocuments, pendingCharges, parkingConfig, vehiclesInside, activeEvents, pendingRequests, unreadNotifications, activeLoans, attendanceSessions, recoveryExams, zoneActivities, virtualClassrooms, mfaUsers] = await Promise.all([prisma.student.count(), prisma.teacher.count(), prisma.course.count(), prisma.section.count(), prisma.career.count(), prisma.enrollmentDocument.count({ where: { status: 'PENDIENTE' } }), prisma.financialCharge.count({ where: { status: { in: ['PENDIENTE', 'VENCIDO'] } } }), prisma.parkingConfig.findUnique({ where: { id: 1 } }), prisma.parkingVisit.count({ where: { status: 'DENTRO' } }), prisma.parkingEvent.count({ where: { status: { in: ['PLANIFICADO', 'EN_CURSO'] } } }), prisma.studentServiceRequest.count({ where: { status: { in: ['SOLICITADA', 'EN_REVISION'] } } }), prisma.appNotification.count({ where: { isRead: false } }), prisma.libraryLoan.count({ where: { status: 'PRESTADO' } }), prisma.attendanceSession.count(), prisma.recoveryExam.count({ where: { status: { not: 'CERRADA' } } }), prisma.zoneActivity.count(), prisma.virtualClassroom.count(), prisma.user.count({ where: { mfaEnabled: true } })]);
      if (/parqueo|estacionamiento|vehículo|vehiculo/.test(question)) return void reply(`Parqueo: ${vehiclesInside} vehículo(s) dentro de ${parkingConfig?.totalCapacity || 0} espacios. Eventos activos o planificados: ${activeEvents}.`);
      if (/biblioteca|préstamo|prestamo|libro/.test(question)) return void reply(`Biblioteca: ${activeLoans} préstamo(s) activo(s).`);
      if (/solicitud|trámite|tramite/.test(question)) return void reply(`Solicitudes pendientes: ${pendingRequests}.`);
      if (/notificaci|aviso/.test(question)) return void reply(`Notificaciones no leídas: ${unreadNotifications}.`);
      if (/asistencia/.test(question)) return void reply(`Sesiones de asistencia registradas: ${attendanceSessions}.`);
      if (/recuperaci/.test(question)) return void reply(`Recuperaciones abiertas: ${recoveryExams}.`);
      if (/actividad|zona media|tarea/.test(question)) return void reply(`Actividades de zona registradas: ${zoneActivities}.`);
      if (/aula virtual|classroom|clase virtual/.test(question)) return void reply(`Aulas virtuales configuradas: ${virtualClassrooms}.`);
      if (/mfa|doble factor|seguridad/.test(question)) return void reply(`Usuarios con MFA habilitado: ${mfaUsers}.`);
      if (/reporte|informe/.test(question)) return void reply('Los reportes se generan desde el módulo Reportes con datos del ciclo seleccionado. Puedo resumir estudiantes, inscripciones, secciones, notas y finanzas; indica cuál reporte necesitas.');
      if (/cuánt|cuant|total|cantidad/.test(question) && /estudiante|alumno/.test(question) && !/expediente|document/.test(question)) return void reply(`Hay ${students} estudiantes registrados en el sistema.`);
      if (/listado|lista|alumno|estudiante|usuario/.test(question)) {
        const searchMatch = question.match(/(?:buscar|busca|nombre|carné|carne|de la carrera|de sistemas|de informática)\s+(.+)/i);
        const search = searchMatch?.[1]?.trim() || '';
        const records = await prisma.student.findMany({ where: search && search.length > 2 ? { OR: [{ name: { contains: search } }, { carnet: { contains: search } }] } : undefined, orderBy: { name: 'asc' }, take: 50, select: { carnet: true, name: true, careerName: true, status: true } });
        return void reply(records.length ? `Listado de estudiantes${search ? ` para "${search}"` : ''}:\n${records.map((item) => `• ${item.carnet} · ${item.name}\n  ${item.careerName || 'Sin carrera'} · ${item.status}`).join('\n')}` : 'No encontré estudiantes con ese criterio.');
      }
      if (/docente|catedr/.test(question)) return void reply(`Docentes registrados: ${teachers}. Puedes revisar sus asignaciones desde el módulo Docentes.`);
      if (/curso/.test(question)) return void reply(`Cursos activos en el catálogo: ${courses}. Puedes administrar cursos y prerrequisitos desde Cursos y Prerrequisitos.`);
      if (/seccion|sección|horario/.test(question)) return void reply(`Secciones registradas: ${sections}. Puedes revisar cupos, docentes, aulas y horarios desde Secciones.`);
      if (/carrera/.test(question)) return void reply(`Carreras registradas: ${careers}. Puedes consultar pensums y cursos desde Carreras.`);
      if (/expediente|document/.test(question)) return void reply(`Expedientes pendientes de revisión: ${pendingDocuments}. Puedes validarlos desde Expediente.`);
      if (/pago|saldo|mora|finanz/.test(question)) return void reply(`Cargos pendientes o vencidos: ${pendingCharges}. Puedes revisarlos desde Pagos y Solvencias.`);
      const context = JSON.stringify({ estudiantes: students, docentes: teachers, carreras: careers, cursos: courses, secciones: sections, expedientesPendientes: pendingDocuments, cargosPendientesOVencidos: pendingCharges, actividadesZona: zoneActivities, aulasVirtuales: virtualClassrooms, usuariosConMFA: mfaUsers });
      return void reply(await answerWithGemini(`${question}\nHistorial reciente:\n${history}`, user.role, context, `Resumen administrativo:\n• Estudiantes: ${students}\n• Docentes: ${teachers}\n• Carreras: ${careers}\n• Cursos: ${courses}\n• Secciones: ${sections}\n• Expedientes pendientes: ${pendingDocuments}\n• Cargos pendientes o vencidos: ${pendingCharges}`));
    }
    return void reply(`Hola ${user.name}. Puedo orientarte sobre los módulos disponibles para tu rol.`);
  });
}
