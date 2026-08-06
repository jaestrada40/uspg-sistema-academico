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
}
