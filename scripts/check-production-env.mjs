const required = ['DATABASE_URL', 'APP_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'PARKING_QR_SECRET', 'MFA_ENCRYPTION_KEY', 'REDIS_URL', 'CLAMAV_HOST', 'BACKUP_ENCRYPTION_KEY'];
const missing = required.filter((key) => !process.env[key] || /cambiar|configurar|example|localhost|placeholder/i.test(process.env[key]));
if ((process.env.DATABASE_PROVIDER || '').toLowerCase() !== 'postgresql') missing.push('DATABASE_PROVIDER=postgresql');
if (missing.length) { console.error(`Configuración de producción incompleta: ${missing.join(', ')}`); process.exit(1); }
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) { console.error('DATABASE_URL debe ser una conexión PostgreSQL.'); process.exit(1); }
let appUrl;
try { appUrl = new URL(process.env.APP_URL); } catch { console.error('APP_URL debe ser una URL válida.'); process.exit(1); }
if (appUrl.protocol !== 'https:') { console.error('APP_URL debe usar HTTPS en producción.'); process.exit(1); }
if (Buffer.byteLength(process.env.PARKING_QR_SECRET) < 32) { console.error('PARKING_QR_SECRET debe tener al menos 32 bytes aleatorios.'); process.exit(1); }
if (Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64').length !== 32) { console.error('MFA_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en base64.'); process.exit(1); }
if (Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'base64').length !== 32) { console.error('BACKUP_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en base64.'); process.exit(1); }
if ((process.env.AI_PROVIDER || 'disabled').toLowerCase() === 'gemini') { console.error('La IA externa está desactivada en producción para proteger datos académicos.'); process.exit(1); }
console.log('Variables esenciales de producción verificadas.');
