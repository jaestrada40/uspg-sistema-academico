// Regresiones de la auditoría de seguridad (run-1). Cliente HTTP contra un servidor local ya iniciado
// y sembrado con las cuentas demo (igual que los demás scripts test-*.mjs). No usar contra producción.
//
// Efectos sobre la base de datos de prueba: enrola MFA en las cuentas BIBLIOTECA, ADMIN y SISTEMAS de prueba
// (el sistema exige MFA a esos roles y la API no permite desactivarlo), por eso se debe ejecutar sobre una
// base recién sembrada. Si una cuenta ya tiene MFA activo, la prueba se detiene sin alterarla. El resto de
// las comprobaciones no persiste datos.
import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const accounts = {
  admin: { username: process.env.TEST_ADMIN_EMAIL || 'cmendoza@administrador.uspg.edu.gt', password: process.env.TEST_ADMIN_PASSWORD || 'Demo123!' },
  library: { username: process.env.TEST_LIBRARY_STAFF_EMAIL || 'alopez@biblioteca.uspg.edu.gt', password: process.env.TEST_LIBRARY_STAFF_PASSWORD || 'Demo123!' },
  student: { username: process.env.TEST_STUDENT_EMAIL || 'jaestradag@alumno.uspg.edu.gt', password: process.env.TEST_STUDENT_PASSWORD || 'Demo123!' },
  registro: { username: process.env.TEST_REGISTRO_EMAIL || 'msolis@registro.uspg.edu.gt', password: process.env.TEST_REGISTRO_PASSWORD || 'Demo123!' },
  systems: { username: process.env.TEST_SYSTEMS_EMAIL || 'sistemas@sistemas.uspg.edu.gt', password: process.env.TEST_SYSTEMS_PASSWORD || 'Demo123!' },
};
const whatsappKey = process.env.TEST_WHATSAPP_API_KEY || '';
const whatsappCareer = process.env.TEST_WHATSAPP_CAREER || 'Ingeniería en Tecnologías de la Información';
const sensitiveKeys = ['passwordHash', 'mfaSecretEncrypted', 'mfaPendingSecretEncrypted', 'mfaRecoveryCodeHashes', 'mfaLastUsedStep'];

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

const request = async (method, path, { cookie, body, headers } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { /* respuesta no JSON */ }
  return { status: response.status, json, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
};

const failures = [];
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures.push(name);
};

const signIn = async (account) => {
  const login = await request('POST', '/api/auth/login', { body: account });
  if (login.status !== 200) throw new Error(`Inicio de sesión ${account.username}: ${login.status}`);
  let cookie = login.cookie;
  if (login.json.user?.mfaEnrollmentRequired) {
    const setup = await request('POST', '/api/auth/mfa/setup', { cookie, body: { currentPassword: account.password } });
    const enable = await request('POST', '/api/auth/mfa/enable', { cookie, body: { code: totp(setup.json.secret) } });
    if (enable.status !== 200) throw new Error(`MFA ${account.username}: ${enable.status}`);
  } else if (login.json.mfaRequired) {
    throw new Error(`${account.username} ya tiene MFA activo; usa otra cuenta para no alterarla.`);
  }
  return { cookie, user: login.json.user };
};

