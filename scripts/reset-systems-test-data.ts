import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { createPrismaClient } from '../src/server/prismaClient';
import { SYSTEMS_CURRICULUM } from '../src/data/systemsCurriculum';

const prisma = createPrismaClient();
const password = 'Demo123!';
const hashPassword = () => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const areaFor = (code: string) => code.startsWith('3CT') ? 'Tecnología' : code.startsWith('3MA') || code.startsWith('3FS') ? 'Ciencias Básicas' : code.startsWith('3CE') || code.startsWith('3OD') ? 'Gestión' : 'Formación General';
const courses = new Map(SYSTEMS_CURRICULUM.map((course) => [course.code, course]));

const history = [
  ['CYC-2022-1', '3CE0058', 73], ['CYC-2022-1', '3CT0090', 92], ['CYC-2022-1', '3FS0011', 90], ['CYC-2022-1', '3MA0044', 79], ['CYC-2022-1', '3SU0001', 3], ['CYC-2022-1', '3SU0005', 0],
  ['CYC-2022-2', '3CE0101', 23], ['CYC-2022-2', '3CT0100', 42], ['CYC-2022-2', '3CT0101', 19], ['CYC-2022-2', '3FS0012', 32], ['CYC-2022-2', '3MA0042', 28], ['CYC-2022-2', '3OD0065', 25], ['CYC-2022-2', '3SU0002', 18],
  ['CYC-2024-2', '3CJ0001', 79], ['CYC-2024-2', '3CT0100', 98], ['CYC-2024-2', '3FS0012', 92], ['CYC-2024-2', '3MA0042', 92], ['CYC-2024-2', '3OD0065', 90], ['CYC-2024-2', '3SU0002', 97], ['CYC-2024-2', '3SU0004', 93],
  ['CYC-2025-1', '3CT0102', 93], ['CYC-2025-1', '3ET0003', 97], ['CYC-2025-1', '3FS0013', 99], ['CYC-2025-1', '3FS0016', 78], ['CYC-2025-1', '3HI0001', 98], ['CYC-2025-1', '3LI0001', 89], ['CYC-2025-1', '3MA0043', 98], ['CYC-2025-1', '3SU0001', 100], ['CYC-2025-1', '3SU0003', 95], ['CYC-2025-1', '3SU0005', 94],
  ['CYC-2025-2', '3CT0108', 89], ['CYC-2025-2', '3FS0014', 87], ['CYC-2025-2', '3FS0015', 93], ['CYC-2025-2', '3HI0002', 95], ['CYC-2025-2', '3LI0002', 96], ['CYC-2025-2', '3MA0017', 79], ['CYC-2025-2', '3MA0028', 96], ['CYC-2025-2', '3SU0006', 98],
  ['CYC-2026-1', '3CT0103', 88], ['CYC-2026-1', '3CT0109', 90], ['CYC-2026-1', '3CT0110', 95], ['CYC-2026-1', '3CT0111', 95], ['CYC-2026-1', '3CT0114', 99], ['CYC-2026-1', '3IN0001', 92], ['CYC-2026-1', '3MA0029', 100],
] as const;
const current = [
  ['3CT0112', ['Sábado'], '07:45 - 10:00'], ['3CE0101', ['Sábado'], '10:00 - 13:00'], ['3CT0113', ['Sábado'], '13:45 - 16:45'], ['3IN0002', ['Viernes'], '18:00 - 20:15'],
] as const;
const cycles = [
  ['CYC-2022-1', 2022, 'Primer Semestre 2022', '2022-01-10', '2022-06-04', false], ['CYC-2022-2', 2022, 'Segundo Semestre 2022', '2022-07-11', '2022-11-26', false], ['CYC-2024-2', 2024, 'Segundo Semestre 2024', '2024-07-15', '2024-11-30', false], ['CYC-2025-1', 2025, 'Primer Semestre 2025', '2025-01-13', '2025-06-07', false], ['CYC-2025-2', 2025, 'Segundo Semestre 2025', '2025-07-14', '2025-11-29', false], ['CYC-2026-1', 2026, 'Primer Semestre 2026', '2026-01-12', '2026-06-06', false], ['CYC-2026-2', 2026, 'Segundo Semestre 2026 · Campus Central', '2026-07-13', '2026-11-28', true],
] as const;

