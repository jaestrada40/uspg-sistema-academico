import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '../src/server/prismaClient';
import { INITIAL_CAREERS, INITIAL_CLASSROOMS, INITIAL_COURSES, INITIAL_CYCLES, INITIAL_ENROLLMENTS, INITIAL_GRADES, INITIAL_SECTIONS, INITIAL_STUDENTS, INITIAL_TEACHERS } from '../src/data/mockData';

if (process.env.NODE_ENV === 'production') {
  throw new Error('La semilla de demostración no puede ejecutarse en producción. Provisiona cuentas iniciales con credenciales únicas.');
}

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
  if (normalized.endsWith('@sistemas.uspg.edu.gt')) return 'SISTEMAS';
  if (normalized.endsWith('@biblioteca.uspg.edu.gt')) return 'BIBLIOTECA';
  if (normalized.endsWith('@parqueo.uspg.edu.gt')) return 'PARQUEO';
  if (normalized.endsWith('@eventos.uspg.edu.gt')) return 'EVENTOS';
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
  {
    id: 'USR-SYS-001', name: 'Soporte de Sistemas USPG', email: 'sistemas@sistemas.uspg.edu.gt', role: roleFromInstitutionalEmail('sistemas@sistemas.uspg.edu.gt'),
    carnetOrCode: 'SYS-0001', phone: '+502 2326-5555', department: 'Tecnología y Sistemas',
  },
  {
    id: 'USR-BIB-001', name: 'Ana López', email: 'alopez@biblioteca.uspg.edu.gt', role: 'BIBLIOTECA',
    carnetOrCode: 'BIB-0001', phone: '+502 2326-7001', department: 'Biblioteca Central',
  },
  {
    id: 'USR-PAR-001', name: 'Roberto Paz', email: 'rpaz@parqueo.uspg.edu.gt', role: 'PARQUEO',
    carnetOrCode: 'PAR-0001', phone: '+502 2326-7002', department: 'Control de Parqueo',
  },
  {
    id: 'USR-EVT-001', name: 'Sandra Ruiz', email: 'sruiz@eventos.uspg.edu.gt', role: 'EVENTOS',
    carnetOrCode: 'EVT-0001', phone: '+502 2326-7003', department: 'Gestión de Eventos',
  },
  {
    id: 'USR-REG-001', name: 'Marta Solís', email: 'msolis@registro.uspg.edu.gt', role: 'REGISTRO',
    carnetOrCode: 'REG-0001', phone: '+502 2326-7004', department: 'Registro Académico',
  },
  {
    id: 'USR-FIN-001', name: 'Jorge Aguilar', email: 'jaguilar@finanzas.uspg.edu.gt', role: 'FINANZAS',
    carnetOrCode: 'FIN-0001', phone: '+502 2326-7005', department: 'Finanzas',
  },
];

const upsertUser = async (id: string, email: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  const actualId = existing?.id ?? id;
  await prisma.user.upsert({
    where: { id: actualId },
    update: data as Parameters<typeof prisma.user.upsert>[0]['update'],
    create: { id, email, ...data, ...extra } as Parameters<typeof prisma.user.upsert>[0]['create'],
  });
  return actualId;
};

for (const user of demoUsers) {
  await upsertUser(user.id, user.email, user, { passwordHash: hashPassword('Demo123!') });
}

for (const student of INITIAL_STUDENTS) {
  const defaultId = student.carnet === '20230142' ? 'USR-003' : `STU-${student.carnet}`;
  const userData = { name: student.name, email: student.email, role: 'ESTUDIANTE', carnetOrCode: student.carnet, active: student.status === 'Activo' };
  const userId = await upsertUser(defaultId, student.email, userData, { passwordHash: hashPassword('Demo123!') });
  const existingStudent = await prisma.student.findFirst({ where: { email: student.email } });
  const studentCarnet = existingStudent?.carnet ?? student.carnet;
  await prisma.student.upsert({
    where: { carnet: studentCarnet },
    update: { ...student, userId },
    create: { ...student, userId },
  });
}

await prisma.campus.upsert({
  where: { id: 'CAMPUS-CENTRAL' },
  update: { name: 'Campus Central', status: 'Activo' },
  create: { id: 'CAMPUS-CENTRAL', code: 'CC', name: 'Campus Central', status: 'Activo' },
});

