import 'dotenv/config';
import { createPrismaClient } from '../src/server/prismaClient';
import { SYSTEMS_CURRICULUM } from '../src/data/systemsCurriculum';

const prisma = createPrismaClient();
const officialCodes = new Set(SYSTEMS_CURRICULUM.map((course) => course.code));
const areaFor = (code: string) => code.startsWith('3CT') ? 'Tecnología' : code.startsWith('3MA') || code.startsWith('3FS') ? 'Ciencias Básicas' : code.startsWith('3CE') || code.startsWith('3OD') ? 'Gestión' : 'Formación General';

await prisma.$transaction(async (tx) => {
  await tx.campus.upsert({ where: { code: 'CC' }, update: { name: 'Campus Central', status: 'Activo' }, create: { id: 'CAMPUS-CENTRAL', code: 'CC', name: 'Campus Central', status: 'Activo' } });
  await tx.career.update({ where: { code: 'CAR-ITI' }, data: { name: 'Ingeniería en Sistemas y Ciencias de la Computación', durationSemesters: 8, totalCredits: 200, degreeType: 'Ingeniería' } });
  await tx.course.updateMany({ where: { careerId: 'CAR-ITI', code: { notIn: [...officialCodes] } }, data: { status: 'Migrado' } });
  for (const course of SYSTEMS_CURRICULUM) {
    const data = { code: course.code, name: course.name, credits: course.credits, semester: course.semester, theoreticalHours: course.credits, practicalHours: 0, area: areaFor(course.code), status: 'Activo', careerId: 'CAR-ITI' };
    await tx.course.upsert({ where: { code: course.code }, update: data, create: data });
  }
  for (const course of SYSTEMS_CURRICULUM) {
    await tx.coursePrerequisite.deleteMany({ where: { courseCode: course.code } });
    if (course.prerequisites?.length) await tx.coursePrerequisite.createMany({ data: course.prerequisites.map((prerequisiteCode) => ({ courseCode: course.code, prerequisiteCode })) });
  }
  await tx.curriculumPlan.upsert({ where: { code: 'SIS-2026B-CC' }, update: { name: 'Pensum Ingeniería en Sistemas 2026B', version: '2026B', effectiveFrom: new Date('2026-07-01'), status: 'Activo', totalCredits: 200, durationSemesters: 8, careerId: 'CAR-ITI' }, create: { id: 'PLAN-SIS-2026B', code: 'SIS-2026B-CC', name: 'Pensum Ingeniería en Sistemas 2026B', version: '2026B', effectiveFrom: new Date('2026-07-01'), status: 'Activo', totalCredits: 200, durationSemesters: 8, careerId: 'CAR-ITI' } });
  await tx.curriculumPlanCourse.deleteMany({ where: { planId: 'PLAN-SIS-2026B' } });
  await tx.curriculumPlanCourse.createMany({ data: SYSTEMS_CURRICULUM.map((course) => ({ planId: 'PLAN-SIS-2026B', courseCode: course.code, semester: course.semester })) });
  await tx.student.updateMany({ where: { careerId: 'CAR-ITI' }, data: { careerName: 'Ingeniería en Sistemas y Ciencias de la Computación', totalCreditsRequired: 200, campusId: 'CAMPUS-CENTRAL', planId: 'PLAN-SIS-2026B' } });
});

const totals = await prisma.course.aggregate({ where: { careerId: 'CAR-ITI', status: 'Activo' }, _count: true, _sum: { credits: true }, _max: { semester: true } });
await prisma.$disconnect();
console.log(`Pensum importado: ${totals._count} cursos, ${totals._sum.credits} créditos, ${totals._max.semester} semestres.`);
