import type express from 'express';
import PDFDocument from 'pdfkit';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerGradeRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { sendOk, notifyByCarnet } = helpers;
  const gradeView = (record: any) => ({ id: record.id, studentCarnet: record.studentCarnet, studentName: record.student.name, sectionId: record.sectionId, courseCode: record.section.courseCode, courseName: record.section.course.name, cycleId: record.section.cycleId, zona: record.zona, parcial: record.parcial, segundoParcial: record.segundoParcial, final: record.final, recuperacion: record.recuperacion, total: record.total, status: record.status, isPublished: record.isPublished, actaStatus: record.section.gradeActStatus, gradesPublishedAt: record.section.gradesPublishedAt, gradesClosedAt: record.section.gradesClosedAt, gradesClosedBy: record.section.gradesClosedBy });
  const recalculateStudentZones = async (tx: any, sectionId: string, studentCarnets: string[]) => { for (const studentCarnet of studentCarnets) { const activityGrades = await tx.zoneActivityGrade.findMany({ where: { studentCarnet, activity: { sectionId }, score: { not: null } } }); const zona = Math.min(30, activityGrades.reduce((sum: number, item: any) => sum + Number(item.score || 0), 0)); const current = await tx.gradeRecord.findUnique({ where: { studentCarnet_sectionId: { studentCarnet, sectionId } } }); if (!current) continue; const total = current.recuperacion > 0 ? current.recuperacion : zona + current.parcial + current.segundoParcial + current.final; await tx.gradeRecord.update({ where: { id: current.id }, data: { zona, total, status: total >= 61 ? 'Aprobado' : total > 0 ? 'Reprobado' : 'En curso' } }); } };
  const { requireUser, requireAdmin } = middleware;

  // ── Zone Activities ──────────────────────────────────────────────────────────

  app.get('/api/zone-activities', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const requestedSectionId = String(req.query.sectionId || '');
    if (user.role === 'ESTUDIANTE') {
      const activities = await prisma.zoneActivity.findMany({ where: { isPublished: true, section: { enrollments: { some: { studentCarnet: user.carnetOrCode, status: 'Inscrito' } } } }, include: { section: { include: { course: true } }, grades: { where: { studentCarnet: user.carnetOrCode }, include: { student: true } } }, orderBy: [{ dueDate: 'desc' }] });
      res.json(activities.map((activity) => ({ id: activity.id, name: activity.name, type: activity.type, maxScore: activity.maxScore, dueDate: activity.dueDate, isPublished: activity.isPublished, sectionId: activity.sectionId, sectionCode: activity.section.code, courseName: activity.section.course.name, grades: activity.grades.map((grade) => ({ id: grade.id, studentCarnet: grade.studentCarnet, studentName: grade.student.name, score: grade.score, feedback: grade.feedback })) })));
      return;
    }
    if (!requestedSectionId) return void res.status(400).json({ message: 'Selecciona una sección.' });
    const section = await prisma.section.findUnique({ where: { id: requestedSectionId } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes consultar esta sección.' });
    const activities = await prisma.zoneActivity.findMany({ where: { sectionId: requestedSectionId }, include: { section: { include: { course: true } }, grades: { include: { student: true }, orderBy: { studentCarnet: 'asc' } } }, orderBy: { dueDate: 'asc' } });
    res.json(activities.map((activity) => ({ id: activity.id, name: activity.name, type: activity.type, maxScore: activity.maxScore, dueDate: activity.dueDate, isPublished: activity.isPublished, sectionId: activity.sectionId, sectionCode: activity.section.code, courseName: activity.section.course.name, grades: activity.grades.map((grade) => ({ id: grade.id, studentCarnet: grade.studentCarnet, studentName: grade.student.name, score: grade.score, feedback: grade.feedback })) })));
  });

  app.post('/api/zone-activities', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const sectionId = String(req.body.sectionId || '');
    const name = String(req.body.name || '').trim();
    const type = String(req.body.type || '').trim().toUpperCase();
    const maxScore = Number(req.body.maxScore);
    const dueDate = new Date(req.body.dueDate);
    const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { enrollments: { where: { status: 'Inscrito' } } } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes crear actividades en esta sección.' });
    if (section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta está cerrada.' });
    if (name.length < 3 || !['TAREA', 'PROYECTO', 'LABORATORIO', 'ACTIVIDAD'].includes(type) || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 30 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente nombre, tipo, valor y fecha.' });
    const aggregate = await prisma.zoneActivity.aggregate({ where: { sectionId }, _sum: { maxScore: true } });
    if ((aggregate._sum.maxScore || 0) + maxScore > 30) return void res.status(409).json({ message: `Las actividades superarían los 30 puntos. Quedan ${(30 - (aggregate._sum.maxScore || 0)).toFixed(2)} puntos disponibles.` });
    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.zoneActivity.create({ data: { sectionId, name, type, maxScore, dueDate } });
      if (section.enrollments.length) await tx.zoneActivityGrade.createMany({ data: section.enrollments.map((enrollment) => ({ activityId: created.id, studentCarnet: enrollment.studentCarnet })) });
      await tx.auditLog.create({ data: { action: 'CREATE_ZONE_ACTIVITY', entityType: 'ZONE_ACTIVITY', entityId: created.id, actorId: user.id, details: JSON.stringify({ sectionId, name, type, maxScore }) } });
      return created;
    });
    res.status(201).json(activity);
  });

  app.put('/api/zone-activities/:id/grades', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const activity = await prisma.zoneActivity.findUnique({ where: { id: req.params.id }, include: { section: true, grades: true } });
    if (!activity || (user.role === 'DOCENTE' && activity.section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes calificar esta actividad.' });
    if (activity.section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta está cerrada.' });
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    const allowedCarnets = new Set(activity.grades.map((grade) => grade.studentCarnet));
    if (records.some((record: any) => !allowedCarnets.has(String(record.studentCarnet)) || record.score === null || !Number.isFinite(Number(record.score)) || Number(record.score) < 0 || Number(record.score) > activity.maxScore)) return void res.status(400).json({ message: `Cada calificación debe estar entre 0 y ${activity.maxScore}.` });
    await prisma.$transaction(async (tx) => {
      for (const record of records) await tx.zoneActivityGrade.update({ where: { activityId_studentCarnet: { activityId: activity.id, studentCarnet: String(record.studentCarnet) } }, data: { score: Number(record.score), feedback: record.feedback ? String(record.feedback) : null } });
      await recalculateStudentZones(tx, activity.sectionId, records.map((record: any) => String(record.studentCarnet)));
      await tx.auditLog.create({ data: { action: 'GRADE_ZONE_ACTIVITY', entityType: 'ZONE_ACTIVITY', entityId: activity.id, actorId: user.id, details: JSON.stringify({ records: records.length }) } });
    });
    res.json({ ok: true });
  });

  app.post('/api/zone-activities/:id/publish', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const activity = await prisma.zoneActivity.findUnique({ where: { id: req.params.id }, include: { section: true, grades: true } });
    if (!activity || (user.role === 'DOCENTE' && activity.section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes publicar esta actividad.' });
    if (activity.grades.some((grade) => grade.score === null)) return void res.status(409).json({ message: 'Debes calificar a todos los estudiantes antes de publicar.' });
    await prisma.$transaction([
      prisma.zoneActivity.update({ where: { id: activity.id }, data: { isPublished: true } }),
      prisma.auditLog.create({ data: { action: 'PUBLISH_ZONE_ACTIVITY', entityType: 'ZONE_ACTIVITY', entityId: activity.id, actorId: user.id } }),
    ]);
    for (const grade of activity.grades) await notifyByCarnet(grade.studentCarnet, `Actividad publicada: ${activity.name}`, `Ya puedes consultar tu calificación de ${activity.name}.`, 'INFO', '/actividades-zona');
    res.json({ ok: true });
  });

  // ── Grades ───────────────────────────────────────────────────────────────────

  app.get('/api/grades', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    const where = user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode, isPublished: true } : user.role === 'DOCENTE' ? { section: { teacherId: user.carnetOrCode } } : {};
    const records = await prisma.gradeRecord.findMany({ where, include: { student: true, section: { include: { course: true } } } });
    res.json(records.map(gradeView));
  });

  app.patch('/api/grades/:id', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Los estudiantes no pueden editar notas.' });
    const current = await prisma.gradeRecord.findUnique({ where: { id: req.params.id }, include: { section: true } });
    if (!current) return void res.status(404).json({ message: 'Registro de nota no encontrado.' });
    if (user.role === 'DOCENTE' && current.section.teacherId !== user.carnetOrCode) return void res.status(403).json({ message: 'Esta sección no está asignada al catedrático.' });
    if (current.section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta está cerrada y sus calificaciones ya no pueden modificarse.' });
    const zona = Number(req.body.zona ?? current.zona), parcial = Number(req.body.parcial ?? current.parcial), segundoParcial = Number(req.body.segundoParcial ?? current.segundoParcial), final = Number(req.body.final ?? current.final), recuperacion = Number(req.body.recuperacion ?? current.recuperacion);
    if (zona < 0 || zona > 30 || parcial < 0 || parcial > 20 || segundoParcial < 0 || segundoParcial > 20 || final < 0 || final > 30 || recuperacion < 0 || recuperacion > 100) return void res.status(400).json({ message: 'La zona admite 30 puntos, cada parcial 20 y el examen final 30.' });
    const total = recuperacion > 0 ? recuperacion : zona + parcial + segundoParcial + final;
    const before = { zona: current.zona, parcial: current.parcial, segundoParcial: current.segundoParcial, final: current.final, recuperacion: current.recuperacion, total: current.total };
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.gradeRecord.update({ where: { id: current.id }, data: { zona, parcial, segundoParcial, final, recuperacion, total, status: total >= 61 ? 'Aprobado' : total > 0 ? 'Reprobado' : 'En curso' }, include: { student: true, section: { include: { course: true } } } });
      await tx.auditLog.create({ data: { action: 'UPDATE_GRADE', entityType: 'GRADES', entityId: current.sectionId, actorId: user.id, details: JSON.stringify({ gradeId: current.id, studentCarnet: current.studentCarnet, before, after: { zona, parcial, segundoParcial, final, recuperacion, total } }) } });
      return updated;
    });
    res.json(gradeView(record));
  });

  app.post('/api/grades/sections/:sectionId/publish', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { gradeRecords: { select: { status: true } } } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes publicar esta sección.' });
    if (section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta ya está cerrada.' });
    if (!section.gradeRecords.length) return void res.status(400).json({ message: 'No hay calificaciones registradas para publicar.' });
    if (section.gradeRecords.some((g) => g.status === 'En curso')) return void res.status(400).json({ message: 'Todos los estudiantes deben tener nota final antes de publicar el acta.' });
    const publishedAt = new Date();
    await prisma.$transaction([
      prisma.gradeRecord.updateMany({ where: { sectionId: section.id }, data: { isPublished: true } }),
      prisma.section.update({ where: { id: section.id }, data: { gradeActStatus: 'PUBLICADA', gradesPublishedAt: publishedAt } }),
      prisma.auditLog.create({ data: { action: 'PUBLISH', entityType: 'GRADES', entityId: section.id, actorId: user.id } }),
    ]);
    const publishedStudents = await prisma.gradeRecord.findMany({ where: { sectionId: section.id }, select: { studentCarnet: true } });
    for (const student of publishedStudents) await notifyByCarnet(student.studentCarnet, 'Notas publicadas', 'Las calificaciones oficiales de tu curso ya están disponibles.', 'SUCCESS', '/historial');
    sendOk(res, { publishedAt });
  });

  app.post('/api/grades/sections/:sectionId/close', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { gradeRecords: { include: { student: true } }, course: { select: { credits: true } } } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes cerrar esta sección.' });
    if (section.gradeActStatus !== 'PUBLICADA') return void res.status(409).json({ message: 'Primero debes publicar el acta antes de cerrarla.' });
    if (!section.gradeRecords.length) return void res.status(400).json({ message: 'No hay calificaciones para cerrar.' });
    if (section.gradeRecords.some((grade) => grade.status === 'En curso')) return void res.status(400).json({ message: 'Todas las calificaciones deben estar completas antes del cierre.' });
    const closedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.section.update({ where: { id: section.id }, data: { gradeActStatus: 'CERRADA', gradesClosedAt: closedAt, gradesClosedBy: user.name } });
      for (const grade of section.gradeRecords) {
        const newEnrollmentStatus = grade.status === 'Aprobado' ? 'Completado' : 'Reprobado';
        await tx.enrollment.updateMany({ where: { studentCarnet: grade.studentCarnet, sectionId: section.id }, data: { status: newEnrollmentStatus } });
      }
      const studentCarnets = [...new Set(section.gradeRecords.map((g) => g.studentCarnet))];
      for (const carnet of studentCarnets) {
        const allGrades = await tx.gradeRecord.findMany({ where: { studentCarnet: carnet, section: { gradeActStatus: 'CERRADA' } }, include: { section: { include: { course: { select: { credits: true } } } } } });
        const approved = allGrades.filter((g) => g.status === 'Aprobado');
        const creditsEarned = approved.reduce((sum, g) => sum + g.section.course.credits, 0);
        const totalWeighted = approved.reduce((sum, g) => sum + g.total * g.section.course.credits, 0);
        const gpa = creditsEarned > 0 ? Math.round((totalWeighted / creditsEarned) * 100) / 100 : 0;
        await tx.student.update({ where: { carnet }, data: { gpa, creditsEarned } });
      }
      await tx.auditLog.create({ data: { action: 'CLOSE', entityType: 'GRADES', entityId: section.id, actorId: user.id, details: JSON.stringify({ records: section.gradeRecords.length }) } });
    });
    sendOk(res, { closedAt, closedBy: user.name });
  });

  app.get('/api/grades/sections/:sectionId/history', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes consultar esta sección.' });
    const history = await prisma.auditLog.findMany({ where: { entityType: 'GRADES', entityId: section.id }, include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(history.map((item) => ({ id: item.id, action: item.action, details: item.details, actorName: item.actor.name, actorRole: item.actor.role, createdAt: item.createdAt })));
  });

  app.get('/api/grades/sections/:sectionId/acta.pdf', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { course: true, teacher: true, cycle: true, gradeRecords: { include: { student: true }, orderBy: { studentCarnet: 'asc' } } } });
    if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes descargar esta acta.' });
    const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    const safeCode = section.code.replace(/[^a-z0-9_-]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Acta_${safeCode}_USPG.pdf"`);
    const doc = new PDFDocument({ size: 'LETTER', margin: 42, info: { Title: `Acta ${section.code}`, Author: institution?.name || 'USPG' } });
    doc.pipe(res);
    const burgundy = '#800020';
    doc.rect(0, 0, 612, 74).fill(burgundy);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institution?.name || 'Universidad de San Pablo de Guatemala', 42, 23, { align: 'center' });
    doc.fontSize(10).text('ACTA OFICIAL DE CALIFICACIONES', 42, 46, { align: 'center' });
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(11).text(`${section.courseCode} - ${section.course.name}`, 42, 94);
    doc.font('Helvetica').fontSize(9).text(`Sección: ${section.code}    Ciclo: ${section.cycle.name}`, 42, 113);
    doc.text(`Catedrático: ${section.teacher.name}`, 42, 128);
    doc.text(`Estado del acta: ${section.gradeActStatus}`, 42, 143);
    if (section.gradesClosedAt) doc.text(`Cierre: ${section.gradesClosedAt.toLocaleString('es-GT')} por ${section.gradesClosedBy}`, 42, 158);
    const columns = [42, 96, 248, 286, 324, 362, 402, 446, 496];
    const widths = [54, 152, 38, 38, 38, 40, 44, 50, 74];
    const headers = ['Carné', 'Estudiante', 'Zona', '1er P.', '2do P.', 'Final', 'Recup.', 'Total', 'Estado'];
    let y = section.gradesClosedAt ? 187 : 172;
    const drawHeader = () => {
      doc.rect(42, y, 528, 23).fill('#F1E7EA');
      doc.fillColor(burgundy).font('Helvetica-Bold').fontSize(7);
      headers.forEach((header, index) => doc.text(header, columns[index] + 3, y + 8, { width: widths[index] - 6, align: index > 1 ? 'center' : 'left' }));
      y += 23;
    };
    drawHeader();
    section.gradeRecords.forEach((grade, index) => {
      if (y > 700) { doc.addPage(); y = 54; drawHeader(); }
      if (index % 2) doc.rect(42, y, 528, 22).fill('#FAFAFA');
      doc.fillColor('#222').font('Helvetica').fontSize(7.5);
      const values = [grade.studentCarnet, grade.student.name, grade.zona, grade.parcial, grade.segundoParcial, grade.final, grade.recuperacion || '-', grade.total, grade.status];
      values.forEach((value, column) => doc.text(String(value), columns[column] + 3, y + 7, { width: widths[column] - 6, align: column > 1 ? 'center' : 'left', ellipsis: true }));
      y += 22;
    });
    y += 18;
    const approved = section.gradeRecords.filter((grade) => grade.status === 'Aprobado').length;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#222').text(`Total: ${section.gradeRecords.length}    Aprobados: ${approved}    Reprobados: ${section.gradeRecords.length - approved}`, 42, y);
    y += 48;
    doc.moveTo(62, y).lineTo(250, y).stroke('#555');
    doc.moveTo(362, y).lineTo(550, y).stroke('#555');
    doc.font('Helvetica').fontSize(8).text(section.teacher.name, 62, y + 7, { width: 188, align: 'center' });
    doc.text('Control Académico', 362, y + 7, { width: 188, align: 'center' });
    const pageCount = doc.bufferedPageRange().count;
    doc.fontSize(7).fillColor('#666').text(`Documento generado el ${new Date().toLocaleString('es-GT')} - Página ${pageCount}`, 42, 742, { align: 'center' });
    doc.end();
  });

  app.get('/api/grades/certification.pdf', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
    if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
    const student = await prisma.student.findUnique({ where: { carnet: studentCarnet }, include: { gradeRecords: { include: { section: { include: { course: true } } }, orderBy: { updatedAt: 'desc' } } } });
    if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    const institutionName = institution?.name || 'Universidad de San Pablo de Guatemala';
    const approvedCredits = student.gradeRecords.filter((grade) => grade.status === 'Aprobado').reduce((sum, grade) => sum + grade.section.course.credits, 0);
    const safeCarnet = student.carnet.replace(/[^a-z0-9_-]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Certificacion_Estudios_${safeCarnet}_USPG.pdf"`);
    const burgundy = '#800020';
    const gray = '#64748B';
    const doc = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true, info: { Title: `Certificación de estudios ${student.carnet}`, Author: institutionName } });
    doc.pipe(res);
    const drawBanner = () => {
      doc.rect(0, 0, 612, 78).fill(burgundy);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { width: 528, align: 'center' });
      doc.fontSize(10).text('SECRETARÍA GENERAL - CERTIFICACIÓN OFICIAL DE ESTUDIOS', 42, 48, { width: 528, align: 'center' });
    };
    drawBanner();
    doc.roundedRect(42, 100, 528, 118, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
    const infoRows = [
      ['Nombre completo', student.name], ['Carné', student.carnet], ['Carrera', student.careerName || '-'],
      ['Ciclo de ingreso', student.entryCycle], ['Promedio general', `${student.gpa.toFixed(2)} pts`], ['Créditos', `${approvedCredits} / ${student.totalCreditsRequired} pts`],
    ];
    let infoY = 116;
    infoRows.forEach(([label, value], index) => {
      const column = index % 2 === 0 ? 62 : 322;
      if (index % 2 === 0 && index > 0) infoY += 36;
      doc.fillColor(gray).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), column, infoY, { width: 220 });
      doc.fillColor('#222').font('Helvetica').fontSize(10).text(value, column, infoY + 13, { width: 220 });
    });
    let y = 244;
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(10).text('Historial de asignaturas evaluadas', 42, y);
    y += 20;
    const columns = [42, 96, 310, 400, 462];
    const widths = [54, 214, 90, 62, 108];
    const headers = ['Código', 'Asignatura', 'Ciclo', 'Nota', 'Estado'];
    const drawHeader = () => {
      doc.rect(42, y, 528, 22).fill('#F1E7EA');
      doc.fillColor(burgundy).font('Helvetica-Bold').fontSize(7.5);
      headers.forEach((header, index) => doc.text(header, columns[index] + 3, y + 7, { width: widths[index] - 6, align: index >= 3 ? 'center' : 'left' }));
      y += 22;
    };
    drawHeader();
    student.gradeRecords.forEach((grade, index) => {
      if (y > 700) { doc.addPage(); y = 54; drawHeader(); }
      if (index % 2) doc.rect(42, y, 528, 22).fill('#FAFAFA');
      doc.fillColor('#222').font('Helvetica').fontSize(7.5);
      const values = [grade.section.courseCode, grade.section.course.name, grade.section.cycleId, grade.total.toFixed(1), grade.status];
      values.forEach((value, column) => doc.text(String(value), columns[column] + 3, y + 7, { width: widths[column] - 6, align: column >= 3 ? 'center' : 'left', ellipsis: true }));
      y += 22;
    });
    if (!student.gradeRecords.length) { doc.fillColor(gray).font('Helvetica').fontSize(9).text('No existen registros de calificaciones para este estudiante.', 42, y + 8); y += 24; }
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      doc.font('Helvetica').fontSize(7).fillColor(gray).text(`Documento oficial generado electrónicamente el ${new Date().toLocaleString('es-GT')} - Sistema Académico USPG`, 42, 742, { width: 528, align: 'center', lineBreak: false });
      if (page === range.start) { doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { width: 528, align: 'center', lineBreak: false }); }
    }
    doc.end();
  });

  // ── Recoveries ────────────────────────────────────────────────────────────────

  const recoveryView = (record: any) => {
    const charge = record.financialCharge;
    const paid = charge ? charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0) : 0;
    const balance = charge ? Math.max(0, charge.amount - paid) : 0;
    return { id: record.id, status: record.status, originalTotal: record.originalTotal, recoveryScore: record.recoveryScore, requestedAt: record.requestedAt, scheduledAt: record.scheduledAt, authorizedAt: record.authorizedAt, gradedAt: record.gradedAt, requestedBy: record.requestedBy, authorizedBy: record.authorizedBy, gradedBy: record.gradedBy, authorizationNote: record.authorizationNote, gradeRecordId: record.gradeRecordId, studentCarnet: record.gradeRecord.studentCarnet, studentName: record.gradeRecord.student.name, sectionId: record.gradeRecord.sectionId, sectionCode: record.gradeRecord.section.code, courseCode: record.gradeRecord.section.courseCode, courseName: record.gradeRecord.section.course.name, teacherId: record.gradeRecord.section.teacherId, charge: charge ? { id: charge.id, amount: charge.amount, paid, balance, status: balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE' } : null };
  };

  app.get('/api/recoveries', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    const where = user.role === 'ESTUDIANTE' ? { gradeRecord: { studentCarnet: user.carnetOrCode } } : user.role === 'DOCENTE' ? { gradeRecord: { section: { teacherId: user.carnetOrCode } } } : {};
    const recoveries = await prisma.recoveryExam.findMany({ where, include: { gradeRecord: { include: { student: true, section: { include: { course: true } } } }, financialCharge: { include: { payments: true } } }, orderBy: { requestedAt: 'desc' } });
    const eligibleWhere = user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode, isPublished: true, total: { lt: 61 }, recoveryExam: null } : user.role === 'ADMIN' ? { isPublished: true, total: { lt: 61 }, recoveryExam: null } : { id: '__none__' };
    const eligibleCandidates = await prisma.gradeRecord.findMany({ where: eligibleWhere as any, include: { student: true, section: { include: { course: true } } } });
    // Un curso reprobado deja de ser elegible para recuperación si el estudiante ya lo aprobó
    // en otro intento/sección (retake); GradeRecord es por sección, no por curso, así que ambos
    // registros conviven en el expediente.
    const approvedByStudent = new Map<string, Set<string>>();
    if (eligibleCandidates.length) {
      const studentCarnets = [...new Set(eligibleCandidates.map((grade) => grade.studentCarnet))];
      const approvedGrades = await prisma.gradeRecord.findMany({ where: { studentCarnet: { in: studentCarnets }, status: 'Aprobado' }, select: { studentCarnet: true, section: { select: { courseCode: true } } } });
      for (const grade of approvedGrades) {
        if (!approvedByStudent.has(grade.studentCarnet)) approvedByStudent.set(grade.studentCarnet, new Set());
        approvedByStudent.get(grade.studentCarnet)!.add(grade.section.courseCode);
      }
    }
    const eligible = eligibleCandidates.filter((grade) => !approvedByStudent.get(grade.studentCarnet)?.has(grade.section.courseCode));
    res.json({ recoveries: recoveries.map(recoveryView), eligible: eligible.map((grade) => ({ id: grade.id, studentCarnet: grade.studentCarnet, studentName: grade.student.name, courseCode: grade.section.courseCode, courseName: grade.section.course.name, sectionCode: grade.section.code, total: grade.total })) });
  });

  app.post('/api/recoveries', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'La solicitud debe realizarla el estudiante o administración.' });
    const gradeRecordId = String(req.body.gradeRecordId || '');
    const grade = await prisma.gradeRecord.findUnique({ where: { id: gradeRecordId }, include: { student: true, recoveryExam: true, section: { select: { courseCode: true } } } });
    if (!grade) return void res.status(404).json({ message: 'Registro de calificación no encontrado.' });
    if (user.role === 'ESTUDIANTE' && grade.studentCarnet !== user.carnetOrCode) return void res.status(403).json({ message: 'Solo puedes solicitar tu propia recuperación.' });
    if (!grade.isPublished || grade.total >= 61) return void res.status(409).json({ message: 'La recuperación solo aplica a una nota reprobada y publicada.' });
    if (grade.recoveryExam) return void res.status(409).json({ message: 'Ya existe una solicitud para este curso.' });
    const alreadyApproved = await prisma.gradeRecord.findFirst({ where: { studentCarnet: grade.studentCarnet, status: 'Aprobado', section: { courseCode: grade.section.courseCode } } });
    if (alreadyApproved) return void res.status(409).json({ message: 'Ya aprobaste este curso en otro intento; no aplica recuperación.' });
    const recovery = await prisma.$transaction(async (tx) => {
      const created = await tx.recoveryExam.create({ data: { gradeRecordId, originalTotal: grade.total, requestedBy: user.name } });
      await tx.auditLog.create({ data: { action: 'REQUEST_RECOVERY', entityType: 'RECOVERY', entityId: created.id, actorId: user.id, details: JSON.stringify({ gradeRecordId, studentCarnet: grade.studentCarnet }) } });
      return created;
    });
    res.status(201).json(recovery);
  });

  app.post('/api/recoveries/:id/authorize', requireAdmin, async (req, res) => {
    const scheduledAt = new Date(req.body.scheduledAt);
    const feeAmount = Number(req.body.feeAmount || 0);
    if (Number.isNaN(scheduledAt.getTime()) || !Number.isFinite(feeAmount) || feeAmount < 0) return void res.status(400).json({ message: 'Fecha o costo de recuperación inválido.' });
    const recovery = await prisma.recoveryExam.findUnique({ where: { id: req.params.id }, include: { gradeRecord: { include: { section: { include: { course: true } } } } } });
    if (!recovery || recovery.status !== 'SOLICITADA') return void res.status(409).json({ message: 'La solicitud no está disponible para autorización.' });
    await prisma.$transaction(async (tx) => {
      let financialChargeId: string | null = null;
      if (feeAmount > 0) {
        const charge = await tx.financialCharge.create({ data: { studentCarnet: recovery.gradeRecord.studentCarnet, concept: `Evaluación de recuperación - ${recovery.gradeRecord.section.course.name}`, amount: feeAmount, dueDate: scheduledAt, cycleId: recovery.gradeRecord.section.cycleId } });
        financialChargeId = charge.id;
      }
      await tx.recoveryExam.update({ where: { id: recovery.id }, data: { status: 'AUTORIZADA', scheduledAt, authorizedAt: new Date(), authorizedBy: res.locals.authUser.name, authorizationNote: req.body.authorizationNote ? String(req.body.authorizationNote) : null, financialChargeId } });
      await tx.auditLog.create({ data: { action: 'AUTHORIZE_RECOVERY', entityType: 'RECOVERY', entityId: recovery.id, actorId: res.locals.authUser.id, details: JSON.stringify({ scheduledAt, feeAmount }) } });
    });
    await notifyByCarnet(recovery.gradeRecord.studentCarnet, 'Recuperación autorizada', `Tu recuperación de ${recovery.gradeRecord.section.course.name} fue autorizada para ${scheduledAt.toLocaleString('es-GT')}.${feeAmount > 0 ? ` Debes cancelar Q${feeAmount.toFixed(2)} antes de la evaluación.` : ''}`, 'SUCCESS', '/recuperaciones');
    res.json({ ok: true });
  });

  app.post('/api/recoveries/:id/reject', requireAdmin, async (req, res) => {
    const recovery = await prisma.recoveryExam.findUnique({ where: { id: req.params.id }, include: { gradeRecord: true } });
    if (!recovery || recovery.status !== 'SOLICITADA') return void res.status(409).json({ message: 'La solicitud no está disponible.' });
    await prisma.$transaction([
      prisma.recoveryExam.update({ where: { id: recovery.id }, data: { status: 'RECHAZADA', authorizedAt: new Date(), authorizedBy: res.locals.authUser.name, authorizationNote: req.body.authorizationNote ? String(req.body.authorizationNote) : 'Solicitud rechazada' } }),
      prisma.auditLog.create({ data: { action: 'REJECT_RECOVERY', entityType: 'RECOVERY', entityId: recovery.id, actorId: res.locals.authUser.id } }),
    ]);
    await notifyByCarnet(recovery.gradeRecord.studentCarnet, 'Solicitud de recuperación rechazada', req.body.authorizationNote ? String(req.body.authorizationNote) : 'La solicitud de recuperación fue rechazada.', 'WARNING', '/recuperaciones');
    res.json({ ok: true });
  });

  app.post('/api/recoveries/:id/grade', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const score = Number(req.body.score);
    const recovery = await prisma.recoveryExam.findUnique({ where: { id: req.params.id }, include: { gradeRecord: { include: { section: true } }, financialCharge: { include: { payments: true } } } });
    if (!recovery || recovery.status !== 'AUTORIZADA') return void res.status(409).json({ message: 'La recuperación no está autorizada para calificación.' });
    if (user.role === 'DOCENTE' && recovery.gradeRecord.section.teacherId !== user.carnetOrCode) return void res.status(403).json({ message: 'Esta sección no está asignada al catedrático.' });
    if (!Number.isFinite(score) || score < 0 || score > 100) return void res.status(400).json({ message: 'La nota debe estar entre 0 y 100.' });
    if (recovery.financialCharge) {
      const paid = recovery.financialCharge.payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (paid < recovery.financialCharge.amount) return void res.status(409).json({ message: 'El pago de la recuperación todavía está pendiente.' });
    }
    await prisma.$transaction([
      prisma.recoveryExam.update({ where: { id: recovery.id }, data: { status: 'CALIFICADA', recoveryScore: score, gradedAt: new Date(), gradedBy: user.name } }),
      prisma.gradeRecord.update({ where: { id: recovery.gradeRecordId }, data: { recuperacion: score, total: score, status: score >= 61 ? 'Aprobado' : 'Reprobado' } }),
      prisma.auditLog.create({ data: { action: 'GRADE_RECOVERY', entityType: 'RECOVERY', entityId: recovery.id, actorId: user.id, details: JSON.stringify({ originalTotal: recovery.originalTotal, recoveryScore: score }) } }),
    ]);
    await notifyByCarnet(recovery.gradeRecord.studentCarnet, 'Nota de recuperación disponible', `Tu nota de recuperación es ${score}/100. Resultado: ${score >= 61 ? 'Aprobado' : 'Reprobado'}.`, score >= 61 ? 'SUCCESS' : 'WARNING', '/recuperaciones');
    res.json({ ok: true });
  });
}