const deleteAll = async () => {
  await prisma.parkingOfflineOperation.deleteMany(); await prisma.parkingAccessAttempt.deleteMany(); await prisma.parkingVisit.deleteMany(); await prisma.parkingAlert.deleteMany(); await prisma.parkingEventGuest.deleteMany(); await prisma.parkingEvent.deleteMany(); await prisma.parkingVehicle.deleteMany(); await prisma.parkingConfig.deleteMany();
  await prisma.libraryReservation.deleteMany(); await prisma.libraryLoan.deleteMany(); await prisma.libraryCopy.deleteMany(); await prisma.libraryBook.deleteMany();
  await prisma.emailOutbox.deleteMany(); await prisma.appNotification.deleteMany(); await prisma.recoveryExam.deleteMany(); await prisma.zoneActivityGrade.deleteMany(); await prisma.zoneActivity.deleteMany(); await prisma.attendanceRecord.deleteMany(); await prisma.attendanceSession.deleteMany();
  await prisma.transferProof.deleteMany(); await prisma.payment.deleteMany(); await prisma.financialAdjustment.deleteMany(); await prisma.financialCharge.deleteMany(); await prisma.paymentAgreement.deleteMany(); await prisma.careerFee.deleteMany();
  await prisma.enrollmentDocument.deleteMany(); await prisma.studentServiceRequest.deleteMany(); await prisma.gradeRecord.deleteMany(); await prisma.enrollment.deleteMany(); await prisma.virtualClassroom.deleteMany(); await prisma.section.deleteMany();
  await prisma.coursePrerequisite.deleteMany(); await prisma.curriculumPlanCourse.deleteMany(); await prisma.assistantMessage.deleteMany(); await prisma.assistantConversation.deleteMany(); await prisma.auditLog.deleteMany(); await prisma.passwordResetToken.deleteMany(); await prisma.mfaChallenge.deleteMany(); await prisma.session.deleteMany();
  await prisma.student.deleteMany(); await prisma.teacher.deleteMany(); await prisma.course.deleteMany(); await prisma.curriculumPlan.deleteMany(); await prisma.campus.deleteMany(); await prisma.academicCycle.deleteMany(); await prisma.classroom.deleteMany(); await prisma.career.deleteMany(); await prisma.user.deleteMany(); await prisma.institutionConfig.deleteMany();
};
const partsFor = (score: number) => { const zona = Math.min(30, score); const parcial = Math.min(20, Math.max(0, score - zona)); const segundoParcial = Math.min(20, Math.max(0, score - zona - parcial)); return { zona, parcial, segundoParcial, final: Math.max(0, score - zona - parcial - segundoParcial) }; };

