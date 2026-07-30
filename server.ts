import 'dotenv/config';
import express from 'express';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { createReceiptPdf, createStatementPdf } from './src/server/financialPdf';
import { createPrismaClient } from './src/server/prismaClient';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const prisma = createPrismaClient();

const defaultMfaRequiredRoles = ['ADMIN', 'DOCENTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS'];
const mfaEncryptionKey = (() => {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === 32) return decoded;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('MFA_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en base64.');
  return createHash('sha256').update('uspg-mfa-development-key').digest();
})();
const encryptMfaSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
};
const decryptMfaSecret = (value: string) => {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('Secreto MFA cifrado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', mfaEncryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const encodeBase32 = (input: Buffer) => {
  let bits = '', output = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  for (let index = 0; index < bits.length; index += 5) output += base32Alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
};
const decodeBase32 = (input: string) => {
  let bits = '';
  for (const character of input.toUpperCase().replace(/=|\s|-/g, '')) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error('Secreto TOTP inválido.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
};
const totpAt = (secret: string, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
};
const matchingTotpStep = (secret: string, code: string) => {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  for (const window of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, Date.now() + window * 30_000));
    const actual = Buffer.from(normalized);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return Math.floor(Date.now() / 30_000) + window;
  }
  return null;
};
const verifyTotp = (secret: string, code: string) => matchingTotpStep(secret, code) !== null;
const recoveryCodeHash = (code: string) => createHmac('sha256', mfaEncryptionKey).update(code.toUpperCase().replace(/[^A-Z2-7]/g, '')).digest('hex');
const generateRecoveryCodes = () => Array.from({ length: 8 }, () => {
  const value = encodeBase32(randomBytes(5));
  return `${value.slice(0, 4)}-${value.slice(4, 8)}`;
});
const getMfaRequiredRoles = async () => {
  const config = await prisma.institutionConfig.findUnique({ where: { id: 1 }, select: { mfaRequiredRoles: true } });
  try {
    const parsed = JSON.parse(config?.mfaRequiredRoles || JSON.stringify(defaultMfaRequiredRoles));
    return Array.isArray(parsed) ? parsed.filter((role): role is string => typeof role === 'string') : defaultMfaRequiredRoles;
  } catch { return defaultMfaRequiredRoles; }
};

const smtpPort = Number(process.env.SMTP_PORT || 587);
const mailTransport = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;

const deliverOutboxEmail = async (outboxId: string) => {
  const email = await prisma.emailOutbox.findUnique({ where: { id: outboxId } });
  if (!email || email.status === 'SENT') return;
  if (!mailTransport) {
    await prisma.emailOutbox.update({ where: { id: outboxId }, data: { status: 'PENDING_CONFIGURATION', lastError: 'SMTP no configurado' } });
    return;
  }
  try {
    await mailTransport.sendMail({ from: process.env.SMTP_FROM || 'Sistema Académico USPG <no-reply@uspg.edu.gt>', to: email.recipientEmail, subject: email.subject, text: email.textBody });
    await prisma.emailOutbox.update({ where: { id: outboxId }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
  } catch (error) {
    await prisma.emailOutbox.update({ where: { id: outboxId }, data: { status: 'FAILED', attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Error SMTP' } });
  }
};

const notifyUser = async (userId: string, title: string, message: string, type = 'INFO', link?: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  const notification = await prisma.appNotification.create({ data: { userId, title, message, type, link, email: { create: { recipientEmail: user.email, subject: title, textBody: message } } }, include: { email: true } });
  if (notification.email) await deliverOutboxEmail(notification.email.id);
};

const notifyByCarnet = async (carnet: string, title: string, message: string, type = 'INFO', link?: string) => {
  const user = await prisma.user.findUnique({ where: { carnetOrCode: carnet }, select: { id: true } });
  if (user) await notifyUser(user.id, title, message, type, link);
};

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://accounts.google.com https://www.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:");
  }
  next();
});
app.use(express.json({ limit: '5mb', strict: true }));

const configuredOrigin = (() => {
  try { return process.env.APP_URL ? new URL(process.env.APP_URL).origin : null; } catch { return null; }
})();
const isDevelopmentOrigin = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const allowed = origin && (origin === configuredOrigin || (!isProduction && isDevelopmentOrigin(origin)));
  if ((origin && !allowed) || fetchSite === 'cross-site') {
    return void res.status(403).json({ message: 'Origen de solicitud no permitido.' });
  }
  next();
});

type RateBucket = { count: number; resetAt: number };
const apiRateBuckets = new Map<string, RateBucket>();
const apiRateWindowMs = 15 * 60 * 1000;
const apiRateLimit = 600;
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = apiRateBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + apiRateWindowMs } : current;
  bucket.count += 1;
  apiRateBuckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', String(apiRateLimit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, apiRateLimit - bucket.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));
  if (bucket.count > apiRateLimit) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return void res.status(429).json({ message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
  }
  if (apiRateBuckets.size > 10_000) {
    for (const [bucketKey, value] of apiRateBuckets) if (value.resetAt <= now) apiRateBuckets.delete(bucketKey);
  }
  next();
});

const sessionCookie = 'uspg_session';
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
};
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const parseCookies = (header = '') => Object.fromEntries(
  header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key)
);
const publicUser = (user: {
  id: string; name: string; email: string; role: string; avatar: string | null;
  carnetOrCode: string | null; phone: string | null; department: string | null; mustChangePassword: boolean; mfaEnabled: boolean;
}, requiredRoles: string[] = defaultMfaRequiredRoles) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar || undefined,
  carnetOrCode: user.carnetOrCode || undefined,
  phone: user.phone || undefined,
  department: user.department || undefined,
  mustChangePassword: user.mustChangePassword,
  mfaEnabled: user.mfaEnabled,
  mfaEnrollmentRequired: requiredRoles.includes(user.role) && !user.mfaEnabled,
});

const verifyPassword = (password: string, stored: string) => {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const roleFromEmail = (email: string) => {
  const value = email.trim().toLowerCase();
  if (value.endsWith('@alumno.uspg.edu.gt')) return 'ESTUDIANTE';
  if (value.endsWith('@catedratico.uspg.edu.gt')) return 'DOCENTE';
  if (value.endsWith('@administrador.uspg.edu.gt')) return 'ADMIN';
  if (value.endsWith('@biblioteca.uspg.edu.gt')) return 'BIBLIOTECA';
  if (value.endsWith('@parqueo.uspg.edu.gt')) return 'PARQUEO';
  if (value.endsWith('@eventos.uspg.edu.gt')) return 'EVENTOS';
  return null;
};

const readSessionToken = (req: express.Request) => parseCookies(req.headers.cookie)[sessionCookie];
const blockUntilMfaEnrollment = async (req: express.Request, res: express.Response, user: { role: string; mfaEnabled: boolean }) => {
  if (user.mfaEnabled || req.path.startsWith('/api/auth/mfa/') || req.path === '/api/auth/change-password') return false;
  const requiredRoles = await getMfaRequiredRoles();
  if (!requiredRoles.includes(user.role)) return false;
  res.status(428).json({ message: 'Debes configurar la autenticación multifactor antes de continuar.', code: 'MFA_ENROLLMENT_REQUIRED' });
  return true;
};
const requireAdmin: express.RequestHandler = async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    if (!token) {
      res.status(401).json({ message: 'Debes iniciar sesión.' });
      return;
    }
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      res.status(401).json({ message: 'La sesión no es válida.' });
      return;
    }
    if (session.user.role !== 'ADMIN') {
      res.status(403).json({ message: 'Solo un administrador puede realizar esta acción.' });
      return;
    }
    if (await blockUntilMfaEnrollment(req, res, session.user)) return;
    res.locals.authUser = session.user;
    next();
  } catch (error) {
    next(error);
  }
};

const requireUser: express.RequestHandler = async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    if (!token) return void res.status(401).json({ message: 'Debes iniciar sesión.' });
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      return void res.status(401).json({ message: 'La sesión no es válida.' });
    }
    if (await blockUntilMfaEnrollment(req, res, session.user)) return;
    res.locals.authUser = session.user;
    next();
  } catch (error) {
    next(error);
  }
};
const requireLibraryStaff: express.RequestHandler = (req, res, next) => ['ADMIN', 'BIBLIOTECA'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Biblioteca.' });
const requireParkingStaff: express.RequestHandler = (req, res, next) => ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Parqueo.' });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: process.env.DATABASE_PROVIDER || 'sqlite' });
});

const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const loginAttemptKey = (req: express.Request, username: string) => `${req.ip}:${username.toLowerCase()}`;
const registerFailedLogin = (key: string) => {
  const current = loginAttempts.get(key);
  const count = (current?.blockedUntil && current.blockedUntil > Date.now() ? current.count : 0) + 1;
  loginAttempts.set(key, { count, blockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
};

const createAuthenticatedSession = async (res: express.Response, userId: string, rememberMe: boolean) => {
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const token = randomBytes(32).toString('base64url');
  const durationMs = (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + durationMs) } });
  res.cookie(sessionCookie, token, { ...sessionCookieOptions, maxAge: rememberMe ? durationMs : undefined });
};

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const rememberMe = Boolean(req.body?.rememberMe);
  const attemptKey = loginAttemptKey(req, username);
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

app.post('/api/auth/change-password', requireUser, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const user = res.locals.authUser;
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return void res.status(400).json({ message: 'La contraseña actual no es correcta.' });
  }
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return void res.status(400).json({ message: 'La nueva contraseña debe tener 8 caracteres, mayúscula, minúscula y número.' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: false } });
  await prisma.session.deleteMany({ where: { userId: user.id, tokenHash: { not: hashToken(readSessionToken(req)) } } });
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

app.get('/api/security/mfa-policy', requireAdmin, async (_req, res) => {
  res.json({ requiredRoles: await getMfaRequiredRoles(), availableRoles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS'] });
});

app.put('/api/security/mfa-policy', requireAdmin, async (req, res) => {
  const availableRoles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS'];
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

const temporaryPassword = () => `UsPG${randomBytes(4).toString('hex')}!`;
const handleUniqueError = (error: unknown, res: express.Response) => {
  if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
    res.status(409).json({ message: 'El correo, carné o código ya está registrado.' });
    return true;
  }
  return false;
};

const studentView = (student: any) => ({ ...student, campusName: student.campus?.name, planCode: student.plan?.code, planName: student.plan?.name, planVersion: student.plan?.version, campus: undefined, plan: undefined });

app.get('/api/academic-structure', requireUser, async (_req, res) => {
  const admin = res.locals.authUser.role === 'ADMIN';
  const [campuses, plans] = await Promise.all([
    prisma.campus.findMany({ where: admin ? {} : { status: 'Activo' }, include: { _count: { select: { students: true } } }, orderBy: { name: 'asc' } }),
    prisma.curriculumPlan.findMany({ where: admin ? {} : { status: 'Activo' }, include: { career: { select: { name: true } }, _count: { select: { courses: true, students: true } } }, orderBy: [{ careerId: 'asc' }, { effectiveFrom: 'desc' }] }),
  ]);
  res.json({ campuses, plans: plans.map((plan) => ({ ...plan, careerName: plan.career.name, career: undefined })) });
});

app.post('/api/academic-structure/campuses', requireAdmin, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase(), name = String(req.body.name || '').trim(), address = String(req.body.address || '').trim();
  if (!/^[A-Z0-9-]{2,12}$/.test(code) || name.length < 3) return void res.status(400).json({ message: 'Indica un código válido y el nombre del campus.' });
  try {
    const campus = await prisma.$transaction(async (tx) => { const created = await tx.campus.create({ data: { id: `CAMPUS-${randomUUID()}`, code, name, address: address || null } }); await tx.auditLog.create({ data: { action: 'CREATE_CAMPUS', entityType: 'CAMPUS', entityId: created.id, actorId: res.locals.authUser.id } }); return created; });
    res.status(201).json(campus);
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.patch('/api/academic-structure/campuses/:id', requireAdmin, async (req, res) => {
  const current = await prisma.campus.findUnique({ where: { id: req.params.id }, include: { _count: { select: { students: true } } } });
  if (!current) return void res.status(404).json({ message: 'Campus no encontrado.' });
  const name = String(req.body.name ?? current.name).trim(), address = String(req.body.address ?? current.address ?? '').trim(), status = String(req.body.status ?? current.status);
  if (name.length < 3 || !['Activo', 'Inactivo'].includes(status)) return void res.status(400).json({ message: 'Nombre o estado no válido.' });
  const campus = await prisma.$transaction(async (tx) => { const updated = await tx.campus.update({ where: { id: current.id }, data: { name, address: address || null, status } }); await tx.auditLog.create({ data: { action: 'UPDATE_CAMPUS', entityType: 'CAMPUS', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, students: current._count.students }) } }); return updated; });
  res.json(campus);
});

app.post('/api/academic-structure/plans', requireAdmin, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase(), name = String(req.body.name || '').trim(), version = String(req.body.version || '').trim().toUpperCase(), careerId = String(req.body.careerId || ''), sourcePlanId = String(req.body.sourcePlanId || '');
  const effectiveFrom = new Date(`${req.body.effectiveFrom}T12:00:00Z`), totalCredits = Number(req.body.totalCredits), durationSemesters = Number(req.body.durationSemesters);
  if (!/^[A-Z0-9-]{3,30}$/.test(code) || name.length < 5 || !version || !careerId || !sourcePlanId || Number.isNaN(effectiveFrom.getTime()) || !Number.isInteger(totalCredits) || totalCredits <= 0 || !Number.isInteger(durationSemesters) || durationSemesters <= 0) return void res.status(400).json({ message: 'Completa código, nombre, versión, vigencia y plan de origen.' });
  const source = await prisma.curriculumPlan.findUnique({ where: { id: sourcePlanId }, include: { courses: true } });
  if (!source || source.careerId !== careerId) return void res.status(400).json({ message: 'El plan de origen debe pertenecer a la misma carrera.' });
  try {
    const plan = await prisma.$transaction(async (tx) => { const created = await tx.curriculumPlan.create({ data: { id: `PLAN-${randomUUID()}`, code, name, version, effectiveFrom, totalCredits, durationSemesters, careerId, status: 'Planificado' } }); if (source.courses.length) await tx.curriculumPlanCourse.createMany({ data: source.courses.map((item) => ({ planId: created.id, courseCode: item.courseCode, semester: item.semester })) }); await tx.auditLog.create({ data: { action: 'CREATE_CURRICULUM_PLAN', entityType: 'CURRICULUM_PLAN', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ sourcePlanId, courses: source.courses.length }) } }); return created; });
    res.status(201).json(plan);
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.patch('/api/academic-structure/plans/:id', requireAdmin, async (req, res) => {
  const current = await prisma.curriculumPlan.findUnique({ where: { id: req.params.id }, include: { _count: { select: { students: true } } } });
  if (!current) return void res.status(404).json({ message: 'Plan académico no encontrado.' });
  const status = String(req.body.status ?? current.status), name = String(req.body.name ?? current.name).trim();
  const effectiveTo = req.body.effectiveTo ? new Date(`${req.body.effectiveTo}T12:00:00Z`) : null;
  if (!['Planificado', 'Activo', 'Cerrado'].includes(status) || name.length < 5 || (effectiveTo && (Number.isNaN(effectiveTo.getTime()) || effectiveTo < current.effectiveFrom))) return void res.status(400).json({ message: 'Nombre, estado o fecha de cierre no válidos.' });
  const plan = await prisma.$transaction(async (tx) => { const updated = await tx.curriculumPlan.update({ where: { id: current.id }, data: { name, status, effectiveTo } }); await tx.auditLog.create({ data: { action: 'UPDATE_CURRICULUM_PLAN', entityType: 'CURRICULUM_PLAN', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, students: current._count.students }) } }); return updated; });
  res.json(plan);
});

app.get('/api/students', requireAdmin, async (_req, res) => {
  const records = await prisma.student.findMany({ include: { campus: true, plan: true }, orderBy: { name: 'asc' } });
  res.json(records.map(studentView));
});

app.post('/api/students', requireAdmin, async (req, res) => {
  const data = req.body;
  if (roleFromEmail(String(data.email || '')) !== 'ESTUDIANTE') {
    return void res.status(400).json({ message: 'El estudiante debe usar un correo @alumno.uspg.edu.gt.' });
  }
  const password = temporaryPassword();
  const userId = randomUUID();
  try {
    const plan = data.planId ? await prisma.curriculumPlan.findUnique({ where: { id: data.planId } }) : await prisma.curriculumPlan.findFirst({ where: { careerId: data.careerId, status: 'Activo' }, orderBy: { effectiveFrom: 'desc' } });
    const campus = data.campusId ? await prisma.campus.findUnique({ where: { id: data.campusId } }) : await prisma.campus.findFirst({ where: { status: 'Activo' }, orderBy: { name: 'asc' } });
    if (!plan || plan.careerId !== data.careerId) return void res.status(400).json({ message: 'Selecciona un plan académico válido para la carrera.' });
    if (!campus) return void res.status(400).json({ message: 'Selecciona un campus válido.' });
    const student = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, name: data.name, email: data.email.toLowerCase(), passwordHash: hashPassword(password), role: 'ESTUDIANTE', carnetOrCode: data.carnet, phone: data.phone, department: data.careerName, mustChangePassword: true } });
      const created = await tx.student.create({ data: { carnet: data.carnet, name: data.name, email: data.email.toLowerCase(), phone: data.phone, careerId: data.careerId, careerName: data.careerName, entryCycle: data.entryCycle, jornada: data.jornada, status: data.status || 'Activo', gpa: data.gpa || 0, creditsEarned: data.creditsEarned || 0, totalCreditsRequired: plan.totalCredits, address: data.address, dpi: data.dpi, campusId: campus.id, planId: plan.id, userId }, include: { campus: true, plan: true } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'STUDENT', entityId: data.carnet, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json({ student: studentView(student), temporaryPassword: password });
  } catch (error) {
    if (!handleUniqueError(error, res)) throw error;
  }
});

