import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const provider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve(process.env.BACKUP_DIRECTORY || 'backups');
mkdirSync(directory, { recursive: true });
let backupFile;
if (provider === 'sqlite') {
  const configured = process.env.DATABASE_URL || 'file:./data/system.db';
  const source = path.resolve(configured.replace(/^file:/, ''));
  backupFile = path.join(directory, `uspg-sqlite-${stamp}.db`);
  const result = spawnSync('sqlite3', [source, `.backup '${backupFile.replaceAll("'", "''")}'`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`No se pudo respaldar SQLite: ${result.stderr}`);
} else if (provider === 'postgresql') {
  backupFile = path.join(directory, `uspg-postgresql-${stamp}.dump`);
  const result = spawnSync('pg_dump', ['--format=custom', '--file', backupFile, '--dbname', process.env.DATABASE_URL || ''], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
} else throw new Error(`Proveedor no soportado: ${provider}`);
const bytes = readFileSync(backupFile);
const manifest = { provider, createdAt: new Date().toISOString(), file: path.basename(backupFile), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
writeFileSync(`${backupFile}.json`, JSON.stringify(manifest, null, 2));
console.log(`Respaldo creado: ${backupFile}`);
console.log(`SHA-256: ${manifest.sha256}`);
