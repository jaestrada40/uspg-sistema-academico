import type express from 'express';
import type { AppPrisma, ServerHelpers, AuthMiddleware } from '../types';

export function registerAttendanceRoutes(
  app: express.Application,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { requireUser } = middleware;
  const { sendOk } = helpers;

  app.get('/api/attendance', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'ESTUDIANTE') {
      const records = await prisma.attendanceRecord.findMany({ where: { studentCarnet: user.carnetOrCode }, include: { session: { include: { section: { include: { course: true } } } } }, orderBy: { session: { classDate: 'desc' } } });
      const grouped = new Map<string, any>();
      for (const record of records) {
        const key = record.session.sectionId;
        const item = grouped.get(key) || { sectionId: key, sectionCode: record.session.section.code, courseName: record.session.section.course.name, records: [] };
        item.records.push({ id: record.id, classDate: record.session.classDate, topic: record.session.topic, status: record.status, note: record.note });
        grouped.set(key, item);
      }
      res.json(Array.from(grouped.values()).map((item) => { const attended = item.records.filter((record: any) => ['PRESENTE', 'JUSTIFICADO'].includes(record.status)).length + item.records.filter((record: any) => record.status === 'TARDE').length * 0.5; return { ...item, percentage: item.records.length ? Math.round((attended / item.records.length) * 100) : 100 }; }));
      return;
    }
    const sectionId = String(req.query.sectionId || '');
    const date = String(req.query.date || '');
    if (!sectionId) return void res.status(400).json({ message: 'Selecciona una sección.' });
    const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: true, enrollments: { where: { status: 'Inscrito' }, include: { student: true } } } });
    if (!section) return void res.status(404).json({ message: 'Sección no encontrada.' });
    if (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode) return void res.status(403).json({ message: 'Esta sección no está asignada al catedrático.' });
    const classDate = date ? new Date(`${date}T12:00:00.000Z`) : null;
    const session = classDate ? await prisma.attendanceSession.findUnique({ where: { sectionId_classDate: { sectionId, classDate } }, include: { records: true } }) : null;
    const existing = new Map<string, any>(session?.records.map((record) => [record.studentCarnet, record]) || []);
    const students = section.enrollments.map((enrollment) => { const record = existing.get(enrollment.studentCarnet); return { studentCarnet: enrollment.studentCarnet, studentName: enrollment.student.name, status: record?.status || 'PRESENTE', note: record?.note || '' }; });
    const recent = await prisma.attendanceSession.findMany({ where: { sectionId }, include: { records: true }, orderBy: { classDate: 'desc' }, take: 12 });
    res.json({ sectionId, sectionCode: section.code, courseName: section.course.name, session: session ? { id: session.id, classDate: session.classDate, topic: session.topic } : null, students, recent: recent.map((item) => ({ id: item.id, classDate: item.classDate, topic: item.topic, present: item.records.filter((record) => record.status === 'PRESENTE').length, absent: item.records.filter((record) => record.status === 'AUSENTE').length, late: item.records.filter((record) => record.status === 'TARDE').length, justified: item.records.filter((record) => record.status === 'JUSTIFICADO').length })) });
  });

  app.post('/api/attendance/sessions', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (!['ADMIN', 'DOCENTE'].includes(user.role)) return void res.status(403).json({ message: 'Solo catedráticos y administradores pueden registrar asistencia.' });
    const sectionId = String(req.body.sectionId || '');
    const date = String(req.body.date || '');
    const classDate = new Date(`${date}T12:00:00.000Z`);
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { enrollments: { where: { status: 'Inscrito' } } } });
    if (!section) return void res.status(404).json({ message: 'Sección no encontrada.' });
    if (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode) return void res.status(403).json({ message: 'Esta sección no está asignada al catedrático.' });
    if (!date || Number.isNaN(classDate.getTime())) return void res.status(400).json({ message: 'Selecciona una fecha válida.' });
    const enrolled = new Set(section.enrollments.map((item) => item.studentCarnet));
    const allowed = new Set(['PRESENTE', 'AUSENTE', 'TARDE', 'JUSTIFICADO']);
    if (records.some((record: any) => !enrolled.has(String(record.studentCarnet)) || !allowed.has(String(record.status)))) return void res.status(400).json({ message: 'La lista contiene estudiantes o estados inválidos.' });
    const session = await prisma.$transaction(async (tx) => {
      const saved = await tx.attendanceSession.upsert({ where: { sectionId_classDate: { sectionId, classDate } }, update: { topic: req.body.topic ? String(req.body.topic) : null }, create: { sectionId, classDate, topic: req.body.topic ? String(req.body.topic) : null, createdBy: user.name } });
      for (const record of records) await tx.attendanceRecord.upsert({ where: { sessionId_studentCarnet: { sessionId: saved.id, studentCarnet: String(record.studentCarnet) } }, update: { status: String(record.status), note: record.note ? String(record.note) : null }, create: { sessionId: saved.id, studentCarnet: String(record.studentCarnet), status: String(record.status), note: record.note ? String(record.note) : null } });
      await tx.auditLog.create({ data: { action: 'SAVE_ATTENDANCE', entityType: 'ATTENDANCE', entityId: saved.id, actorId: user.id, details: JSON.stringify({ sectionId, date, records: records.length }) } });
      return saved;
    });
    sendOk(res, { id: session.id });
  });
}