app.patch('/api/students/:carnet', requireAdmin, async (req, res) => {
  const current = await prisma.student.findUnique({ where: { carnet: req.params.carnet } });
  if (!current) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const next = { ...current, ...req.body };
  if (roleFromEmail(String(next.email)) !== 'ESTUDIANTE') return void res.status(400).json({ message: 'El estudiante debe usar un correo @alumno.uspg.edu.gt.' });
  try {
    const plan = next.planId ? await prisma.curriculumPlan.findUnique({ where: { id: next.planId } }) : null;
    const campus = next.campusId ? await prisma.campus.findUnique({ where: { id: next.campusId } }) : null;
    if (!plan || plan.careerId !== next.careerId) return void res.status(400).json({ message: 'Selecciona un plan académico válido para la carrera.' });
    if (!campus) return void res.status(400).json({ message: 'Selecciona un campus válido.' });
    const student = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.userId }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, active: next.status === 'Activo' } });
      const updated = await tx.student.update({ where: { carnet: req.params.carnet }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, careerId: next.careerId, careerName: next.careerName, entryCycle: next.entryCycle, jornada: next.jornada, status: next.status, gpa: next.gpa, creditsEarned: next.creditsEarned, totalCreditsRequired: plan.totalCredits, address: next.address, dpi: next.dpi, campusId: campus.id, planId: plan.id }, include: { campus: true, plan: true } });
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'STUDENT', entityId: req.params.carnet, actorId: res.locals.authUser.id } });
      return updated;
    });
    res.json(studentView(student));
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.get('/api/teachers', requireAdmin, async (_req, res) => {
  const records = await prisma.teacher.findMany({ orderBy: { name: 'asc' } });
  res.json(records.map(({ assignedSectionIds, ...teacher }) => ({ ...teacher, assignedSectionIds: JSON.parse(assignedSectionIds) })));
});

app.post('/api/teachers', requireAdmin, async (req, res) => {
  const data = req.body;
  if (roleFromEmail(String(data.email || '')) !== 'DOCENTE') return void res.status(400).json({ message: 'El catedrático debe usar un correo @catedratico.uspg.edu.gt.' });
  const password = temporaryPassword();
  const userId = randomUUID();
  try {
    const teacher = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, name: data.name, email: data.email.toLowerCase(), passwordHash: hashPassword(password), role: 'DOCENTE', carnetOrCode: data.code, phone: data.phone, department: data.specialty, mustChangePassword: true } });
      const created = await tx.teacher.create({ data: { code: data.code, name: data.name, email: data.email.toLowerCase(), phone: data.phone, specialty: data.specialty, academicDegree: data.academicDegree, assignedSectionIds: JSON.stringify(data.assignedSectionIds || []), status: data.status || 'Activo', maxHoursPerWeek: data.maxHoursPerWeek, userId } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'TEACHER', entityId: data.code, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json({ teacher: { ...teacher, assignedSectionIds: JSON.parse(teacher.assignedSectionIds) }, temporaryPassword: password });
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.patch('/api/teachers/:code', requireAdmin, async (req, res) => {
  const current = await prisma.teacher.findUnique({ where: { code: req.params.code } });
  if (!current) return void res.status(404).json({ message: 'Catedrático no encontrado.' });
  const next = { ...current, ...req.body };
  if (roleFromEmail(String(next.email)) !== 'DOCENTE') return void res.status(400).json({ message: 'El catedrático debe usar un correo @catedratico.uspg.edu.gt.' });
  try {
    const teacher = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.userId }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, active: next.status === 'Activo' } });
      const updated = await tx.teacher.update({ where: { code: req.params.code }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, specialty: next.specialty, academicDegree: next.academicDegree, assignedSectionIds: Array.isArray(next.assignedSectionIds) ? JSON.stringify(next.assignedSectionIds) : next.assignedSectionIds, status: next.status, maxHoursPerWeek: next.maxHoursPerWeek } });
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'TEACHER', entityId: req.params.code, actorId: res.locals.authUser.id } });
      return updated;
    });
    res.json({ ...teacher, assignedSectionIds: JSON.parse(teacher.assignedSectionIds) });
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

const careerView = async (career: { code: string; name: string; faculty: string; durationSemesters: number; totalCredits: number; modality: string; status: string; degreeType: string }) => ({
  ...career,
  studentCount: await prisma.student.count({ where: { careerId: career.code } }),
  courseCount: await prisma.course.count({ where: { careerId: career.code } }),
});

app.get('/api/careers', requireAdmin, async (_req, res) => {
  const records = await prisma.career.findMany({ orderBy: { name: 'asc' } });
  res.json(await Promise.all(records.map(careerView)));
});

app.post('/api/careers', requireAdmin, async (req, res) => {
  const data = req.body;
  if (!data.code?.trim() || !data.name?.trim()) return void res.status(400).json({ message: 'El código y nombre son obligatorios.' });
  try {
    const career = await prisma.$transaction(async (tx) => {
      const created = await tx.career.create({ data: { code: data.code.trim().toUpperCase(), name: data.name.trim(), faculty: data.faculty, durationSemesters: data.durationSemesters, totalCredits: data.totalCredits, modality: data.modality, status: data.status || 'Activo', degreeType: data.degreeType } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CAREER', entityId: created.code, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json(await careerView(career));
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.patch('/api/careers/:code', requireAdmin, async (req, res) => {
  const current = await prisma.career.findUnique({ where: { code: req.params.code } });
  if (!current) return void res.status(404).json({ message: 'Carrera no encontrada.' });
  const next = { ...current, ...req.body, code: current.code };
  const career = await prisma.$transaction(async (tx) => {
    const updated = await tx.career.update({ where: { code: current.code }, data: { name: next.name, faculty: next.faculty, durationSemesters: next.durationSemesters, totalCredits: next.totalCredits, modality: next.modality, status: next.status, degreeType: next.degreeType } });
    await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'CAREER', entityId: current.code, actorId: res.locals.authUser.id } });
    return updated;
  });
  res.json(await careerView(career));
});

const courseView = (course: any) => ({
  code: course.code,
  name: course.name,
  credits: course.credits,
  semester: course.semester,
  careerId: course.careerId,
  careerName: course.career?.name,
  prerequisiteCodes: course.prerequisites?.map((item: any) => item.prerequisiteCode) || [],
  theoreticalHours: course.theoreticalHours,
  practicalHours: course.practicalHours,
  area: course.area,
  status: course.status,
});

const validatePrerequisites = async (courseCode: string, prerequisiteCodes: string[]) => {
  const unique = [...new Set(prerequisiteCodes)];
  if (unique.includes(courseCode)) return 'Un curso no puede ser prerrequisito de sí mismo.';
  const existing = await prisma.course.findMany({ where: { code: { in: unique } }, select: { code: true } });
  if (existing.length !== unique.length) return 'Uno o más prerrequisitos no existen.';
  const edges = await prisma.coursePrerequisite.findMany();
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.courseCode !== courseCode) graph.set(edge.courseCode, [...(graph.get(edge.courseCode) || []), edge.prerequisiteCode]);
  }
  graph.set(courseCode, unique);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string): boolean => {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    for (const prerequisite of graph.get(code) || []) if (visit(prerequisite)) return true;
    visiting.delete(code);
    visited.add(code);
    return false;
  };
  for (const code of graph.keys()) if (visit(code)) return 'Los prerrequisitos crearían una dependencia circular.';
  return null;
};

app.get('/api/courses', requireAdmin, async (_req, res) => {
  const records = await prisma.course.findMany({ include: { career: true, prerequisites: true }, orderBy: [{ careerId: 'asc' }, { semester: 'asc' }, { code: 'asc' }] });
  res.json(records.map(courseView));
});

app.get('/api/curriculum-map', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'La malla estudiantil no está disponible para catedráticos.' });
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
  if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
  const student = await prisma.student.findUnique({ where: { carnet: studentCarnet }, include: {
    campus: true,
    plan: {
      include: {
        courses: {
          include: { course: { include: { prerequisites: { include: { prerequisite: { select: { name: true } } } } } } },
          orderBy: [{ semester: 'asc' }, { courseCode: 'asc' }],
        },
      },
    },
    enrollments: { include: { section: true } },
    gradeRecords: { include: { section: true } },
    financialCharges: { include: { payments: true, adjustments: true } },
    enrollmentDocuments: true,
  } });
  if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const courses = student.plan
    ? student.plan.courses.map((item) => ({ ...item.course, semester: item.semester }))
    : await prisma.course.findMany({ where: { careerId: student.careerId, status: 'Activo' }, include: { prerequisites: { include: { prerequisite: { select: { name: true } } } } }, orderBy: [{ semester: 'asc' }, { code: 'asc' }] });
  const approved = new Set<string>();
  for (const enrollment of student.enrollments) if (enrollment.status === 'Completado') approved.add(enrollment.section.courseCode);
  for (const grade of student.gradeRecords) if ((grade.isPublished || grade.section.gradeActStatus !== 'BORRADOR') && grade.total >= 61) approved.add(grade.section.courseCode);
  const active = new Set(student.enrollments.filter((item) => item.status === 'Inscrito').map((item) => item.section.courseCode));
  const mapped = courses.map((course) => {
    const prerequisiteCodes = course.prerequisites.map((item) => item.prerequisiteCode);
    const missingPrerequisites = course.prerequisites.filter((item) => !approved.has(item.prerequisiteCode)).map((item) => ({ code: item.prerequisiteCode, name: item.prerequisite.name }));
    const status = approved.has(course.code) ? 'APROBADO' : active.has(course.code) ? 'EN_CURSO' : missingPrerequisites.length ? 'BLOQUEADO' : 'DISPONIBLE';
    return { code: course.code, name: course.name, credits: course.credits, semester: course.semester, prerequisiteCodes, missingPrerequisites, status };
  });
  const charges = student.financialCharges.map((charge) => ({ dueDate: charge.dueDate, balance: Math.max(0, charge.amount - charge.adjustments.reduce((sum, item) => sum + item.amount, 0) - charge.payments.reduce((sum, item) => sum + item.amount, 0)) }));
  const financialSolvent = !charges.some((charge) => charge.dueDate < new Date() && charge.balance > 0);
  const expedienteComplete = student.enrollmentDocuments.length >= 5 && student.enrollmentDocuments.every((document) => document.status === 'APROBADO');
  const totalCredits = mapped.reduce((sum, course) => sum + course.credits, 0), approvedCredits = mapped.filter((course) => course.status === 'APROBADO').reduce((sum, course) => sum + course.credits, 0);
  res.json({ student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId, campusName: student.campus?.name || 'Sin campus', planCode: student.plan?.code || 'Plan general', planName: student.plan?.name || 'Pensum vigente', planVersion: student.plan?.version || 'Actual' }, curriculum: { totalCourses: mapped.length, totalCredits, semesters: student.plan?.durationSemesters || Math.max(0, ...mapped.map((course) => course.semester)), approvedCourses: mapped.filter((course) => course.status === 'APROBADO').length, approvedCredits, progress: totalCredits ? Math.round((approvedCredits / totalCredits) * 100) : 0 }, courses: mapped, graduationRequirements: [
    { code: 'LECTURES', label: 'Lectures (12)', completed: false, detail: 'Pendiente de registro institucional' },
    { code: 'ENGLISH_TEST', label: 'Constancia de test de inglés', completed: false, detail: 'Pendiente de validación' },
    { code: 'FINANCIAL', label: 'Solvencia de caja', completed: financialSolvent, detail: financialSolvent ? 'Sin saldos vencidos' : 'Existen saldos vencidos' },
    { code: 'FILE', label: 'Solvencia de expediente (C1)', completed: expedienteComplete, detail: expedienteComplete ? 'Expediente completo' : 'Documentos pendientes' },
    { code: 'FINAL_WORK', label: 'Trabajo final', completed: false, detail: 'Pendiente de registro institucional' },
  ] });
});

