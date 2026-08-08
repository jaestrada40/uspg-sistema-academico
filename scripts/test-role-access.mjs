const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const accounts = {
  ADMIN: { username: process.env.TEST_ADMIN_EMAIL || 'admin@administrador.uspg.edu.gt', password: process.env.TEST_ADMIN_PASSWORD || 'Demo123!' },
  DOCENTE: { username: process.env.TEST_TEACHER_EMAIL || 'luismena@catedratico.uspg.edu.gt', password: process.env.TEST_TEACHER_PASSWORD || 'Demo123!' },
  ESTUDIANTE: { username: process.env.TEST_STUDENT_EMAIL || 'jaestradag@alumno.uspg.edu.gt', password: process.env.TEST_STUDENT_PASSWORD || 'Demo123!' },
  SISTEMAS: { username: process.env.TEST_SYSTEMS_EMAIL || 'sistemas@sistemas.uspg.edu.gt', password: process.env.TEST_SYSTEMS_PASSWORD || 'Demo123!' },
  BIBLIOTECA: { username: process.env.TEST_LIBRARY_STAFF_EMAIL || 'alopez@biblioteca.uspg.edu.gt', password: process.env.TEST_LIBRARY_STAFF_PASSWORD || 'Demo123!' },
  PARQUEO: { username: process.env.TEST_PARKING_STAFF_EMAIL || 'rpaz@parqueo.uspg.edu.gt', password: process.env.TEST_PARKING_STAFF_PASSWORD || 'Demo123!' },
  EVENTOS: { username: process.env.TEST_EVENTS_STAFF_EMAIL || 'sruiz@eventos.uspg.edu.gt', password: process.env.TEST_EVENTS_STAFF_PASSWORD || 'Demo123!' },
  REGISTRO: { username: process.env.TEST_REGISTRO_EMAIL || 'msolis@registro.uspg.edu.gt', password: process.env.TEST_REGISTRO_PASSWORD || 'Demo123!' },
  FINANZAS: { username: process.env.TEST_FINANZAS_EMAIL || 'jaguilar@finanzas.uspg.edu.gt', password: process.env.TEST_FINANZAS_PASSWORD || 'Demo123!' },
};
const cases = {
  ADMIN: [
    ['/api/students', 200], ['/api/finances', 200], ['/api/student-requests', 200],
    ['/api/library/books/no-existe/copies', 403, 'POST'],
    ['/api/parking/offline-manifest', 403], ['/api/parking', 200],
  ],
  DOCENTE: [
    ['/api/finances', 403], ['/api/student-requests', 403], ['/api/enrollment-documents', 403],
  ],
  ESTUDIANTE: [
    ['/api/finances', 200], ['/api/student-requests', 200], ['/api/enrollment-documents', 200], ['/api/finances/career-fees', 403],
  ],
  SISTEMAS: [
    ['/api/systems/overview', 200], ['/api/finances', 403], ['/api/students', 403],
  ],
  BIBLIOTECA: [
    ['/api/library', 200], ['/api/finances', 403], ['/api/grades', 403], ['/api/attendance?sectionId=no-existe', 403], ['/api/enrollments', 403], ['/api/student-requests', 403], ['/api/virtual-classrooms', 403], ['/api/enrollment-documents?studentCarnet=2200138', 403],
  ],
  PARQUEO: [
    ['/api/parking', 200], ['/api/parking/offline-manifest', 200], ['/api/finances', 403], ['/api/grades', 403], ['/api/enrollments', 403], ['/api/student-requests', 403], ['/api/virtual-classrooms', 403], ['/api/enrollment-documents?studentCarnet=2200138', 403],
  ],
  EVENTOS: [
    ['/api/parking', 200], ['/api/parking/offline-manifest', 200], ['/api/finances', 403], ['/api/grades', 403], ['/api/enrollments', 403], ['/api/student-requests', 403], ['/api/virtual-classrooms', 403], ['/api/enrollment-documents?studentCarnet=2200138', 403],
  ],
  REGISTRO: [
    ['/api/students', 200], ['/api/finances/career-fees', 403], ['/api/finances', 403],
  ],
  FINANZAS: [
    ['/api/finances/career-fees', 200], ['/api/students', 200], ['/api/students', 403, 'POST'],
  ],
};
let failures = 0;
for (const [role, account] of Object.entries(accounts)) {
  if (!account.password) { console.log(`SKIP ${role}: configura TEST_ADMIN_PASSWORD para probar una sesión administrativa independiente.`); continue; }
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  if (!login.ok || !cookie) { console.error(`FAIL ${role}: inicio de sesión ${login.status}`); failures++; continue; }
  const profile = await login.json();
  if (profile.user.role !== role) { console.error(`FAIL ${role}: servidor devolvió ${profile.user.role}`); failures++; continue; }
  if (profile.user.mfaEnrollmentRequired) {
    const statusResponse = await fetch(`${baseUrl}/api/auth/mfa/status`, { headers: { Cookie: cookie } });
    const protectedResponse = await fetch(`${baseUrl}${cases[role][0][0]}`, { headers: { Cookie: cookie } });
    const ok = statusResponse.status === 200 && protectedResponse.status === 428;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${role} inscripción MFA obligatoria: estado ${statusResponse.status}, módulo protegido ${protectedResponse.status}`);
    if (!ok) failures++;
    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    continue;
  }
  if (profile.user.mustChangePassword) {
    const profileResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    const protectedResponse = await fetch(`${baseUrl}${cases[role][0][0]}`, { headers: { Cookie: cookie } });
    const ok = profileResponse.status === 200 && protectedResponse.status === 428;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${role} cambio de contraseña obligatorio: perfil ${profileResponse.status}, módulo protegido ${protectedResponse.status}`);
    if (!ok) failures++;
    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    continue;
  }
  for (const [path, expected, method = 'GET'] of cases[role]) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { Cookie: cookie } });
    const ok = response.status === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${role} ${method} ${path}: ${response.status} (esperado ${expected})`);
    if (!ok) failures++;
  }
  await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
}
if (failures) { console.error(`${failures} prueba(s) fallaron.`); process.exit(1); }
console.log('Matriz de permisos completada sin fallos.');