await deleteAll();
await prisma.$transaction(async (tx) => {
  await tx.institutionConfig.create({ data: { id: 1, name: 'Universidad de San Pablo de Guatemala', shortName: 'USPG', logoDataUrl: null } });
  await tx.campus.createMany({ data: [{ id: 'CAMPUS-CENTRAL', code: 'CC', name: 'Campus Central', address: 'Ciudad de Guatemala', status: 'Activo' }, { id: 'CAMPUS-ESCUINTLA', code: 'ESC', name: 'Campus Escuintla', address: 'Escuintla', status: 'Activo' }] });
  await tx.career.create({ data: { code: 'CAR-SIS', name: 'Ingeniería en Sistemas y Ciencias de la Computación', faculty: 'Escuela de Ingeniería', durationSemesters: 8, totalCredits: 200, modality: 'Presencial', status: 'Activo', degreeType: 'Ingeniería' } });
  await tx.curriculumPlan.create({ data: { id: 'PLAN-SIS2026B-CC', code: 'SIS2026B-CC', name: 'Ingeniería en Sistemas y Ciencias de la Computación', version: '2026B', effectiveFrom: new Date('2026-07-01'), status: 'Activo', totalCredits: 200, durationSemesters: 8, careerId: 'CAR-SIS', campusId: 'CAMPUS-CENTRAL' } });
  await tx.course.createMany({ data: SYSTEMS_CURRICULUM.map((course) => ({ code: course.code, name: course.name, credits: course.credits, semester: course.semester, theoreticalHours: course.credits, practicalHours: 0, area: areaFor(course.code), status: 'Activo', careerId: 'CAR-SIS' })) });
  await tx.curriculumPlanCourse.createMany({ data: SYSTEMS_CURRICULUM.map((course) => ({ planId: 'PLAN-SIS2026B-CC', courseCode: course.code, semester: course.semester })) });
  await tx.coursePrerequisite.createMany({ data: SYSTEMS_CURRICULUM.flatMap((course) => (course.prerequisites || []).map((prerequisiteCode) => ({ courseCode: course.code, prerequisiteCode }))) });
  await tx.academicCycle.createMany({ data: cycles.map(([id, year, name, start, end, isCurrent]) => ({ id, year, name, startDate: new Date(start), endDate: new Date(end), enrollmentStartDate: new Date(start), enrollmentEndDate: new Date(start), gradeSubmissionDeadline: new Date(end), status: isCurrent ? 'En curso' : 'Finalizado', isCurrent })) });
  await tx.classroom.createMany({ data: [{ id: 'AULA-CC-101', code: 'CC-101', building: 'Campus Central', capacity: 35, type: 'Teórica', status: 'Disponible', hasProjector: true }, { id: 'LAB-CC-01', code: 'CC-LAB-01', building: 'Campus Central', capacity: 30, type: 'Laboratorio', status: 'Disponible', hasProjector: true }, { id: 'AULA-ESC-101', code: 'ESC-101', building: 'Campus Escuintla', capacity: 35, type: 'Teórica', status: 'Disponible', hasProjector: true }] });
  await tx.user.createMany({ data: [
    { id: 'USR-ADMIN-001', name: 'Administrador USPG', email: 'admin@administrador.uspg.edu.gt', role: 'ADMIN', carnetOrCode: 'ADM-0001', department: 'Administración', active: true, mustChangePassword: false, passwordHash: hashPassword() },
    { id: 'USR-DOC-001', name: 'Luis Mena', email: 'luismena@catedratico.uspg.edu.gt', role: 'DOCENTE', carnetOrCode: 'DOC-1042', department: 'Escuela de Ingeniería', active: true, mustChangePassword: false, passwordHash: hashPassword() },
    { id: 'USR-EST-001', name: 'Javier Augusto Estrada Gordillo', email: 'jaestradag@alumno.uspg.edu.gt', role: 'ESTUDIANTE', carnetOrCode: '2200138', department: 'Ingeniería en Sistemas y Ciencias de la Computación', active: true, mustChangePassword: false, passwordHash: hashPassword() },
    { id: 'USR-SYS-001', name: 'Soporte de Sistemas USPG', email: 'sistemas@sistemas.uspg.edu.gt', role: 'SISTEMAS', carnetOrCode: 'SYS-0001', department: 'Tecnología y Sistemas', active: true, mustChangePassword: false, passwordHash: hashPassword() },
  ] });
  await tx.teacher.create({ data: { code: 'DOC-1042', name: 'Luis Mena', email: 'luismena@catedratico.uspg.edu.gt', phone: '+502 5512-3489', specialty: 'Ingeniería de Software', academicDegree: 'Ingeniero', assignedSectionIds: '[]', status: 'Activo', maxHoursPerWeek: 40, userId: 'USR-DOC-001' } });
  await tx.student.create({ data: { carnet: '2200138', name: 'Javier Augusto Estrada Gordillo', email: 'jaestradag@alumno.uspg.edu.gt', phone: '+502 0000-0000', careerId: 'CAR-SIS', careerName: 'Ingeniería en Sistemas y Ciencias de la Computación', entryCycle: 'CYC-2022-1', jornada: 'Sabatina', status: 'Activo', gpa: 90, creditsEarned: 0, totalCreditsRequired: 200, userId: 'USR-EST-001', campusId: 'CAMPUS-CENTRAL', planId: 'PLAN-SIS2026B-CC' } });
  for (const [cycleId, courseCode, score] of history) {
    const sectionId = `HIST-${courseCode}-${cycleId}`;
    const passed = score >= 61;
    await tx.section.create({ data: { id: sectionId, code: `${courseCode}-A`, scheduleDays: '[]', scheduleTime: '00:00 - 00:00', modality: 'Presencial', jornada: 'Sabatina', capacity: 0, enrolledCount: 0, status: 'Cerrada', courseCode, teacherId: 'DOC-1042', cycleId, classroomId: 'AULA-CC-101', gradeActStatus: 'CERRADA' } });
    await tx.gradeRecord.create({ data: { id: `GRD-${courseCode}-${cycleId}`, studentCarnet: '2200138', sectionId, ...partsFor(score), total: score, status: passed ? 'Aprobado' : 'Reprobado', isPublished: true } });
  }
  for (const [courseCode, days, time] of current) {
    const sectionId = `SEC-${courseCode}-2026B`;
    await tx.section.create({ data: { id: sectionId, code: `${courseCode}-A`, scheduleDays: JSON.stringify(days), scheduleTime: time, modality: 'Presencial', jornada: 'Sabatina', capacity: 30, enrolledCount: 1, status: 'Abierta', courseCode, teacherId: 'DOC-1042', cycleId: 'CYC-2026-2', classroomId: 'LAB-CC-01' } });
    await tx.enrollment.create({ data: { studentCarnet: '2200138', sectionId, status: 'Inscrito' } });
    await tx.virtualClassroom.create({ data: { sectionId } });
  }
  const approved = new Set(history.filter(([, , score]) => score >= 61).map(([, courseCode]) => courseCode));
  const creditsEarned = [...approved].reduce((sum, courseCode) => sum + (courses.get(courseCode)?.credits || 0), 0);
  await tx.student.update({ where: { carnet: '2200138' }, data: { creditsEarned } });
});
await prisma.$disconnect();
console.log('Base de pruebas limpia: 1 carrera, 2 campus, 4 usuarios, historial y matrícula de Sistemas.');
