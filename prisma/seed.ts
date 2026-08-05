import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '../src/server/prismaClient';
import { INITIAL_CAREERS, INITIAL_CLASSROOMS, INITIAL_COURSES, INITIAL_CYCLES, INITIAL_ENROLLMENTS, INITIAL_GRADES, INITIAL_SECTIONS, INITIAL_STUDENTS, INITIAL_TEACHERS } from '../src/data/mockData';

const prisma = createPrismaClient();

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const roleFromInstitutionalEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith('@alumno.uspg.edu.gt')) return 'ESTUDIANTE';
  if (normalized.endsWith('@catedratico.uspg.edu.gt')) return 'DOCENTE';
  if (normalized.endsWith('@administrador.uspg.edu.gt')) return 'ADMIN';
  throw new Error(`Dominio institucional no reconocido: ${email}`);
};

const demoUsers = [
  {
    id: 'USR-001', name: 'Ing. Carlos Mendoza', email: 'cmendoza@administrador.uspg.edu.gt', role: roleFromInstitutionalEmail('cmendoza@administrador.uspg.edu.gt'),
    carnetOrCode: 'ADM-2020', phone: '+502 2326-5555', department: 'Dirección Académica Central',
  },
  {
    id: 'USR-002', name: 'Luis Mena', email: 'luismena@catedratico.uspg.edu.gt', role: roleFromInstitutionalEmail('luismena@catedratico.uspg.edu.gt'),
    carnetOrCode: 'DOC-1042', phone: '+502 5512-3489', department: 'Facultad de Ingeniería y Tecnologías',
  },
  {
    id: 'USR-003', name: 'Javier Estrada', email: 'jaestradag@alumno.uspg.edu.gt', role: roleFromInstitutionalEmail('jaestradag@alumno.uspg.edu.gt'),
    carnetOrCode: '20230142', phone: '+502 4125-8890', department: 'Ingeniería en Tecnologías de la Información',
  },
];

for (const user of demoUsers) {
  await prisma.user.upsert({
    where: { id: user.id },
    update: user,
    create: { ...user, passwordHash: hashPassword('Demo123!') },
  });
}

for (const student of INITIAL_STUDENTS) {
  const userId = student.carnet === '20230142' ? 'USR-003' : `STU-${student.carnet}`;
  await prisma.user.upsert({
    where: { id: userId },
    update: { name: student.name, email: student.email, role: 'ESTUDIANTE', carnetOrCode: student.carnet, active: student.status === 'Activo' },
    create: { id: userId, name: student.name, email: student.email, role: roleFromInstitutionalEmail(student.email), carnetOrCode: student.carnet, active: student.status === 'Activo', passwordHash: hashPassword('Demo123!') },
  });
  await prisma.student.upsert({
    where: { carnet: student.carnet },
    update: { ...student, userId },
    create: { ...student, userId },
  });
}

for (const teacher of INITIAL_TEACHERS) {
  const userId = teacher.code === 'DOC-1042' ? 'USR-002' : `TCH-${teacher.code}`;
  const data = { ...teacher, assignedSectionIds: JSON.stringify(teacher.assignedSectionIds), userId };
  await prisma.user.upsert({
    where: { id: userId },
    update: { name: teacher.name, email: teacher.email, role: 'DOCENTE', carnetOrCode: teacher.code, active: teacher.status === 'Activo' },
    create: { id: userId, name: teacher.name, email: teacher.email, role: roleFromInstitutionalEmail(teacher.email), carnetOrCode: teacher.code, active: teacher.status === 'Activo', passwordHash: hashPassword('Demo123!') },
  });
  await prisma.teacher.upsert({
    where: { code: teacher.code },
    update: data,
    create: data,
  });
}

for (const career of INITIAL_CAREERS) {
  const { studentCount: _studentCount, courseCount: _courseCount, ...data } = career;
  await prisma.career.upsert({ where: { code: career.code }, update: data, create: data });
}

for (const course of INITIAL_COURSES) {
  const { prerequisiteCodes: _prerequisiteCodes, careerName: _careerName, ...data } = course;
  await prisma.course.upsert({ where: { code: course.code }, update: data, create: data });
}

