const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const email = process.env.TEST_LIBRARY_EMAIL || process.env.TEST_ADMIN_EMAIL || 'cmendoza@administrador.uspg.edu.gt';
const password = process.env.TEST_LIBRARY_PASSWORD || process.env.TEST_ADMIN_PASSWORD;

if (!password) {
  console.log('SKIP Biblioteca: configura TEST_LIBRARY_PASSWORD o TEST_ADMIN_PASSWORD para ejecutar el flujo contra datos reales.');
  process.exit(0);
}

const request = async (path, options = {}) => fetch(`${baseUrl}${path}`, options);
const login = await request('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: email, password }),
});
if (!login.ok) throw new Error(`Inicio de sesión falló: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
const data = await (await request('/api/library', { headers })).json();
const book = data.books?.find((item) => item.available > 0 && item.copies?.[0]?.barcode) || data.books?.find((item) => item.available > 0);
const borrowerCode = process.env.TEST_LIBRARY_BORROWER_CODE;
if (!book || !borrowerCode) throw new Error('Indica TEST_LIBRARY_BORROWER_CODE y asegúrate de tener un libro disponible.');
const copy = book.copies?.find((item) => item.status === 'DISPONIBLE') || book.copy;
if (!copy?.barcode) throw new Error('La API de Biblioteca no devolvió un código de ejemplar disponible.');

const loanResponse = await request('/api/library/loans', { method: 'POST', headers, body: JSON.stringify({ borrowerCode, barcode: copy.barcode, days: 7 }) });
if (loanResponse.status !== 201) throw new Error(`Préstamo falló: ${loanResponse.status} ${await loanResponse.text()}`);
const loan = await loanResponse.json();
const renewResponse = await request(`/api/library/loans/${loan.id}/renew`, { method: 'POST', headers });
if (renewResponse.status !== 200) throw new Error(`Renovación falló: ${renewResponse.status} ${await renewResponse.text()}`);
const returnResponse = await request(`/api/library/loans/${loan.id}/return`, { method: 'POST', headers, body: JSON.stringify({ condition: 'BUENO' }) });
if (returnResponse.status !== 200) throw new Error(`Devolución falló: ${returnResponse.status} ${await returnResponse.text()}`);

const incidentLoanResponse = await request('/api/library/loans', { method: 'POST', headers, body: JSON.stringify({ borrowerCode, barcode: copy.barcode, days: 7 }) });
if (incidentLoanResponse.status !== 201) throw new Error(`Préstamo de incidencia falló: ${incidentLoanResponse.status} ${await incidentLoanResponse.text()}`);
const incidentLoan = await incidentLoanResponse.json();
const incidentResponse = await request(`/api/library/loans/${incidentLoan.id}/incident`, { method: 'POST', headers, body: JSON.stringify({ type: 'DANADO', notes: 'Prueba controlada de incidencia bibliotecaria.', suspensionDays: 0 }) });
if (incidentResponse.status !== 200) throw new Error(`Incidencia falló: ${incidentResponse.status} ${await incidentResponse.text()}`);

let reservationStatus = 'omitida: requiere sesión de estudiante/docente';
if (process.env.TEST_LIBRARY_BORROWER_EMAIL && process.env.TEST_LIBRARY_BORROWER_PASSWORD) {
  const borrowerLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.TEST_LIBRARY_BORROWER_EMAIL, password: process.env.TEST_LIBRARY_BORROWER_PASSWORD }) });
  const borrowerCookie = borrowerLogin.headers.get('set-cookie')?.split(';')[0];
  const reservationResponse = await request(`/api/library/books/${book.id}/reserve`, { method: 'POST', headers: { Cookie: borrowerCookie } });
  if (![201, 409].includes(reservationResponse.status)) throw new Error(`Reserva falló: ${reservationResponse.status} ${await reservationResponse.text()}`);
  reservationStatus = reservationResponse.status === 201 ? 'creada' : 'ya existente';
}
console.log(`PASS Biblioteca: préstamo, renovación, devolución, incidencia DANADO y reserva (${reservationStatus}).`);
await request('/api/auth/logout', { method: 'POST', headers });
