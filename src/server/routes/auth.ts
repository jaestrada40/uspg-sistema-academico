import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type express from 'express';
import QRCode from 'qrcode';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

// Local helpers not exposed as server-wide helpers but needed here
const encodeBase32 = (input: Buffer) => {
  const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '', output = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  for (let index = 0; index < bits.length; index += 5) output += base32Alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
};

export function registerAuthRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const {
    hashToken, readSessionToken, sessionCookie, sessionCookieOptions,
    decryptMfaSecret, encryptMfaSecret, totpAt, matchingTotpStep,
    getMfaRequiredRoles, defaultMfaRequiredRoles,
    loginAttempts, passwordRecoveryRequests, loginAttemptKey, registerFailedLogin,
    publicUser, verifyPassword, hashPassword, passwordPolicyError,
    createAuthenticatedSession, notifyUser, mailTransport, emailHtml,
  } = helpers;
  const { requireUser, requireAdmin } = middleware;

  const recoveryCodeHash = (code: string) => {
    const configured = process.env.MFA_ENCRYPTION_KEY;
    let key: Buffer;
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      key = decoded.length === 32 ? decoded : createHash('sha256').update('uspg-mfa-development-key').digest();
    } else {
      key = createHash('sha256').update('uspg-mfa-development-key').digest();
    }
    return createHmac('sha256', key).update(code.toUpperCase().replace(/[^A-Z2-7]/g, '')).digest('hex');
  };

  const generateRecoveryCodes = () => Array.from({ length: 8 }, () => {
    const value = encodeBase32(randomBytes(5));
    return `${value.slice(0, 4)}-${value.slice(4, 8)}`;
  });

  const verifyTotp = (secret: string, code: string) => matchingTotpStep(secret, code) !== null;

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const rememberMe = Boolean(req.body?.rememberMe);
    const attemptKey = loginAttemptKey(username);
    const attempt = loginAttempts.get(attemptKey);
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now()) return void res.status(429).json({ message: 'Demasiados intentos fallidos. Intenta nuevamente en 15 minutos.' });
    const user = await prisma.user.findFirst({
      where: {
        active: true,
        OR: [{ email: username.toLowerCase() }, { carnetOrCode: username }],
      },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      registerFailedLogin(attemptKey);
      res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
      return;
    }

    loginAttempts.delete(attemptKey);

    if (user.mfaEnabled) {
      await prisma.mfaChallenge.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, { userId: user.id }] } });
      const challengeToken = randomBytes(32).toString('base64url');
      await prisma.mfaChallenge.create({ data: { tokenHash: hashToken(challengeToken), userId: user.id, rememberMe, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
      return void res.status(202).json({ mfaRequired: true, challengeToken, methods: ['TOTP', 'RECOVERY'] });
    }
    await createAuthenticatedSession(res, user.id, rememberMe);
    const requiredRoles = await getMfaRequiredRoles();
    res.json({ user: publicUser(user, requiredRoles) });
  });

  app.post('/api/auth/mfa/verify', async (req, res) => {
    const challengeToken = String(req.body?.challengeToken || '');
    const code = String(req.body?.code || '');
    const challenge = challengeToken ? await prisma.mfaChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) }, include: { user: true } }) : null;
    if (!challenge || challenge.expiresAt <= new Date() || !challenge.user.active || !challenge.user.mfaEnabled || !challenge.user.mfaSecretEncrypted) {
      if (challenge) await prisma.mfaChallenge.delete({ where: { id: challenge.id } });
      return void res.status(401).json({ message: 'El desafío MFA expiró. Inicia sesión nuevamente.' });
    }
    if (challenge.attempts >= 5) {
      await prisma.mfaChallenge.delete({ where: { id: challenge.id } });
      return void res.status(429).json({ message: 'Demasiados intentos MFA. Inicia sesión nuevamente.' });
    }
    const secret = decryptMfaSecret(challenge.user.mfaSecretEncrypted);
    const matchedTotpStep = matchingTotpStep(secret, code);
    const hashes: string[] = JSON.parse(challenge.user.mfaRecoveryCodeHashes || '[]');
    const recoveryHash = recoveryCodeHash(code);
    const recoveryIndex = hashes.findIndex((hash) => hash.length === recoveryHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(recoveryHash)));
    if ((matchedTotpStep === null || (challenge.user.mfaLastUsedStep !== null && matchedTotpStep <= challenge.user.mfaLastUsedStep)) && recoveryIndex < 0) {
      await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      return void res.status(401).json({ message: 'Código de verificación incorrecto.' });
    }
    await prisma.$transaction([
      prisma.mfaChallenge.delete({ where: { id: challenge.id } }),
      ...(recoveryIndex >= 0 ? [prisma.user.update({ where: { id: challenge.userId }, data: { mfaRecoveryCodeHashes: JSON.stringify(hashes.filter((_, index) => index !== recoveryIndex)) } })] : [prisma.user.update({ where: { id: challenge.userId }, data: { mfaLastUsedStep: matchedTotpStep } })]),
      prisma.auditLog.create({ data: { action: recoveryIndex >= 0 ? 'LOGIN_MFA_RECOVERY' : 'LOGIN_MFA_TOTP', entityType: 'USER', entityId: challenge.userId, actorId: challenge.userId } }),
    ]);
    await createAuthenticatedSession(res, challenge.userId, challenge.rememberMe);
    const requiredRoles = await getMfaRequiredRoles();
    res.json({ user: publicUser(challenge.user, requiredRoles), recoveryCodeUsed: recoveryIndex >= 0 });
  });

  app.get('/api/auth/me', async (req, res) => {
    const token = readSessionToken(req);
    if (!token) {
      res.status(401).json({ message: 'No hay una sesión activa.' });
      return;
    }
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      res.clearCookie(sessionCookie, sessionCookieOptions);
      res.status(401).json({ message: 'La sesión expiró.' });
      return;
    }
    const requiredRoles = await getMfaRequiredRoles();
    res.json({ user: publicUser(session.user, requiredRoles) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = readSessionToken(req);
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(sessionCookie, sessionCookieOptions);
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const genericResponse = { message: 'Si el correo está registrado, recibirás un enlace de recuperación.' };
    const recoveryKey = hashToken(email);
    const lastRequest = passwordRecoveryRequests.get(recoveryKey) || 0;
    if (Date.now() - lastRequest < 5 * 60 * 1000) return void res.json(genericResponse);
    passwordRecoveryRequests.set(recoveryKey, Date.now());
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !user.active) return void res.json(genericResponse);
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    if (mailTransport) {
      const resetUrl = `${String(process.env.APP_URL).replace(/\/$/, '')}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
      try {
        await mailTransport.sendMail({
          from: process.env.SMTP_FROM || 'Sistema Académico USPG <no-reply@uspg.edu.gt>',
          to: user.email,
          subject: 'Restablecimiento de contraseña USPG',
          text: `Hola ${user.name}. Usa este enlace para restablecer tu contraseña. Vence en 30 minutos y solo funciona una vez:\n\n${resetUrl}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
          html: emailHtml('Restablecimiento de contraseña', `Hola ${user.name},\n\nUsa el botón para crear una nueva contraseña. El enlace vence en 30 minutos y solo funciona una vez.\n\nSi no solicitaste este cambio, puedes ignorar este mensaje.`, resetUrl),
        });
      } catch (error) {
        console.error('No se pudo enviar la recuperación de contraseña:', error instanceof Error ? error.message : 'Error SMTP');
      }
    }
    res.json(genericResponse);
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return void res.status(400).json({ message: policyError });
    const record = token ? await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }) : null;
    if (!record || record.expiresAt <= new Date() || !record.user.active) {
      if (record) await prisma.passwordResetToken.delete({ where: { id: record.id } });
      return void res.status(400).json({ message: 'El enlace es inválido o ya venció.' });
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: record.userId } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: record.userId } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
      prisma.auditLog.create({ data: { action: 'PASSWORD_RESET_SELF_SERVICE', entityType: 'USER', entityId: record.userId, actorId: record.userId } }),
    ]);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', requireUser, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const user = res.locals.authUser;
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return void res.status(400).json({ message: 'La contraseña actual no es correcta.' });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return void res.status(400).json({ message: policyError });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: false } });
    await prisma.session.deleteMany({ where: { userId: user.id, tokenHash: { not: hashToken(readSessionToken(req) as string) } } });
    res.json({ ok: true });
  });

  app.get('/api/auth/mfa/status', requireUser, async (_req, res) => {
    const user = await prisma.user.findUnique({ where: { id: res.locals.authUser.id } });
    if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' });
    const requiredRoles = await getMfaRequiredRoles();
    const recoveryCodes: string[] = JSON.parse(user.mfaRecoveryCodeHashes || '[]');
    res.json({ enabled: user.mfaEnabled, required: requiredRoles.includes(user.role), requiredRoles, recoveryCodesRemaining: recoveryCodes.length });
  });

  app.post('/api/auth/mfa/setup', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const currentPassword = String(req.body?.currentPassword || '');
    if (!verifyPassword(currentPassword, user.passwordHash)) return void res.status(400).json({ message: 'La contraseña actual no es correcta.' });
    if (user.mfaEnabled) return void res.status(409).json({ message: 'MFA ya está activo en esta cuenta.' });
    const secret = encodeBase32(randomBytes(20));
    await prisma.user.update({ where: { id: user.id }, data: { mfaPendingSecretEncrypted: encryptMfaSecret(secret) } });
    const label = encodeURIComponent(`USPG:${user.email}`);
    const issuer = encodeURIComponent('Universidad de San Pablo de Guatemala');
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 1, width: 280 });
    await prisma.auditLog.create({ data: { action: 'START_MFA_SETUP', entityType: 'USER', entityId: user.id, actorId: user.id } });
    res.json({ secret, otpauthUri, qrDataUrl });
  });

  app.post('/api/auth/mfa/enable', requireUser, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: res.locals.authUser.id } });
    if (!user?.mfaPendingSecretEncrypted) return void res.status(409).json({ message: 'Primero inicia la configuración MFA.' });
    const secret = decryptMfaSecret(user.mfaPendingSecretEncrypted);
    if (!verifyTotp(secret, String(req.body?.code || ''))) return void res.status(400).json({ message: 'El código no es válido. Verifica la hora del dispositivo.' });
    const recoveryCodes = generateRecoveryCodes();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecretEncrypted: user.mfaPendingSecretEncrypted, mfaPendingSecretEncrypted: null, mfaRecoveryCodeHashes: JSON.stringify(recoveryCodes.map(recoveryCodeHash)), mfaLastUsedStep: null } }),
      prisma.auditLog.create({ data: { action: 'ENABLE_MFA', entityType: 'USER', entityId: user.id, actorId: user.id } }),
    ]);
    await notifyUser(user.id, 'Autenticación multifactor activada', 'MFA fue activado en tu cuenta. Si no reconoces este cambio, comunícate con administración.', 'SUCCESS', '/perfil');
    res.json({ ok: true, recoveryCodes });
  });

  app.post('/api/auth/mfa/recovery-codes', requireUser, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: res.locals.authUser.id } });
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) return void res.status(409).json({ message: 'MFA no está activo.' });
    if (!verifyPassword(String(req.body?.currentPassword || ''), user.passwordHash) || !verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), String(req.body?.code || ''))) return void res.status(400).json({ message: 'Contraseña o código MFA incorrecto.' });
    const recoveryCodes = generateRecoveryCodes();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodeHashes: JSON.stringify(recoveryCodes.map(recoveryCodeHash)) } }),
      prisma.auditLog.create({ data: { action: 'REGENERATE_MFA_RECOVERY_CODES', entityType: 'USER', entityId: user.id, actorId: user.id } }),
    ]);
    res.json({ recoveryCodes });
  });

  app.post('/api/auth/mfa/disable', requireUser, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: res.locals.authUser.id } });
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) return void res.status(409).json({ message: 'MFA no está activo.' });
    const requiredRoles = await getMfaRequiredRoles();
    if (requiredRoles.includes(user.role)) return void res.status(409).json({ message: 'MFA es obligatorio para tu rol. Un administrador debe cambiar primero la política.' });
    const code = String(req.body?.code || '');
    const hashes: string[] = JSON.parse(user.mfaRecoveryCodeHashes || '[]');
    const codeHash = recoveryCodeHash(code);
    const validRecovery = hashes.some((hash) => hash.length === codeHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(codeHash)));
    if (!verifyPassword(String(req.body?.currentPassword || ''), user.passwordHash) || (!verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code) && !validRecovery)) return void res.status(400).json({ message: 'Contraseña o código MFA incorrecto.' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaRecoveryCodeHashes: null, mfaLastUsedStep: null } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { action: 'DISABLE_MFA', entityType: 'USER', entityId: user.id, actorId: user.id } }),
    ]);
    await notifyUser(user.id, 'Autenticación multifactor desactivada', 'MFA fue desactivado en tu cuenta.', 'WARNING', '/perfil');
    res.json({ ok: true });
  });

  app.get('/api/auth/sessions', requireUser, async (req, res) => {
    const token = helpers.readSessionToken(req);
    const currentHash = token ? hashToken(token) : null;
    const sessions = await prisma.session.findMany({ where: { userId: res.locals.authUser.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    res.json(sessions.map((session) => ({ id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt, current: session.tokenHash === currentHash })));
  });

  app.delete('/api/auth/sessions/:id', requireUser, async (req, res) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session || session.userId !== res.locals.authUser.id) return void res.status(404).json({ message: 'Sesión no encontrada.' });
    await prisma.session.delete({ where: { id: session.id } });
    res.json({ ok: true });
  });

  app.get('/api/security/mfa-policy', requireAdmin, async (_req, res) => {
    res.json({ requiredRoles: await getMfaRequiredRoles(), availableRoles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'] });
  });

  app.put('/api/security/mfa-policy', requireAdmin, async (req, res) => {
    const availableRoles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'];
    const requiredRoles: string[] = Array.isArray(req.body?.requiredRoles) ? [...new Set<string>(req.body.requiredRoles.map((role: unknown) => String(role).toUpperCase()))] : [];
    if (requiredRoles.some((role) => !availableRoles.includes(role))) return void res.status(400).json({ message: 'La política contiene un rol inválido.' });
    await prisma.$transaction([
      prisma.institutionConfig.update({ where: { id: 1 }, data: { mfaRequiredRoles: JSON.stringify(requiredRoles) } }),
      prisma.auditLog.create({ data: { action: 'UPDATE_MFA_POLICY', entityType: 'INSTITUTION', entityId: '1', actorId: res.locals.authUser.id, details: JSON.stringify({ requiredRoles }) } }),
    ]);
    res.json({ requiredRoles });
  });

  app.post('/api/security/users/:id/reset-mfa', requireAdmin, async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return void res.status(404).json({ message: 'Usuario no encontrado.' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: target.id }, data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaRecoveryCodeHashes: null, mfaLastUsedStep: null } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: target.id } }),
      prisma.session.deleteMany({ where: { userId: target.id } }),
      prisma.auditLog.create({ data: { action: 'ADMIN_RESET_MFA', entityType: 'USER', entityId: target.id, actorId: res.locals.authUser.id } }),
    ]);
    await notifyUser(target.id, 'MFA reiniciado por administración', 'Tus métodos MFA fueron eliminados. Deberás configurarlos nuevamente si tu rol lo requiere.', 'WARNING', '/perfil');
    res.json({ ok: true });
  });
}