app.post('/api/courses', requireAdmin, async (req, res) => {
  const data = req.body;
  const code = String(data.code || '').trim().toUpperCase();
  const prerequisiteCodes = Array.isArray(data.prerequisiteCodes) ? data.prerequisiteCodes : [];
  const validationError = await validatePrerequisites(code, prerequisiteCodes);
  if (validationError) return void res.status(400).json({ message: validationError });
  try {
    const course = await prisma.$transaction(async (tx) => {
      await tx.course.create({ data: { code, name: data.name, credits: data.credits, semester: data.semester, careerId: data.careerId, theoreticalHours: data.theoreticalHours, practicalHours: data.practicalHours, area: data.area, status: data.status || 'Activo' } });
      if (prerequisiteCodes.length) await tx.coursePrerequisite.createMany({ data: prerequisiteCodes.map((prerequisiteCode: string) => ({ courseCode: code, prerequisiteCode })) });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'COURSE', entityId: code, actorId: res.locals.authUser.id } });
      return tx.course.findUniqueOrThrow({ where: { code }, include: { career: true, prerequisites: true } });
    });
    res.status(201).json(courseView(course));
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.patch('/api/courses/:code', requireAdmin, async (req, res) => {
  const current = await prisma.course.findUnique({ where: { code: req.params.code } });
  if (!current) return void res.status(404).json({ message: 'Curso no encontrado.' });
  const next = { ...current, ...req.body, code: current.code };
  const prerequisiteCodes = Array.isArray(req.body.prerequisiteCodes) ? req.body.prerequisiteCodes : undefined;
  if (prerequisiteCodes) {
    const validationError = await validatePrerequisites(current.code, prerequisiteCodes);
    if (validationError) return void res.status(400).json({ message: validationError });
  }
  const course = await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { code: current.code }, data: { name: next.name, credits: next.credits, semester: next.semester, careerId: next.careerId, theoreticalHours: next.theoreticalHours, practicalHours: next.practicalHours, area: next.area, status: next.status } });
    if (prerequisiteCodes) {
      await tx.coursePrerequisite.deleteMany({ where: { courseCode: current.code } });
      if (prerequisiteCodes.length) await tx.coursePrerequisite.createMany({ data: prerequisiteCodes.map((prerequisiteCode: string) => ({ courseCode: current.code, prerequisiteCode })) });
    }
    await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'COURSE', entityId: current.code, actorId: res.locals.authUser.id } });
    return tx.course.findUniqueOrThrow({ where: { code: current.code }, include: { career: true, prerequisites: true } });
  });
  res.json(courseView(course));
});

const cycleView = (cycle: any) => ({ ...cycle, startDate: cycle.startDate.toISOString().slice(0, 10), endDate: cycle.endDate.toISOString().slice(0, 10), enrollmentStartDate: cycle.enrollmentStartDate.toISOString().slice(0, 10), enrollmentEndDate: cycle.enrollmentEndDate.toISOString().slice(0, 10), gradeSubmissionDeadline: cycle.gradeSubmissionDeadline.toISOString().slice(0, 10) });
app.get('/api/cycles', requireUser, async (_req, res) => res.json((await prisma.academicCycle.findMany({ orderBy: { startDate: 'desc' } })).map(cycleView)));
app.post('/api/cycles', requireAdmin, async (req, res) => {
  const data = req.body;
  if (new Date(data.startDate) >= new Date(data.endDate) || new Date(data.enrollmentStartDate) > new Date(data.enrollmentEndDate)) return void res.status(400).json({ message: 'Las fechas del ciclo no son válidas.' });
  const id = `CYC-${data.year}-${Date.now().toString().slice(-5)}`;
  const cycle = await prisma.$transaction(async (tx) => {
    if (data.isCurrent) await tx.academicCycle.updateMany({ data: { isCurrent: false } });
    const created = await tx.academicCycle.create({ data: { ...data, id, startDate: new Date(data.startDate), endDate: new Date(data.endDate), enrollmentStartDate: new Date(data.enrollmentStartDate), enrollmentEndDate: new Date(data.enrollmentEndDate), gradeSubmissionDeadline: new Date(data.gradeSubmissionDeadline) } });
    await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CYCLE', entityId: id, actorId: res.locals.authUser.id } });
    return created;
  });
  res.status(201).json(cycleView(cycle));
});
app.patch('/api/cycles/:id', requireAdmin, async (req, res) => {
  const current = await prisma.academicCycle.findUnique({ where: { id: req.params.id } });
  if (!current) return void res.status(404).json({ message: 'Ciclo no encontrado.' });
  const data = req.body;
  const cycle = await prisma.$transaction(async (tx) => {
    if (data.isCurrent) await tx.academicCycle.updateMany({ where: { id: { not: current.id } }, data: { isCurrent: false } });
    return tx.academicCycle.update({ where: { id: current.id }, data: { ...data, id: undefined, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined, enrollmentStartDate: data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : undefined, enrollmentEndDate: data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : undefined, gradeSubmissionDeadline: data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : undefined } });
  });
  res.json(cycleView(cycle));
});

app.get('/api/classrooms', requireUser, async (_req, res) => res.json(await prisma.classroom.findMany({ orderBy: [{ building: 'asc' }, { code: 'asc' }] })));
app.post('/api/classrooms', requireAdmin, async (req, res) => {
  try { const classroom = await prisma.classroom.create({ data: req.body }); res.status(201).json(classroom); }
  catch (error) { if (!handleUniqueError(error, res)) throw error; }
});
app.patch('/api/classrooms/:id', requireAdmin, async (req, res) => res.json(await prisma.classroom.update({ where: { id: req.params.id }, data: req.body })));

const sectionView = (section: any) => ({ id: section.id, code: section.code, courseCode: section.courseCode, courseName: section.course.name, teacherId: section.teacherId, teacherName: section.teacher.name, cycleId: section.cycleId, scheduleDays: JSON.parse(section.scheduleDays), scheduleTime: section.scheduleTime, classroomId: section.classroomId, classroomName: section.classroom.code, modality: section.modality, jornada: section.jornada, capacity: section.capacity, enrolledCount: section.enrolledCount, status: section.status });
app.get('/api/sections', requireUser, async (_req, res) => res.json((await prisma.section.findMany({ include: { course: true, teacher: true, classroom: true } })).map(sectionView)));
app.post('/api/sections', requireAdmin, async (req, res) => {
  const data = req.body;
  const classroom = await prisma.classroom.findUnique({ where: { id: data.classroomId } });
  if (!classroom || classroom.status === 'Mantenimiento') return void res.status(400).json({ message: 'El aula no está disponible.' });
  if (data.modality !== 'Virtual' && data.capacity > classroom.capacity) return void res.status(400).json({ message: 'El cupo supera la capacidad del aula.' });
  const days = data.scheduleDays || [];
  const candidates = await prisma.section.findMany({ where: { cycleId: data.cycleId, scheduleTime: data.scheduleTime }, include: { teacher: true, classroom: true } });
  for (const section of candidates) {
    if (!JSON.parse(section.scheduleDays).some((day: string) => days.includes(day))) continue;
    if (section.teacherId === data.teacherId) return void res.status(409).json({ message: `El catedrático ya tiene la sección ${section.code} en ese horario.` });
    if (data.modality !== 'Virtual' && section.classroomId === data.classroomId) return void res.status(409).json({ message: `El aula ya está ocupada por la sección ${section.code}.` });
  }
  const id = `SEC-${data.courseCode}-${Date.now().toString().slice(-6)}`;
  try {
    const section = await prisma.$transaction(async (tx) => {
      const created = await tx.section.create({ data: { ...data, id, scheduleDays: JSON.stringify(days), enrolledCount: 0 }, include: { course: true, teacher: true, classroom: true } });
      await tx.virtualClassroom.create({ data: { sectionId: id } });
      return created;
    });
    res.status(201).json(sectionView(section));
  } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});
app.patch('/api/sections/:id', requireAdmin, async (req, res) => {
  const data = { ...req.body, scheduleDays: req.body.scheduleDays ? JSON.stringify(req.body.scheduleDays) : undefined };
  const section = await prisma.section.update({ where: { id: req.params.id }, data, include: { course: true, teacher: true, classroom: true } });
  res.json(sectionView(section));
});
app.delete('/api/sections/:id', requireAdmin, async (req, res) => { await prisma.section.delete({ where: { id: req.params.id } }); res.json({ ok: true }); });

const enrollmentView = (record: any) => ({ id: record.id, studentCarnet: record.studentCarnet, studentName: record.student?.name, sectionId: record.sectionId, courseCode: record.section?.courseCode, courseName: record.section?.course?.name, cycleId: record.section?.cycleId, enrollmentDate: record.enrollmentDate.toISOString().slice(0, 10), status: record.status });
app.get('/api/enrollments', requireUser, async (_req, res) => {
  const user = res.locals.authUser;
  const where = user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode } : {};
  const records = await prisma.enrollment.findMany({ where, include: { student: true, section: { include: { course: true } } }, orderBy: { enrollmentDate: 'desc' } });
  res.json(records.map(enrollmentView));
});
app.post('/api/enrollments', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  const studentCarnet = String(req.body?.studentCarnet || '');
  const sectionId = String(req.body?.sectionId || '');
  if (user.role === 'ESTUDIANTE' && user.carnetOrCode !== studentCarnet) return void res.status(403).json({ message: 'Solo puedes inscribirte a ti mismo.' });
  const student = await prisma.student.findUnique({ where: { carnet: studentCarnet }, include: { plan: { include: { courses: { select: { courseCode: true } } } } } });
  if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const overdueCharges = await prisma.financialCharge.findMany({ where: { studentCarnet, dueDate: { lt: new Date() }, status: { not: 'PAGADO' } }, include: { payments: true, adjustments: true } });
  const overdueBalance = overdueCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.adjustments.reduce((adjusted, item) => adjusted + item.amount, 0) - charge.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
  if (overdueBalance > 0) return void res.status(409).json({ message: `La inscripción está bloqueada por un saldo vencido de Q${overdueBalance.toFixed(2)}.` });
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: { include: { prerequisites: true } }, cycle: true } });
  if (!section || section.status !== 'Abierta') return void res.status(400).json({ message: 'La sección no está disponible.' });
  if (student.plan && !student.plan.courses.some((item) => item.courseCode === section.courseCode)) return void res.status(400).json({ message: 'El curso no pertenece al pensum asignado al estudiante.' });
  const now = new Date();
  if (now < section.cycle.enrollmentStartDate || now > section.cycle.enrollmentEndDate) return void res.status(400).json({ message: 'El período de inscripción está cerrado.' });
  if (section.enrolledCount >= section.capacity) return void res.status(409).json({ message: 'La sección ya no tiene cupo.' });
  const duplicate = await prisma.enrollment.findUnique({ where: { studentCarnet_sectionId: { studentCarnet, sectionId } } });
  if (duplicate?.status === 'Inscrito') return void res.status(409).json({ message: 'Ya estás inscrito en esta sección.' });
  const active = await prisma.enrollment.findMany({ where: { studentCarnet, status: 'Inscrito', section: { cycleId: section.cycleId } }, include: { section: { include: { course: true } } } });
  const credits = active.reduce((sum, item) => sum + item.section.course.credits, 0);
  if (credits + section.course.credits > 24) return void res.status(400).json({ message: 'La inscripción supera el límite de 24 créditos.' });
  const prerequisiteCodes = section.course.prerequisites.map((item) => item.prerequisiteCode);
  if (prerequisiteCodes.length) {
    const completed = await prisma.enrollment.findMany({ where: { studentCarnet, status: 'Completado', section: { courseCode: { in: prerequisiteCodes } } }, include: { section: true } });
    const completedCodes = new Set(completed.map((item) => item.section.courseCode));
    const missing = prerequisiteCodes.filter((code) => !completedCodes.has(code));
    if (missing.length) return void res.status(400).json({ message: `Faltan prerrequisitos: ${missing.join(', ')}.` });
  }
  const record = await prisma.$transaction(async (tx) => {
    const enrollment = duplicate ? await tx.enrollment.update({ where: { id: duplicate.id }, data: { status: 'Inscrito', enrollmentDate: now } }) : await tx.enrollment.create({ data: { studentCarnet, sectionId, enrollmentDate: now } });
    await tx.section.update({ where: { id: sectionId }, data: { enrolledCount: { increment: 1 } } });
    const applicableFees = await tx.careerFee.findMany({ where: { careerId: student.careerId, cycleId: section.cycleId, AND: [{ OR: [{ campusId: null }, { campusId: student.campusId }] }, { OR: [{ planId: null }, { planId: student.planId }] }] } });
    for (const fee of applicableFees) await tx.financialCharge.upsert({ where: { careerFeeId_studentCarnet: { careerFeeId: fee.id, studentCarnet } }, update: {}, create: { studentCarnet, concept: fee.concept, amount: fee.amount, dueDate: fee.dueDate, cycleId: fee.cycleId, careerFeeId: fee.id } });
    await tx.auditLog.create({ data: { action: 'ENROLL', entityType: 'ENROLLMENT', entityId: enrollment.id, actorId: user.id } });
    return tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id }, include: { student: true, section: { include: { course: true } } } });
  });
  res.status(201).json(enrollmentView(record));
});
app.delete('/api/enrollments/:id', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  const record = await prisma.enrollment.findUnique({ where: { id: req.params.id } });
  if (!record) return void res.status(404).json({ message: 'Inscripción no encontrada.' });
  if (user.role === 'ESTUDIANTE' && user.carnetOrCode !== record.studentCarnet) return void res.status(403).json({ message: 'No puedes retirar esta inscripción.' });
  if (record.status === 'Inscrito') await prisma.$transaction([prisma.enrollment.update({ where: { id: record.id }, data: { status: 'Retirado' } }), prisma.section.update({ where: { id: record.sectionId }, data: { enrolledCount: { decrement: 1 } } })]);
  res.json({ ok: true });
});

const financeView = (charge: any) => {
  const paid = charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
  const adjusted = (charge.adjustments || []).reduce((sum: number, item: any) => sum + item.amount, 0);
  const netAmount = Math.max(0, charge.amount - adjusted);
  const balance = Math.max(0, netAmount - paid);
  const status = balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE';
  return { id: charge.id, concept: charge.concept, grossAmount: charge.amount, adjusted, amount: netAmount, paid, balance, dueDate: charge.dueDate, status, cycleId: charge.cycleId, studentCarnet: charge.studentCarnet, studentName: charge.student.name, adjustments: (charge.adjustments || []).map((item: any) => ({ id: item.id, type: item.type, amount: item.amount, reason: item.reason, createdAt: item.createdAt })), payments: charge.payments.map((payment: any) => ({ id: payment.id, receiptNumber: payment.receiptNumber, amount: payment.amount, method: payment.method, reference: payment.reference, paidAt: payment.paidAt })) };
};

const statementDates = (req: express.Request) => {
  const from = req.query.from ? new Date(`${String(req.query.from)}T00:00:00.000Z`) : new Date('2000-01-01T00:00:00.000Z');
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date();
  return { from, to, valid: !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to };
};

const buildFinancialStatement = async (studentCarnet: string, from: Date, to: Date) => {
  const student = await prisma.student.findUnique({ where: { carnet: studentCarnet } });
  if (!student) return null;
  const [charges, payments, adjustments] = await Promise.all([
    prisma.financialCharge.findMany({ where: { studentCarnet, createdAt: { lte: to } }, orderBy: { createdAt: 'asc' } }),
    prisma.payment.findMany({ where: { studentCarnet, paidAt: { lte: to } }, include: { charge: { select: { concept: true } } }, orderBy: { paidAt: 'asc' } }),
    prisma.financialAdjustment.findMany({ where: { studentCarnet, createdAt: { lte: to } }, include: { charge: { select: { concept: true } } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const openingCharges = charges.filter((item) => item.createdAt < from).reduce((sum, item) => sum + item.amount, 0);
  const openingPayments = payments.filter((item) => item.paidAt < from).reduce((sum, item) => sum + item.amount, 0);
  const openingAdjustments = adjustments.filter((item) => item.createdAt < from).reduce((sum, item) => sum + item.amount, 0);
  const openingBalance = openingCharges - openingPayments - openingAdjustments;
  const movements = [
    ...charges.filter((item) => item.createdAt >= from).map((item) => ({ id: `charge:${item.id}`, date: item.createdAt, type: 'CARGO', document: item.id.slice(-8).toUpperCase(), description: item.concept, debit: item.amount, credit: 0 })),
    ...payments.filter((item) => item.paidAt >= from).map((item) => ({ id: `payment:${item.id}`, date: item.paidAt, type: 'PAGO', document: item.receiptNumber, description: `Pago · ${item.charge.concept}`, debit: 0, credit: item.amount })),
    ...adjustments.filter((item) => item.createdAt >= from).map((item) => ({ id: `adjustment:${item.id}`, date: item.createdAt, type: item.type, document: item.id.slice(-8).toUpperCase(), description: `${item.type === 'BECA' ? 'Beca' : 'Descuento'} · ${item.charge.concept}`, debit: 0, credit: item.amount })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let runningBalance = openingBalance;
  const ledger = movements.map((item) => { runningBalance += item.debit - item.credit; return { ...item, balance: runningBalance }; });
  const periodDebits = movements.reduce((sum, item) => sum + item.debit, 0), periodCredits = movements.reduce((sum, item) => sum + item.credit, 0);
  return { student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId }, period: { from, to }, openingBalance, periodDebits, periodCredits, closingBalance: runningBalance, movements: ledger };
};

app.get('/api/finances', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'El módulo financiero no está disponible para catedráticos.' });
  const requestedCarnet = String(req.query.studentCarnet || '');
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode : requestedCarnet || undefined;
  const charges = await prisma.financialCharge.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, adjustments: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { paidAt: 'desc' } } }, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] });
  const records = charges.map(financeView);
  const total = records.reduce((sum, charge) => sum + charge.amount, 0);
  const paid = records.reduce((sum, charge) => sum + charge.paid, 0);
  const overdue = records.filter((charge) => charge.status === 'VENCIDO').reduce((sum, charge) => sum + charge.balance, 0);
  res.json({ charges: records, summary: { total, paid, balance: total - paid, overdue, solvent: overdue <= 0 } });
});