try {
  const library = await signIn(accounts.library);
  const student = await request('POST', '/api/auth/login', { body: accounts.student });
  const admin = await signIn(accounts.admin);

  // 1. Biblioteca no recibe credenciales ni puede operar sobre cuentas con rol de gestión.
  const lifted = await request('PATCH', `/api/library/users/${student.json.user.id}/suspension`, { cookie: library.cookie });
  check('biblioteca: levantar suspensión no devuelve credenciales', lifted.status === 200 && sensitiveKeys.every((key) => !(key in (lifted.json || {}))), `status ${lifted.status}`);
  const liftedAdmin = await request('PATCH', `/api/library/users/${admin.user.id}/suspension`, { cookie: library.cookie });
  check('biblioteca: no puede apuntar a una cuenta ADMIN', liftedAdmin.status === 404, `status ${liftedAdmin.status}`);

  // 2. La malla curricular no la leen roles ajenos.
  const map = await request('GET', `/api/curriculum-map?studentCarnet=${student.json.user.carnetOrCode}`, { cookie: library.cookie });
  check('malla curricular: BIBLIOTECA recibe 403', map.status === 403, `status ${map.status}`);

  // 3. Un estudiante sin carné no puede crearse.
  const noCarnet = await request('POST', '/api/admin/users', { cookie: admin.cookie, body: { name: 'Prueba SinCarnet', email: `sc-${randomUUID().slice(0, 8)}@alumno.uspg.edu.gt`, role: 'ESTUDIANTE' } });
  check('admin: ESTUDIANTE sin carné se rechaza', noCarnet.status === 400, `status ${noCarnet.status}`);

  // 4. SISTEMAS no puede intervenir cuentas con autoridad de gestión.
  const systems = await signIn(accounts.systems);
  const registro = await request('POST', '/api/auth/login', { body: accounts.registro });
  const resetRegistro = await request('POST', `/api/systems/accounts/${registro.json.user.id}/reset-password`, { cookie: systems.cookie });
  check('sistemas: no puede resetear una cuenta REGISTRO', resetRegistro.status === 404 && !resetRegistro.json?.temporaryPassword, `status ${resetRegistro.status}`);

  // 5. Una cookie malformada no tumba el servidor.
  const cookieResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: 'uspg_session=%' } }).then((r) => r.status).catch(() => 'sin respuesta');
  const health = await fetch(`${baseUrl}/api/health`).then((r) => r.status).catch(() => 'sin respuesta');
  check('cookie malformada: responde sin terminar el proceso', cookieResponse === 401 && health === 200, `me ${cookieResponse}, health ${health}`);

  // 6. El bloqueo por intentos fallidos se activa al quinto fallo (usuario inexistente para no bloquear una cuenta real).
  const ghost = `bloqueo-${randomUUID()}@alumno.uspg.edu.gt`;
  const statuses = [];
  for (let attempt = 0; attempt < 7; attempt += 1) statuses.push((await request('POST', '/api/auth/login', { body: { username: ghost, password: `mala-${attempt}` } })).status);
  check('login: bloqueo después de 5 fallos', statuses.slice(0, 5).every((s) => s === 401) && statuses.slice(5).every((s) => s === 429), statuses.join(','));

  // 7. Inscripciones simultáneas por WhatsApp no derriban el servidor (requiere TEST_WHATSAPP_API_KEY y un plan activo).
  if (whatsappKey) {
    const tag = randomUUID().slice(0, 6);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => request('POST', '/api/integrations/whatsapp/solicitudes-inscripcion', {
      headers: { 'x-api-key': whatsappKey },
      body: { name: 'Regresion Concurrente', phone: `+502 8${tag.replace(/\D/g, '0')}${i}0000`, careerName: whatsappCareer, personalEmail: `reg-${tag}-${i}@example.com` },
    }).then((r) => r.status).catch(() => 'sin respuesta')));
    const alive = await fetch(`${baseUrl}/api/health`).then((r) => r.status).catch(() => 'sin respuesta');
    check('whatsapp: ráfaga concurrente sin caída y con inscripciones creadas', alive === 200 && !results.includes('sin respuesta') && results.filter((s) => s === 201).length >= 1, `${results.join(',')} health ${alive}`);
    // Un mismo teléfono (en formatos distintos) llegando a la vez crea una sola cuenta.
    const digits = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    const formats = [digits, `+502 ${digits.slice(0, 4)} ${digits.slice(4)}`, `502-${digits}`];
    const same = await Promise.all(formats.map((phone, i) => request('POST', '/api/integrations/whatsapp/solicitudes-inscripcion', {
      headers: { 'x-api-key': whatsappKey },
      body: { name: `Mismo Telefono ${i} Regresion`, phone, careerName: whatsappCareer, personalEmail: `tel-${tag}-${i}@example.com` },
    }).then((r) => r.status).catch(() => 'sin respuesta')));
    check('whatsapp: un teléfono en formatos distintos crea una sola cuenta', same.filter((s) => s === 201).length === 1 && same.filter((s) => s === 409).length === 2, same.join(','));
  } else {
    console.log('SKIP whatsapp: define TEST_WHATSAPP_API_KEY (y un plan curricular activo) para probar la ráfaga concurrente.');
  }
} catch (error) {
  console.error(`FAIL regresiones de seguridad: ${error instanceof Error ? error.message : error}`);
  failures.push('error de ejecución');
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} comprobación(es): ${failures.join('; ')}`);
  process.exit(1);
}
console.log('PASS regresiones de seguridad.');
