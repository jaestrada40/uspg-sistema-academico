import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('prisma/schema.prisma', 'utf8');
const target = source.replace('provider = "sqlite"', 'provider = "postgresql"');
if (source === target) throw new Error('No se encontró el proveedor SQLite en prisma/schema.prisma.');
writeFileSync('prisma/schema.postgresql.prisma', target);
console.log('Esquema PostgreSQL generado en prisma/schema.postgresql.prisma');