app.get('/api/finances/statement', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
  const dates = statementDates(req);
  if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
  if (!dates.valid) return void res.status(400).json({ message: 'El rango de fechas no es válido.' });
  const statement = await buildFinancialStatement(studentCarnet, dates.from, dates.to);
  if (!statement) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  res.json(statement);
});

app.get('/api/finances/career-fees', requireAdmin, async (_req, res) => {
  const fees = await prisma.careerFee.findMany({ include: { career: { select: { name: true } }, campus: { select: { name: true } }, plan: { select: { code: true, version: true } } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }] });
  res.json(fees.map((fee) => ({ ...fee, careerName: fee.career.name, campusName: fee.campus?.name, planCode: fee.plan?.code, planVersion: fee.plan?.version })));
});

app.post('/api/finances/career-fee-schedules', requireAdmin, async (req, res) => {
  const careerId = String(req.body.careerId || '').trim();
  const cycleId = String(req.body.cycleId || '').trim();
  const campusId = req.body.campusId ? String(req.body.campusId) : null;
  const planId = req.body.planId ? String(req.body.planId) : null;
  const enrollmentAmount = Number(req.body.enrollmentAmount);
  const monthlyAmount = Number(req.body.monthlyAmount);
  const installments = Number(req.body.installments);
  const enrollmentDueDate = new Date(`${req.body.enrollmentDueDate}T12:00:00Z`);
  const firstDueDate = new Date(`${req.body.firstDueDate}T12:00:00Z`);
  if (!careerId || !cycleId || !Number.isFinite(enrollmentAmount) || enrollmentAmount < 0 || !Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || !Number.isInteger(installments) || installments < 1 || installments > 12 || Number.isNaN(enrollmentDueDate.getTime()) || Number.isNaN(firstDueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente los montos, fechas y cantidad de cuotas.' });
  const [career, cycle, campus, plan] = await Promise.all([
    prisma.career.findUnique({ where: { code: careerId } }),
    prisma.academicCycle.findUnique({ where: { id: cycleId } }),
    campusId ? prisma.campus.findUnique({ where: { id: campusId } }) : null,
    planId ? prisma.curriculumPlan.findUnique({ where: { id: planId } }) : null,
  ]);
  if (!career || !cycle || (campusId && !campus) || (planId && (!plan || plan.careerId !== careerId))) return void res.status(400).json({ message: 'La carrera, campus, plan o ciclo no son válidos.' });
  const definitions: { concept: string; amount: number; dueDate: Date; feeType: string; installmentNumber: number | null }[] = [];
  if (enrollmentAmount > 0) definitions.push({ concept: `Matrícula - ${cycle.name}`, amount: enrollmentAmount, dueDate: enrollmentDueDate, feeType: 'MATRICULA', installmentNumber: null });
  for (let index = 0; index < installments; index += 1) { const dueDate = new Date(firstDueDate); dueDate.setUTCMonth(dueDate.getUTCMonth() + index); definitions.push({ concept: `Cuota académica ${index + 1}/${installments} - ${cycle.name}`, amount: monthlyAmount, dueDate, feeType: 'MENSUALIDAD', installmentNumber: index + 1 }); }
  const duplicate = await prisma.careerFee.findFirst({ where: { careerId, cycleId, campusId, planId, OR: definitions.map((item) => ({ concept: item.concept, dueDate: item.dueDate })) } });
  if (duplicate) return void res.status(409).json({ message: 'Ya existe total o parcialmente este calendario para el alcance seleccionado.' });
  const studentWhere = { careerId, status: 'Activo', ...(campusId ? { campusId } : {}), ...(planId ? { planId } : {}) };
  const activeStudents = await prisma.student.findMany({ where: studentWhere, select: { carnet: true } });
  const created = await prisma.$transaction(async (tx) => {
    const fees = [];
    for (const definition of definitions) {
      const fee = await tx.careerFee.create({ data: { ...definition, installmentCount: definition.feeType === 'MENSUALIDAD' ? installments : null, careerId, cycleId, campusId, planId, createdBy: res.locals.authUser.name, assignedCount: activeStudents.length } });
      if (activeStudents.length) await tx.financialCharge.createMany({ data: activeStudents.map((studentItem) => ({ studentCarnet: studentItem.carnet, concept: fee.concept, amount: fee.amount, dueDate: fee.dueDate, cycleId, careerFeeId: fee.id })) });
      fees.push(fee);
    }
    await tx.auditLog.create({ data: { action: 'CREATE_FEE_SCHEDULE', entityType: 'FINANCE', entityId: `${careerId}:${cycleId}`, actorId: res.locals.authUser.id, details: JSON.stringify({ campusId, planId, installments, enrollmentAmount, monthlyAmount, fees: fees.length, students: activeStudents.length }) } });
    return fees;
  });
  res.status(201).json({ fees: created, assignedCount: activeStudents.length, message: `Calendario creado con ${created.length} cargos para ${activeStudents.length} estudiantes.` });
});

app.post('/api/finances/career-fees', requireAdmin, async (req, res) => {
  const careerId = String(req.body.careerId || '').trim();
  const cycleId = String(req.body.cycleId || '').trim();
  const concept = String(req.body.concept || '').trim();
  const amount = Number(req.body.amount);
  const dueDate = new Date(req.body.dueDate);
  if (!careerId || !cycleId || concept.length < 3 || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente carrera, ciclo, concepto, monto y vencimiento.' });
  const [career, cycle, activeStudents] = await Promise.all([
    prisma.career.findUnique({ where: { code: careerId } }),
    prisma.academicCycle.findUnique({ where: { id: cycleId } }),
    prisma.student.findMany({ where: { careerId, status: 'Activo' }, select: { carnet: true } }),
  ]);
  if (!career || !cycle) return void res.status(404).json({ message: 'Carrera o ciclo académico no encontrado.' });
  const fee = await prisma.$transaction(async (tx) => {
    const created = await tx.careerFee.create({ data: { careerId, cycleId, concept, amount, dueDate, createdBy: res.locals.authUser.name, assignedCount: activeStudents.length } });
    if (activeStudents.length) await tx.financialCharge.createMany({ data: activeStudents.map((student) => ({ studentCarnet: student.carnet, concept, amount, dueDate, cycleId, careerFeeId: created.id })) });
    await tx.auditLog.create({ data: { action: 'CREATE_CAREER_FEE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ careerId, cycleId, concept, amount, assignedCount: activeStudents.length }) } });
    return created;
  });
  res.status(201).json({ ...fee, careerName: career.name, message: `Cargo asignado a ${activeStudents.length} estudiantes activos de ${career.name}.` });
});

app.post('/api/finances/charges', requireAdmin, async (req, res) => {
  const studentCarnet = String(req.body.studentCarnet || '').trim();
  const concept = String(req.body.concept || '').trim();
  const amount = Number(req.body.amount);
  const dueDate = new Date(req.body.dueDate);
  if (!studentCarnet || concept.length < 3 || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente estudiante, concepto, monto y vencimiento.' });
  if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const charge = await prisma.$transaction(async (tx) => {
    const created = await tx.financialCharge.create({ data: { studentCarnet, concept, amount, dueDate, cycleId: req.body.cycleId || null }, include: { student: true, payments: true, adjustments: true } });
    await tx.auditLog.create({ data: { action: 'CREATE_CHARGE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, concept, amount }) } });
    return created;
  });
  res.status(201).json(financeView(charge));
});

app.post('/api/finances/adjustments', requireAdmin, async (req, res) => {
  const chargeId = String(req.body.chargeId || '');
  const type = String(req.body.type || '').trim().toUpperCase();
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim();
  if (!['BECA', 'DESCUENTO'].includes(type) || !Number.isFinite(amount) || amount <= 0 || reason.length < 3) return void res.status(400).json({ message: 'Selecciona beca o descuento e indica un monto y motivo válidos.' });
  const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true } });
  if (!charge) return void res.status(404).json({ message: 'Cargo no encontrado.' });
  const paid = charge.payments.reduce((sum, item) => sum + item.amount, 0);
  const alreadyAdjusted = charge.adjustments.reduce((sum, item) => sum + item.amount, 0);
  const maximum = Math.max(0, charge.amount - paid - alreadyAdjusted);
  if (amount > maximum) return void res.status(400).json({ message: `El ajuste no puede superar el saldo de Q${maximum.toFixed(2)}.` });
  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await tx.financialAdjustment.create({ data: { chargeId, studentCarnet: charge.studentCarnet, type, amount, reason, appliedBy: res.locals.authUser.name } });
    if (amount >= maximum) await tx.financialCharge.update({ where: { id: chargeId }, data: { status: 'PAGADO' } });
    await tx.auditLog.create({ data: { action: 'APPLY_FINANCIAL_ADJUSTMENT', entityType: 'FINANCE', entityId: chargeId, actorId: res.locals.authUser.id, details: JSON.stringify({ type, amount, reason }) } });
    return created;
  });
  await notifyByCarnet(charge.studentCarnet, `${type === 'BECA' ? 'Beca' : 'Descuento'} aplicado`, `Se aplicó un ajuste de Q${amount.toFixed(2)}. Motivo: ${reason}.`, 'SUCCESS', '/pagos');
  res.status(201).json(adjustment);
});

app.post('/api/finances/late-fees', requireAdmin, async (req, res) => {
  const studentCarnet = String(req.body.studentCarnet || '').trim();
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim();
  const dueDate = new Date(req.body.dueDate);
  if (!studentCarnet || !Number.isFinite(amount) || amount <= 0 || reason.length < 3 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente estudiante, monto, motivo y vencimiento de la mora.' });
  if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const charge = await prisma.$transaction(async (tx) => {
    const created = await tx.financialCharge.create({ data: { studentCarnet, concept: `Mora - ${reason}`, amount, dueDate, cycleId: req.body.cycleId || null } });
    await tx.auditLog.create({ data: { action: 'CREATE_LATE_FEE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, amount, reason }) } });
    return created;
  });
  await notifyByCarnet(studentCarnet, 'Cargo por mora', `Se registró un cargo por mora de Q${amount.toFixed(2)}. Motivo: ${reason}.`, 'WARNING', '/pagos');
  res.status(201).json(charge);
});

app.post('/api/finances/agreements', requireAdmin, async (req, res) => {
  const studentCarnet = String(req.body.studentCarnet || '').trim();
  const totalAmount = Number(req.body.totalAmount);
  const installments = Number(req.body.installments);
  const startDate = new Date(req.body.startDate);
  const note = String(req.body.note || '').trim();
  if (!studentCarnet || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(installments) || installments < 2 || installments > 24 || Number.isNaN(startDate.getTime())) return void res.status(400).json({ message: 'Indica monto, entre 2 y 24 cuotas y una fecha inicial válida.' });
  if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const agreement = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentAgreement.create({ data: { studentCarnet, totalAmount, installments, startDate, note: note || null, createdBy: res.locals.authUser.name } });
    const base = Math.floor((totalAmount / installments) * 100) / 100;
    const amounts = Array.from({ length: installments }, (_, index) => index === installments - 1 ? Number((totalAmount - base * (installments - 1)).toFixed(2)) : base);
    await tx.financialCharge.createMany({ data: amounts.map((amount, index) => { const dueDate = new Date(startDate); dueDate.setUTCMonth(dueDate.getUTCMonth() + index); return { studentCarnet, concept: `Convenio ${created.id.slice(-6).toUpperCase()} - cuota ${index + 1}/${installments}`, amount, dueDate, agreementId: created.id }; }) });
    await tx.auditLog.create({ data: { action: 'CREATE_PAYMENT_AGREEMENT', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, totalAmount, installments }) } });
    return created;
  });
  await notifyByCarnet(studentCarnet, 'Convenio de pago creado', `Se creó un convenio de Q${totalAmount.toFixed(2)} en ${installments} cuotas.`, 'INFO', '/pagos');
  res.status(201).json(agreement);
});

app.post('/api/finances/payments', requireAdmin, async (req, res) => {
  const chargeId = String(req.body.chargeId || '');
  const amount = Number(req.body.amount);
  const method = String(req.body.method || '').trim().toUpperCase();
  const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true } });
  if (!charge) return void res.status(404).json({ message: 'Cargo no encontrado.' });
  const paid = charge.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, charge.amount - charge.adjustments.reduce((sum, item) => sum + item.amount, 0) - paid);
  if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return void res.status(400).json({ message: `El pago debe ser mayor a cero y no superar Q${balance.toFixed(2)}.` });
  if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPÓSITO'].includes(method)) return void res.status(400).json({ message: 'Selecciona un método de pago válido.' });
  const receiptNumber = `REC-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({ data: { receiptNumber, amount, method, reference: req.body.reference ? String(req.body.reference) : null, chargeId, studentCarnet: charge.studentCarnet, registeredBy: res.locals.authUser.name } });
    if (amount >= balance) await tx.financialCharge.update({ where: { id: chargeId }, data: { status: 'PAGADO' } });
    await tx.auditLog.create({ data: { action: 'REGISTER_PAYMENT', entityType: 'FINANCE', entityId: chargeId, actorId: res.locals.authUser.id, details: JSON.stringify({ receiptNumber, amount, method }) } });
    return created;
  });
  await notifyByCarnet(charge.studentCarnet, 'Pago registrado', `Se registró el pago ${receiptNumber} por Q${amount.toFixed(2)} mediante ${method}.`, 'SUCCESS', '/pagos');
  res.status(201).json(payment);
});

app.get('/api/finances/transfer-proofs', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const requestedCarnet = String(req.query.studentCarnet || '');
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : requestedCarnet;
  const records = await prisma.transferProof.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, charge: { select: { concept: true } } }, omit: { fileData: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(records.map((item) => ({ ...item, studentName: item.student.name, concept: item.charge.concept })));
});

app.post('/api/finances/transfer-proofs', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role !== 'ESTUDIANTE') return void res.status(403).json({ message: 'El comprobante debe enviarse desde la cuenta del estudiante.' });
  const chargeId = String(req.body.chargeId || '');
  const amount = Number(req.body.amount);
  const reference = String(req.body.reference || '').trim();
  const fileName = String(req.body.fileName || '').trim().slice(0, 180);
  const dataUrl = String(req.body.dataUrl || '');
  const match = dataUrl.match(/^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!Number.isFinite(amount) || amount <= 0 || reference.length < 3 || !fileName || !match) return void res.status(400).json({ message: 'Completa monto, referencia y comprobante PDF, PNG o JPG.' });
  if (Buffer.byteLength(match[2], 'base64') > 3 * 1024 * 1024) return void res.status(400).json({ message: 'El comprobante no puede superar 3 MB.' });
  const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true, transferProofs: { where: { status: 'PENDIENTE' } } } });
  if (!charge || charge.studentCarnet !== user.carnetOrCode) return void res.status(404).json({ message: 'Cargo no encontrado.' });
  const paid = charge.payments.reduce((sum, item) => sum + item.amount, 0), adjusted = charge.adjustments.reduce((sum, item) => sum + item.amount, 0), pending = charge.transferProofs.reduce((sum, item) => sum + item.amount, 0);
  const available = Math.max(0, charge.amount - paid - adjusted - pending);
  if (amount > available) return void res.status(400).json({ message: `El monto supera el saldo disponible para comprobantes: Q${available.toFixed(2)}.` });
  const duplicate = await prisma.transferProof.findFirst({ where: { reference, status: { in: ['PENDIENTE', 'APROBADO'] } } });
  if (duplicate) return void res.status(409).json({ message: 'La referencia ya fue registrada.' });
  const proof = await prisma.$transaction(async (tx) => {
    const saved = await tx.transferProof.create({ data: { chargeId, studentCarnet: user.carnetOrCode || '', amount, reference, fileName, mimeType: match[1], fileData: match[2] } });
    await tx.auditLog.create({ data: { action: 'SUBMIT_TRANSFER_PROOF', entityType: 'TRANSFER_PROOF', entityId: saved.id, actorId: user.id, details: JSON.stringify({ chargeId, amount, reference }) } });
    return saved;
  });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  for (const admin of admins) await notifyUser(admin.id, 'Transferencia pendiente de validar', `${user.name} envió un comprobante por Q${amount.toFixed(2)}.`, 'INFO', '/pagos');
  res.status(201).json({ id: proof.id, status: proof.status });
});

app.get('/api/finances/transfer-proofs/:id/file', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  const proof = await prisma.transferProof.findUnique({ where: { id: req.params.id } });
  if (!proof || user.role === 'DOCENTE' || (user.role === 'ESTUDIANTE' && proof.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Comprobante no encontrado.' });
  res.setHeader('Content-Type', proof.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${proof.fileName.replace(/["\r\n]/g, '')}"`);
  res.send(Buffer.from(proof.fileData, 'base64'));
});

