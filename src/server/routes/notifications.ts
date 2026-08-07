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
      const { text: finalAnswer, source } = await answerWithGemini(`${originalQuestion}\nHistorial reciente:\n${history}`, user.role, groundedContext || answer, answer);
      if (source === 'error') await prisma.auditLog.create({ data: { action: 'ASSISTANT_AI_FALLBACK', entityType: 'ASSISTANT', entityId: conversation.id, actorId: user.id, details: JSON.stringify({ question: originalQuestion.slice(0, 200) }) } });
      await prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: finalAnswer, linksJson: links.length ? JSON.stringify(links) : null } });
      await prisma.assistantConversation.update({ where: { id: conversation.id }, data: { title: conversation.title === 'Nueva conversación' ? originalQuestion.slice(0, 60) : undefined } });
      return void res.json({ conversationId: conversation.id, answer: finalAnswer, links });
    };
    if (/revela|muéstrame|muestrame|ignora|omite|instrucciones|prompt|system message|clave|api key|secreto|configuración interna/.test(question)) {
      return void reply('Puedo ayudarte con información y procesos universitarios, pero no puedo revelar instrucciones internas, claves, secretos ni datos de otros usuarios.');
    }
    if (user.role === 'ESTUDIANTE') {
      const student = await prisma.student.findUnique({ where: { userId: user.id }, include: { plan: { include: { courses: { include: { course: true }, orderBy: { semester: 'asc' } } } }, enrollments: { where: { status: 'Inscrito' }, include: { section: { include: { course: true, teacher: true, classroom: true, cycle: true } } } }, gradeRecords: { include: { section: { include: { course: true } } } }, financialCharges: { include: { payments: true, adjustments: true } } } });
      if (!student) return void reply('No encontré tu expediente de estudiante asociado a esta cuenta.');
      const currentCycle = await prisma.academicCycle.findFirst({ where: { isCurrent: true, campusId: student.campusId } });
      const currentEnrollments = student.enrollments.filter((e) => !currentCycle || e.section.cycleId === currentCycle.id);
      const [tasks, attendance, loans, requests, cycles, institution, offeredSections, parkingVehicles, recentParkingVisits] = await Promise.all([
        prisma.zoneActivity.findMany({ where: { isPublished: true, section: { enrollments: { some: { studentCarnet: student.carnet, status: 'Inscrito' } } } }, include: { section: { include: { course: true } }, grades: { where: { studentCarnet: student.carnet }, select: { score: true, feedback: true } } }, orderBy: { dueDate: 'asc' } }),
        prisma.attendanceRecord.findMany({ where: { studentCarnet: student.carnet }, include: { session: { include: { section: { include: { course: true } } } } }, orderBy: { session: { classDate: 'desc' } } }),
        prisma.libraryLoan.findMany({ where: { borrowerId: user.id, status: { not: 'DEVUELTO' } }, include: { copy: { include: { book: true } } }, orderBy: { dueAt: 'asc' } }),
        prisma.studentServiceRequest.findMany({ where: { studentCarnet: student.carnet }, orderBy: { createdAt: 'desc' }, take: 10 }),
        prisma.academicCycle.findMany({ where: { campusId: student.campusId }, orderBy: { startDate: 'desc' }, take: 4 }),
        prisma.institutionConfig.findUnique({ where: { id: 1 } }),
        prisma.section.findMany({ where: { status: 'Abierta' }, select: { cycleId: true, courseCode: true, code: true, enrolledCount: true, capacity: true, course: { select: { name: true } } } }),
        prisma.parkingVehicle.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' } }),
        prisma.parkingVisit.findMany({ where: { userId: user.id }, orderBy: { enteredAt: 'desc' }, take: 10 }),
      ]);
      // El dashboard muestra el expediente acumulado del estudiante, no solo las
      // actas publicadas del ciclo actual. Esta misma fuente/lógica se usa aquí.
      const visibleGrades = student.gradeRecords;
      const approvedGrades = visibleGrades.filter((item) => item.status === 'Aprobado' || ((item.isPublished || item.section.gradeActStatus !== 'BORRADOR') && item.total >= 61));
      const failedGrades = visibleGrades.filter((item) => item.status === 'Reprobado' || ((item.isPublished || item.section.gradeActStatus !== 'BORRADOR') && item.total < 61));
      const approvedCodes = new Set(approvedGrades.map((item) => item.section.courseCode));
      const pendingPlanCourses = (student.plan?.courses || []).filter((item) => !approvedCodes.has(item.courseCode));
      const pendingBalance = student.financialCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.adjustments.reduce((a, item) => a + item.amount, 0) - charge.payments.reduce((a, item) => a + item.amount, 0)), 0);
      const verifiedContext = JSON.stringify({ estudiante: { carnet: student.carnet, nombre: student.name, carrera: student.careerName, plan: student.plan?.name }, cursosInscritos: currentEnrollments.map((item) => ({ codigo: item.section.course.code, nombre: item.section.course.name, dias: item.section.scheduleDays, hora: item.section.scheduleTime, aula: item.section.classroom.code, docente: item.section.teacher.name })), calificacionesDelExpediente: visibleGrades.map((item) => ({ curso: item.section.course.name, total: Number(item.total), estado: item.status, visible: item.isPublished || item.section.gradeActStatus !== 'BORRADOR' })), promedioGeneral: Number(student.gpa), creditos: { aprobados: Number(student.creditsEarned), requeridos: Number(student.totalCreditsRequired), pendientes: Math.max(0, Number(student.totalCreditsRequired) - Number(student.creditsEarned)) }, pensumPendiente: pendingPlanCourses.map((item) => ({ curso: item.course.name, semestre: item.semester, creditos: item.course.credits })), tareas: tasks.map((item) => ({ nombre: item.name, curso: item.section.course.name, vence: item.dueDate, entregada: item.grades.length > 0, calificacion: item.grades[0]?.score ?? null })), asistencia: attendance.map((item) => ({ curso: item.session.section.course.name, fecha: item.session.classDate, estado: item.status })), pagos: { saldoPendiente: pendingBalance, cargos: student.financialCharges.map((item) => ({ concepto: item.concept, vencimiento: item.dueDate, estado: item.status })) }, biblioteca: loans.map((item) => ({ libro: item.copy.book.title, vence: item.dueAt, estado: item.status })), tramites: requests.map((item) => ({ tipo: item.type, estado: item.status, proposito: item.purpose })), calendario: cycles.map((item) => ({ nombre: item.name, inicio: item.startDate, fin: item.endDate, inscripcionDesde: item.enrollmentStartDate, inscripcionHasta: item.enrollmentEndDate })), institucion: institution ? { nombre: institution.name, siglas: institution.shortName } : null, parqueo: { vehiculos: parkingVehicles.map((v) => ({ placa: v.plate, marca: v.make, modelo: v.model, color: v.color, tipo: v.type, estado: v.status, codigoAcceso: v.accessCode })), visitasRecientes: recentParkingVisits.map((v) => ({ placa: v.plate, entrada: v.enteredAt, salida: v.exitedAt, estado: v.status })) } });
      groundedContext = verifiedContext;
      const approvedCredits = approvedGrades.reduce((sum, item) => sum + item.section.course.credits, 0);

      // ── Detección de preguntas combinadas (2 temas en una) ──────────────────────
      type TopicKey = 'grades' | 'payments' | 'schedule' | 'attendance' | 'tasks' | 'library' | 'parking';
      const topicPatterns: [TopicKey, RegExp][] = [
        ['grades', /nota|calificaci[oó]n|promedio|aprob|reprob/],
        ['payments', /pago|saldo|debo|finanz|deuda|mora/],
        ['schedule', /horario|clase|inscrit|materia|llevo/],
        ['attendance', /asistencia|faltas|presencia/],
        ['tasks', /tarea|asignaci[oó]n/],
        ['library', /biblioteca|libro|pr[eé]stamo/],
        ['parking', /parqueo|veh[ií]culo|placa|carro/],
      ];
      const matchedTopics = topicPatterns.filter(([, pattern]) => pattern.test(question)).map(([key]) => key);
      if (matchedTopics.length >= 2 && /\by\b|tambi[eé]n|adem[aá]s/.test(question)) {
        const parts: string[] = [];
        if (matchedTopics.includes('grades')) {
          const lines = visibleGrades.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5).map((item) => `${item.section.course.name}: ${Number(item.total).toFixed(1)} · ${item.status}`);
          parts.push(lines.length ? `Calificaciones:\n${lines.join('\n')}` : 'Sin calificaciones registradas.');
        }
        if (matchedTopics.includes('payments')) {
          const balance = student.financialCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
          parts.push(`Saldo pendiente: Q${balance.toFixed(2)}.`);
        }
        if (matchedTopics.includes('schedule')) {
          const lines = currentEnrollments.map((item) => `${item.section.course.name} · ${item.section.scheduleTime}`);
          parts.push(lines.length ? `Cursos inscritos:\n${lines.join('\n')}` : 'Sin cursos inscritos actualmente.');
        }
        if (matchedTopics.includes('attendance')) {
          const present = attendance.filter((item) => item.status === 'PRESENTE').length;
          parts.push(`Asistencia: ${present} presentes, ${attendance.length - present} ausencias/tardanzas.`);
        }
        if (matchedTopics.includes('tasks')) {
          const pending = tasks.filter((item) => item.grades.length === 0);
          parts.push(pending.length ? `Tareas pendientes: ${pending.map((item) => item.name).join(', ')}.` : 'Sin tareas pendientes.');
        }
        if (matchedTopics.includes('library')) {
          parts.push(loans.length ? `Préstamos activos: ${loans.map((item) => `${item.copy.book.title} (vence ${item.dueAt.toLocaleDateString('es-GT')})`).join(', ')}.` : 'Sin préstamos activos.');
        }
        if (matchedTopics.includes('parking')) {
          parts.push(parkingVehicles.length ? `Vehículos: ${parkingVehicles.map((v) => v.plate).join(', ')}.` : 'Sin vehículos registrados.');
        }
        return void reply(parts.join('\n\n'));
      }

      // ── Exámenes finales ────────────────────────────────────────────────────────
      if (/examen.*final|final.*examen|ex[aá]menes|semana.*examen|examen.*cu[aá]ndo|cu[aá]ndo.*examen/.test(question)) {
        if (!currentCycle) return void reply('No hay un ciclo académico actual configurado.');
        if ((currentCycle as any).examStartDate) {
          const start = new Date((currentCycle as any).examStartDate).toLocaleDateString('es-GT');
          const end = (currentCycle as any).examEndDate ? new Date((currentCycle as any).examEndDate).toLocaleDateString('es-GT') : null;
          return void reply(`Los exámenes finales del ${currentCycle.name} están programados del ${start}${end ? ` al ${end}` : ''}.`);
        }
        return void reply(`No hay fechas de exámenes finales configuradas para ${currentCycle.name}. Consulta con tu docente o administración.`);
      }

      // ── Renovar préstamo de biblioteca ──────────────────────────────────────────
      if (/renovar|renovaci[oó]n|extender.*pr[eé]stamo|pr[eé]stamo.*extender|alargar.*pr[eé]stamo/.test(question)) {
        if (!loans.length) return void reply('No tienes préstamos activos para renovar.');
        const renewable = loans.filter((item) => item.renewalCount === 0);
        if (!renewable.length) return void reply('Tus préstamos ya han sido renovados el máximo de 1 vez permitida. Devuelve el libro y solicita uno nuevo si es necesario.');
        return void reply(`Puedes renovar ${renewable.length} préstamo(s):\n${renewable.map((item) => `• ${item.copy.book.title} · vence ${item.dueAt.toLocaleDateString('es-GT')}`).join('\n')}\nVe al módulo Biblioteca y selecciona la opción de renovación.`);
      }

      // ── Disponibilidad de un libro para otra persona ────────────────────────────
      if (/compa[ñn]ero|amigo|amiga|otra persona|alguien m[aá]s|puede prestar|puede llevar/.test(question) && /libro|biblioteca|pr[eé]stamo/.test(question)) {
        const searchMatch = question.match(/(?:el libro|libro de|de|sobre|título)\s+([a-z0-9\s]+)/i);
        const search = searchMatch?.[1]?.trim();
        const books = await prisma.libraryBook.findMany({ where: { status: 'ACTIVO', ...(search && search.length > 2 ? { OR: [{ title: { contains: search } }, { author: { contains: search } }] } : {}) }, include: { copies: { where: { status: 'DISPONIBLE' }, select: { id: true } } }, orderBy: { title: 'asc' }, take: 10 });
        if (!books.length) return void reply(search ? `No encontré el libro "${search}" en el catálogo.` : 'Indica el nombre del libro que buscas.');
        return void reply(`Disponibilidad${search ? ` de "${search}"` : ''}:\n${books.map((b) => `• ${b.title} · ${b.author} · ${b.copies.length} copia(s) disponible(s)`).join('\n')}\nCualquier estudiante o docente puede solicitarlo desde el módulo Biblioteca.`);
      }

      // ── Graduación ─────────────────────────────────────────────────────────────
      if (/graduar|recibirme|titularme|terminar la carrera|falta para terminar|cu[aá]nto me falta|cu[aá]nto falta para graduarme/.test(question)) {
        const remainingCredits = Math.max(0, student.totalCreditsRequired - approvedCredits);
        const nextSemesters = pendingPlanCourses.reduce((max, item) => Math.max(max, item.semester), 0) - (student.plan?.courses || []).filter((item) => approvedCodes.has(item.courseCode)).reduce((max, item) => Math.max(max, item.semester), 0);
        const semestersLeft = Math.max(0, nextSemesters);
        return void reply(remainingCredits === 0 && pendingPlanCourses.length === 0
          ? '¡Tienes todos los créditos y cursos del pensum completados! Consulta con administración para iniciar el proceso de graduación.'
          : `Para graduarte te faltan ${remainingCredits} créditos y ${pendingPlanCourses.length} curso(s) del pensum.\nCursos pendientes:\n${pendingPlanCourses.slice(0, 15).map((item) => `• ${item.course.code} · ${item.course.name} · Semestre ${item.semester} · ${item.course.credits} cr.`).join('\n')}${pendingPlanCourses.length > 15 ? `\n… y ${pendingPlanCourses.length - 15} más.` : ''}`);
      }

      // ── Tiempo en la carrera ────────────────────────────────────────────────────
      if (/cu[aá]nto tiempo llevo|tiempo.*carrera|semestres cursados|cu[aá]ntos ciclos|cu[aá]ntos semestres llevo/.test(question)) {
        const cyclesWithGrades = new Set(student.gradeRecords.map((item) => item.section.cycleId)).size;
        return void reply(`Llevas ${cyclesWithGrades} ciclo(s) académico(s) con calificaciones registradas en la carrera de ${student.careerName}.`);
      }

      // ── Cursos en riesgo de reprobar ────────────────────────────────────────────
      if (/riesgo|peligro.*reprobar|voy mal|curso.*bajo|bajo en|mal en.*curso|en peligro|reprobar/.test(question) && !/puedo recuperar|derecho.*recuper/.test(question)) {
        const atRisk = visibleGrades.filter((item) => item.status !== 'Aprobado' && item.status !== 'Reprobado' && Number(item.total) < 61 && Number(item.total) > 0);
        const currentAtRisk = currentEnrollments.filter((e) => {
          const grade = atRisk.find((g) => g.section.courseCode === e.section.course.code);
          return Boolean(grade);
        });
        if (!currentAtRisk.length && !atRisk.length) return void reply('No se detectaron cursos en riesgo con calificaciones actuales publicadas.');
        const lines = atRisk.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)} pts · ${item.status}`);
        return void reply(`Cursos con nota por debajo de 61 puntos:\n${lines.join('\n')}\nTe recomendamos asistir a tutorías o consultar al docente.`);
      }

      // ── Elegibilidad para recuperación ─────────────────────────────────────────
      if (/puedo recuperar|tengo derecho.*recuper|aplico.*recuper|derecho a recuper|puedo hacer recuper/.test(question)) {
        const eligible = visibleGrades.filter((item) => Number(item.total) >= 31 && Number(item.total) <= 60 && item.status !== 'Aprobado');
        return void reply(eligible.length
          ? `Cursos con derecho a recuperación (nota entre 31 y 60):\n${eligible.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)} pts`).join('\n')}\nSolicita tu examen de recuperación desde el módulo Recuperaciones.`
          : 'No tienes cursos elegibles para recuperación en este momento (se requiere nota entre 31 y 60 puntos).');
      }

      // ── Verificar prerequisito de un curso ─────────────────────────────────────
      if (/prerequisito|prerrequisito|puedo inscribir|tengo.*prerreq|req.*para/.test(question)) {
        const courseMatch = question.match(/(?:de|para|inscribir|llevar|cursar)\s+([a-z0-9\s]+)/i);
        const searchTerm = courseMatch?.[1]?.trim();
        const planCourse = searchTerm ? (student.plan?.courses || []).find((item) => item.course.name.toLocaleLowerCase('es-GT').includes(searchTerm) || item.course.code.toLocaleLowerCase('es-GT').includes(searchTerm)) : null;
        if (!planCourse) return void reply('Indica el nombre o código del curso para verificar sus prerrequisitos. Ejemplo: "¿puedo inscribir Física II?"');
        const prereqs = await prisma.coursePrerequisite.findMany({ where: { courseCode: planCourse.courseCode }, include: { prerequisite: true } });
        if (!prereqs.length) return void reply(`${planCourse.course.name} no tiene prerrequisitos registrados.`);
        const met = prereqs.filter((p) => approvedCodes.has(p.prerequisiteCode));
        const missing = prereqs.filter((p) => !approvedCodes.has(p.prerequisiteCode));
        return void reply(`Prerrequisitos de ${planCourse.course.name}:\n${prereqs.map((p) => `• ${p.prerequisite.code} · ${p.prerequisite.name} · ${approvedCodes.has(p.prerequisiteCode) ? '✓ Aprobado' : '✗ Pendiente'}`).join('\n')}\n${missing.length === 0 ? '¡Cumples todos los prerrequisitos para inscribir este curso!' : `Te faltan ${missing.length} prerrequisito(s) por aprobar.`}`);
      }

      // ── Semestre del pensum en que estoy ───────────────────────────────────────
      if (/en qu[eé] semestre.*pensum|semestre.*pensum.*voy|semestre.*estoy|en qu[eé] semestre estoy/.test(question)) {
        const maxApprovedSemester = (student.plan?.courses || []).filter((item) => approvedCodes.has(item.courseCode)).reduce((max, item) => Math.max(max, item.semester), 0);
        const currentSemester = maxApprovedSemester + 1;
        const totalSemesters = (student.plan?.courses || []).reduce((max, item) => Math.max(max, item.semester), 0);
        return void reply(maxApprovedSemester === 0
          ? 'Aún no tienes cursos aprobados en el pensum.'
          : `Según los cursos aprobados, estás en el semestre ${currentSemester} de ${totalSemesters} del pensum de ${student.careerName}.`);
      }

      // ── Créditos de un curso específico ────────────────────────────────────────
      if (/cu[aá]ntos cr[eé]ditos.*tiene|cr[eé]ditos.*vale|cr[eé]dito.*del curso|cu[aá]nto vale.*cr[eé]dito/.test(question)) {
        const courseMatch = question.match(/(?:tiene|vale|del curso|de)\s+([a-z0-9\s]+)/i);
        const searchTerm = courseMatch?.[1]?.trim();
        const found = searchTerm ? (student.plan?.courses || []).find((item) => item.course.name.toLocaleLowerCase('es-GT').includes(searchTerm) || item.course.code.toLocaleLowerCase('es-GT').includes(searchTerm)) : null;
        if (!found) return void reply('Indica el nombre o código del curso. Ejemplo: "¿cuántos créditos tiene Física I?"');
        return void reply(`${found.course.name} (${found.course.code}) vale ${found.course.credits} crédito(s) y está en el semestre ${found.semester} del pensum.`);
      }

      // ── Cupo en sección / sección llena ────────────────────────────────────────
      if (/cupo|hay espacio|hay lugar|secci[oó]n.*llena|llena.*secci[oó]n|disponible.*inscribir/.test(question)) {
        const courseMatch = question.match(/(?:en|de|para)\s+([a-z0-9\s]+)/i);
        const searchTerm = courseMatch?.[1]?.trim();
        const matched = searchTerm ? offeredSections.filter((s) => s.course.name.toLocaleLowerCase('es-GT').includes(searchTerm) || s.courseCode.toLocaleLowerCase('es-GT').includes(searchTerm)) : offeredSections;
        if (!matched.length) return void reply(searchTerm ? `No encontré secciones abiertas para "${searchTerm}".` : 'No hay secciones abiertas actualmente.');
        return void reply(`Cupo en secciones abiertas${searchTerm ? ` para "${searchTerm}"` : ''}:\n${matched.slice(0, 15).map((s) => `• ${s.code} · ${s.course.name} · ${s.enrolledCount}/${s.capacity} inscritos · ${s.enrolledCount < s.capacity ? 'Con cupo' : 'Sin cupo'}`).join('\n')}`);
      }

      // ── Calificaciones del ciclo anterior ──────────────────────────────────────
      if (/semestre pasado|ciclo anterior|semestre anterior|el anterior|ciclo pasado/.test(question)) {
        const previousCycle = cycles.find((cycle) => !currentCycle || cycle.id !== currentCycle.id);
        const previousGrades = previousCycle ? visibleGrades.filter((item) => item.section.cycleId === previousCycle.id) : [];
        return void reply(previousGrades.length
          ? `Calificaciones del ${previousCycle?.name || 'ciclo anterior'}:\n${previousGrades.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)} · ${item.status}`).join('\n')}`
          : `No encontré calificaciones del ciclo anterior${previousCycle ? ` (${previousCycle.name})` : ''}.`);
      }

      // ── Fechas de inscripción ───────────────────────────────────────────────────
      if (/cierra.*inscripci[oó]n|plazo.*inscripci[oó]n|fecha.*inscripci[oó]n|inscripci[oó]n.*cierra|inscripci[oó]n.*fecha|cu[aá]ndo.*inscripci[oó]n|inscripci[oó]n.*cu[aá]ndo/.test(question)) {
        if (!currentCycle) return void reply('No hay un ciclo académico actual configurado.');
        const enrollEnd = currentCycle.enrollmentEndDate ? `hasta el ${new Date(currentCycle.enrollmentEndDate).toLocaleDateString('es-GT')}` : 'sin fecha límite registrada';
        const enrollStart = currentCycle.enrollmentStartDate ? `desde el ${new Date(currentCycle.enrollmentStartDate).toLocaleDateString('es-GT')} ` : '';
        return void reply(`Inscripción de cursos para ${currentCycle.name}: ${enrollStart}${enrollEnd}.`);
      }

      // ── ¿Está mi vehículo dentro del parqueo? ──────────────────────────────────
      if (/est[aá].*dentro|carro.*parqueo|moto.*parqueo|veh[ií]culo.*est[aá]|dentro.*parqueo|est[aá].*estacionado/.test(question)) {
        if (!parkingVehicles.length) return void reply('No tienes vehículos registrados en el sistema de parqueo.');
        const inside = recentParkingVisits.find((v) => v.status === 'DENTRO');
        return void reply(inside
          ? `Sí, tu vehículo (${inside.plate}) está dentro del parqueo desde ${inside.enteredAt.toLocaleString('es-GT')}.`
          : 'Ninguno de tus vehículos está registrado dentro del parqueo en este momento.');
      }

      // ── Historial / conteo de visitas al parqueo ────────────────────────────────
      if (/cu[aá]ntas veces.*parqueo|historial.*parqueo|entradas.*parqueo|visitas.*parqueo|parqueo.*cu[aá]ntas/.test(question)) {
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthCount = await prisma.parkingVisit.count({ where: { userId: user.id, enteredAt: { gte: firstOfMonth } } });
        return void reply(`Este mes has entrado al parqueo ${monthCount} vez(ces). Últimas ${recentParkingVisits.length} visita(s):\n${recentParkingVisits.map((v) => `• ${v.plate} · entrada ${v.enteredAt.toLocaleString('es-GT')}${v.exitedAt ? ` · salida ${v.exitedAt.toLocaleString('es-GT')}` : ' · aún dentro'}`).join('\n')}`);
      }

      // ── Próximo semestre ────────────────────────────────────────────────────────
      if (/pr[oó]ximo semestre|siguiente semestre|puedo llevar|puedo cursar|asignar|segundo semestre|siguiente ciclo/.test(question)) {
        const explicitSemester = question.match(/(primer|segundo) semestre/);
        const requestedCycle = explicitSemester ? cycles.find((cycle) => cycle.name.toLocaleLowerCase('es-GT').includes(`${explicitSemester[1]} semestre`)) : null;
        const nextCycle = requestedCycle || cycles.filter((cycle) => !currentCycle || cycle.startDate > currentCycle.startDate).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
        const candidates = nextCycle ? (student.plan?.courses || []).filter((item) => !approvedCodes.has(item.courseCode)).filter((item) => offeredSections.some((section) => section.cycleId === nextCycle.id && section.courseCode === item.courseCode)) : pendingPlanCourses;
        return void reply(candidates.length ? `Para ${nextCycle?.name || 'el próximo semestre'} aparecen disponibles en tu pensum:\n${candidates.map((item) => `• ${item.course.code} · ${item.course.name} · ${item.course.credits} créditos`).join('\n')}` : `No encontré cursos ofertados para ${requestedCycle?.name || 'el próximo semestre'} en tu pensum.`);
      }

      // ── Promedio ────────────────────────────────────────────────────────────────
      if (/promedio|gpa|rendimiento|c[oó]mo voy|c[oó]mo ando|c[oó]mo me va/.test(question) && !/semestre|ciclo/.test(question)) {
        const average = Number(student.gpa);
        const description = average >= 85 ? 'rendimiento sobresaliente' : average >= 80 ? 'rendimiento muy bueno' : average >= 70 ? 'rendimiento bueno' : 'rendimiento en desarrollo';
        return void reply(`Tu promedio general es ${average.toFixed(1)} sobre 100, equivalente a un ${description}.`);
      }

      // ── Créditos y avance ───────────────────────────────────────────────────────
      if (/cr[eé]dito|credito|pensum|avance/.test(question) && !/créditos.*tiene|créditos.*vale|crédito.*del curso/.test(question)) {
        return void reply(`Llevas ${approvedCredits} de ${student.totalCreditsRequired} créditos; te faltan ${Math.max(0, student.totalCreditsRequired - approvedCredits)}. Cursos aprobados: ${approvedGrades.length}; reprobados: ${failedGrades.length}; pendientes en el pensum: ${pendingPlanCourses.length}.`);
      }

      // ── Cursos aprobados / reprobados ───────────────────────────────────────────
      if (/aprob|ganad/.test(question)) return void reply(approvedGrades.length ? `Cursos aprobados:\n${approvedGrades.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)}`).join('\n')}` : 'No tienes cursos aprobados registrados.');
      if (/reprob|perdid/.test(question)) return void reply(failedGrades.length ? `Cursos reprobados:\n${failedGrades.map((item) => `• ${item.section.course.name}: ${Number(item.total).toFixed(1)}`).join('\n')}` : 'No tienes cursos reprobados registrados.');

      // ── Tareas ──────────────────────────────────────────────────────────────────
      if (/tarea|asignaci[oó]n|asignasion|pendiente.*actividad|actividad.*pendiente/.test(question)) {
        return void reply(tasks.length ? `Tareas y asignaciones publicadas:\n${tasks.map((item) => `• ${item.name} · ${item.section.course.name} · vence ${item.dueDate.toLocaleDateString('es-GT')} · ${item.grades.length ? `entregada · nota ${item.grades[0].score}` : 'pendiente'}`).join('\n')}` : 'No hay tareas publicadas para tus cursos.');
      }

      // ── Biblioteca ──────────────────────────────────────────────────────────────
      if (/biblioteca|libro|pr[eé]stamo|prestamo/.test(question)) {
        const wantsCatalog = /qu[eé] libros|cat[aá]logo|disponibles|buscar libro|hay en la biblioteca|libros tienen|libros hay|qu[eé] tienen|qu[eé] hay/.test(question);
        if (wantsCatalog) {
          const searchMatch = question.match(/(?:buscar|busca|sobre|de|título|titulo|autor|tema)\s+([a-z0-9\s]+)/i);
          const search = searchMatch?.[1]?.trim();
          const books = await prisma.libraryBook.findMany({ where: { status: 'ACTIVO', ...(search && search.length > 2 ? { OR: [{ title: { contains: search } }, { author: { contains: search } }, { category: { contains: search } }] } : {}) }, include: { copies: { where: { status: 'DISPONIBLE' }, select: { id: true } } }, orderBy: { title: 'asc' }, take: 20 });
          return void reply(books.length ? `Libros en biblioteca${search ? ` para "${search}"` : ''}:\n${books.map((b) => `• ${b.title} · ${b.author} · ${b.category} · ${b.copies.length} copia(s) disponible(s)`).join('\n')}` : `No encontré libros${search ? ` para "${search}"` : ''} en el catálogo.`);
        }
        return void reply(loans.length ? `Tus préstamos activos en biblioteca:\n${loans.map((item) => `• ${item.copy.book.title} · vence ${item.dueAt.toLocaleDateString('es-GT')} · ${item.status}`).join('\n')}` : 'No tienes préstamos activos en biblioteca.');
      }

      // ── Parqueo ─────────────────────────────────────────────────────────────────
      if (/parqueo|estacionamiento|veh[ií]culo|vehiculo|placa|ticket|tiquete|acceso.*parqueo|carro/.test(question)) {
        if (!parkingVehicles.length) return void reply('No tienes vehículos registrados en el sistema de parqueo. Puedes registrar tu vehículo desde el módulo Parqueo Inteligente.');
        const lines = parkingVehicles.map((v) => `• ${v.plate} · ${v.make} ${v.model} · ${v.color} · Código de acceso: ${v.accessCode} · Estado: ${v.status}`);
        const lastVisit = recentParkingVisits[0];
        const visitLine = lastVisit ? `\nÚltima visita: entrada ${lastVisit.enteredAt.toLocaleString('es-GT')}${lastVisit.exitedAt ? `, salida ${lastVisit.exitedAt.toLocaleString('es-GT')}` : ' · aún dentro'}.` : '';
        return void reply(`Tus vehículos registrados:\n${lines.join('\n')}${visitLine}`);
      }

      // ── Docente / maestro / profe ───────────────────────────────────────────────
      if (/docente|catedr|maestro|profe/.test(question)) {
        return void reply(currentEnrollments.length ? `Docentes por curso:\n${currentEnrollments.map((item) => `• ${item.section.course.name}: ${item.section.teacher.name}`).join('\n')}` : 'No tienes cursos inscritos actualmente.');
      }

      // ── Calendario académico ────────────────────────────────────────────────────
      if (/calendario|inicio de clases|fin de clases|per[ií]odo acad|fechas del semestre/.test(question)) {
        if (!currentCycle) return void reply('No hay un ciclo académico actual configurado en el sistema.');
        const cycle = currentCycle as any;
        const enrollInfo = currentCycle.enrollmentStartDate && currentCycle.enrollmentEndDate
          ? `\nInscripción: ${new Date(currentCycle.enrollmentStartDate).toLocaleDateString('es-GT')} al ${new Date(currentCycle.enrollmentEndDate).toLocaleDateString('es-GT')}.`
          : '';
        const examInfo = cycle.examStartDate
          ? `\nExámenes finales: ${new Date(cycle.examStartDate).toLocaleDateString('es-GT')}${cycle.examEndDate ? ` al ${new Date(cycle.examEndDate).toLocaleDateString('es-GT')}` : ''}.`
          : '';
        return void reply(`Ciclo actual: "${currentCycle.name}".\nClases: ${currentCycle.startDate.toLocaleDateString('es-GT')} al ${currentCycle.endDate.toLocaleDateString('es-GT')}.${enrollInfo}${examInfo}`);
      }

      // ── Horario y cursos ────────────────────────────────────────────────────────
      if (/horario|horaro|hora|clase|hoy|mañana|manana|curso|materia|llevo|inscrit|qu[eé] me toca|qu[eé] tengo|que tengo|que llevo/.test(question) && !/nota|calific|promedio|pago|saldo|pensum|cr[eé]dito|asist|recuper|biblioteca|c[oó]mo sal[ií]|c[oó]mo me fue/.test(question)) {
        const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('es-GT', { weekday: 'long' }).toLocaleLowerCase('es-GT');
        const requestedDay = /mañana|manana/.test(question) ? tomorrow : /lunes/.test(question) ? 'lunes' : /martes/.test(question) ? 'martes' : /mi[eé]rcoles/.test(question) ? 'miércoles' : /jueves/.test(question) ? 'jueves' : /viernes/.test(question) ? 'viernes' : /s[aá]bado/.test(question) ? 'sábado' : /domingo/.test(question) ? 'domingo' : null;
        const lines = currentEnrollments.filter((item) => { if (!requestedDay) return true; try { return JSON.parse(item.section.scheduleDays).some((day: string) => day.toLocaleLowerCase('es-GT').includes(requestedDay)); } catch { return item.section.scheduleDays.toLocaleLowerCase('es-GT').includes(requestedDay); } }).map((item) => { let days = item.section.scheduleDays; try { days = JSON.parse(days).join(', '); } catch { /* legacy */ } return `• ${item.section.course.code} · ${item.section.course.name}\n  ${days} · ${item.section.scheduleTime}\n  Aula: ${item.section.classroom.code} · Docente: ${item.section.teacher.name}`; });
        return void reply(lines.length ? `${requestedDay ? `Tus clases del ${requestedDay}` : 'Estos son tus cursos inscritos'}:\n${lines.join('\n')}` : requestedDay ? `No tienes clases programadas el ${requestedDay}.` : currentCycle ? `No tienes cursos inscritos en el ciclo actual (${currentCycle.name}).` : 'No hay un ciclo académico actual configurado.');
      }

      // ── Nota más alta / más baja ────────────────────────────────────────────────
      if (/nota m[aá]s alta|mejor nota|nota m[aá]s baja|peor nota/.test(question)) {
        if (!visibleGrades.length) return void reply('Todavía no tienes calificaciones registradas.');
        const wantsLowest = /m[aá]s baja|peor/.test(question);
        const target = visibleGrades.reduce((best, item) => (wantsLowest ? Number(item.total) < Number(best.total) : Number(item.total) > Number(best.total)) ? item : best);
        return void reply(`Tu ${wantsLowest ? 'nota más baja' : 'nota más alta'} es ${Number(target.total).toFixed(1)}, en ${target.section.course.name} (${target.status}).`);
      }

      // ── Calificaciones ──────────────────────────────────────────────────────────
      if (/nota|calificacion|calificaci[oó]n|calificasion|ganad|c[oó]mo sal[ií]|c[oó]mo me fue|mis notas|que notas/.test(question)) {
        const lines = visibleGrades.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => `${item.section.course.code} ${item.section.course.name}: ${Number(item.total).toFixed(1)} · ${item.status}`);
        return void reply(lines.length ? `Tus calificaciones del expediente son:\n${lines.join('\n')}` : 'Todavía no tienes calificaciones registradas.');
      }

      // ── Pagos y finanzas ────────────────────────────────────────────────────────
      if (/debo|pago|saldo|finanz|vencid|cu[aá]nto debo|deuda|mora/.test(question)) {
        const balance = student.financialCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
        const overdue = student.financialCharges.filter((c) => c.status === 'VENCIDO');
        const overdueText = overdue.length ? ` Tienes ${overdue.length} cargo(s) vencido(s).` : '';
        return void reply(`Tu saldo pendiente registrado es Q${balance.toFixed(2)}.${overdueText}`);
      }

      // ── Asistencia ──────────────────────────────────────────────────────────────
      if (/asistencia|asistensias|faltas|presencia|fui a clases|falt[eé]/.test(question)) {
        const present = attendance.filter((item) => item.status === 'PRESENTE').length;
        const absent = attendance.filter((item) => item.status === 'AUSENTE').length;
        const late = attendance.filter((item) => item.status === 'TARDANZA').length;
        return void reply(`Asistencia registrada: ${present} presente(s), ${absent} ausencia(s), ${late} tardanza(s), de ${attendance.length} registro(s) en total.`);
      }

      // ── Recuperaciones ──────────────────────────────────────────────────────────
      if (/recuperaci|examen de recuper|examen remedial/.test(question)) {
        const recoveries = await prisma.recoveryExam.findMany({ where: { gradeRecord: { studentCarnet: student.carnet } }, include: { gradeRecord: { include: { section: { include: { course: true } } } } } });
        return void reply(recoveries.length ? `Recuperaciones:\n${recoveries.map((item) => `• ${item.gradeRecord.section.course.name}: ${item.status}${item.recoveryScore != null ? ` · nota ${item.recoveryScore}` : ''}`).join('\n')}` : 'No tienes recuperaciones registradas.');
      }

      // ── Solicitudes y trámites ──────────────────────────────────────────────────
      if (/solicitud|tr[aá]mite|tramite|constancia|expediente|document/.test(question)) {
        const studentRequests = await prisma.studentServiceRequest.findMany({ where: { studentCarnet: student.carnet }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, status: true, purpose: true, createdAt: true } });
        return void reply(studentRequests.length ? `Tus solicitudes recientes:\n${studentRequests.map((item) => `• ${item.type} · ${item.status} · ${item.purpose} · ${new Date(item.createdAt).toLocaleDateString('es-GT')}`).join('\n')}` : 'No tienes solicitudes registradas.');
      }

      // ── Notificaciones ──────────────────────────────────────────────────────────
      if (/notificaci|aviso|avisos|mensajes del sistema/.test(question)) {
        const notifications = await prisma.appNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { title: true, message: true, isRead: true } });
        return void reply(notifications.length ? `Tus notificaciones recientes:\n${notifications.map((item) => `• ${item.title}${item.isRead ? ' · leída' : ' · sin leer'}\n  ${item.message}`).join('\n')}` : 'No tienes notificaciones.');
      }

      return void reply('Puedo ayudarte con:\n• Horarios y cursos inscritos\n• Calificaciones y promedio\n• Avance del pensum y créditos\n• Próximo semestre y cursos disponibles\n• Prerequisitos de cursos\n• Tareas y actividades\n• Asistencia y faltas\n• Pagos y saldo pendiente\n• Recuperaciones\n• Biblioteca (catálogo y préstamos)\n• Parqueo y vehículos\n• Solicitudes y trámites\n• Notificaciones\n¿Sobre qué necesitas información?');
    }
    if (user.role === 'DOCENTE') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: user.id },
        include: {
          sections: {
            where: { cycle: { isCurrent: true } },
            include: {
              course: true,
              classroom: true,
              cycle: true,
              virtualClassroom: { select: { syncStatus: true, alternateLink: true } },
              gradeRecords: { select: { total: true, recoveryExam: { select: { id: true, status: true } } } },
              attendanceSessions: { select: { id: true } },
              zoneActivities: { select: { id: true, name: true, grades: { select: { score: true } } } },
            },
          },
        },
      });
      if (!teacher) return void reply('No encontré tu información de docente.');

      const currentCycleForTeacher = teacher.sections[0]?.cycle ?? null;
      groundedContext = JSON.stringify({ docente: teacher.name, secciones: teacher.sections.map((s) => ({ codigo: s.code, curso: s.course.name, horario: s.scheduleDays, hora: s.scheduleTime, aula: s.classroom.code, ciclo: s.cycle.name, inscritos: s.enrolledCount, acta: s.gradeActStatus })) });

      // Ciclo / fechas
      if (/límite.*nota|nota.*límite|entrega.*nota|cuándo.*nota/.test(question)) {
        if (!currentCycleForTeacher) return void reply('No hay ciclo activo.');
        return void reply(`Límite para entregar notas del ciclo ${currentCycleForTeacher.name}: ${currentCycleForTeacher.gradeSubmissionDeadline.toISOString().slice(0, 10)}.`);
      }
      if (/examen.*final|final.*examen/.test(question)) {
        if (!currentCycleForTeacher) return void reply('No hay ciclo activo.');
        if (!currentCycleForTeacher.examStartDate) return void reply('El ciclo actual no tiene fechas de exámenes finales registradas.');
        return void reply(`Exámenes finales del ciclo ${currentCycleForTeacher.name}: del ${currentCycleForTeacher.examStartDate.toISOString().slice(0, 10)} al ${(currentCycleForTeacher.examEndDate ?? currentCycleForTeacher.examStartDate).toISOString().slice(0, 10)}.`);
      }
      if (/cu[aá]ndo.*termin|fin.*clase|termina.*ciclo/.test(question)) {
        if (!currentCycleForTeacher) return void reply('No hay ciclo activo.');
        return void reply(`Las clases del ciclo ${currentCycleForTeacher.name} terminan el ${currentCycleForTeacher.endDate.toISOString().slice(0, 10)}.`);
      }

      // Actas de notas
      if (/acta|actas|nota.*entreg|entreg.*nota/.test(question)) {
        const entregadas = teacher.sections.filter((s) => s.gradeActStatus === 'ENTREGADA');
        const pendientes = teacher.sections.filter((s) => s.gradeActStatus !== 'ENTREGADA');
        if (!teacher.sections.length) return void reply('No tienes secciones asignadas en el ciclo actual.');
        const lines = teacher.sections.map((s) => `• ${s.code} ${s.course.name}: ${s.gradeActStatus}`);
        return void reply(`Actas de notas:\n${lines.join('\n')}\n\nEntregadas: ${entregadas.length} · Pendientes: ${pendientes.length}`);
      }

      // Notas reprobados / riesgo
      if (/reprob/.test(question)) {
        const total = teacher.sections.reduce((sum, s) => sum + s.gradeRecords.filter((g) => g.total < 61).length, 0);
        return void reply(`Estudiantes con nota reprobatoria (< 61) en tus secciones del ciclo actual: ${total}.`);
      }
      if (/riesgo|entre.*40.*60|nota.*baja/.test(question)) {
        const total = teacher.sections.reduce((sum, s) => sum + s.gradeRecords.filter((g) => g.total >= 40 && g.total < 61).length, 0);
        return void reply(`Estudiantes en riesgo académico (nota entre 40 y 60) en tus secciones: ${total}.`);
      }
      if (/publicad|public.*nota|nota.*public/.test(question)) {
        const lines = teacher.sections.map((s) => `• ${s.code} ${s.course.name}: ${s.gradeActStatus === 'PUBLICADA' || s.gradeActStatus === 'ENTREGADA' ? 'Publicadas' : 'No publicadas'}`);
        return void reply(`Estado de publicación de notas:\n${lines.join('\n')}`);
      }

      // Asistencia
      if (/asistencia|inasistencia|faltas/.test(question)) {
        const secMatch = teacher.sections.find((s) => question.includes(s.code) || question.toLowerCase().includes(s.course.name.toLowerCase().slice(0, 5)));
        if (secMatch) {
          const highAbsence = await prisma.attendanceRecord.groupBy({
            by: ['studentCarnet'],
            where: { status: 'AUSENTE', session: { sectionId: secMatch.id } },
            _count: { _all: true },
          });
          const threshold = Math.ceil(secMatch.attendanceSessions.length * 0.25);
          const atRisk = highAbsence.filter((r) => r._count._all >= threshold);
          return void reply(`Sección ${secMatch.code} (${secMatch.course.name}) — Sesiones registradas: ${secMatch.attendanceSessions.length}. Estudiantes con ≥25% inasistencias: ${atRisk.length}.`);
        }
        const totalSessions = teacher.sections.reduce((sum, s) => sum + s.attendanceSessions.length, 0);
        return void reply(`Total de sesiones de asistencia registradas en tus secciones: ${totalSessions}. Indica una sección para ver detalle de inasistencias.`);
      }

      // Recuperaciones
      if (/recuperaci/.test(question)) {
        const sectionRecoveries = teacher.sections.map((s) => ({
          ...s,
          pendingRecoveries: s.gradeRecords.filter((g) => g.recoveryExam && ['SOLICITADA', 'AUTORIZADA'].includes(g.recoveryExam.status)).length,
        }));
        const total = sectionRecoveries.reduce((sum, s) => sum + s.pendingRecoveries, 0);
        if (!total) return void reply('No tienes recuperaciones pendientes de calificar en el ciclo actual.');
        const lines = sectionRecoveries.filter((s) => s.pendingRecoveries > 0).map((s) => `• ${s.code} ${s.course.name}: ${s.pendingRecoveries} recuperación(es)`);
        return void reply(`Recuperaciones pendientes en tus secciones:\n${lines.join('\n')}`);
      }

      // Zona media / actividades
      if (/zona|actividad/.test(question)) {
        const secMatch = teacher.sections.find((s) => question.includes(s.code) || question.toLowerCase().includes(s.course.name.toLowerCase().slice(0, 5)));
        if (secMatch) {
          const lines = secMatch.zoneActivities.map((a) => {
            const sinCalificar = a.grades.filter((g) => g.score === null).length;
            return `• ${a.name}: ${sinCalificar} sin calificar`;
          });
          return void reply(lines.length ? `Actividades de zona en ${secMatch.code} (${secMatch.course.name}):\n${lines.join('\n')}` : `No hay actividades de zona registradas en ${secMatch.code}.`);
        }
        const total = teacher.sections.reduce((sum, s) => sum + s.zoneActivities.length, 0);
        return void reply(`Total de actividades de zona en tus secciones: ${total}. Indica una sección para ver el detalle.`);
      }

      // Aula virtual
      if (/aula virtual|classroom|clase virtual/.test(question)) {
        const lines = teacher.sections.map((s) => {
          const vc = s.virtualClassroom;
          if (!vc) return `• ${s.code} ${s.course.name}: Sin aula virtual`;
          return `• ${s.code} ${s.course.name}: ${vc.syncStatus}${vc.alternateLink ? ' — ' + vc.alternateLink : ''}`;
        });
        return void reply(`Estado de aulas virtuales en tus secciones:\n${lines.join('\n')}`);
      }

      // Horarios / secciones generales
      if (/horario|secci[oó]n|curso|clase|materia|asignatura/.test(question)) {
        const lines = teacher.sections.map((s) => `${s.code} · ${s.course.code} ${s.course.name}: ${s.scheduleDays} ${s.scheduleTime}, aula ${s.classroom.code}, inscritos ${s.enrolledCount}`);
        return void reply(lines.length ? `Tus secciones asignadas en el ciclo actual:\n${lines.join('\n')}` : 'No tienes secciones asignadas en el ciclo actual.');
      }

      // Estudiantes / inscritos
      if (/inscrit|alumno|estudiante|cu[aá]nt/.test(question)) {
        const secMatch = teacher.sections.find((s) => question.includes(s.code) || question.toLowerCase().includes(s.course.name.toLowerCase().slice(0, 5)));
        if (secMatch) return void reply(`La sección ${secMatch.code} (${secMatch.course.name}) tiene ${secMatch.enrolledCount} estudiante(s) inscritos. Aula: ${secMatch.classroom.code}.`);
        const total = teacher.sections.reduce((sum, s) => sum + s.enrolledCount, 0);
        return void reply(`Tienes ${total} estudiante(s) inscrito(s) en total, distribuidos en ${teacher.sections.length} sección(es).`);
      }

      return void reply(`Tienes ${teacher.sections.length} sección(es) asignada(s) en el ciclo actual. Puedo informarte sobre horarios, inscritos, notas, actas, asistencia, recuperaciones, actividades de zona y aulas virtuales.`);
    }
    if (user.role === 'ADMIN') {
      const [
        students, teachers, courses, sections, careers,
        pendingDocuments, pendingCharges, parkingConfig, vehiclesInside, activeEvents,
        pendingRequests, unreadNotifications, activeLoans, attendanceSessions,
        recoveryExams, zoneActivities, virtualClassrooms, mfaUsers,
        campuses, currentCycle, enrolledCount, fullSections, noTeacherSections,
        inDebtStudents, solventStudents, totalDebtAmount, deliveredActs, pendingActs,
        failedGrades, atRiskStudents, inactiveUsers, usersByRole, overdueLoans,
        libraryBooks, loansThisMonth, activeEventsList, parkingTodayVisits,
      ] = await Promise.all([
        prisma.student.count(),
        prisma.teacher.count(),
        prisma.course.count(),
        prisma.section.count(),
        prisma.career.count(),
        prisma.enrollmentDocument.count({ where: { status: 'PENDIENTE' } }),
        prisma.financialCharge.count({ where: { status: { in: ['PENDIENTE', 'VENCIDO'] } } }),
        prisma.parkingConfig.findUnique({ where: { id: 1 } }),
        prisma.parkingVisit.count({ where: { status: 'DENTRO' } }),
        prisma.parkingEvent.count({ where: { status: { in: ['PLANIFICADO', 'EN_CURSO'] } } }),
        prisma.studentServiceRequest.count({ where: { status: { in: ['SOLICITADA', 'EN_REVISION'] } } }),
        prisma.appNotification.count({ where: { isRead: false } }),
        prisma.libraryLoan.count({ where: { status: 'PRESTADO' } }),
        prisma.attendanceSession.count(),
        prisma.recoveryExam.count({ where: { status: { not: 'CERRADA' } } }),
        prisma.zoneActivity.count(),
        prisma.virtualClassroom.count(),
        prisma.user.count({ where: { mfaEnabled: true } }),
        // new queries
        prisma.campus.count({ where: { status: 'Activo' } }),
        prisma.academicCycle.findFirst({ where: { isCurrent: true }, select: { name: true, enrollmentStartDate: true, enrollmentEndDate: true, gradeSubmissionDeadline: true, examStartDate: true, examEndDate: true, startDate: true, endDate: true } }),
        prisma.gradeRecord.count({ where: { section: { cycle: { isCurrent: true } } } }),
        prisma.section.findMany({ where: { cycle: { isCurrent: true } }, select: { enrolledCount: true, capacity: true } }).then((ss) => ss.filter((s) => s.enrolledCount >= s.capacity).length).catch(() => 0),
        Promise.resolve(0),
        prisma.student.count({ where: { financialCharges: { some: { status: { in: ['PENDIENTE', 'VENCIDO'] } } } } }),
        prisma.student.count({ where: { financialCharges: { none: { status: { in: ['PENDIENTE', 'VENCIDO'] } } } } }),
        prisma.financialCharge.aggregate({ where: { status: { in: ['PENDIENTE', 'VENCIDO'] } }, _sum: { amount: true } }),
        prisma.section.count({ where: { cycle: { isCurrent: true }, gradeActStatus: 'ENTREGADA' } }),
        prisma.section.count({ where: { cycle: { isCurrent: true }, gradeActStatus: { not: 'ENTREGADA' } } }),
        prisma.gradeRecord.count({ where: { total: { lt: 61 }, section: { cycle: { isCurrent: true } } } }),
        prisma.gradeRecord.count({ where: { total: { gte: 40, lt: 61 }, section: { cycle: { isCurrent: true } } } }),
        prisma.user.count({ where: { active: false } }),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { active: true } }),
        prisma.libraryLoan.count({ where: { status: 'PRESTADO', dueAt: { lt: new Date() } } }),
        prisma.libraryBook.count(),
        prisma.libraryLoan.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
        prisma.parkingEvent.findMany({ where: { status: { in: ['PLANIFICADO', 'EN_CURSO'] } }, select: { name: true, status: true, startsAt: true }, take: 5 }),
        prisma.parkingVisit.count({ where: { enteredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      ]);

      groundedContext = JSON.stringify({ estudiantes: students, docentes: teachers, carreras: careers, cursos: courses, secciones: sections, expedientesPendientes: pendingDocuments, cargosPendientesOVencidos: pendingCharges, parqueo: { dentro: vehiclesInside, capacidad: parkingConfig?.totalCapacity || 0, eventosActivos: activeEvents }, solicitudesPendientes: pendingRequests, notificacionesNoLeidas: unreadNotifications, prestamosActivos: activeLoans, sesionesAsistencia: attendanceSessions, recuperacionesAbiertas: recoveryExams, actividadesZona: zoneActivities, aulasVirtuales: virtualClassrooms, usuariosConMFA: mfaUsers, campus: campuses, cicloActual: currentCycle?.name });

      // Ciclo actual
      if (/ciclo|período|periodo|semestre.*activ|activ.*semestre/.test(question)) {
        if (!currentCycle) return void reply('No hay un ciclo académico activo actualmente.');
        const fmt = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '—';
        return void reply(`Ciclo activo: **${currentCycle.name}**\n• Clases: ${fmt(currentCycle.startDate)} al ${fmt(currentCycle.endDate)}\n• Inscripciones: ${fmt(currentCycle.enrollmentStartDate)} al ${fmt(currentCycle.enrollmentEndDate)}\n• Límite de notas: ${fmt(currentCycle.gradeSubmissionDeadline)}${currentCycle.examStartDate ? `\n• Exámenes finales: ${fmt(currentCycle.examStartDate)} al ${fmt(currentCycle.examEndDate)}` : ''}`);
      }
      if (/inscripci/.test(question) && /fecha|cuánd|cuando|inicio|fin/.test(question)) {
        if (!currentCycle) return void reply('No hay ciclo activo.');
        return void reply(`Inscripciones del ciclo ${currentCycle.name}: del ${currentCycle.enrollmentStartDate.toISOString().slice(0,10)} al ${currentCycle.enrollmentEndDate.toISOString().slice(0,10)}.`);
      }
      if (/límite.*nota|nota.*límite|entrega.*nota|acta.*límite/.test(question)) {
        if (!currentCycle) return void reply('No hay ciclo activo.');
        return void reply(`Límite de entrega de notas del ciclo ${currentCycle.name}: ${currentCycle.gradeSubmissionDeadline.toISOString().slice(0,10)}.`);
      }
      if (/examen.*final|final.*examen/.test(question)) {
        if (!currentCycle) return void reply('No hay ciclo activo.');
        if (!currentCycle.examStartDate) return void reply(`El ciclo ${currentCycle.name} no tiene fechas de exámenes finales registradas.`);
        return void reply(`Exámenes finales del ciclo ${currentCycle.name}: del ${currentCycle.examStartDate.toISOString().slice(0,10)} al ${(currentCycle.examEndDate ?? currentCycle.examStartDate).toISOString().slice(0,10)}.`);
      }

      // Campus
      if (/campus|sede/.test(question)) return void reply(`Campus activos registrados: ${campuses}.`);

      // Inscripciones del ciclo
      if (/inscrit|matrículad|matriculad/.test(question)) return void reply(`Estudiantes inscritos en el ciclo actual: ${enrolledCount}.`);

      // Secciones llenas / sin docente
      if (/sección.*llena|secciones.*llena|cupo.*agotado/.test(question)) return void reply(`Secciones llenas en el ciclo actual: ${fullSections}.`);

      // Finanzas detallado
      if (/mora|estudiante.*deb|deb.*estudiante/.test(question)) return void reply(`Estudiantes con cargos pendientes o vencidos (en mora): ${inDebtStudents}. Estudiantes solventes: ${solventStudents}.`);
      if (/solvente/.test(question)) return void reply(`Estudiantes con solvencia financiera: ${solventStudents} de ${students} total.`);
      if (/monto.*total|total.*deuda|suma.*cargo/.test(question)) {
        const total = totalDebtAmount._sum.amount ?? 0;
        return void reply(`Monto total de cargos pendientes o vencidos: Q${Number(total).toFixed(2)}.`);
      }

      // Actas de notas
      if (/acta|actas/.test(question)) return void reply(`Actas de notas del ciclo actual — Entregadas: ${deliveredActs} · Pendientes: ${pendingActs}.`);

      // Reprobados / riesgo
      if (/reprob/.test(question)) return void reply(`Estudiantes con nota reprobatoria en el ciclo actual: ${failedGrades}.`);
      if (/riesgo académico|riesgo.*académico/.test(question)) return void reply(`Estudiantes en riesgo académico (nota entre 40 y 60) en el ciclo actual: ${atRiskStudents}.`);

      // Usuarios por rol / inactivos
      if (/usuario.*rol|rol.*usuario|desglose.*rol|distribución.*rol/.test(question)) {
        const lines = (usersByRole as { role: string; _count: { _all: number } }[]).map((r) => `• ${r.role}: ${r._count._all}`).join('\n');
        return void reply(`Usuarios activos por rol:\n${lines}`);
      }
      if (/inactiv/.test(question) && /usuario/.test(question)) return void reply(`Usuarios inactivos en el sistema: ${inactiveUsers}.`);
      if (/mfa|doble factor|seguridad/.test(question)) {
        const noMfa = (usersByRole as { role: string; _count: { _all: number } }[]).reduce((s, r) => s + r._count._all, 0) - mfaUsers;
        return void reply(`Usuarios con MFA habilitado: ${mfaUsers}. Sin MFA: ${noMfa}.`);
      }

      // Biblioteca detallado
      if (/préstamo.*vencid|vencid.*préstamo|préstamo.*atrasad/.test(question)) return void reply(`Préstamos vencidos (no devueltos a tiempo): ${overdueLoans}.`);
      if (/cuántos.*libro|libro.*catálogo|catálogo.*libro/.test(question)) return void reply(`Libros registrados en el catálogo de biblioteca: ${libraryBooks}.`);
      if (/préstamo.*mes|mes.*préstamo/.test(question)) return void reply(`Préstamos de biblioteca realizados este mes: ${loansThisMonth}.`);
      if (/biblioteca|préstamo|prestamo|libro/.test(question)) return void reply(`Biblioteca — Préstamos activos: ${activeLoans} · Vencidos: ${overdueLoans} · Libros en catálogo: ${libraryBooks} · Préstamos este mes: ${loansThisMonth}.`);

      // Parqueo detallado
      if (/ingresaron.*hoy|hoy.*parqueo|visita.*hoy|hoy.*ingres/.test(question)) return void reply(`Vehículos que ingresaron al parqueo hoy: ${parkingTodayVisits}.`);
      if (/evento.*parqueo|parqueo.*evento|evento.*planificado/.test(question)) {
        if (!activeEventsList.length) return void reply('No hay eventos de parqueo planificados o en curso.');
        return void reply(`Eventos de parqueo activos o planificados:\n${(activeEventsList as { name: string; status: string; startsAt: Date }[]).map((e) => `• ${e.name} · ${e.status} · ${e.startsAt.toISOString().slice(0,10)}`).join('\n')}`);
      }
      if (/capacidad.*parqueo|parqueo.*capacidad/.test(question)) return void reply(`Capacidad total del parqueo: ${parkingConfig?.totalCapacity || 0} espacios. Ocupados ahora: ${vehiclesInside}.`);
      if (/parqueo|estacionamiento|vehículo|vehiculo/.test(question)) return void reply(`Parqueo — Dentro ahora: ${vehiclesInside}/${parkingConfig?.totalCapacity || 0} · Ingresos hoy: ${parkingTodayVisits} · Eventos activos: ${activeEvents}.`);

      // Solicitudes / notificaciones
      if (/solicitud|trámite|tramite/.test(question)) {
        if (/tipo|frecuente|más piden|más solicit/.test(question)) {
          const byType = await prisma.studentServiceRequest.groupBy({ by: ['type'], _count: { _all: true }, orderBy: { _count: { type: 'desc' } }, take: 5 });
          if (!byType.length) return void reply('No hay solicitudes registradas.');
          return void reply(`Tipos de solicitudes más frecuentes:\n${byType.map((r) => `• ${r.type}: ${r._count._all}`).join('\n')}`);
        }
        return void reply(`Solicitudes estudiantiles pendientes o en revisión: ${pendingRequests}.`);
      }
      if (/notificaci|aviso/.test(question)) return void reply(`Notificaciones no leídas: ${unreadNotifications}.`);

      // Asistencia / recuperaciones / zona / aulas
      if (/asistencia/.test(question)) return void reply(`Sesiones de asistencia registradas: ${attendanceSessions}.`);
      if (/recuperaci/.test(question)) return void reply(`Recuperaciones abiertas: ${recoveryExams}.`);
      if (/actividad|zona media/.test(question)) return void reply(`Actividades de zona registradas: ${zoneActivities}.`);
      if (/aula virtual|classroom|clase virtual/.test(question)) return void reply(`Aulas virtuales configuradas: ${virtualClassrooms}.`);

      // Reportes
      if (/reporte|informe/.test(question)) return void reply('Los reportes se generan desde el módulo Reportes con datos del ciclo seleccionado. Puedo resumir estudiantes, inscripciones, secciones, notas y finanzas; indica cuál reporte necesitas.');

      // Listado de estudiantes
      if (/cuánt|cuant|total|cantidad/.test(question) && /estudiante|alumno/.test(question) && !/expediente|document/.test(question)) return void reply(`Hay ${students} estudiantes registrados en el sistema.`);
      if (/listado|lista|alumno|estudiante|usuario/.test(question)) {
        const searchMatch = question.match(/(?:buscar|busca|nombre|carné|carne|de la carrera|de sistemas|de informática)\s+(.+)/i);
        const search = searchMatch?.[1]?.trim() || '';
        const records = await prisma.student.findMany({ where: search && search.length > 2 ? { OR: [{ name: { contains: search } }, { carnet: { contains: search } }] } : undefined, orderBy: { name: 'asc' }, take: 50, select: { carnet: true, name: true, careerName: true, status: true } });
        return void reply(records.length ? `Listado de estudiantes${search ? ` para "${search}"` : ''}:\n${records.map((item) => `• ${item.carnet} · ${item.name}\n  ${item.careerName || 'Sin carrera'} · ${item.status}`).join('\n')}` : 'No encontré estudiantes con ese criterio.');
      }

      // Docentes
      if (/docente.*sin seccion|docente.*sin sección|sin.*asignaci/.test(question)) {
        const unassigned = await prisma.teacher.findMany({ where: { status: 'Activo', sections: { none: { cycle: { isCurrent: true } } } }, select: { code: true, name: true }, take: 20 });
        if (!unassigned.length) return void reply('Todos los docentes activos tienen al menos una sección asignada en el ciclo actual.');
        return void reply(`Docentes sin sección en el ciclo actual:\n${unassigned.map((t) => `• ${t.code} · ${t.name}`).join('\n')}`);
      }
      if (/cuántas.*secci.*docente|secciones.*tiene.*docente|docente.*cuántas/.test(question)) {
        const nameMatch = question.match(/docente\s+(.+)|de\s+(.+)/i);
        const search = (nameMatch?.[1] || nameMatch?.[2] || '').trim();
        if (!search) return void reply('Indica el nombre o código del docente que deseas consultar.');
        const found = await prisma.teacher.findFirst({ where: { OR: [{ name: { contains: search } }, { code: { contains: search } }] }, include: { sections: { where: { cycle: { isCurrent: true } }, select: { code: true, course: { select: { name: true } } } } } });
        if (!found) return void reply(`No encontré docente con "${search}".`);
        return void reply(`${found.name} (${found.code}) tiene ${found.sections.length} sección(es) en el ciclo actual${found.sections.length ? ':\n' + found.sections.map((s) => `• ${s.code} · ${s.course.name}`).join('\n') : '.'}`);
      }
      if (/docente|catedr/.test(question)) return void reply(`Docentes registrados: ${teachers}. Puedes revisar sus asignaciones desde el módulo Docentes.`);

      // Cursos / secciones / carreras / expedientes / pagos
      if (/curso/.test(question)) return void reply(`Cursos en el catálogo: ${courses}. Administra cursos y prerrequisitos desde Cursos y Prerrequisitos.`);
      if (/seccion|sección|horario/.test(question)) return void reply(`Secciones registradas: ${sections} · Llenas en ciclo actual: ${fullSections}.`);
      if (/carrera/.test(question)) {
        if (/estudiante.*carrera|por carrera|distribuc/.test(question)) {
          const byCareer = await prisma.student.groupBy({ by: ['careerName'], _count: { _all: true }, orderBy: { _count: { careerName: 'desc' } }, take: 10 });
          return void reply(`Estudiantes por carrera:\n${byCareer.map((r) => `• ${r.careerName || 'Sin carrera'}: ${r._count._all}`).join('\n')}`);
        }
        return void reply(`Carreras registradas: ${careers}. Consulta pensums y cursos desde Carreras.`);
      }
      if (/expediente|document/.test(question)) return void reply(`Expedientes pendientes de revisión: ${pendingDocuments}. Puedes validarlos desde Expediente.`);
      if (/pago|saldo|mora|finanz/.test(question)) return void reply(`Cargos pendientes o vencidos: ${pendingCharges} · Monto total: Q${Number(totalDebtAmount._sum.amount ?? 0).toFixed(2)} · Estudiantes en mora: ${inDebtStudents}.`);

      // Resumen general
      return void reply(`Resumen administrativo:\n• Ciclo activo: ${currentCycle?.name || 'Ninguno'}\n• Estudiantes: ${students} (en mora: ${inDebtStudents})\n• Docentes: ${teachers}\n• Carreras: ${careers} · Cursos: ${courses}\n• Secciones: ${sections} (llenas: ${fullSections})\n• Expedientes pendientes: ${pendingDocuments}\n• Cargos pendientes/vencidos: ${pendingCharges}\n• Parqueo: ${vehiclesInside}/${parkingConfig?.totalCapacity || 0} dentro\n• Biblioteca: ${activeLoans} préstamos activos\n• Solicitudes pendientes: ${pendingRequests}`);
    }
    if (user.role === 'BIBLIOTECA') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const [
        totalBooks, activeBooks, totalCopies, availableCopies, damagedCopies,
        activeLoans, overdueLoans, loansToday, loansThisMonth,
        pendingReservations, readyReservations,
        suspendedUsers, topBorrowed,
      ] = await Promise.all([
        prisma.libraryBook.count(),
        prisma.libraryBook.count({ where: { status: 'ACTIVO' } }),
        prisma.libraryCopy.count(),
        prisma.libraryCopy.count({ where: { status: 'DISPONIBLE' } }),
        prisma.libraryCopy.count({ where: { condition: { in: ['DAÑADO', 'MALO'] } } }),
        prisma.libraryLoan.count({ where: { status: 'PRESTADO' } }),
        prisma.libraryLoan.count({ where: { status: 'PRESTADO', dueAt: { lt: now } } }),
        prisma.libraryLoan.count({ where: { loanedAt: { gte: new Date(now.setHours(0, 0, 0, 0)) } } }),
        prisma.libraryLoan.count({ where: { loanedAt: { gte: startOfMonth } } }),
        prisma.libraryReservation.count({ where: { status: 'SOLICITADA' } }),
        prisma.libraryReservation.count({ where: { status: 'LISTA' } }),
        prisma.user.count({ where: { librarySuspendedUntil: { gt: now } } }),
        prisma.libraryLoan.groupBy({ by: ['copyId'], _count: { _all: true }, orderBy: { _count: { copyId: 'desc' } }, take: 5 }),
      ]);

      // Catálogo / libros
      if (/cu[aá]ntos.*libro|libro.*cat[aá]logo|cat[aá]logo|total.*libro/.test(question)) return void reply(`Catálogo: ${totalBooks} título(s) registrados (${activeBooks} activos) · ${totalCopies} ejemplares en total · ${availableCopies} disponibles.`);
      if (/ejemplar|copia|disponible/.test(question)) return void reply(`Ejemplares — Total: ${totalCopies} · Disponibles: ${availableCopies} · En préstamo: ${activeLoans} · Dañados/malos: ${damagedCopies}.`);
      if (/dañado|mal estado|condici[oó]n/.test(question)) return void reply(`Ejemplares en mal estado (dañado o malo): ${damagedCopies} de ${totalCopies} total.`);

      // Búsqueda de libro específico
      if (/buscar|busca|existe.*libro|hay.*libro|libro.*disponible/.test(question)) {
        const titleMatch = question.match(/(?:buscar?|existe|hay|libro)\s+(?:el libro\s+)?["']?(.+?)["']?\s*(?:\?|$)/i);
        const search = titleMatch?.[1]?.trim() || '';
        if (!search || search.length < 3) return void reply('Indica el título o autor que deseas buscar.');
        const books = await prisma.libraryBook.findMany({
          where: { OR: [{ title: { contains: search } }, { author: { contains: search } }] },
          include: { copies: { select: { status: true } } },
          take: 8,
        });
        if (!books.length) return void reply(`No encontré libros con "${search}" en el catálogo.`);
        const lines = books.map((b) => {
          const avail = b.copies.filter((c) => c.status === 'DISPONIBLE').length;
          return `• ${b.title} — ${b.author} (${avail}/${b.copies.length} disponibles)`;
        });
        return void reply(`Resultados para "${search}":\n${lines.join('\n')}`);
      }

      // Préstamos
      if (/vencido|atrasado|mora.*pr[eé]stamo|pr[eé]stamo.*vencido/.test(question)) return void reply(`Préstamos vencidos (no devueltos a tiempo): ${overdueLoans}.`);
      if (/pr[eé]stamo.*hoy|hoy.*pr[eé]stamo/.test(question)) return void reply(`Préstamos realizados hoy: ${loansToday}.`);
      if (/pr[eé]stamo.*mes|mes.*pr[eé]stamo/.test(question)) return void reply(`Préstamos realizados este mes: ${loansThisMonth}.`);
      if (/pr[eé]stamo.*activ|activ.*pr[eé]stamo|cu[aá]ntos.*pr[eé]stamo/.test(question)) return void reply(`Préstamos activos: ${activeLoans} · Vencidos: ${overdueLoans} · Hoy: ${loansToday} · Este mes: ${loansThisMonth}.`);

      // Reservaciones
      if (/reserva.*pendiente|pendiente.*reserva/.test(question)) return void reply(`Reservaciones pendientes de atender: ${pendingReservations}.`);
      if (/reserva.*lista|lista.*reserva|listas para retirar/.test(question)) return void reply(`Reservaciones listas para retirar: ${readyReservations}.`);
      if (/reserva/.test(question)) return void reply(`Reservaciones — Pendientes: ${pendingReservations} · Listas para retirar: ${readyReservations}.`);

      // Usuarios suspendidos
      if (/suspendido|suspensi[oó]n/.test(question)) return void reply(`Usuarios con suspensión de biblioteca activa: ${suspendedUsers}.`);

      // Libros más prestados
      if (/m[aá]s prestado|popular|m[aá]s solicitado/.test(question)) {
        if (!topBorrowed.length) return void reply('No hay préstamos registrados aún.');
        const copyIds = topBorrowed.map((r) => r.copyId);
        const copies = await prisma.libraryCopy.findMany({ where: { id: { in: copyIds } }, include: { book: { select: { title: true, author: true } } } });
        const lines = topBorrowed.map((r) => {
          const copy = copies.find((c) => c.id === r.copyId);
          return `• ${copy?.book.title ?? 'Desconocido'} — ${copy?.book.author ?? ''}: ${r._count._all} préstamo(s)`;
        });
        return void reply(`Libros más prestados:\n${lines.join('\n')}`);
      }

      // Resumen general
      if (/biblioteca|pr[eé]stamo|libro/.test(question)) return void reply(`Biblioteca:\n• Títulos: ${totalBooks} (${activeBooks} activos)\n• Ejemplares: ${totalCopies} (${availableCopies} disponibles)\n• Préstamos activos: ${activeLoans} (vencidos: ${overdueLoans})\n• Reservaciones pendientes: ${pendingReservations}\n• Usuarios suspendidos: ${suspendedUsers}`);

      return void reply(`Hola ${user.name}. Puedo informarte sobre el catálogo, préstamos, reservaciones y estado general de la biblioteca.`);
    }

    if (user.role === 'SISTEMAS') {
      const [
        activeUsers, inactiveUsers, usersByRole, mfaUsers,
        activeSessions, pendingResets, tempPasswordUsers,
        auditLogs, unreadNotifications,
        virtualClassrooms, vcErrors, vcPending,
        cycles, campuses, assistantConversations,
        students, teachers, courses, sections,
      ] = await Promise.all([
        prisma.user.count({ where: { active: true } }),
        prisma.user.count({ where: { active: false } }),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { active: true } }),
        prisma.user.count({ where: { mfaEnabled: true, active: true } }),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.passwordResetToken.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.user.count({ where: { mustChangePassword: true, active: true } }),
        prisma.auditLog.count(),
        prisma.appNotification.count({ where: { isRead: false } }),
        prisma.virtualClassroom.count(),
        prisma.virtualClassroom.count({ where: { syncStatus: { contains: 'ERROR' } } }),
        prisma.virtualClassroom.count({ where: { syncStatus: 'PENDING_CONFIGURATION' } }),
        prisma.academicCycle.count(),
        prisma.campus.count({ where: { status: 'Activo' } }),
        prisma.assistantConversation.count(),
        prisma.student.count(),
        prisma.teacher.count(),
        prisma.course.count(),
        prisma.section.count(),
      ]);

      const totalActive = (usersByRole as { role: string; _count: { _all: number } }[]).reduce((s, r) => s + r._count._all, 0);
      const noMfa = totalActive - mfaUsers;

      // Usuarios generales
      if (/usuario.*rol|rol.*usuario|desglose|distribuc/.test(question)) {
        const lines = (usersByRole as { role: string; _count: { _all: number } }[]).map((r) => `• ${r.role}: ${r._count._all}`).join('\n');
        return void reply(`Usuarios activos por rol:\n${lines}\n\nTotal activos: ${activeUsers} · Inactivos: ${inactiveUsers}`);
      }
      if (/inactiv/.test(question)) return void reply(`Usuarios inactivos: ${inactiveUsers}. Usuarios activos: ${activeUsers}.`);
      if (/cu[aá]nt.*usuario|usuario.*cu[aá]nt|total.*usuario/.test(question)) return void reply(`Usuarios activos: ${activeUsers} · Inactivos: ${inactiveUsers} · Total: ${activeUsers + inactiveUsers}.`);

      // Seguridad
      if (/mfa|doble factor|autenticaci[oó]n/.test(question)) return void reply(`MFA — Habilitado: ${mfaUsers} · Sin MFA: ${noMfa} · Total activos: ${totalActive}.`);
      if (/sesi[oó]n.*activ|activ.*sesi[oó]n|cu[aá]ntas.*sesi/.test(question)) return void reply(`Sesiones activas actualmente: ${activeSessions}.`);
      if (/reset.*contraseña|contraseña.*reset|token.*reset|recuper.*contraseña/.test(question)) return void reply(`Tokens de reset de contraseña vigentes: ${pendingResets}.`);
      if (/contraseña temporal|temporal.*contraseña|must.*change|cambiar.*contraseña/.test(question)) return void reply(`Usuarios con contraseña temporal sin cambiar: ${tempPasswordUsers}.`);
      if (/seguridad|acceso/.test(question)) return void reply(`Resumen de seguridad:\n• Sesiones activas: ${activeSessions}\n• Sin MFA: ${noMfa}\n• Contraseña temporal pendiente: ${tempPasswordUsers}\n• Tokens de reset vigentes: ${pendingResets}`);

      // Aulas virtuales
      if (/error.*aula|aula.*error|sync.*error|fallo.*aula/.test(question)) return void reply(`Aulas virtuales con error de sincronización: ${vcErrors} de ${virtualClassrooms} total.`);
      if (/pendiente.*aula|aula.*pendiente|sin configurar/.test(question)) return void reply(`Aulas virtuales pendientes de configurar: ${vcPending} de ${virtualClassrooms} total.`);
      if (/aula virtual|classroom|sincron/.test(question)) return void reply(`Aulas virtuales — Total: ${virtualClassrooms} · Con error: ${vcErrors} · Pendientes de configurar: ${vcPending} · Activas: ${virtualClassrooms - vcErrors - vcPending}.`);

      // Logs y notificaciones
      if (/log|audit[oó]ria|registro.*actividad/.test(question)) return void reply(`Registros de auditoría en el sistema: ${auditLogs.toLocaleString()}.`);
      if (/notificaci/.test(question)) return void reply(`Notificaciones no leídas en el sistema: ${unreadNotifications}.`);

      // Asistente / conversaciones
      if (/asistente|conversaci[oó]n|chatbot/.test(question)) return void reply(`Conversaciones generadas con el asistente: ${assistantConversations.toLocaleString()}.`);

      // Datos generales del sistema
      if (/ciclo/.test(question)) return void reply(`Ciclos académicos registrados: ${cycles}.`);
      if (/campus|sede/.test(question)) return void reply(`Campus activos: ${campuses}.`);
      if (/base de datos|datos|registro/.test(question)) return void reply(`Registros principales:\n• Estudiantes: ${students}\n• Docentes: ${teachers}\n• Cursos: ${courses}\n• Secciones: ${sections}\n• Logs de auditoría: ${auditLogs.toLocaleString()}\n• Conversaciones asistente: ${assistantConversations}`);

      // Resumen general
      return void reply(`Resumen del sistema:\n• Usuarios activos: ${activeUsers} (${noMfa} sin MFA)\n• Sesiones activas: ${activeSessions}\n• Contraseñas temporales pendientes: ${tempPasswordUsers}\n• Aulas virtuales con error: ${vcErrors}/${virtualClassrooms}\n• Logs de auditoría: ${auditLogs.toLocaleString()}\n• Notificaciones no leídas: ${unreadNotifications}\n• Campus activos: ${campuses} · Ciclos: ${cycles}`);
    }

    return void reply(`Hola ${user.name}. Puedo orientarte sobre los módulos disponibles para tu rol.`);
  });
}
