import 'dotenv/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const provider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve(process.env.BACKUP_DIRECTORY || 'backups');
mkdirSync(directory, { recursive: true });
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en base64.');
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'uspg-backup-'));
let backupFile;
if (provider === 'sqlite') {
  const configured = process.env.DATABASE_URL || 'file:./data/system.db';
  const source = path.resolve(configured.replace(/^file:/, ''));
  backupFile = path.join(tempDirectory, `uspg-sqlite-${stamp}.db`);
  const result = spawnSync('sqlite3', [source, `.backup '${backupFile.replaceAll("'", "''")}'`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`No se pudo respaldar SQLite: ${result.stderr}`);
} else if (provider === 'postgresql') {
  backupFile = path.join(tempDirectory, `uspg-postgresql-${stamp}.dump`);
  const result = spawnSync('pg_dump', ['--format=custom', '--file', backupFile, '--dbname', process.env.DATABASE_URL || ''], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
} else throw new Error(`Proveedor no soportado: ${provider}`);
try {
  const plain = readFileSync(backupFile);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const encryptedFile = path.join(directory, `${path.basename(backupFile)}.enc`);
  writeFileSync(encryptedFile, encrypted, { mode: 0o600 });
  const manifest = { provider, encrypted: 'aes-256-gcm', createdAt: new Date().toISOString(), file: path.basename(encryptedFile), bytes: encrypted.length, sha256: createHash('sha256').update(encrypted).digest('hex') };
  writeFileSync(`${encryptedFile}.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`Respaldo creado: ${encryptedFile}`);
  console.log(`SHA-256: ${manifest.sha256}`);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