for (const cycle of INITIAL_CYCLES) {
  await prisma.academicCycle.upsert({
    where: { id: cycle.id },
    update: { ...cycle, startDate: new Date(cycle.startDate), endDate: new Date(cycle.endDate), enrollmentStartDate: new Date(cycle.enrollmentStartDate), enrollmentEndDate: new Date(cycle.enrollmentEndDate), gradeSubmissionDeadline: new Date(cycle.gradeSubmissionDeadline) },
    create: { ...cycle, startDate: new Date(cycle.startDate), endDate: new Date(cycle.endDate), enrollmentStartDate: new Date(cycle.enrollmentStartDate), enrollmentEndDate: new Date(cycle.enrollmentEndDate), gradeSubmissionDeadline: new Date(cycle.gradeSubmissionDeadline) },
  });
}
for (const classroom of INITIAL_CLASSROOMS) await prisma.classroom.upsert({ where: { id: classroom.id }, update: classroom, create: classroom });
for (const section of INITIAL_SECTIONS) {
  const { courseName: _courseName, teacherName: _teacherName, classroomName: _classroomName, ...data } = section;
  await prisma.section.upsert({ where: { id: section.id }, update: { ...data, scheduleDays: JSON.stringify(section.scheduleDays) }, create: { ...data, scheduleDays: JSON.stringify(section.scheduleDays) } });
  await prisma.virtualClassroom.upsert({ where: { sectionId: section.id }, update: {}, create: { sectionId: section.id } });
}
for (const enrollment of INITIAL_ENROLLMENTS) {
  const { studentName: _studentName, courseCode: _courseCode, courseName: _courseName, cycleId: _cycleId, ...data } = enrollment;
  await prisma.enrollment.upsert({ where: { id: enrollment.id }, update: { ...data, enrollmentDate: new Date(enrollment.enrollmentDate) }, create: { ...data, enrollmentDate: new Date(enrollment.enrollmentDate) } });
}
for (const grade of INITIAL_GRADES) {
  const { studentName: _studentName, courseCode: _courseCode, courseName: _courseName, cycleId: _cycleId, ...data } = grade;
  const [student, section] = await Promise.all([prisma.student.findUnique({ where: { carnet: grade.studentCarnet } }), prisma.section.findUnique({ where: { id: grade.sectionId } })]);
  if (!student || !section) continue;
  await prisma.gradeRecord.upsert({ where: { id: grade.id }, update: data, create: data });
}

const initialCharges = [
  { id: 'FIN-001', studentCarnet: '20230142', concept: 'Mensualidad julio 2026', amount: 1200, dueDate: new Date('2026-07-10'), cycleId: 'CYC-2026-1', status: 'PAGADO' },
  { id: 'FIN-002', studentCarnet: '20230142', concept: 'Mensualidad agosto 2026', amount: 1200, dueDate: new Date('2026-08-10'), cycleId: 'CYC-2026-1', status: 'PENDIENTE' },
  { id: 'FIN-003', studentCarnet: '20240311', concept: 'Mensualidad julio 2026', amount: 1200, dueDate: new Date('2026-07-10'), cycleId: 'CYC-2026-1', status: 'PENDIENTE' },
];
for (const charge of initialCharges) {
  if (await prisma.student.findUnique({ where: { carnet: charge.studentCarnet } })) {
    await prisma.financialCharge.upsert({ where: { id: charge.id }, update: charge, create: charge });
  }
}
await prisma.payment.upsert({
  where: { id: 'PAY-001' },
  update: {},
  create: { id: 'PAY-001', receiptNumber: 'REC-2026-DEMO001', amount: 1200, method: 'TRANSFERENCIA', reference: 'TRX-DEMO-001', registeredBy: 'Ing. Carlos Mendoza', studentCarnet: '20230142', chargeId: 'FIN-001', paidAt: new Date('2026-07-08') },
});
await prisma.payment.upsert({
  where: { id: 'PAY-002' },
  update: {},
  create: { id: 'PAY-002', receiptNumber: 'REC-2026-DEMO002', amount: 500, method: 'EFECTIVO', registeredBy: 'Ing. Carlos Mendoza', studentCarnet: '20240311', chargeId: 'FIN-003', paidAt: new Date('2026-07-09') },
});

for (const course of INITIAL_COURSES) {
  await prisma.coursePrerequisite.deleteMany({ where: { courseCode: course.code } });
  if (course.prerequisiteCodes.length) {
    await prisma.coursePrerequisite.createMany({
      data: course.prerequisiteCodes.map((prerequisiteCode) => ({ courseCode: course.code, prerequisiteCode })),
    });
  }
}

const logoPath = '/Users/javierestrada/Downloads/logou.webp';
const logoDataUrl = existsSync(logoPath)
  ? `data:image/webp;base64,${readFileSync(logoPath).toString('base64')}`
  : null;

await prisma.institutionConfig.upsert({
  where: { id: 1 },
  update: logoDataUrl ? { logoDataUrl } : {},
  create: {
    id: 1,
    name: 'Universidad de San Pablo de Guatemala',
    shortName: 'USPG',
    logoDataUrl,
  },
});

await prisma.$disconnect();
console.log('Base inicial creada. Usuarios demo usan la contraseña Demo123!');