app.patch('/api/finances/transfer-proofs/:id/review', requireAdmin, async (req, res) => {
  const status = String(req.body.status || '').trim().toUpperCase();
  const reviewNote = String(req.body.reviewNote || '').trim();
  if (!['APROBADO', 'RECHAZADO'].includes(status) || (status === 'RECHAZADO' && reviewNote.length < 3)) return void res.status(400).json({ message: 'Selecciona aprobar o rechazar; el rechazo requiere una observación.' });
  const proof = await prisma.transferProof.findUnique({ where: { id: req.params.id }, include: { charge: { include: { payments: true, adjustments: true } } } });
  if (!proof || proof.status !== 'PENDIENTE') return void res.status(409).json({ message: 'El comprobante ya fue revisado o no existe.' });
  const paid = proof.charge.payments.reduce((sum, item) => sum + item.amount, 0), adjusted = proof.charge.adjustments.reduce((sum, item) => sum + item.amount, 0), balance = Math.max(0, proof.charge.amount - paid - adjusted);
  if (status === 'APROBADO' && proof.amount > balance) return void res.status(409).json({ message: `El saldo actual es Q${balance.toFixed(2)}; revisa otros pagos antes de aprobar.` });
  const receiptNumber = status === 'APROBADO' ? `REC-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}` : null;
  await prisma.$transaction(async (tx) => {
    await tx.transferProof.update({ where: { id: proof.id }, data: { status, reviewNote: reviewNote || null, reviewedBy: res.locals.authUser.name, reviewedAt: new Date(), receiptNumber } });
    if (status === 'APROBADO') {
      await tx.payment.create({ data: { receiptNumber: receiptNumber!, amount: proof.amount, method: 'TRANSFERENCIA', reference: proof.reference, chargeId: proof.chargeId, studentCarnet: proof.studentCarnet, registeredBy: res.locals.authUser.name } });
      if (proof.amount >= balance) await tx.financialCharge.update({ where: { id: proof.chargeId }, data: { status: 'PAGADO' } });
    }
    await tx.auditLog.create({ data: { action: 'REVIEW_TRANSFER_PROOF', entityType: 'TRANSFER_PROOF', entityId: proof.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, receiptNumber, reviewNote }) } });
  });
  await notifyByCarnet(proof.studentCarnet, `Transferencia ${status.toLowerCase()}`, status === 'APROBADO' ? `Tu transferencia fue aprobada y se emitió el recibo ${receiptNumber}.` : `Tu transferencia fue rechazada. Observación: ${reviewNote}.`, status === 'APROBADO' ? 'SUCCESS' : 'WARNING', '/pagos');
  res.json({ ok: true, receiptNumber });
});

app.get('/api/finances/payments/:id/receipt.pdf', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { student: true, charge: true } });
  if (!payment || (user.role === 'ESTUDIANTE' && payment.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Recibo no encontrado.' });
  const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
  const doc = createReceiptPdf({ institutionName: institution?.name || 'Universidad de San Pablo de Guatemala', receiptNumber: payment.receiptNumber, paidAt: payment.paidAt, studentCarnet: payment.studentCarnet, studentName: payment.student.name, concept: payment.charge.concept, amount: payment.amount, method: payment.method, reference: payment.reference, registeredBy: payment.registeredBy });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payment.receiptNumber}.pdf"`);
  doc.pipe(res); doc.end();
});

app.get('/api/finances/statement.pdf', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode : String(req.query.studentCarnet || '');
  if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
  const dates = statementDates(req);
  if (!dates.valid) return void res.status(400).json({ message: 'El rango de fechas no es válido.' });
  const statement = await buildFinancialStatement(studentCarnet, dates.from, dates.to);
  if (!statement) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
  const doc = createStatementPdf({ institutionName: institution?.name || 'Universidad de San Pablo de Guatemala', ...statement });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Estado_Cuenta_${studentCarnet}.pdf"`);
  doc.pipe(res); doc.end();
});

