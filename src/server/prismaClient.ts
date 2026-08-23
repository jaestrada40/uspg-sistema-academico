import { PrismaClient } from '../generated/prisma/client';

export const createPrismaClient = () => {
  const provider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada.');
  if (provider === 'postgresql' || provider === 'sqlite') return new PrismaClient();
  throw new Error(`DATABASE_PROVIDER no soportado: ${provider}`);
};
