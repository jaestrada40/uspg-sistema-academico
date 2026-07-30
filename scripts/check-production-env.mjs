const required = ['DATABASE_URL', 'APP_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'PARKING_QR_SECRET'];
const missing = required.filter((key) => !process.env[key] || /cambiar|example|localhost/i.test(process.env[key]));
if ((process.env.DATABASE_PROVIDER || '').toLowerCase() !== 'postgresql') missing.push('DATABASE_PROVIDER=postgresql');
if (missing.length) { console.error(`Configuración de producción incompleta: ${missing.join(', ')}`); process.exit(1); }
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) { console.error('DATABASE_URL debe ser una conexión PostgreSQL.'); process.exit(1); }
let appUrl;
try { appUrl = new URL(process.env.APP_URL); } catch { console.error('APP_URL debe ser una URL válida.'); process.exit(1); }
if (appUrl.protocol !== 'https:') { console.error('APP_URL debe usar HTTPS en producción.'); process.exit(1); }
if (Buffer.byteLength(process.env.PARKING_QR_SECRET) < 32) { console.error('PARKING_QR_SECRET debe tener al menos 32 bytes aleatorios.'); process.exit(1); }
if (process.env.SMTP_PASS.length < 12) { console.error('SMTP_PASS parece demasiado corta para producción.'); process.exit(1); }
console.log('Variables esenciales de producción verificadas.');