const parkingCode = (prefix: string) => `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
const normalizePlate = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const parkingQrSecret = process.env.PARKING_QR_SECRET || 'uspg-parking-development-secret';
const dynamicParkingPass = (vehicleId: string) => { const expiresAt = Date.now() + 5 * 60 * 1000, payload = `PV1.${vehicleId}.${expiresAt}.${randomBytes(4).toString('hex')}`, signature = createHmac('sha256', parkingQrSecret).update(payload).digest('base64url'); return { code: `${payload}.${signature}`, expiresAt: new Date(expiresAt) }; };
const verifyDynamicParkingPass = (code: string) => { const parts = code.split('.'); if (parts.length !== 5 || parts[0] !== 'PV1') return null; const payload = parts.slice(0, 4).join('.'), expected = createHmac('sha256', parkingQrSecret).update(payload).digest('base64url'), supplied = parts[4]; if (expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null; const expiresAt = Number(parts[2]); return Number.isFinite(expiresAt) && expiresAt > Date.now() ? { vehicleId: parts[1], expiresAt } : null; };
const maskedParkingCode = (code: string) => code ? `${code.slice(0, 7)}…${code.slice(-4)}` : null;
const notifyParkingTeam = async (title: string, message: string) => { const users = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'PARQUEO', 'EVENTOS'] }, active: true }, select: { id: true } }); await Promise.all(users.map((user) => notifyUser(user.id, title, message, 'WARNING', '/parqueo'))); };
const createParkingAlert = async (dedupeKey: string, type: string, severity: string, message: string, eventId?: string) => { if (await prisma.parkingAlert.findUnique({ where: { dedupeKey } })) return; await prisma.parkingAlert.create({ data: { dedupeKey, type, severity, message, eventId } }); await notifyParkingTeam(`Alerta de parqueo · ${severity}`, message); };
const evaluateOccupancyAlerts = async (occupancy: number, capacity: number) => { const percentage = capacity ? Math.round((occupancy / capacity) * 100) : 0, day = new Date().toISOString().slice(0, 10); for (const threshold of [80, 90, 100]) if (percentage >= threshold) await createParkingAlert(`OCCUPANCY:${day}:${threshold}`, 'OCUPACION', threshold === 100 ? 'CRITICA' : threshold === 90 ? 'ALTA' : 'MEDIA', `El parqueo alcanzó ${percentage}% de ocupación (${occupancy}/${capacity}).`); };

app.get('/api/parking', requireUser, async (_req, res) => {
  const user = res.locals.authUser, staff = ['ADMIN', 'PARQUEO', 'EVENTOS'].includes(user.role), now = new Date(), fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const [config, occupancy, vehicles, activeVisits, recentVisits, events, gate1, gate2, attempts] = await Promise.all([
    prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.parkingVisit.count({ where: { status: 'DENTRO' } }),
    prisma.parkingVehicle.findMany({ where: staff ? {} : { ownerId: user.id }, include: { owner: { select: { name: true, carnetOrCode: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.parkingVisit.findMany({ where: staff ? { status: 'DENTRO' } : { userId: user.id, status: 'DENTRO' }, orderBy: { enteredAt: 'desc' } }),
    staff ? prisma.parkingVisit.findMany({ include: { user: { select: { name: true } }, event: { select: { name: true } } }, orderBy: { enteredAt: 'desc' }, take: 50 }) : Promise.resolve([]),
    prisma.parkingEvent.findMany({ where: staff ? {} : { startsAt: { lte: new Date(now.getTime() + 30 * 86400000) }, endsAt: { gte: now }, status: { not: 'CANCELADO' } }, include: { _count: { select: { guests: true, visits: true } } }, orderBy: { startsAt: 'asc' }, take: 30 }),
    prisma.parkingVisit.count({ where: { entryGate: 'ENTRADA_1', enteredAt: { gte: fifteenMinutesAgo } } }),
    prisma.parkingVisit.count({ where: { entryGate: 'ENTRADA_2', enteredAt: { gte: fifteenMinutesAgo } } }),
    staff ? prisma.parkingAccessAttempt.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) : Promise.resolve([]),
  ]);
  const available = Math.max(0, config.totalCapacity - occupancy), recommendedGate = gate1 <= gate2 ? 'ENTRADA_1' : 'ENTRADA_2';
  await evaluateOccupancyAlerts(occupancy, config.totalCapacity); const hour = now.getHours(); if (hour >= 22 && occupancy > 0) await createParkingAlert(`AFTER_HOURS:${now.toISOString().slice(0, 10)}`, 'FUERA_DE_HORARIO', 'ALTA', `${occupancy} vehículo(s) permanecen dentro después de las 22:00.`); const alerts = staff ? await prisma.parkingAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) : [];
  res.json({ config, summary: { occupancy, available, percentage: Math.round((occupancy / config.totalCapacity) * 100), gate1Last15Minutes: gate1, gate2Last15Minutes: gate2, recommendedGate }, vehicles, activeVisits, recentVisits, events, attempts, alerts });
});

app.post('/api/parking/staff', requireUser, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), code = String(req.body.code || '').trim().toUpperCase(), role = String(req.body.role || 'PARQUEO');
  if (name.length < 3 || !['PARQUEO', 'EVENTOS'].includes(role) || roleFromEmail(email) !== role || code.length < 3) return void res.status(400).json({ message: `Usa un correo @${role === 'PARQUEO' ? 'parqueo' : 'eventos'}.uspg.edu.gt.` }); const password = temporaryPassword();
  try { const created = await prisma.user.create({ data: { id: randomUUID(), name, email, role, carnetOrCode: code, passwordHash: hashPassword(password), department: role === 'PARQUEO' ? 'Seguridad y Parqueo' : 'Gestión de Eventos', mustChangePassword: true } }); res.status(201).json({ user: { name: created.name, email: created.email, role }, temporaryPassword: password }); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.post('/api/parking/vehicles', requireUser, async (req, res) => {
  const user = res.locals.authUser, plate = normalizePlate(req.body.plate), ownerCode = String(req.body.ownerCode || '').trim(); let owner = user;
  if (['ADMIN', 'PARQUEO'].includes(user.role) && ownerCode) { const found = await prisma.user.findFirst({ where: { OR: [{ carnetOrCode: ownerCode }, { email: ownerCode.toLowerCase() }] } }); if (!found) return void res.status(404).json({ message: 'Propietario no encontrado.' }); owner = found; }
  if (plate.length < 4 || String(req.body.make || '').trim().length < 2 || String(req.body.model || '').trim().length < 1) return void res.status(400).json({ message: 'Completa placa, marca, modelo y color.' });
  try { const vehicle = await prisma.parkingVehicle.create({ data: { plate, make: String(req.body.make), model: String(req.body.model), color: String(req.body.color || 'No indicado'), type: String(req.body.type || 'AUTOMOVIL'), accessCode: parkingCode('USPG'), ownerId: owner.id } }); res.status(201).json(vehicle); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.post('/api/parking/vehicles/:id/pass', requireUser, async (req, res) => {
  const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } }); if (!vehicle || vehicle.status !== 'ACTIVO') return void res.status(404).json({ message: 'Vehículo activo no encontrado.' }); if (!['ADMIN', 'PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes generar este pase.' }); res.json(dynamicParkingPass(vehicle.id));
});

app.patch('/api/parking/vehicles/:id/status', requireUser, async (req, res) => {
  const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } }); if (!vehicle) return void res.status(404).json({ message: 'Vehículo no encontrado.' }); if (!['ADMIN', 'PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes modificar este vehículo.' }); const status = String(req.body.status); if (!['ACTIVO', 'BLOQUEADO'].includes(status)) return void res.status(400).json({ message: 'Estado no válido.' }); res.json(await prisma.parkingVehicle.update({ where: { id: vehicle.id }, data: { status } }));
});

app.patch('/api/parking/config', requireUser, requireAdmin, async (req, res) => {
  const totalCapacity = Number(req.body.totalCapacity), regularReserve = Number(req.body.regularReserve || 0); if (!Number.isInteger(totalCapacity) || totalCapacity < 1 || !Number.isInteger(regularReserve) || regularReserve < 0 || regularReserve >= totalCapacity) return void res.status(400).json({ message: 'Capacidad o reserva no válida.' }); res.json(await prisma.parkingConfig.upsert({ where: { id: 1 }, update: { totalCapacity, regularReserve }, create: { id: 1, totalCapacity, regularReserve } }));
});

app.post('/api/parking/events', requireUser, requireParkingStaff, async (req, res) => {
  const startsAt = new Date(req.body.startsAt), endsAt = new Date(req.body.endsAt), reservedSpaces = Number(req.body.reservedSpaces); if (String(req.body.name || '').trim().length < 3 || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(reservedSpaces) || reservedSpaces < 1) return void res.status(400).json({ message: 'Completa correctamente evento, horario y espacios.' }); const config = await prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }); if (reservedSpaces > config.totalCapacity - config.regularReserve) return void res.status(400).json({ message: `Debes conservar ${config.regularReserve} espacios para la comunidad universitaria.` }); res.status(201).json(await prisma.parkingEvent.create({ data: { name: String(req.body.name), organizer: String(req.body.organizer || res.locals.authUser.name), startsAt, endsAt, reservedSpaces, createdBy: res.locals.authUser.name, status: 'ACTIVO' } }));
});

app.post('/api/parking/events/:id/guests', requireUser, requireParkingStaff, async (req, res) => {
  const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id }, include: { _count: { select: { guests: true } } } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); if (event._count.guests >= event.reservedSpaces) return void res.status(409).json({ message: 'El evento alcanzó los espacios reservados.' }); const guestName = String(req.body.guestName || '').trim(); if (guestName.length < 3) return void res.status(400).json({ message: 'Indica el nombre del invitado.' }); const saved = await prisma.parkingEventGuest.create({ data: { eventId: event.id, guestName, plate: req.body.plate ? normalizePlate(req.body.plate) : null, accessCode: parkingCode('EVT') } }); const used = event._count.guests + 1; if (used >= Math.ceil(event.reservedSpaces * .9)) await createParkingAlert(`EVENT_CAPACITY:${event.id}:90`, 'EVENTO', used >= event.reservedSpaces ? 'CRITICA' : 'ALTA', `${event.name} registró ${used} de ${event.reservedSpaces} invitados.`, event.id); res.status(201).json(saved);
});

app.get('/api/parking/events/:id', requireUser, requireParkingStaff, async (req, res) => {
  const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id }, include: { guests: { orderBy: { createdAt: 'desc' } }, visits: { orderBy: { enteredAt: 'desc' } } } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); const enteredGuestIds = new Set(event.visits.filter((visit) => visit.eventId).map((visit) => visit.accessCode)); const occupied = event.visits.filter((visit) => visit.status === 'DENTRO').length; res.json({ ...event, occupied, available: Math.max(0, event.reservedSpaces - event.guests.length), guests: event.guests.map((guest) => ({ ...guest, entered: guest.status === 'UTILIZADO' || enteredGuestIds.has(guest.accessCode) })) });
});

app.patch('/api/parking/events/:id/status', requireUser, requireParkingStaff, async (req, res) => {
  const status = String(req.body.status || ''); if (!['ACTIVO', 'CANCELADO', 'CERRADO'].includes(status)) return void res.status(400).json({ message: 'Estado de evento no válido.' }); const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); if (status === 'CERRADO' && await prisma.parkingVisit.count({ where: { eventId: event.id, status: 'DENTRO' } })) return void res.status(409).json({ message: 'No puedes cerrar el evento mientras existan vehículos dentro.' }); const updated = await prisma.$transaction(async (tx) => { const saved = await tx.parkingEvent.update({ where: { id: event.id }, data: { status } }); if (status !== 'ACTIVO') await tx.parkingEventGuest.updateMany({ where: { eventId: event.id, status: 'AUTORIZADO' }, data: { status: 'CANCELADO' } }); return saved; }); res.json(updated);
});

app.post('/api/parking/events/:eventId/guests/:guestId/reissue', requireUser, requireParkingStaff, async (req, res) => {
  const guest = await prisma.parkingEventGuest.findFirst({ where: { id: req.params.guestId, eventId: req.params.eventId }, include: { event: true } }); if (!guest) return void res.status(404).json({ message: 'Invitado no encontrado.' }); if (guest.event.status !== 'ACTIVO' || guest.status === 'UTILIZADO') return void res.status(409).json({ message: 'Este pase ya no puede regenerarse.' }); res.json(await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { accessCode: parkingCode('EVT'), status: 'AUTORIZADO' } }));
});

app.patch('/api/parking/events/:eventId/guests/:guestId/status', requireUser, requireParkingStaff, async (req, res) => {
  const guest = await prisma.parkingEventGuest.findFirst({ where: { id: req.params.guestId, eventId: req.params.eventId } }); if (!guest) return void res.status(404).json({ message: 'Invitado no encontrado.' }); if (guest.status === 'UTILIZADO') return void res.status(409).json({ message: 'No puede cancelarse un pase que ya ingresó.' }); res.json(await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { status: 'CANCELADO' } }));
});

app.post('/api/parking/access', requireUser, requireParkingStaff, async (req, res) => {
  const code = String(req.body.code || '').trim(), normalizedCode = code.toUpperCase(), plateInput = normalizePlate(req.body.plate), entryGate = String(req.body.entryGate || ''), operatorId = res.locals.authUser.id; const reject = async (status: number, reason: string, vehicleId?: string) => { const masked = maskedParkingCode(code); await prisma.parkingAccessAttempt.create({ data: { outcome: 'RECHAZADO', reason, entryGate, plate: plateInput || null, codeMasked: masked, vehicleId, operatorId } }); const since = new Date(Date.now() - 10 * 60 * 1000), repeated = await prisma.parkingAccessAttempt.count({ where: { outcome: 'RECHAZADO', createdAt: { gte: since }, OR: [...(plateInput ? [{ plate: plateInput }] : []), ...(masked ? [{ codeMasked: masked }] : [])] } }); if (repeated >= 3) await createParkingAlert(`REJECTED:${plateInput || masked}:${new Date().toISOString().slice(0, 13)}`, 'INTENTOS_INVALIDOS', 'ALTA', `${repeated} intentos rechazados en 10 minutos para ${plateInput || masked || 'un pase desconocido'}.`); res.status(status).json({ message: reason }); };
  if (!['ENTRADA_1', 'ENTRADA_2'].includes(entryGate)) return void await reject(400, 'Selecciona Entrada 1 o Entrada 2.'); const dynamicPass = verifyDynamicParkingPass(code);
  const [vehicle, guest, config, occupancy] = await Promise.all([dynamicPass ? prisma.parkingVehicle.findFirst({ where: { id: dynamicPass.vehicleId, status: 'ACTIVO' }, include: { owner: true } }) : prisma.parkingVehicle.findFirst({ where: { plate: plateInput || '__NONE__', status: 'ACTIVO' }, include: { owner: true } }), prisma.parkingEventGuest.findFirst({ where: { OR: [{ accessCode: normalizedCode || '__NONE__' }, { plate: plateInput || '__NONE__' }], status: 'AUTORIZADO' }, include: { event: true } }), prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }), prisma.parkingVisit.count({ where: { status: 'DENTRO' } })]);
  if (!vehicle && !guest) return void await reject(404, code.startsWith('PV1.') ? 'El QR vehicular venció o no es válido.' : 'Pase o placa no autorizado.'); if (occupancy >= config.totalCapacity) return void await reject(409, 'Parqueo lleno. Acceso temporalmente detenido.', vehicle?.id); const plate = vehicle?.plate || guest?.plate || plateInput; if (!plate) return void await reject(400, 'Registra la placa del visitante.', vehicle?.id); if (await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' } })) return void await reject(409, 'El vehículo ya se encuentra dentro.', vehicle?.id);
  if (guest && (guest.event.status !== 'ACTIVO' || new Date() < new Date(guest.event.startsAt.getTime() - 3 * 3600000) || new Date() > guest.event.endsAt)) return void await reject(403, 'El pase del evento no está vigente.'); const visit = await prisma.parkingVisit.create({ data: { plate, accessCode: code || vehicle?.accessCode, visitorName: guest?.guestName, entryGate, vehicleId: vehicle?.id, userId: vehicle?.ownerId, eventId: guest?.eventId } }); if (guest) await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { status: 'UTILIZADO' } }); await prisma.parkingAccessAttempt.create({ data: { outcome: 'AUTORIZADO', reason: guest ? 'Invitado de evento' : dynamicPass ? 'QR dinámico válido' : 'Placa autorizada', entryGate, plate, codeMasked: maskedParkingCode(code), vehicleId: vehicle?.id, operatorId } }); await evaluateOccupancyAlerts(occupancy + 1, config.totalCapacity); res.status(201).json({ visit, occupancy: occupancy + 1, available: config.totalCapacity - occupancy - 1 });
});

app.patch('/api/parking/alerts/:id/acknowledge', requireUser, requireParkingStaff, async (req, res) => {
  const alert = await prisma.parkingAlert.findUnique({ where: { id: req.params.id } }); if (!alert) return void res.status(404).json({ message: 'Alerta no encontrada.' }); res.json(await prisma.parkingAlert.update({ where: { id: alert.id }, data: { status: 'ATENDIDA', acknowledgedBy: res.locals.authUser.name, acknowledgedAt: new Date() } }));
});

app.get('/api/parking/offline-manifest', requireUser, requireParkingStaff, async (_req, res) => {
  const now = new Date(), expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); const [vehicles, guests] = await Promise.all([prisma.parkingVehicle.findMany({ where: { status: 'ACTIVO' }, select: { plate: true } }), prisma.parkingEventGuest.findMany({ where: { status: 'AUTORIZADO', event: { status: 'ACTIVO', startsAt: { lte: expiresAt }, endsAt: { gte: now } } }, select: { plate: true, accessCode: true } })]); res.json({ generatedAt: now, expiresAt, plates: vehicles.map((item) => item.plate), guestPasses: guests.map((item) => ({ plate: item.plate, code: item.accessCode })) });
});

app.post('/api/parking/offline-sync', requireUser, requireParkingStaff, async (req, res) => {
  const operations = Array.isArray(req.body.operations) ? req.body.operations.slice(0, 100) : []; if (!operations.length) return void res.status(400).json({ message: 'No hay operaciones para sincronizar.' }); const results: Array<{ id: string; status: string; message?: string }> = [];
  for (const item of operations) { const id = String(item.id || ''), type = String(item.type || ''), plate = normalizePlate(item.plate), gate = String(item.gate || ''), recordedAt = new Date(item.recordedAt); if (!id || !['ENTRY', 'EXIT'].includes(type) || plate.length < 4 || Number.isNaN(recordedAt.getTime())) { results.push({ id, status: 'RECHAZADO', message: 'Datos incompletos.' }); continue; } if (await prisma.parkingOfflineOperation.findUnique({ where: { clientOperationId: id } })) { results.push({ id, status: 'DUPLICADO' }); continue; }
    try { if (type === 'ENTRY') { const vehicle = await prisma.parkingVehicle.findUnique({ where: { plate } }); if (!vehicle || vehicle.status !== 'ACTIVO') throw new Error('Vehículo no autorizado.'); if (await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' } })) throw new Error('El vehículo ya está dentro.'); const visit = await prisma.parkingVisit.create({ data: { plate, entryGate: ['ENTRADA_1','ENTRADA_2'].includes(gate) ? gate : 'ENTRADA_1', enteredAt: recordedAt, vehicleId: vehicle.id, userId: vehicle.ownerId } }); await prisma.parkingOfflineOperation.create({ data: { clientOperationId: id, type, plate, gate, reason: String(item.reason || 'Contingencia sin conexión'), recordedAt, syncedBy: res.locals.authUser.name, visitId: visit.id } }); await prisma.parkingAccessAttempt.create({ data: { outcome: 'SINCRONIZADO', reason: 'Entrada registrada durante contingencia', entryGate: gate, plate, vehicleId: vehicle.id, operatorId: res.locals.authUser.id } }); }
      else { const visit = await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' }, orderBy: { enteredAt: 'desc' } }); if (!visit) throw new Error('No existe un ingreso activo.'); await prisma.parkingVisit.update({ where: { id: visit.id }, data: { status: 'SALIO', exitedAt: recordedAt, exitGate: 'SALIDA_1' } }); await prisma.parkingOfflineOperation.create({ data: { clientOperationId: id, type, plate, gate: 'SALIDA_1', reason: String(item.reason || 'Contingencia sin conexión'), recordedAt, syncedBy: res.locals.authUser.name, visitId: visit.id } }); }
      results.push({ id, status: 'SINCRONIZADO' }); } catch (error) { results.push({ id, status: 'RECHAZADO', message: error instanceof Error ? error.message : 'No fue posible sincronizar.' }); }
  } res.json({ results });
});

app.post('/api/parking/manual-barrier', requireUser, requireParkingStaff, async (req, res) => {
  const gate = String(req.body.gate || ''), reason = String(req.body.reason || '').trim(), plate = normalizePlate(req.body.plate); if (!['ENTRADA_1','ENTRADA_2','SALIDA_1'].includes(gate) || reason.length < 5) return void res.status(400).json({ message: 'Indica barrera y motivo de la apertura manual.' }); const attempt = await prisma.parkingAccessAttempt.create({ data: { outcome: 'APERTURA_MANUAL', reason, entryGate: gate, plate: plate || null, operatorId: res.locals.authUser.id } }); await createParkingAlert(`MANUAL:${attempt.id}`, 'APERTURA_MANUAL', 'MEDIA', `${res.locals.authUser.name} abrió manualmente ${gate.replace('_',' ')}. Motivo: ${reason}`); res.status(201).json(attempt);
});

app.post('/api/parking/exit', requireUser, requireParkingStaff, async (req, res) => {
  const plate = normalizePlate(req.body.plate), code = String(req.body.code || '').trim().toUpperCase(); const visit = await prisma.parkingVisit.findFirst({ where: { status: 'DENTRO', OR: [{ plate: plate || '__NONE__' }, { accessCode: code || '__NONE__' }] }, orderBy: { enteredAt: 'desc' } }); if (!visit) return void res.status(404).json({ message: 'No existe un ingreso activo para ese vehículo.' }); res.json(await prisma.parkingVisit.update({ where: { id: visit.id }, data: { status: 'SALIO', exitedAt: new Date(), exitGate: 'SALIDA_1' } }));
});

app.post('/api/library/staff', requireUser, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), code = String(req.body.code || '').trim().toUpperCase();
  if (name.length < 3 || roleFromEmail(email) !== 'BIBLIOTECA' || code.length < 3) return void res.status(400).json({ message: 'Indica nombre, código y correo @biblioteca.uspg.edu.gt.' });
  const password = temporaryPassword();
  try { const user = await prisma.user.create({ data: { id: randomUUID(), name, email, role: 'BIBLIOTECA', carnetOrCode: code, passwordHash: hashPassword(password), department: 'Biblioteca', mustChangePassword: true } }); res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, temporaryPassword: password }); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

const evaluateLibraryAlerts = async () => { const now = new Date(), tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000); const [dueSoon, overdue] = await Promise.all([prisma.libraryLoan.findMany({ where: { status: 'PRESTADO', dueAt: { gte: now, lte: tomorrow }, dueReminderSentAt: null }, include: { copy: { include: { book: true } } }, take: 100 }), prisma.libraryLoan.findMany({ where: { status: 'PRESTADO', dueAt: { lt: now }, overdueNoticeSentAt: null }, include: { copy: { include: { book: true } } }, take: 100 })]); for (const loan of dueSoon) { await notifyUser(loan.borrowerId, 'Recordatorio de devolución', `${loan.copy.book.title} vence el ${loan.dueAt.toLocaleString('es-GT')}.`, 'WARNING', '/biblioteca'); await prisma.libraryLoan.update({ where: { id: loan.id }, data: { dueReminderSentAt: new Date() } }); } for (const loan of overdue) { await notifyUser(loan.borrowerId, 'Préstamo vencido', `${loan.copy.book.title} está vencido desde el ${loan.dueAt.toLocaleDateString('es-GT')}. Devuélvelo a Biblioteca.`, 'ERROR', '/biblioteca'); await prisma.libraryLoan.update({ where: { id: loan.id }, data: { overdueNoticeSentAt: new Date() } }); } };

app.get('/api/library', requireUser, async (_req, res) => {
  const user = res.locals.authUser;
  const staff = ['ADMIN', 'BIBLIOTECA'].includes(user.role);
  await evaluateLibraryAlerts();
  const expired = await prisma.libraryReservation.findMany({ where: { status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] }, expiresAt: { lt: new Date() } } }); for (const item of expired) await prisma.$transaction(async (tx) => { await tx.libraryReservation.update({ where: { id: item.id }, data: { status: 'EXPIRADA' } }); if (item.assignedCopyId) await tx.libraryCopy.updateMany({ where: { id: item.assignedCopyId, status: 'RESERVADO' }, data: { status: 'DISPONIBLE' } }); });
  const [books, loans, reservations] = await Promise.all([
    prisma.libraryBook.findMany({ where: { status: 'ACTIVO' }, include: { copies: true, _count: { select: { reservations: true } } }, orderBy: { title: 'asc' } }),
    prisma.libraryLoan.findMany({ where: staff ? {} : { borrowerId: user.id }, include: { borrower: { select: { id: true, name: true, carnetOrCode: true, librarySuspendedUntil: true, librarySuspensionReason: true } }, copy: { include: { book: true } } }, orderBy: { loanedAt: 'desc' }, take: 200 }),
    prisma.libraryReservation.findMany({ where: staff ? {} : { userId: user.id }, include: { user: { select: { name: true, carnetOrCode: true, email: true } }, book: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const popularity = new Map<string, number>(); loans.forEach((loan) => popularity.set(loan.copy.book.title, (popularity.get(loan.copy.book.title) || 0) + 1)); const popularBooks = [...popularity.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([title,count])=>({title,count}));
  res.json({ books: books.map((book) => ({ ...book, available: book.copies.filter((copy) => copy.status === 'DISPONIBLE').length, totalCopies: book.copies.length })), loans: loans.map((loan) => ({ id: loan.id, loanedAt: loan.loanedAt, dueAt: loan.dueAt, returnedAt: loan.returnedAt, status: loan.status === 'PRESTADO' && loan.dueAt < new Date() ? 'VENCIDO' : loan.status, renewalCount: loan.renewalCount, borrowerId: loan.borrower.id, borrowerName: loan.borrower.name, borrowerCode: loan.borrower.carnetOrCode, suspendedUntil: loan.borrower.librarySuspendedUntil, suspensionReason: loan.borrower.librarySuspensionReason, barcode: loan.copy.barcode, bookTitle: loan.copy.book.title })), reservations, metrics: { popularBooks, overdue: loans.filter((loan)=>loan.status === 'PRESTADO' && loan.dueAt < new Date()).length, damagedCopies: books.flatMap((book)=>book.copies).filter((copy)=>['DANADO','PERDIDO','MANTENIMIENTO'].includes(copy.status)).length } });
});

app.post('/api/library/books', requireUser, requireLibraryStaff, async (req, res) => {
  const title = String(req.body.title || '').trim(), author = String(req.body.author || '').trim(), category = String(req.body.category || '').trim(), barcode = String(req.body.barcode || '').trim().toUpperCase();
  if (title.length < 2 || author.length < 2 || category.length < 2 || barcode.length < 3) return void res.status(400).json({ message: 'Completa título, autor, categoría y código del ejemplar.' });
  try { const book = await prisma.$transaction(async (tx) => { const created = await tx.libraryBook.create({ data: { title, author, category, isbn: req.body.isbn ? String(req.body.isbn) : null, publisher: req.body.publisher ? String(req.body.publisher) : null, publicationYear: req.body.publicationYear ? Number(req.body.publicationYear) : null, copies: { create: { barcode, location: String(req.body.location || 'Biblioteca Central') } } } }); await tx.auditLog.create({ data: { action: 'CREATE_LIBRARY_BOOK', entityType: 'LIBRARY_BOOK', entityId: created.id, actorId: res.locals.authUser.id } }); return created; }); res.status(201).json(book); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.post('/api/library/books/:id/copies', requireUser, requireLibraryStaff, async (req, res) => {
  const barcode = String(req.body.barcode || '').trim().toUpperCase(); if (barcode.length < 3) return void res.status(400).json({ message: 'Indica el código de barras.' });
  try { res.status(201).json(await prisma.libraryCopy.create({ data: { bookId: req.params.id, barcode, location: String(req.body.location || 'Biblioteca Central') } })); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
});

app.post('/api/library/loans', requireUser, requireLibraryStaff, async (req, res) => {
  const borrowerCode = String(req.body.borrowerCode || '').trim(), barcode = String(req.body.barcode || '').trim().toUpperCase(), days = Number(req.body.days || 7);
  const [borrower, copy] = await Promise.all([prisma.user.findFirst({ where: { OR: [{ carnetOrCode: borrowerCode }, { email: borrowerCode.toLowerCase() }], active: true } }), prisma.libraryCopy.findUnique({ where: { barcode }, include: { book: true } })]);
  if (!borrower || !copy) return void res.status(404).json({ message: 'Usuario o ejemplar no encontrado.' }); if (borrower.librarySuspendedUntil && borrower.librarySuspendedUntil > new Date()) return void res.status(403).json({ message: `Usuario suspendido hasta ${borrower.librarySuspendedUntil.toLocaleDateString('es-GT')}: ${borrower.librarySuspensionReason || 'incidencia bibliotecaria'}.` }); const reservation = await prisma.libraryReservation.findFirst({ where: { userId: borrower.id, bookId: copy.bookId, status: 'LISTA', assignedCopyId: copy.id } }); if (copy.status !== 'DISPONIBLE' && !(copy.status === 'RESERVADO' && reservation)) return void res.status(409).json({ message: 'El ejemplar no está disponible para este usuario.' }); if (!Number.isInteger(days) || days < 1 || days > 30) return void res.status(400).json({ message: 'El préstamo debe durar entre 1 y 30 días.' });
  const activeCount = await prisma.libraryLoan.count({ where: { borrowerId: borrower.id, status: 'PRESTADO' } }); if (activeCount >= 3) return void res.status(409).json({ message: 'El usuario ya alcanzó el máximo de 3 préstamos.' });
  const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + days);
  const loan = await prisma.$transaction(async (tx) => { const created = await tx.libraryLoan.create({ data: { borrowerId: borrower.id, copyId: copy.id, dueAt } }); await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: 'PRESTADO' } }); if (reservation) await tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'ENTREGADA', fulfilledAt: new Date() } }); await tx.auditLog.create({ data: { action: 'LIBRARY_LOAN', entityType: 'LIBRARY_LOAN', entityId: created.id, actorId: res.locals.authUser.id } }); return created; });
  await notifyUser(borrower.id, 'Préstamo de biblioteca', `${copy.book.title} debe devolverse el ${dueAt.toLocaleDateString('es-GT')}.`, 'INFO', '/biblioteca'); res.status(201).json(loan);
});

app.post('/api/library/loans/:id/return', requireUser, requireLibraryStaff, async (req, res) => {
  const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: { include: { book: true } } } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' }); const waiting = await prisma.libraryReservation.findFirst({ where: { bookId: loan.copy.bookId, status: { in: ['ACTIVA','SOLICITADA'] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' } }), readyUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => { await tx.libraryLoan.update({ where: { id: loan.id }, data: { status: 'DEVUELTO', returnedAt: new Date() } }); await tx.libraryCopy.update({ where: { id: loan.copyId }, data: { status: waiting ? 'RESERVADO' : 'DISPONIBLE', condition: String(req.body.condition || 'BUENO') } }); if (waiting) await tx.libraryReservation.update({ where: { id: waiting.id }, data: { status: 'LISTA', assignedCopyId: loan.copyId, readyAt: new Date(), expiresAt: readyUntil } }); await tx.auditLog.create({ data: { action: 'LIBRARY_RETURN', entityType: 'LIBRARY_LOAN', entityId: loan.id, actorId: res.locals.authUser.id } }); }); if (waiting) await notifyUser(waiting.userId, 'Tu reserva ya está disponible', `${loan.copy.book.title} está listo para recoger hasta el ${readyUntil.toLocaleString('es-GT')}. Presenta tu QR.`, 'SUCCESS', '/biblioteca'); res.json({ ok: true, assignedToWaitingUser: Boolean(waiting) });
});

app.post('/api/library/loans/:id/incident', requireUser, requireLibraryStaff, async (req, res) => {
  const type = String(req.body.type || ''), notes = String(req.body.notes || '').trim(), suspensionDays = Number(req.body.suspensionDays || 0); if (!['DANADO','PERDIDO'].includes(type) || notes.length < 5 || !Number.isInteger(suspensionDays) || suspensionDays < 0 || suspensionDays > 365) return void res.status(400).json({ message: 'Completa tipo, detalle y días de suspensión.' }); const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: { include: { book: true } }, borrower: true } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' }); const suspendedUntil = suspensionDays ? new Date(Date.now() + suspensionDays * 86400000) : null; await prisma.$transaction([prisma.libraryLoan.update({ where: { id: loan.id }, data: { status: type, returnedAt: new Date(), notes } }), prisma.libraryCopy.update({ where: { id: loan.copyId }, data: { status: type, condition: type } }), ...(suspendedUntil ? [prisma.user.update({ where: { id: loan.borrowerId }, data: { librarySuspendedUntil: suspendedUntil, librarySuspensionReason: `${type}: ${notes}` } })] : []), prisma.auditLog.create({ data: { action: 'LIBRARY_INCIDENT', entityType: 'LIBRARY_LOAN', entityId: loan.id, actorId: res.locals.authUser.id, details: JSON.stringify({ type, notes, suspensionDays }) } })]); await notifyUser(loan.borrowerId, `Incidencia de Biblioteca: ${type}`, `${loan.copy.book.title}: ${notes}${suspendedUntil ? ` Suspensión hasta ${suspendedUntil.toLocaleDateString('es-GT')}.` : ''}`, 'ERROR', '/biblioteca'); res.json({ ok: true, suspendedUntil });
});

app.patch('/api/library/users/:id/suspension', requireUser, requireLibraryStaff, async (req, res) => { const user = await prisma.user.findUnique({ where: { id: req.params.id } }); if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' }); res.json(await prisma.user.update({ where: { id: user.id }, data: { librarySuspendedUntil: null, librarySuspensionReason: null } })); });

app.post('/api/library/loans/:id/renew', requireUser, async (req, res) => {
  const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: true } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' });
  if (!['ADMIN', 'BIBLIOTECA'].includes(res.locals.authUser.role) && loan.borrowerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes renovar este préstamo.' }); if (loan.renewalCount >= 1) return void res.status(409).json({ message: 'Solo se permite una renovación.' });
  if (await prisma.libraryReservation.findFirst({ where: { bookId: loan.copy.bookId, status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] } } })) return void res.status(409).json({ message: 'El libro tiene solicitudes pendientes.' }); const dueAt = new Date(loan.dueAt); dueAt.setDate(dueAt.getDate() + 7); res.json(await prisma.libraryLoan.update({ where: { id: loan.id }, data: { dueAt, renewalCount: { increment: 1 } } }));
});

app.post('/api/library/books/:id/reserve', requireUser, async (req, res) => {
  if (!['ESTUDIANTE', 'DOCENTE'].includes(res.locals.authUser.role)) return void res.status(403).json({ message: 'La reserva corresponde a estudiantes y docentes.' }); const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 2);
  if (await prisma.libraryReservation.findFirst({ where: { bookId: req.params.id, userId: res.locals.authUser.id, status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] } } })) return void res.status(409).json({ message: 'Ya tienes una solicitud activa para este libro.' }); const book = await prisma.libraryBook.findUnique({ where: { id: req.params.id } }); if (!book) return void res.status(404).json({ message: 'Libro no encontrado.' }); const reservation = await prisma.libraryReservation.create({ data: { bookId: book.id, userId: res.locals.authUser.id, expiresAt, status: 'SOLICITADA' } }); await notifyUser(res.locals.authUser.id, 'Solicitud recibida', `Biblioteca recibió tu solicitud de ${book.title}.`, 'INFO', '/biblioteca'); res.status(201).json(reservation);
});

app.post('/api/library/reservations/:id/prepare', requireUser, requireLibraryStaff, async (req, res) => {
  const reservation = await prisma.libraryReservation.findUnique({ where: { id: req.params.id }, include: { book: true } }); if (!reservation || !['ACTIVA','SOLICITADA'].includes(reservation.status)) return void res.status(409).json({ message: 'La solicitud ya no puede prepararse.' }); const copy = await prisma.libraryCopy.findFirst({ where: { bookId: reservation.bookId, status: 'DISPONIBLE' }, orderBy: { createdAt: 'asc' } }); if (!copy) return void res.status(409).json({ message: 'No existe un ejemplar disponible todavía.' }); const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); const saved = await prisma.$transaction(async (tx) => { await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: 'RESERVADO' } }); return tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'LISTA', assignedCopyId: copy.id, readyAt: new Date(), expiresAt } }); }); await notifyUser(reservation.userId, 'Libro listo para recoger', `${reservation.book.title} está listo. Presenta tu QR antes del ${expiresAt.toLocaleString('es-GT')}.`, 'SUCCESS', '/biblioteca'); res.json({ ...saved, barcode: copy.barcode });
});

app.patch('/api/library/reservations/:id/cancel', requireUser, async (req, res) => {
  const reservation = await prisma.libraryReservation.findUnique({ where: { id: req.params.id } }); if (!reservation || !['ACTIVA','SOLICITADA','LISTA'].includes(reservation.status)) return void res.status(409).json({ message: 'La solicitud ya no puede cancelarse.' }); if (!['ADMIN','BIBLIOTECA'].includes(res.locals.authUser.role) && reservation.userId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes cancelar esta solicitud.' }); const saved = await prisma.$transaction(async (tx) => { if (reservation.assignedCopyId) await tx.libraryCopy.updateMany({ where: { id: reservation.assignedCopyId, status: 'RESERVADO' }, data: { status: 'DISPONIBLE' } }); return tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'CANCELADA', cancelledAt: new Date() } }); }); res.json(saved);
});

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
  const existing = new Map(session?.records.map((record) => [record.studentCarnet, record]) || []);
  const students = section.enrollments.map((enrollment) => { const record = existing.get(enrollment.studentCarnet); return { studentCarnet: enrollment.studentCarnet, studentName: enrollment.student.name, status: record?.status || 'PRESENTE', note: record?.note || '' }; });
  const recent = await prisma.attendanceSession.findMany({ where: { sectionId }, include: { records: true }, orderBy: { classDate: 'desc' }, take: 12 });
  res.json({ sectionId, sectionCode: section.code, courseName: section.course.name, session: session ? { id: session.id, classDate: session.classDate, topic: session.topic } : null, students, recent: recent.map((item) => ({ id: item.id, classDate: item.classDate, topic: item.topic, present: item.records.filter((record) => record.status === 'PRESENTE').length, absent: item.records.filter((record) => record.status === 'AUSENTE').length, late: item.records.filter((record) => record.status === 'TARDE').length, justified: item.records.filter((record) => record.status === 'JUSTIFICADO').length })) });
});

app.post('/api/attendance/sessions', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Los estudiantes no pueden registrar asistencia.' });
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
  res.json({ ok: true, id: session.id });
});

const recalculateStudentZones = async (tx: any, sectionId: string, studentCarnets: string[]) => {
  for (const studentCarnet of studentCarnets) {
    const activityGrades = await tx.zoneActivityGrade.findMany({ where: { studentCarnet, activity: { sectionId }, score: { not: null } } });
    const zona = Math.min(30, activityGrades.reduce((sum: number, item: any) => sum + Number(item.score || 0), 0));
    const current = await tx.gradeRecord.findUnique({ where: { studentCarnet_sectionId: { studentCarnet, sectionId } } });
    if (!current) continue;
    const total = current.recuperacion > 0 ? current.recuperacion : zona + current.parcial + current.segundoParcial + current.final;
    await tx.gradeRecord.update({ where: { id: current.id }, data: { zona, total, status: total >= 61 ? 'Aprobado' : total > 0 ? 'Reprobado' : 'En curso' } });
  }
};

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

app.get('/api/virtual-classrooms', requireUser, async (_req, res) => {
  const user = res.locals.authUser;
  const where = user.role === 'DOCENTE'
    ? { section: { teacherId: user.carnetOrCode } }
    : user.role === 'ESTUDIANTE'
      ? { section: { enrollments: { some: { studentCarnet: user.carnetOrCode, status: 'Inscrito' } } } }
      : {};
  const records = await prisma.virtualClassroom.findMany({ where, include: { section: { include: { course: true, teacher: true, cycle: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(records.map((record) => ({ id: record.id, provider: record.provider, syncStatus: record.syncStatus, enrollmentCode: record.enrollmentCode, alternateLink: record.alternateLink, lastSyncedAt: record.lastSyncedAt, syncError: record.syncError, sectionId: record.sectionId, sectionCode: record.section.code, courseCode: record.section.courseCode, courseName: record.section.course.name, teacherName: record.section.teacher.name, cycleName: record.section.cycle.name })));
});

const gradeView = (record: any) => ({ id: record.id, studentCarnet: record.studentCarnet, studentName: record.student.name, sectionId: record.sectionId, courseCode: record.section.courseCode, courseName: record.section.course.name, cycleId: record.section.cycleId, zona: record.zona, parcial: record.parcial, segundoParcial: record.segundoParcial, final: record.final, recuperacion: record.recuperacion, total: record.total, status: record.status, isPublished: record.isPublished, actaStatus: record.section.gradeActStatus, gradesPublishedAt: record.section.gradesPublishedAt, gradesClosedAt: record.section.gradesClosedAt, gradesClosedBy: record.section.gradesClosedBy });
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
  const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
  if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes publicar esta sección.' });
  if (section.gradeActStatus === 'CERRADA') return void res.status(409).json({ message: 'El acta ya está cerrada.' });
  const publishedAt = new Date();
  await prisma.$transaction([
    prisma.gradeRecord.updateMany({ where: { sectionId: section.id }, data: { isPublished: true } }),
    prisma.section.update({ where: { id: section.id }, data: { gradeActStatus: 'PUBLICADA', gradesPublishedAt: publishedAt } }),
    prisma.auditLog.create({ data: { action: 'PUBLISH', entityType: 'GRADES', entityId: section.id, actorId: user.id } }),
  ]);
  const publishedStudents = await prisma.gradeRecord.findMany({ where: { sectionId: section.id }, select: { studentCarnet: true } });
  for (const student of publishedStudents) await notifyByCarnet(student.studentCarnet, 'Notas publicadas', 'Las calificaciones oficiales de tu curso ya están disponibles.', 'SUCCESS', '/historial');
  res.json({ ok: true, publishedAt });
});

app.post('/api/grades/sections/:sectionId/close', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'ESTUDIANTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const section = await prisma.section.findUnique({ where: { id: req.params.sectionId }, include: { gradeRecords: true } });
  if (!section || (user.role === 'DOCENTE' && section.teacherId !== user.carnetOrCode)) return void res.status(403).json({ message: 'No puedes cerrar esta sección.' });
  if (section.gradeActStatus !== 'PUBLICADA') return void res.status(409).json({ message: 'Primero debes publicar el acta antes de cerrarla.' });
  if (!section.gradeRecords.length) return void res.status(400).json({ message: 'No hay calificaciones para cerrar.' });
  if (section.gradeRecords.some((grade) => grade.status === 'En curso')) return void res.status(400).json({ message: 'Todas las calificaciones deben estar completas antes del cierre.' });
  const closedAt = new Date();
  await prisma.$transaction([
    prisma.section.update({ where: { id: section.id }, data: { gradeActStatus: 'CERRADA', gradesClosedAt: closedAt, gradesClosedBy: user.name } }),
    prisma.auditLog.create({ data: { action: 'CLOSE', entityType: 'GRADES', entityId: section.id, actorId: user.id, details: JSON.stringify({ records: section.gradeRecords.length }) } }),
  ]);
  res.json({ ok: true, closedAt, closedBy: user.name });
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
  const eligible = await prisma.gradeRecord.findMany({ where: eligibleWhere as any, include: { student: true, section: { include: { course: true } } } });
  res.json({ recoveries: recoveries.map(recoveryView), eligible: eligible.map((grade) => ({ id: grade.id, studentCarnet: grade.studentCarnet, studentName: grade.student.name, courseCode: grade.section.courseCode, courseName: grade.section.course.name, sectionCode: grade.section.code, total: grade.total })) });
});

app.post('/api/recoveries', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'La solicitud debe realizarla el estudiante o administración.' });
  const gradeRecordId = String(req.body.gradeRecordId || '');
  const grade = await prisma.gradeRecord.findUnique({ where: { id: gradeRecordId }, include: { student: true, recoveryExam: true } });
  if (!grade) return void res.status(404).json({ message: 'Registro de calificación no encontrado.' });
  if (user.role === 'ESTUDIANTE' && grade.studentCarnet !== user.carnetOrCode) return void res.status(403).json({ message: 'Solo puedes solicitar tu propia recuperación.' });
  if (!grade.isPublished || grade.total >= 61) return void res.status(409).json({ message: 'La recuperación solo aplica a una nota reprobada y publicada.' });
  if (grade.recoveryExam) return void res.status(409).json({ message: 'Ya existe una solicitud para este curso.' });
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

app.get('/api/student-requests', requireUser, async (_req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Este módulo no está disponible para catedráticos.' });
  const records = await prisma.studentServiceRequest.findMany({ where: user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode || '' } : {}, include: { student: true }, orderBy: { createdAt: 'desc' } });
  res.json(records.map((record) => ({ id: record.id, type: record.type, status: record.status, purpose: record.purpose, deliveryType: record.deliveryType, adminNote: record.adminNote, handledBy: record.handledBy, reviewedAt: record.reviewedAt, completedAt: record.completedAt, createdAt: record.createdAt, studentCarnet: record.studentCarnet, studentName: record.student.name, careerName: record.student.careerName || record.student.careerId, creditsEarned: record.student.creditsEarned, totalCreditsRequired: record.student.totalCreditsRequired })));
});

app.post('/api/student-requests', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role !== 'ESTUDIANTE') return void res.status(403).json({ message: 'La solicitud debe ser creada desde la cuenta del estudiante.' });
  const type = String(req.body.type || '').trim().toUpperCase();
  const purpose = String(req.body.purpose || '').trim();
  const deliveryType = String(req.body.deliveryType || 'DIGITAL').trim().toUpperCase();
  if (!['CONSTANCIA_ESTUDIOS', 'CERTIFICACION_NOTAS', 'CIERRE_PENSUM'].includes(type) || purpose.length < 5 || !['DIGITAL', 'FISICA'].includes(deliveryType)) return void res.status(400).json({ message: 'Selecciona un trámite e indica el propósito y forma de entrega.' });
  const duplicate = await prisma.studentServiceRequest.findFirst({ where: { studentCarnet: user.carnetOrCode || '', type, status: { in: ['SOLICITADA', 'EN_REVISION', 'APROBADA'] } } });
  if (duplicate) return void res.status(409).json({ message: 'Ya tienes una solicitud activa de este trámite.' });
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.studentServiceRequest.create({ data: { studentCarnet: user.carnetOrCode || '', type, purpose, deliveryType } });
    await tx.auditLog.create({ data: { action: 'CREATE_STUDENT_REQUEST', entityType: 'STUDENT_REQUEST', entityId: created.id, actorId: user.id, details: JSON.stringify({ type, deliveryType }) } });
    return created;
  });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  for (const admin of admins) await notifyUser(admin.id, 'Nueva solicitud estudiantil', `${user.name} solicitó ${type.replaceAll('_', ' ').toLowerCase()}.`, 'INFO', '/solicitudes');
  res.status(201).json(record);
});

app.patch('/api/student-requests/:id', requireAdmin, async (req, res) => {
  const status = String(req.body.status || '').trim().toUpperCase();
  const adminNote = String(req.body.adminNote || '').trim();
  if (!['EN_REVISION', 'APROBADA', 'RECHAZADA', 'ENTREGADA'].includes(status)) return void res.status(400).json({ message: 'Selecciona un estado válido.' });
  if (['RECHAZADA', 'ENTREGADA'].includes(status) && adminNote.length < 3) return void res.status(400).json({ message: 'Agrega una observación para informar al estudiante.' });
  const current = await prisma.studentServiceRequest.findUnique({ where: { id: req.params.id } });
  if (!current) return void res.status(404).json({ message: 'Solicitud no encontrada.' });
  if (['RECHAZADA', 'ENTREGADA'].includes(current.status)) return void res.status(409).json({ message: 'La solicitud ya está cerrada.' });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.studentServiceRequest.update({ where: { id: current.id }, data: { status, adminNote: adminNote || null, handledBy: res.locals.authUser.name, reviewedAt: current.reviewedAt || now, completedAt: ['RECHAZADA', 'ENTREGADA'].includes(status) ? now : null } });
    await tx.auditLog.create({ data: { action: 'UPDATE_STUDENT_REQUEST', entityType: 'STUDENT_REQUEST', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ from: current.status, to: status, adminNote }) } });
    return saved;
  });
  const labels: Record<string, string> = { EN_REVISION: 'está en revisión', APROBADA: 'fue aprobada', RECHAZADA: 'fue rechazada', ENTREGADA: 'fue completada y entregada' };
  await notifyByCarnet(current.studentCarnet, 'Actualización de solicitud', `Tu solicitud ${labels[status]}.${adminNote ? ` Observación: ${adminNote}` : ''}`, status === 'RECHAZADA' ? 'WARNING' : status === 'ENTREGADA' ? 'SUCCESS' : 'INFO', '/solicitudes');
  res.json(updated);
});

const enrollmentDocumentTypes: Record<string, string> = {
  DPI: 'Documento de identificación (DPI)',
  CERTIFICADO_NACIMIENTO: 'Certificado de nacimiento',
  TITULO_DIVERSIFICADO: 'Título de nivel diversificado',
  CERTIFICACION_ESTUDIOS: 'Certificación de estudios',
  FOTOGRAFIA: 'Fotografía reciente',
};

app.get('/api/enrollment-documents', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
  const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
  if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
  const student = await prisma.student.findUnique({ where: { carnet: studentCarnet } });
  if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
  const documents = await prisma.enrollmentDocument.findMany({ where: { studentCarnet }, orderBy: { createdAt: 'desc' }, omit: { fileData: true } });
  const byType = new Map(documents.map((document) => [document.type, document]));
  res.json({ student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId }, requirements: Object.entries(enrollmentDocumentTypes).map(([type, label]) => ({ type, label, document: byType.get(type) || null })), summary: { total: Object.keys(enrollmentDocumentTypes).length, uploaded: documents.length, approved: documents.filter((item) => item.status === 'APROBADO').length, complete: documents.length === Object.keys(enrollmentDocumentTypes).length && documents.every((item) => item.status === 'APROBADO') } });
});

app.post('/api/enrollment-documents', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  if (user.role !== 'ESTUDIANTE') return void res.status(403).json({ message: 'El archivo debe cargarse desde la cuenta del estudiante.' });
  const type = String(req.body.type || '').trim().toUpperCase();
  const fileName = String(req.body.fileName || '').trim().slice(0, 180);
  const dataUrl = String(req.body.dataUrl || '');
  const match = dataUrl.match(/^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!enrollmentDocumentTypes[type] || !fileName || !match) return void res.status(400).json({ message: 'Selecciona un requisito y carga un archivo PDF, PNG o JPG válido.' });
  if (Buffer.byteLength(match[2], 'base64') > 3 * 1024 * 1024) return void res.status(400).json({ message: 'El archivo no puede superar 3 MB.' });
  const document = await prisma.$transaction(async (tx) => {
    const saved = await tx.enrollmentDocument.upsert({ where: { studentCarnet_type: { studentCarnet: user.carnetOrCode || '', type } }, update: { fileName, mimeType: match[1], fileData: match[2], status: 'PENDIENTE', reviewNote: null, reviewedBy: null, reviewedAt: null }, create: { studentCarnet: user.carnetOrCode || '', type, fileName, mimeType: match[1], fileData: match[2] } });
    await tx.auditLog.create({ data: { action: 'UPLOAD_ENROLLMENT_DOCUMENT', entityType: 'ENROLLMENT_DOCUMENT', entityId: saved.id, actorId: user.id, details: JSON.stringify({ type, fileName }) } });
    return saved;
  });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  for (const admin of admins) await notifyUser(admin.id, 'Documento pendiente de revisión', `${user.name} cargó ${enrollmentDocumentTypes[type]}.`, 'INFO', '/expediente');
  res.status(201).json({ id: document.id, status: document.status });
});

app.get('/api/enrollment-documents/:id/file', requireUser, async (req, res) => {
  const user = res.locals.authUser;
  const document = await prisma.enrollmentDocument.findUnique({ where: { id: req.params.id } });
  if (!document || user.role === 'DOCENTE' || (user.role === 'ESTUDIANTE' && document.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Documento no encontrado.' });
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`);
  res.send(Buffer.from(document.fileData, 'base64'));
});

