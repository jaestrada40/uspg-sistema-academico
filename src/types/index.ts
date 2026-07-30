export type UserRole = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE' | 'BIBLIOTECA' | 'PARQUEO' | 'EVENTOS';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  carnetOrCode?: string;
  phone?: string;
  department?: string;
  mustChangePassword?: boolean;
}

export type StatusType = 'Activo' | 'Inactivo' | 'Egresado' | 'Suspendido' | 'Aprobado' | 'Reprobado' | 'En curso' | 'Retirado' | 'Planificado' | 'Inscripciones abiertas' | 'Finalizado' | 'Disponible' | 'Cerrado' | 'En espera';

export interface Student {
  carnet: string;
  name: string;
  email: string;
  phone: string;
  careerId: string;
  careerName?: string;
  entryCycle: string;
  jornada: 'Matutina' | 'Vespertina' | 'Nocturna' | 'Sabatina';
  status: 'Activo' | 'Inactivo' | 'Egresado' | 'Suspendido';
  gpa: number; // Promedio general
  creditsEarned: number;
  totalCreditsRequired: number;
  address?: string;
  dpi?: string;
  campusId?: string;
  campusName?: string;
  planId?: string;
  planCode?: string;
  planName?: string;
  planVersion?: string;
}

export interface Teacher {
  code: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  academicDegree: string;
  assignedSectionIds: string[];
  status: 'Activo' | 'Inactivo';
  maxHoursPerWeek: number;
}

export interface Career {
  code: string;
  name: string;
  faculty: string;
  durationSemesters: number;
  totalCredits: number;
  modality: 'Presencial' | 'Virtual' | 'Híbrida';
  status: 'Activo' | 'Inactivo';
  studentCount: number;
  courseCount: number;
  degreeType: 'Licenciatura' | 'Ingeniería' | 'Maestría' | 'Técnico';
}

export interface Course {
  code: string;
  name: string;
  credits: number;
  semester: number;
  careerId: string;
  careerName?: string;
  prerequisiteCodes: string[];
  theoreticalHours: number;
  practicalHours: number;
  area: 'Básica' | 'Especialidad' | 'Humanística' | 'Investigación' | 'Práctica';
  status: 'Activo' | 'Inactivo';
}

export interface AcademicCycle {
  id: string;
  year: number;
  name: string; // e.g. "Primer Semestre 2026"
  startDate: string;
  endDate: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  gradeSubmissionDeadline: string;
  status: 'Planificado' | 'Inscripciones abiertas' | 'En curso' | 'Finalizado';
  isCurrent: boolean;
}

export interface Section {
  id: string;
  code: string; // e.g. "SEC-A"
  courseCode: string;
  courseName?: string;
  teacherId: string;
  teacherName?: string;
  cycleId: string;
  scheduleDays: string[]; // e.g. ["Lun", "Mié"]
  scheduleTime: string; // e.g. "07:00 - 09:00"
  classroomId: string;
  classroomName?: string;
  modality: 'Presencial' | 'Virtual' | 'Híbrida';
  jornada: 'Matutina' | 'Vespertina' | 'Nocturna' | 'Sabatina';
  capacity: number;
  enrolledCount: number;
  status: 'Abierta' | 'Cerrada' | 'Cancelada';
}

export interface Classroom {
  id: string;
  code: string; // e.g. "AULA-102"
  building: string; // e.g. "Edificio Central"
  capacity: number;
  type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual';
  status: 'Disponible' | 'Mantenimiento' | 'Ocupada';
  hasProjector: boolean;
  hasAirConditioning: boolean;
}

export interface Enrollment {
  id: string;
  studentCarnet: string;
  studentName?: string;
  sectionId: string;
  courseCode?: string;
  courseName?: string;
  cycleId: string;
  enrollmentDate: string;
  status: 'Inscrito' | 'Retirado' | 'Completado';
}

export interface GradeRecord {
  id: string;
  studentCarnet: string;
  studentName?: string;
  sectionId: string;
  courseCode: string;
  courseName: string;
  cycleId: string;
  zona: number; // Max 30
  parcial: number; // Primer parcial, max 20
  segundoParcial: number; // Segundo parcial, max 20
  final: number; // Max 30
  recuperacion: number; // 0-100 if applicable
  total: number; // zona + primer parcial + segundo parcial + final, o recuperación
  status: 'Aprobado' | 'Reprobado' | 'En curso' | 'Retirado';
  isPublished: boolean;
  actaStatus?: 'BORRADOR' | 'PUBLICADA' | 'CERRADA';
  gradesPublishedAt?: string;
  gradesClosedAt?: string;
  gradesClosedBy?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'info' | 'warning' | 'success' | 'danger';
  link?: string;
}

export interface AcademicParameters {
  minPassingGrade: number; // 61
  maxCreditLimit: number; // 24
  minAttendancePercentage: number; // 80%
  currentCycleId: string;
  allowGradeEditDays: number;
}

export interface InstitutionConfig {
  name: string;
  shortName: string;
  logoDataUrl: string | null;
  updatedAt?: string;
}