for (const teacher of INITIAL_TEACHERS) {
  const defaultId = teacher.code === 'DOC-1042' ? 'USR-002' : `TCH-${teacher.code}`;
  const teacherUserData = { name: teacher.name, email: teacher.email, role: 'DOCENTE', carnetOrCode: teacher.code, active: teacher.status === 'Activo' };
  const userId = await upsertUser(defaultId, teacher.email, teacherUserData, { passwordHash: hashPassword('Demo123!') });
  const existingTeacher = await prisma.teacher.findFirst({ where: { email: teacher.email } });
  const teacherCode = existingTeacher?.code ?? teacher.code;
  const data = { ...teacher, assignedSectionIds: JSON.stringify(teacher.assignedSectionIds), userId, campusId: 'CAMPUS-CENTRAL' };
  await prisma.teacher.upsert({
    where: { code: teacherCode },
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
    update: { ...cycle, startDate: new Date(cycle.startDate), endDate: new Date(cycle.endDate), enrollmentStartDate: new Date(cycle.enrollmentStartDate), enrollmentEndDate: new Date(cycle.enrollmentEndDate), gradeSubmissionDeadline: new Date(cycle.gradeSubmissionDeadline), campusId: 'CAMPUS-CENTRAL' },
    create: { ...cycle, startDate: new Date(cycle.startDate), endDate: new Date(cycle.endDate), enrollmentStartDate: new Date(cycle.enrollmentStartDate), enrollmentEndDate: new Date(cycle.enrollmentEndDate), gradeSubmissionDeadline: new Date(cycle.gradeSubmissionDeadline), campusId: 'CAMPUS-CENTRAL' },
  });
}
for (const classroom of INITIAL_CLASSROOMS) await prisma.classroom.upsert({ where: { id: classroom.id }, update: { ...classroom, campusId: 'CAMPUS-CENTRAL' }, create: { ...classroom, campusId: 'CAMPUS-CENTRAL' } });
for (const section of INITIAL_SECTIONS) {
  const { courseName: _courseName, teacherName: _teacherName, classroomName: _classroomName, ...data } = section;
  await prisma.section.upsert({ where: { id: section.id }, update: { ...data, scheduleDays: JSON.stringify(section.scheduleDays) }, create: { ...data, scheduleDays: JSON.stringify(section.scheduleDays) } });
  await prisma.virtualClassroom.upsert({ where: { sectionId: section.id }, update: {}, create: { sectionId: section.id } });
}
for (const enrollment of INITIAL_ENROLLMENTS) {
  const { studentName: _studentName, courseCode: _courseCode, courseName: _courseName, cycleId: _cycleId, ...data } = enrollment;
  await prisma.enrollment.upsert({ where: { id: enrollment.id }, update: { ...data, enrollmentDate: new Date(enrollment.enrollmentDate) }, create: { ...data, enrollmentDate: new Date(enrollment.enrollmentDate) } });
}
// Create the historical section records required by historical grades. Without
// these rows the FK prevents the grade records from being loaded and the
// curriculum map incorrectly presents completed courses as available.
for (const grade of INITIAL_GRADES) {
  if (!grade.sectionId.startsWith('HIST-')) continue;
  const course = await prisma.course.findUnique({ where: { code: grade.courseCode } });
  if (!course) continue;
  await prisma.section.upsert({
    where: { id: grade.sectionId },
    update: {},
    create: { id: grade.sectionId, code: `${grade.courseCode}-HIST`, scheduleDays: JSON.stringify([]), scheduleTime: '00:00 - 00:00', modality: 'Presencial', jornada: 'Matutina', capacity: 0, enrolledCount: 0, status: 'Cerrada', courseCode: grade.courseCode, teacherId: 'DOC-1042', cycleId: grade.cycleId, classroomId: 'CLR-LAB1' },
  });
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

// Libros de prueba para biblioteca
const sampleBooks = [
  { id: 'BK-001', isbn: '978-0-13-110362-7', title: 'El Lenguaje de Programación C', author: 'Brian W. Kernighan, Dennis M. Ritchie', publisher: 'Prentice Hall', publicationYear: 1988, category: 'Programación', copies: 3 },
  { id: 'BK-002', isbn: '978-0-13-468599-1', title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, category: 'Ingeniería de Software', copies: 2 },
  { id: 'BK-003', isbn: '978-0-596-51774-8', title: 'JavaScript: The Good Parts', author: 'Douglas Crockford', publisher: "O'Reilly Media", publicationYear: 2008, category: 'Programación', copies: 4 },
  { id: 'BK-004', isbn: '978-0-13-235088-4', title: 'Estructura de Datos y Algoritmos', author: 'Thomas H. Cormen', publisher: 'MIT Press', publicationYear: 2009, category: 'Algoritmos', copies: 5 },
  { id: 'BK-005', isbn: '978-0-201-63361-0', title: 'Design Patterns: Elements of Reusable Object-Oriented Software', author: 'Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides', publisher: 'Addison-Wesley', publicationYear: 1994, category: 'Ingeniería de Software', copies: 2 },
  { id: 'BK-006', isbn: '978-0-07-352332-3', title: 'Sistemas Operativos Modernos', author: 'Andrew S. Tanenbaum', publisher: 'Pearson', publicationYear: 2015, category: 'Sistemas Operativos', copies: 3 },
  { id: 'BK-007', isbn: '978-0-321-12521-7', title: 'Domain-Driven Design', author: 'Eric Evans', publisher: 'Addison-Wesley', publicationYear: 2003, category: 'Ingeniería de Software', copies: 2 },
  { id: 'BK-008', isbn: '978-0-13-349906-6', title: 'Fundamentos de Base de Datos', author: 'Abraham Silberschatz', publisher: 'McGraw-Hill', publicationYear: 2019, category: 'Bases de Datos', copies: 4 },
  { id: 'BK-009', isbn: '978-1-491-91205-8', title: 'Learning Python', author: 'Mark Lutz', publisher: "O'Reilly Media", publicationYear: 2013, category: 'Programación', copies: 3 },
  { id: 'BK-010', isbn: '978-0-13-461950-9', title: 'Redes de Computadoras', author: 'Andrew S. Tanenbaum, David J. Wetherall', publisher: 'Pearson', publicationYear: 2012, category: 'Redes', copies: 3 },
];

for (const book of sampleBooks) {
  const { copies: copyCount, ...bookData } = book;
  await prisma.libraryBook.upsert({
    where: { id: bookData.id },
    update: bookData,
    create: bookData,
  });
  for (let i = 1; i <= copyCount; i++) {
    const copyId = `${book.id}-C${i}`;
    await prisma.libraryCopy.upsert({
      where: { id: copyId },
      update: {},
      create: { id: copyId, barcode: `BAR-${book.id}-${i}`, location: `Estante ${book.category.slice(0, 3).toUpperCase()}-${i}`, status: 'DISPONIBLE', condition: 'BUENO', bookId: book.id },
    });
  }
}

// ── Biblioteca: préstamos y reservaciones de prueba ──────────────────────────
const studentUserIds: Record<string, string> = {};
for (const s of INITIAL_STUDENTS.slice(0, 4)) {
  const u = await prisma.user.findFirst({ where: { carnetOrCode: s.carnet } });
  if (u) studentUserIds[s.carnet] = u.id;
}

const loanData = [
  { id: 'LOAN-001', copyId: 'BK-001-C1', carnet: INITIAL_STUDENTS[0].carnet, dueAt: new Date(Date.now() - 3 * 86400000), returnedAt: null as Date | null, status: 'VENCIDO' },
  { id: 'LOAN-002', copyId: 'BK-003-C1', carnet: INITIAL_STUDENTS[0].carnet, dueAt: new Date(Date.now() + 7 * 86400000), returnedAt: null as Date | null, status: 'PRESTADO' },
  { id: 'LOAN-003', copyId: 'BK-004-C1', carnet: INITIAL_STUDENTS[1].carnet, dueAt: new Date(Date.now() + 5 * 86400000), returnedAt: null as Date | null, status: 'PRESTADO' },
  { id: 'LOAN-004', copyId: 'BK-008-C1', carnet: INITIAL_STUDENTS[2].carnet, dueAt: new Date(Date.now() - 10 * 86400000), returnedAt: new Date(Date.now() - 8 * 86400000) as Date | null, status: 'DEVUELTO' },
  { id: 'LOAN-005', copyId: 'BK-002-C1', carnet: INITIAL_STUDENTS[3].carnet, dueAt: new Date(Date.now() + 3 * 86400000), returnedAt: null as Date | null, status: 'PRESTADO' },
];

for (const loan of loanData) {
  const borrowerId = studentUserIds[loan.carnet];
  if (!borrowerId) continue;
  await prisma.libraryCopy.update({ where: { id: loan.copyId }, data: { status: loan.status === 'DEVUELTO' ? 'DISPONIBLE' : loan.status === 'PRESTADO' ? 'PRESTADO' : 'VENCIDO' } }).catch(() => {});
  await prisma.libraryLoan.upsert({
    where: { id: loan.id },
    update: {},
    create: { id: loan.id, copyId: loan.copyId, borrowerId, dueAt: loan.dueAt, returnedAt: loan.returnedAt, status: loan.status, loanedAt: new Date(Date.now() - 14 * 86400000) },
  });
}

const reservationData = [
  { id: 'RES-001', bookId: 'BK-005', carnet: INITIAL_STUDENTS[0].carnet, expiresAt: new Date(Date.now() + 2 * 86400000), status: 'SOLICITADA' },
  { id: 'RES-002', bookId: 'BK-007', carnet: INITIAL_STUDENTS[1].carnet, expiresAt: new Date(Date.now() + 1 * 86400000), status: 'SOLICITADA' },
];

for (const res of reservationData) {
  const userId = studentUserIds[res.carnet];
  if (!userId) continue;
  await prisma.libraryReservation.upsert({
    where: { id: res.id },
    update: {},
    create: { id: res.id, bookId: res.bookId, userId, expiresAt: res.expiresAt, status: res.status },
  });
}

// ── Parqueo: configuración, vehículos, visitas y evento ───────────────────────
await prisma.parkingConfig.upsert({
  where: { id: 1 },
  update: {},
  create: { id: 1, totalCapacity: 200, regularReserve: 20, entry1Name: 'Entrada Principal', entry2Name: 'Entrada Lateral' },
});

const vehicleData = [
  { id: 'VEH-001', plate: 'P123ABC', make: 'Toyota', model: 'Corolla', color: 'Blanco', type: 'AUTOMOVIL', status: 'ACTIVO', accessCode: 'USPG-VEHD01', ownerId: studentUserIds[INITIAL_STUDENTS[0].carnet] },
  { id: 'VEH-002', plate: 'O456DEF', make: 'Honda', model: 'Civic', color: 'Gris', type: 'AUTOMOVIL', status: 'ACTIVO', accessCode: 'USPG-VEHD02', ownerId: studentUserIds[INITIAL_STUDENTS[1].carnet] },
  { id: 'VEH-003', plate: 'M789GHI', make: 'Yamaha', model: 'FZ25', color: 'Negro', type: 'MOTOCICLETA', status: 'ACTIVO', accessCode: 'USPG-VEHD03', ownerId: studentUserIds[INITIAL_STUDENTS[2].carnet] },
];

for (const v of vehicleData) {
  if (!v.ownerId) continue;
  await prisma.parkingVehicle.upsert({ where: { id: v.id }, update: {}, create: v });
}

// Una visita activa (dentro) y dos históricas
if (vehicleData[0].ownerId) {
  await prisma.parkingVisit.upsert({
    where: { id: 'VIS-001' },
    update: {},
    create: { id: 'VIS-001', plate: 'P123ABC', entryGate: 'ENTRADA_1', status: 'DENTRO', vehicleId: 'VEH-001', userId: vehicleData[0].ownerId, enteredAt: new Date(Date.now() - 45 * 60000) },
  });
}
if (vehicleData[1].ownerId) {
  await prisma.parkingVisit.upsert({
    where: { id: 'VIS-002' },
    update: {},
    create: { id: 'VIS-002', plate: 'O456DEF', entryGate: 'ENTRADA_2', status: 'SALIO', vehicleId: 'VEH-002', userId: vehicleData[1].ownerId, enteredAt: new Date(Date.now() - 3 * 3600000), exitedAt: new Date(Date.now() - 1 * 3600000), exitGate: 'SALIDA_1' },
  });
}
if (vehicleData[2].ownerId) {
  await prisma.parkingVisit.upsert({
    where: { id: 'VIS-003' },
    update: {},
    create: { id: 'VIS-003', plate: 'M789GHI', entryGate: 'ENTRADA_1', status: 'SALIO', vehicleId: 'VEH-003', userId: vehicleData[2].ownerId, enteredAt: new Date(Date.now() - 5 * 3600000), exitedAt: new Date(Date.now() - 2 * 3600000), exitGate: 'SALIDA_1' },
  });
}

// Evento de graduación con invitados
const gradEventId = 'EVT-GRAD-001';
await prisma.parkingEvent.upsert({
  where: { id: gradEventId },
  update: {},
  create: { id: gradEventId, name: 'Graduación Ing. Sistemas 2026', organizer: 'Sandra Ruiz', startsAt: new Date(Date.now() + 2 * 86400000), endsAt: new Date(Date.now() + 2 * 86400000 + 4 * 3600000), reservedSpaces: 50, status: 'ACTIVO', createdBy: 'Sandra Ruiz' },
});

const guestData = [
  { id: 'GUE-001', guestName: 'María González', plate: 'G111AAA', accessCode: 'EVT-A1B2C3', status: 'AUTORIZADO' },
  { id: 'GUE-002', guestName: 'Pedro Ramírez', plate: null, accessCode: 'EVT-D4E5F6', status: 'AUTORIZADO' },
  { id: 'GUE-003', guestName: 'Laura Castillo', plate: 'G222BBB', accessCode: 'EVT-G7H8I9', status: 'AUTORIZADO' },
];

for (const g of guestData) {
  await prisma.parkingEventGuest.upsert({ where: { id: g.id }, update: {}, create: { ...g, eventId: gradEventId } });
}

// Alerta de prueba
await prisma.parkingAlert.upsert({
  where: { dedupeKey: 'DEMO-ALERT-001' },
  update: {},
  create: { dedupeKey: 'DEMO-ALERT-001', type: 'OCUPACION', severity: 'MEDIA', message: 'El parqueo alcanzó 80% de ocupación durante el horario pico matutino.', status: 'ACTIVA' },
});

await prisma.$disconnect();
console.log('Base inicial creada. Usuarios demo usan la contraseña Demo123!');
