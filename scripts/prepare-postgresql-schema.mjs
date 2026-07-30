import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('prisma/schema.prisma', 'utf8');
const target = source
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('output   = "../src/generated/prisma"', 'output   = "../../src/generated/prisma"');
if (source === target) throw new Error('No se encontró el proveedor SQLite en prisma/schema.prisma.');
mkdirSync('prisma/postgresql', { recursive: true });
writeFileSync('prisma/postgresql/schema.prisma', target);
console.log('Esquema PostgreSQL generado en prisma/postgresql/schema.prisma');
