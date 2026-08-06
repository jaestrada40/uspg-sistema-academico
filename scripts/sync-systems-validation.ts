import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { createPrismaClient } from '../src/server/prismaClient';
import { SYSTEMS_CURRICULUM } from '../src/data/systemsCurriculum';

const prisma = createPrismaClient();
const officialCodes = new Set(SYSTEMS_CURRICULUM.map((course) => course.code));
const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const areaFor = (code: string) => code.startsWith('3CT') ? 'Tecnología' : code.startsWith('3MA') || code.startsWith('3FS') ? 'Ciencias Básicas' : code.startsWith('3CE') || code.startsWith('3OD') ? 'Gestión' : 'Formación General';
const currentCourses = ['3CE0101', '3CT0112', '3CT0113', '3IN0002'];
const currentSchedules: Record<string, { days: string[]; time: string }> = {
  '3CT0112': { days: ['Sábado'], time: '07:45 - 10:00' },
  '3CE0101': { days: ['Sábado'], time: '10:00 - 13:00' },
  '3CT0113': { days: ['Sábado'], time: '13:45 - 16:45' },
  '3IN0002': { days: ['Viernes'], time: '18:00 - 20:15' },
};
const priorGrades = [
  ['3CT0110', 95], ['3CT0111', 95], ['3IN0001', 92],
] as const;
const validationPassword = process.env.VALIDATION_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'Demo123!' : '');
if (!validationPassword) throw new Error('VALIDATION_PASSWORD es obligatoria al sincronizar datos de validación en producción.');

