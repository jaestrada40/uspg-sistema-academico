import type express from 'express';
import type { AppPrisma, ServerHelpers, AuthMiddleware } from '../types';

export function registerSystemsRoutes(
  app: express.Application,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { requireUser, requireSystems } = middleware;
  const { mailTransport, notifyUser, hashPassword, temporaryPassword, deliverOutboxEmail } = helpers;

  app.get('/api/systems/overview', requireUser, requireSystems, async (_req, res) => {
    const [users, activeSessions, mfaEnabled, pendingEmails, failedEmails, recentAudit] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.user.count({ where: { mfaEnabled: true } }),
      prisma.emailOutbox.count({ where: { status: { in: ['PENDING_CONFIGURATION', 'FAILED'] } } }),
      prisma.emailOutbox.count({ where: { status: 'FAILED' } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { actor: { select: { name: true, role: true } } } }),
    ]);
    res.json({ health: { ok: true, database: process.env.DATABASE_PROVIDER || 'sqlite', smtpConfigured: Boolean(mailTransport) }, metrics: { managedUsers: users, activeSessions, mfaEnabled, pendingEmails, failedEmails }, audit: recentAudit.map((record) => ({ id: record.id, action: record.action, entityType: record.entityType, entityId: record.entityId, actor: record.actor?.name || 'Sistema', actorRole: record.actor?.role || null, createdAt: record.createdAt })) });
  });

  app.get('/api/systems/accounts', requireUser, requireSystems, async (_req, res) => {
    const users = await prisma.user.findMany({ where: { role: { not: 'ADMIN' } }, select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, mfaEnabled: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    res.json(users);
  });

  app.post('/api/systems/accounts/:id/reset-password', requireUser, requireSystems, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role === 'ADMIN') return void res.status(404).json({ message: 'Usuario no disponible para soporte técnico.' });
    const password = temporaryPassword();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password), mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { action: 'PASSWORD_RESET_SYSTEMS', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ role: user.role }) } }),
    ]);
    await notifyUser(user.id, 'Cambio de contraseña · Sistema Académico USPG', `El equipo de Sistemas restableció tu acceso. Correo: ${user.email}\nContraseña temporal: ${password}\nDebes cambiarla al ingresar.`, 'WARNING', '/login');
    res.json({ temporaryPassword: password });
  });

  app.post('/api/systems/accounts/:id/reset-mfa', requireUser, requireSystems, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role === 'ADMIN') return void res.status(404).json({ message: 'Usuario no disponible para soporte técnico.' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaRecoveryCodeHashes: null, mfaLastUsedStep: null } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { action: 'MFA_RESET_SYSTEMS', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ role: user.role }) } }),
    ]);
    await notifyUser(user.id, 'MFA reiniciado por Sistemas', 'Tus métodos MFA fueron eliminados. Configúralos nuevamente al ingresar si tu rol lo requiere.', 'WARNING', '/perfil');
    res.json({ ok: true });
  });

  app.get('/api/systems/outbox', requireUser, requireSystems, async (_req, res) => {
    const records = await prisma.emailOutbox.findMany({ where: { status: { in: ['PENDING_CONFIGURATION', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, recipientEmail: true, subject: true, status: true, attempts: true, lastError: true, createdAt: true } });
    res.json({ smtpConfigured: Boolean(mailTransport), records });
  });

  app.post('/api/systems/outbox/:id/retry', requireUser, requireSystems, async (req, res) => {
    const record = await prisma.emailOutbox.findUnique({ where: { id: req.params.id } });
    if (!record || !['PENDING_CONFIGURATION', 'FAILED'].includes(record.status)) return void res.status(404).json({ message: 'Correo no disponible para reintento.' });
    await deliverOutboxEmail(record.id);
    await prisma.auditLog.create({ data: { action: 'RETRY_OUTBOX_SYSTEMS', entityType: 'EMAIL_OUTBOX', entityId: record.id, actorId: res.locals.authUser.id } });
    res.json(await prisma.emailOutbox.findUnique({ where: { id: record.id }, select: { id: true, status: true, attempts: true, lastError: true } }));
  });

  app.get('/api/systems/sessions', requireUser, requireSystems, async (_req, res) => {
    const sessions = await prisma.session.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions.map((s) => ({ id: s.id, userId: s.userId, name: s.user.name, email: s.user.email, role: s.user.role, createdAt: s.createdAt, expiresAt: s.expiresAt })));
  });

  app.delete('/api/systems/sessions/:id', requireUser, requireSystems, async (req, res) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) return void res.status(404).json({ message: 'Sesión no encontrada.' });
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user?.role === 'ADMIN') return void res.status(403).json({ message: 'No se puede cerrar sesión de ADMIN.' });
    await prisma.session.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({ data: { action: 'SESSION_CLOSED_SYSTEMS', entityType: 'SESSION', entityId: req.params.id, actorId: res.locals.authUser.id, details: JSON.stringify({ userId: session.userId }) } });
    res.json({ ok: true });
  });

  app.get('/api/systems/inactive-users', requireUser, requireSystems, async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { active: false, role: { not: 'ADMIN' } },
      select: { id: true, name: true, email: true, role: true, active: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(users);
  });

  app.patch('/api/systems/accounts/:id/toggle-active', requireUser, requireSystems, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role === 'ADMIN') return void res.status(404).json({ message: 'Usuario no disponible para soporte técnico.' });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { active: !user.active } });
    if (!updated.active) await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.create({ data: { action: updated.active ? 'USER_ACTIVATED_SYSTEMS' : 'USER_DEACTIVATED_SYSTEMS', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id } });
    res.json({ active: updated.active });
  });

  app.get('/api/systems/audit', requireUser, requireSystems, async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const pageSize = [10, 20, 50, 100].includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 20;
    const where: Record<string, unknown> = {};
    if (req.query.action) where.action = { contains: String(req.query.action) };
    if (req.query.actorId) where.actorId = String(req.query.actorId);
    const [total, records] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { name: true, role: true } } } }),
    ]);
    res.json({ total, page, pageSize, records: records.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, actor: r.actor?.name || 'Sistema', actorRole: r.actor?.role || null, details: r.details, createdAt: r.createdAt })) });
  });

  app.get('/api/systems/virtual-classrooms', requireUser, requireSystems, async (_req, res) => {
    const classrooms = await prisma.virtualClassroom.findMany({
      include: { section: { include: { course: { select: { name: true, code: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(classrooms.map((vc) => ({ id: vc.id, provider: vc.provider, syncStatus: vc.syncStatus, externalCourseId: vc.externalCourseId, syncError: vc.syncError, lastSyncedAt: vc.lastSyncedAt, courseName: vc.section.course.name, courseCode: vc.section.course.code, sectionId: vc.sectionId, updatedAt: vc.updatedAt })));
  });
}
