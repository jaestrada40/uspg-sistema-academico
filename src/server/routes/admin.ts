import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerAdminRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { handleUniqueError, notifyUser, hashPassword, temporaryPassword } = helpers;
  const { requireAdmin, requireRegistro, requireUser } = middleware;
  const requireAcademicRead: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'REGISTRO', 'FINANZAS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Registro Académico.' });

  app.get('/api/admin/users', requireAdmin, async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, carnetOrCode: true, active: true, mustChangePassword: true, mfaEnabled: true, updatedAt: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  });

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || '').trim().toUpperCase();
    const carnetOrCode = String(req.body?.carnetOrCode || '').trim() || null;
    const allowedRoles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS', 'REGISTRO', 'FINANZAS'];
    if (name.length < 3 || !/^\S+@\S+\.\S+$/.test(email) || !allowedRoles.includes(role)) return void res.status(400).json({ message: 'Nombre, correo y rol son obligatorios y válidos.' });
    const password = temporaryPassword();
    try {
      const user = await prisma.user.create({ data: { id: randomUUID(), name, email, role, carnetOrCode, passwordHash: hashPassword(password), mustChangePassword: true, department: role === 'ADMIN' ? 'Administración' : null } });
      await prisma.auditLog.create({ data: { action: 'USER_CREATED_ADMIN', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ email, role }) } });
      res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, carnetOrCode: user.carnetOrCode, active: user.active, mustChangePassword: true, mfaEnabled: false }, temporaryPassword: password });
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' });
    const password = temporaryPassword();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password), mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { action: 'PASSWORD_RESET_ADMIN', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ email: user.email }) } }),
    ]);
    await notifyUser(user.id, 'Cambio de contraseña · Sistema Académico USPG', `Hola ${user.name},\n\nUn administrador restableció tu acceso.\n\nCorreo: ${user.email}\nContraseña temporal: ${password}\n\nIngresa al sistema y cambia esta contraseña cuando se te solicite. Por seguridad, no compartas este correo.`, 'WARNING', '/login');
    res.json({ temporaryPassword: password, mustChangePassword: true, emailQueued: true });
  });

  app.patch('/api/admin/users/:id/toggle-active', requireAdmin, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' });
    if (user.id === res.locals.authUser.id) return void res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' });
    if (user.role === 'ADMIN') return void res.status(400).json({ message: 'No puedes desactivar cuentas de administrador.' });
    const active = !user.active;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { active } });
      await tx.auditLog.create({ data: { action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ email: user.email }) } });
      if (!active) await tx.session.deleteMany({ where: { userId: user.id } });
    });
    res.json({ active });
  });

  app.post('/api/admin/users/:id/reset-mfa', requireAdmin, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaRecoveryCodeHashes: null, mfaLastUsedStep: null } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { action: 'MFA_RESET_ADMIN', entityType: 'USER', entityId: user.id, actorId: res.locals.authUser.id, details: JSON.stringify({ email: user.email }) } }),
    ]);
    res.json({ ok: true });
  });

  app.get('/api/users', requireAdmin, async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, carnetOrCode: true, active: true, mustChangePassword: true, mfaEnabled: true, updatedAt: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  });

  app.get('/api/institution', async (_req, res) => {
    const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    res.json(institution || {
      id: 1,
      name: 'Universidad de San Pablo de Guatemala',
      shortName: 'USPG',
      logoDataUrl: null,
      mfaRequiredRoles: null,
    });
  });

  app.put('/api/institution', requireRegistro, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const shortName = String(req.body?.shortName || '').trim().toUpperCase();
    const logoDataUrl = req.body?.logoDataUrl == null ? null : String(req.body.logoDataUrl);

    if (name.length < 3 || name.length > 120) {
      res.status(400).json({ message: 'El nombre institucional debe tener entre 3 y 120 caracteres.' });
      return;
    }
    if (!/^[A-Z0-9ÁÉÍÓÚÜÑ-]{2,12}$/.test(shortName)) {
      res.status(400).json({ message: 'La abreviatura debe tener entre 2 y 12 letras o números.' });
      return;
    }
    if (
      logoDataUrl &&
      (!/^data:image\/(png|jpeg|webp);base64,/.test(logoDataUrl) || logoDataUrl.length > 3_000_000)
    ) {
      res.status(400).json({ message: 'El logo debe ser PNG, JPG o WebP y pesar menos de 2 MB.' });
      return;
    }

    const institution = await prisma.institutionConfig.upsert({
      where: { id: 1 },
      update: { name, shortName, logoDataUrl },
      create: { id: 1, name, shortName, logoDataUrl },
    });
    res.json(institution);
  });

  app.get('/api/parameters', requireRegistro, async (_req, res) => {
    const params = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    res.json(params || {});
  });

  app.get('/api/audit-logs', requireRegistro, async (req, res) => {
    const take = Math.min(Number(req.query.limit) || 100, 500);
    const records = await prisma.auditLog.findMany({
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json(records.map((record) => ({
      id: record.id,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      details: record.details,
      actorName: record.actor?.name || 'Sistema',
      actorRole: record.actor?.role || null,
      createdAt: record.createdAt,
    })));
  });

  app.get('/api/academic-parameters', requireRegistro, async (_req, res) => {
    const config = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    res.json(config || {});
  });

  app.get('/api/classrooms', requireUser, requireAcademicRead, async (_req, res) => res.json(await prisma.classroom.findMany({ orderBy: [{ building: 'asc' }, { code: 'asc' }] })));
  app.post('/api/classrooms', requireRegistro, async (req, res) => {
    if (!req.body.campusId) return void res.status(400).json({ message: 'Selecciona el campus del aula.' });
    try { const classroom = await prisma.classroom.create({ data: req.body }); res.status(201).json(classroom); }
    catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });
  app.patch('/api/classrooms/:id', requireRegistro, async (req, res) => {
    if ('campusId' in req.body && !req.body.campusId) return void res.status(400).json({ message: 'Selecciona el campus del aula.' });
    res.json(await prisma.classroom.update({ where: { id: req.params.id }, data: req.body }));
  });
}
