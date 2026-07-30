import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const backupFile = process.argv[2];
if (!backupFile) throw new Error('Uso: npm run backup:verify -- backups/archivo.db');
const manifest = JSON.parse(readFileSync(`${backupFile}.json`, 'utf8'));
const bytes = readFileSync(backupFile);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== manifest.sha256 || bytes.length !== manifest.bytes) throw new Error('El respaldo está dañado o fue modificado.');
if (manifest.provider === 'sqlite') {
  const result = spawnSync('sqlite3', [backupFile, 'PRAGMA integrity_check;'], { encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() !== 'ok') throw new Error(`SQLite no superó integrity_check: ${result.stderr || result.stdout}`);
} else {
  const result = spawnSync('pg_restore', ['--list', backupFile], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`El respaldo PostgreSQL no es legible: ${result.stderr}`);
}
console.log(`Respaldo verificado correctamente: ${backupFile}`);
