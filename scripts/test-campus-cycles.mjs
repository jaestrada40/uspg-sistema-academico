import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const email = process.env.TEST_ADMIN_EMAIL || 'admin@administrador.uspg.edu.gt';
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password) {
  console.log('SKIP Ciclos por campus: configura TEST_ADMIN_PASSWORD para ejecutar el flujo contra datos reales.');
  process.exit(0);
}

const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password }) });
assert.equal(login.status, 200, 'Login de administrador debe funcionar');
const cookie = login.headers.get('set-cookie');

const structureResponse = await fetch(`${baseUrl}/api/academic-structure`, { headers: { Cookie: cookie } });
assert.equal(structureResponse.status, 200);
const { campuses } = await structureResponse.json();
assert.ok(campuses.length >= 1, 'Debe existir al menos un campus');
const centralCampus = campuses.find((campus) => campus.code === 'CC') || campuses[0];

const cyclesResponse = await fetch(`${baseUrl}/api/cycles`, { headers: { Cookie: cookie } });
assert.equal(cyclesResponse.status, 200);
const cycles = await cyclesResponse.json();
assert.ok(cycles.length > 0, 'Deben existir ciclos');
for (const cycle of cycles) {
  assert.ok(cycle.campusId, `El ciclo ${cycle.id} debe tener campusId`);
  assert.ok(!cycle.name.includes('·'), `El nombre del ciclo ${cycle.id} no debe incluir el campus incrustado`);
}

const createResponse = await fetch(`${baseUrl}/api/cycles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    year: 2099, name: 'Ciclo de prueba QA', campusId: centralCampus.id,
    startDate: '2099-01-10', endDate: '2099-05-30',
    enrollmentStartDate: '2099-01-01', enrollmentEndDate: '2099-01-09',
    gradeSubmissionDeadline: '2099-06-05', status: 'Planificado', isCurrent: false,
  }),
});
assert.equal(createResponse.status, 201, 'Crear un ciclo nuevo con campusId debe funcionar');
const created = await createResponse.json();
assert.equal(created.campusId, centralCampus.id);
assert.equal(created.campusName, centralCampus.name);

const missingCampusResponse = await fetch(`${baseUrl}/api/cycles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    year: 2099, name: 'Ciclo sin campus QA',
    startDate: '2099-01-10', endDate: '2099-05-30',
    enrollmentStartDate: '2099-01-01', enrollmentEndDate: '2099-01-09',
    gradeSubmissionDeadline: '2099-06-05', status: 'Planificado', isCurrent: false,
  }),
});
assert.equal(missingCampusResponse.status, 400, 'Crear un ciclo sin campusId debe rechazarse');

await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
console.log('PASS Ciclos por campus: listado con campus, nombre sin sufijo incrustado, creación con y sin campus.');
