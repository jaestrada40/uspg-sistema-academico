import { createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const backupFile = process.argv[2];
if (!backupFile) throw new Error('Uso: npm run backup:verify -- backups/archivo.db');
const manifest = JSON.parse(readFileSync(`${backupFile}.json`, 'utf8'));
const bytes = readFileSync(backupFile);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== manifest.sha256 || bytes.length !== manifest.bytes) throw new Error('El respaldo está dañado o fue modificado.');
let verifiedFile = backupFile;
let tempDirectory;
if (manifest.encrypted === 'aes-256-gcm') {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en base64.');
  if (bytes.length < 29) throw new Error('El respaldo cifrado es inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12), bytes.subarray(bytes.length - 16));
  const plain = Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]);
  tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'uspg-backup-'));
  verifiedFile = path.join(tempDirectory, 'backup');
  writeFileSync(verifiedFile, plain, { mode: 0o600 });
}
try {
  if (manifest.provider === 'sqlite') {
    const result = spawnSync('sqlite3', [verifiedFile, 'PRAGMA integrity_check;'], { encoding: 'utf8' });
    if (result.status !== 0 || result.stdout.trim() !== 'ok') throw new Error(`SQLite no superó integrity_check: ${result.stderr || result.stdout}`);
  } else {
    const result = spawnSync('pg_restore', ['--list', verifiedFile], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.trim()) throw new Error(`El respaldo PostgreSQL no es legible: ${result.stderr}`);
  }
} finally { if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true }); }
console.log(`Respaldo verificado correctamente: ${backupFile}`);