await prisma.$transaction(async (tx) => {
  await tx.campus.upsert({ where: { code: 'CC' }, update: { name: 'Campus Central', status: 'Activo' }, create: { id: 'CAMPUS-CENTRAL', code: 'CC', name: 'Campus Central', status: 'Activo' } });
  await tx.career.update({ where: { code: 'CAR-ITI' }, data: { name: 'Ingeniería en Sistemas y Ciencias de la Computación', durationSemesters: 8, totalCredits: 200, degreeType: 'Ingeniería', modality: 'Presencial' } });
  await tx.course.updateMany({ where: { careerId: 'CAR-ITI', code: { notIn: [...officialCodes] } }, data: { status: 'Migrado' } });
  for (const course of SYSTEMS_CURRICULUM) {
    await tx.course.upsert({ where: { code: course.code }, update: { name: course.name, credits: course.credits, semester: course.semester, theoreticalHours: course.credits, practicalHours: 0, area: areaFor(course.code), status: 'Activo', careerId: 'CAR-ITI' }, create: { code: course.code, name: course.name, credits: course.credits, semester: course.semester, theoreticalHours: course.credits, practicalHours: 0, area: areaFor(course.code), status: 'Activo', careerId: 'CAR-ITI' } });
    await tx.coursePrerequisite.deleteMany({ where: { courseCode: course.code } });
    if (course.prerequisites?.length) await tx.coursePrerequisite.createMany({ data: course.prerequisites.map((prerequisiteCode) => ({ courseCode: course.code, prerequisiteCode })) });
  }
  await tx.curriculumPlan.upsert({ where: { code: 'SIS-2026B-CC' }, update: { name: 'Pensum Ingeniería en Sistemas 2026B', version: '2026B', effectiveFrom: new Date('2026-07-01'), status: 'Activo', totalCredits: 200, durationSemesters: 8, careerId: 'CAR-ITI' }, create: { id: 'PLAN-SIS-2026B', code: 'SIS-2026B-CC', name: 'Pensum Ingeniería en Sistemas 2026B', version: '2026B', effectiveFrom: new Date('2026-07-01'), status: 'Activo', totalCredits: 200, durationSemesters: 8, careerId: 'CAR-ITI' } });
  await tx.curriculumPlanCourse.deleteMany({ where: { planId: 'PLAN-SIS-2026B' } });
  await tx.curriculumPlanCourse.createMany({ data: SYSTEMS_CURRICULUM.map((course) => ({ planId: 'PLAN-SIS-2026B', courseCode: course.code, semester: course.semester })) });

  const studentUser = await tx.user.findUnique({ where: { email: 'jaestradag@alumno.uspg.edu.gt' } });
  if (!studentUser) throw new Error('No se encontró el usuario estudiante jestradag@alumno.uspg.edu.gt');
  const existingStudent = await tx.student.findUnique({ where: { userId: studentUser.id } });
  if (!existingStudent) throw new Error('No se encontró el expediente del estudiante.');
  await tx.user.update({ where: { id: studentUser.id }, data: { name: 'Javier Augusto Estrada Gordillo', carnetOrCode: '2200138', department: 'Ingeniería en Sistemas y Ciencias de la Computación', active: true } });
  if (existingStudent.carnet !== '2200138') await tx.student.update({ where: { carnet: existingStudent.carnet }, data: { carnet: '2200138' } });
  await tx.student.update({ where: { carnet: '2200138' }, data: { name: 'Javier Augusto Estrada Gordillo', email: 'jaestradag@alumno.uspg.edu.gt', careerId: 'CAR-ITI', careerName: 'Ingeniería en Sistemas y Ciencias de la Computación', totalCreditsRequired: 200, campusId: 'CAMPUS-CENTRAL', planId: 'PLAN-SIS-2026B', status: 'Activo', jornada: 'Sabatina' } });

  await tx.user.upsert({ where: { email: 'sistemas@sistemas.uspg.edu.gt' }, update: { name: 'Soporte de Sistemas USPG', role: 'SISTEMAS', carnetOrCode: 'SYS-0001', department: 'Tecnología y Sistemas', active: true }, create: { id: 'USR-SYS-001', name: 'Soporte de Sistemas USPG', email: 'sistemas@sistemas.uspg.edu.gt', role: 'SISTEMAS', carnetOrCode: 'SYS-0001', department: 'Tecnología y Sistemas', active: true, mustChangePassword: true, passwordHash: hashPassword('Demo123!') } });
  await tx.user.updateMany({ where: { email: { in: ['cmendoza@administrador.uspg.edu.gt', 'luismena@catedratico.uspg.edu.gt', 'jaestradag@alumno.uspg.edu.gt', 'sistemas@sistemas.uspg.edu.gt'] } }, data: { passwordHash: hashPassword(validationPassword), mustChangePassword: false, active: true } });

  await tx.academicCycle.updateMany({ where: { id: 'CYC-2026-1' }, data: { status: 'Finalizado', isCurrent: false } });
  await tx.academicCycle.update({ where: { id: 'CYC-2026-2' }, data: { name: 'Segundo Semestre 2026 · Campus Central', startDate: new Date('2026-07-13'), endDate: new Date('2026-11-28'), enrollmentStartDate: new Date('2026-06-15'), enrollmentEndDate: new Date('2026-07-08'), gradeSubmissionDeadline: new Date('2026-12-08'), status: 'En curso', isCurrent: true } });

  await tx.enrollment.deleteMany({ where: { studentCarnet: '2200138', section: { courseCode: { notIn: [...officialCodes] } } } });
  await tx.gradeRecord.deleteMany({ where: { studentCarnet: '2200138', section: { courseCode: { notIn: [...officialCodes] } } } });
  const classroom = await tx.classroom.findFirst({ where: { status: 'Disponible' }, orderBy: { code: 'asc' } });
  if (!classroom) throw new Error('No existe un aula disponible.');
  for (const [courseCode, score] of priorGrades) {
    const sectionId = `HIST-${courseCode}-2026A`;
    await tx.section.upsert({ where: { id: sectionId }, update: {}, create: { id: sectionId, code: `${courseCode}-A-2026A`, scheduleDays: JSON.stringify([]), scheduleTime: '00:00 - 00:00', modality: 'Presencial', jornada: 'Sabatina', capacity: 0, enrolledCount: 0, status: 'Cerrada', courseCode, teacherId: 'DOC-1042', cycleId: 'CYC-2026-1', classroomId: classroom.id } });
    await tx.gradeRecord.upsert({ where: { studentCarnet_sectionId: { studentCarnet: '2200138', sectionId } }, update: { zona: 30, parcial: 20, segundoParcial: 20, final: score - 70, total: score, status: 'Aprobado', isPublished: true }, create: { id: `GRD-${courseCode}-2026A`, student: { connect: { carnet: '2200138' } }, section: { connect: { id: sectionId } }, zona: 30, parcial: 20, segundoParcial: 20, final: score - 70, total: score, status: 'Aprobado', isPublished: true } });
  }
  for (const courseCode of currentCourses) {
    const sectionId = `SEC-${courseCode}-2026B-A`;
    const schedule = currentSchedules[courseCode];
    await tx.section.upsert({ where: { id: sectionId }, update: { status: 'Abierta', teacherId: 'DOC-1042', cycleId: 'CYC-2026-2', scheduleDays: JSON.stringify(schedule.days), scheduleTime: schedule.time }, create: { id: sectionId, code: `${courseCode}-A-2026B`, scheduleDays: JSON.stringify(schedule.days), scheduleTime: schedule.time, modality: 'Presencial', jornada: 'Sabatina', capacity: 30, enrolledCount: 0, status: 'Abierta', courseCode, teacherId: 'DOC-1042', cycleId: 'CYC-2026-2', classroomId: classroom.id } });
    await tx.enrollment.upsert({ where: { studentCarnet_sectionId: { studentCarnet: '2200138', sectionId } }, update: { status: 'Inscrito' }, create: { studentCarnet: '2200138', sectionId, status: 'Inscrito' } });
    await tx.section.update({ where: { id: sectionId }, data: { enrolledCount: 1 } });
  }
});
await prisma.$disconnect();
console.log('Datos de validación sincronizados: pensum oficial, estudiante, ciclo 2026B y cuentas de soporte.');
