const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const accounts = {
  ADMIN: { username: process.env.TEST_ADMIN_EMAIL || 'cmendoza@administrador.uspg.edu.gt', password: process.env.TEST_ADMIN_PASSWORD },
  DOCENTE: { username: process.env.TEST_TEACHER_EMAIL || 'luismena@catedratico.uspg.edu.gt', password: process.env.TEST_TEACHER_PASSWORD || 'Demo123!' },
  ESTUDIANTE: { username: process.env.TEST_STUDENT_EMAIL || 'jaestrada@alumno.uspg.edu.gt', password: process.env.TEST_STUDENT_PASSWORD || 'Demo123!' },
};
const cases = {
  ADMIN: [
    ['/api/students', 200], ['/api/finances', 200], ['/api/student-requests', 200],
  ],
  DOCENTE: [
    ['/api/finances', 403], ['/api/student-requests', 403], ['/api/enrollment-documents', 403],
  ],
  ESTUDIANTE: [
    ['/api/finances', 200], ['/api/student-requests', 200], ['/api/enrollment-documents', 200], ['/api/finances/career-fees', 403],
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
  for (const [path, expected] of cases[role]) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
    const ok = response.status === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${role} ${path}: ${response.status} (esperado ${expected})`);
    if (!ok) failures++;
  }
  await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
}
if (failures) { console.error(`${failures} prueba(s) fallaron.`); process.exit(1); }
console.log('Matriz de permisos completada sin fallos.');
