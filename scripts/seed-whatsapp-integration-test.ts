import { createPrismaClient } from '../src/server/prismaClient';

const prisma = createPrismaClient();

async function main() {
  await prisma.campus.upsert({
    where: { id: 'CAMPUS-CENTRAL' },
    update: {},
    create: { id: 'CAMPUS-CENTRAL', code: 'CC', name: 'Campus Central', address: 'Ciudad de Guatemala', status: 'Activo' },
  });
  await prisma.career.upsert({
    where: { code: 'CAR-SIS' },
    update: {},
    create: {
      code: 'CAR-SIS',
      name: 'Ingeniería en Sistemas y Ciencias de la Computación',
      faculty: 'Escuela de Ingeniería',
      durationSemesters: 8,
      totalCredits: 200,
      modality: 'Presencial',
      status: 'Activo',
      degreeType: 'Ingeniería',
    },
  });
  await prisma.curriculumPlan.upsert({
    where: { id: 'PLAN-SIS-TEST' },
    update: {},
    create: {
      id: 'PLAN-SIS-TEST',
      code: 'SIS-TEST',
      name: 'Ingeniería en Sistemas y Ciencias de la Computación',
      version: 'TEST',
      effectiveFrom: new Date('2026-01-01'),
      status: 'Activo',
      totalCredits: 200,
      durationSemesters: 8,
      careerId: 'CAR-SIS',
      campusId: 'CAMPUS-CENTRAL',
    },
  });
  console.log('Datos de prueba listos: CAR-SIS + PLAN-SIS-TEST + CAMPUS-CENTRAL');
}

main().finally(() => prisma.$disconnect());