app.patch('/api/enrollment-documents/:id/review', requireAdmin, async (req, res) => {
  const status = String(req.body.status || '').trim().toUpperCase();
  const reviewNote = String(req.body.reviewNote || '').trim();
  if (!['APROBADO', 'RECHAZADO'].includes(status) || (status === 'RECHAZADO' && reviewNote.length < 3)) return void res.status(400).json({ message: 'Selecciona aprobar o rechazar; el rechazo requiere una observación.' });
  const current = await prisma.enrollmentDocument.findUnique({ where: { id: req.params.id } });
  if (!current) return void res.status(404).json({ message: 'Documento no encontrado.' });
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.enrollmentDocument.update({ where: { id: current.id }, data: { status, reviewNote: reviewNote || null, reviewedBy: res.locals.authUser.name, reviewedAt: new Date() } });
    await tx.auditLog.create({ data: { action: 'REVIEW_ENROLLMENT_DOCUMENT', entityType: 'ENROLLMENT_DOCUMENT', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, reviewNote }) } });
    return saved;
  });
  await notifyByCarnet(current.studentCarnet, `Documento ${status.toLowerCase()}`, `${enrollmentDocumentTypes[current.type] || 'El documento'} fue ${status.toLowerCase()}.${reviewNote ? ` Observación: ${reviewNote}` : ''}`, status === 'APROBADO' ? 'SUCCESS' : 'WARNING', '/expediente');
  res.json(updated);
});

app.post('/api/virtual-classrooms/:id/sync', requireAdmin, async (_req, res) => {
  if (!process.env.GOOGLE_CLASSROOM_CLIENT_ID) return void res.status(503).json({ message: 'Google Workspace todavía no está configurado. TI debe proporcionar las credenciales OAuth institucionales.' });
  res.status(501).json({ message: 'Las credenciales fueron detectadas, pero la autorización administrativa todavía debe completarse.' });
});

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

app.put('/api/institution', requireAdmin, async (req, res) => {
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Ocurrió un error interno en el servidor.' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist'), { setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } }));
  app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(rootDir, 'dist', 'index.html')); });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Sistema Académico disponible en http://localhost:${port}`);
});
