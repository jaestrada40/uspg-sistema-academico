import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export const createPrismaClient = () => {
  const provider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada.');
  if (provider === 'postgresql') return new PrismaClient({ adapter: new PrismaPg(url) });
  if (provider === 'sqlite') return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  throw new Error(`DATABASE_PROVIDER no soportado: ${provider}`);
};
