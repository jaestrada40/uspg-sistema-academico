const required = ['DATABASE_URL', 'APP_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'PARKING_QR_SECRET'];
const missing = required.filter((key) => !process.env[key] || /cambiar|example|localhost/i.test(process.env[key]));
if ((process.env.DATABASE_PROVIDER || '').toLowerCase() !== 'postgresql') missing.push('DATABASE_PROVIDER=postgresql');
if (missing.length) { console.error(`Configuración de producción incompleta: ${missing.join(', ')}`); process.exit(1); }
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) { console.error('DATABASE_URL debe ser una conexión PostgreSQL.'); process.exit(1); }
console.log('Variables esenciales de producción verificadas.');
