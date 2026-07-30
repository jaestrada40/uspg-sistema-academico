import { createHmac } from 'node:crypto';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const username = process.env.TEST_MFA_EMAIL || 'jaestrada@alumno.uspg.edu.gt';
const password = process.env.TEST_MFA_PASSWORD || 'Demo123!';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const decodeBase32 = (input) => {
  let bits = '';
  for (const character of input.replace(/=|\s|-/g, '')) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
};
const totp = (secret) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
};
const request = async (path, options = {}, cookie = '') => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(`${path}: ${response.status} ${body.message || ''}`);
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
};

let sessionCookie = '';
let enabled = false;
try {
  const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  sessionCookie = login.cookie;
  const initial = await request('/api/auth/mfa/status', {}, sessionCookie);
  if (initial.body.enabled) throw new Error('La cuenta de prueba ya tiene MFA activo; usa otra cuenta para no alterar su configuración.');
  const setup = await request('/api/auth/mfa/setup', { method: 'POST', body: JSON.stringify({ currentPassword: password }) }, sessionCookie);
  const enable = await request('/api/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code: totp(setup.body.secret) }) }, sessionCookie);
  enabled = true;
  await request('/api/auth/logout', { method: 'POST', body: '{}' }, sessionCookie);
  const challenged = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (!challenged.body.mfaRequired || !challenged.body.challengeToken) throw new Error('El inicio de sesión no solicitó MFA.');
  const usedTotp = totp(setup.body.secret);
  const firstVerified = await request('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ challengeToken: challenged.body.challengeToken, code: usedTotp }) });
  await request('/api/auth/logout', { method: 'POST', body: '{}' }, firstVerified.cookie);
  const secondChallenge = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  const replay = await fetch(`${baseUrl}/api/auth/mfa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken: secondChallenge.body.challengeToken, code: usedTotp }) });
  if (replay.status !== 401) throw new Error(`Un código TOTP reutilizado no fue rechazado (${replay.status}).`);
  const verified = await request('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ challengeToken: secondChallenge.body.challengeToken, code: enable.body.recoveryCodes[0] }) });
  sessionCookie = verified.cookie;
  if (!verified.body.recoveryCodeUsed) throw new Error('El código de recuperación no fue reconocido como consumido.');
  await request('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ currentPassword: password, code: enable.body.recoveryCodes[1] }) }, sessionCookie);
  enabled = false;
  const final = await request('/api/auth/mfa/status', {}, sessionCookie);
  if (final.body.enabled) throw new Error('MFA continuó activo después de la limpieza de prueba.');
  console.log('PASS MFA: configuración, TOTP, bloqueo de repetición, recuperación de un uso y desactivación.');
} catch (error) {
  console.error(`FAIL MFA: ${error instanceof Error ? error.message : error}`);
  if (enabled) console.error('ATENCIÓN: la cuenta de prueba podría conservar MFA activo; desactívalo desde el perfil.');
  process.exit(1);
}
