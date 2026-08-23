import XLSX from 'xlsx';
import type { AppPrisma } from '../types';

export const enrollmentView = (record: any) => ({
  id: record.id,
  studentCarnet: record.studentCarnet,
  studentName: record.student?.name,
  sectionId: record.sectionId,
  courseCode: record.section?.courseCode,
  courseName: record.section?.course?.name,
  cycleId: record.section?.cycleId,
  enrollmentDate: record.enrollmentDate.toISOString().slice(0, 10),
  status: record.status,
});

export const cycleView = (cycle: any) => ({
  ...cycle,
  startDate: cycle.startDate.toISOString().slice(0, 10),
  endDate: cycle.endDate.toISOString().slice(0, 10),
  enrollmentStartDate: cycle.enrollmentStartDate.toISOString().slice(0, 10),
  enrollmentEndDate: cycle.enrollmentEndDate.toISOString().slice(0, 10),
  gradeSubmissionDeadline: cycle.gradeSubmissionDeadline.toISOString().slice(0, 10),
  examStartDate: cycle.examStartDate ? cycle.examStartDate.toISOString().slice(0, 10) : undefined,
  examEndDate: cycle.examEndDate ? cycle.examEndDate.toISOString().slice(0, 10) : undefined,
  campusName: cycle.campus?.name,
  campusCode: cycle.campus?.code,
  campus: undefined,
});

export const studentView = (student: any) => ({
  ...student,
  campusName: student.campus?.name,
  planCode: student.plan?.code,
  planName: student.plan?.name,
  planVersion: student.plan?.version,
  campus: undefined,
  plan: undefined,
});

export const careerView = async (
  prisma: AppPrisma,
  career: { code: string; name: string; faculty: string; durationSemesters: number; totalCredits: number; modality: string; status: string; degreeType: string },
) => ({
  ...career,
  studentCount: await prisma.student.count({ where: { careerId: career.code } }),
  courseCount: await prisma.course.count({ where: { careerId: career.code } }),
});

export const courseView = (course: any) => ({
  code: course.code,
  name: course.name,
  credits: course.credits,
  semester: course.semester,
  careerId: course.careerId,
  careerName: course.career?.name,
  prerequisiteCodes: course.prerequisites?.map((item: any) => item.prerequisiteCode) || [],
  theoreticalHours: course.theoreticalHours,
  practicalHours: course.practicalHours,
  area: course.area,
  status: course.status,
});

export const validatePrerequisites = async (prisma: AppPrisma, courseCode: string, prerequisiteCodes: string[]) => {
  const unique = [...new Set(prerequisiteCodes)];
  if (unique.includes(courseCode)) return 'Un curso no puede ser prerrequisito de sí mismo.';
  const existing = await prisma.course.findMany({ where: { code: { in: unique } }, select: { code: true } });
  if (existing.length !== unique.length) return 'Uno o más prerrequisitos no existen.';
  const edges = await prisma.coursePrerequisite.findMany();
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.courseCode !== courseCode) graph.set(edge.courseCode, [...(graph.get(edge.courseCode) || []), edge.prerequisiteCode]);
  }
  graph.set(courseCode, unique);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string): boolean => {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    for (const prerequisite of graph.get(code) || []) if (visit(prerequisite)) return true;
    visiting.delete(code);
    visited.add(code);
    return false;
  };
  for (const code of graph.keys()) if (visit(code)) return 'Los prerrequisitos crearían una dependencia circular.';
  return null;
};

export const normalizeImportHeader = (value: unknown) =>
  String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');

export const parseCourseImport = (dataUrl: string) => {
  const match = String(dataUrl || '').match(/^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Carga un archivo Excel .xlsx válido.');
  const content = Buffer.from(match[1], 'base64');
  if (content.length > 2 * 1024 * 1024 || content.subarray(0, 2).toString('ascii') !== 'PK') throw new Error('El archivo Excel no es válido o supera 2 MB.');
  const workbook = XLSX.read(content, { type: 'buffer', cellFormula: false, cellHTML: false, bookVBA: false, sheetRows: 2_001 });
  if (workbook.SheetNames.length > 10) throw new Error('El archivo supera el número de hojas permitido.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) throw new Error('El archivo no contiene hojas.');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r > 2_000 || range.e.c > 49) throw new Error('El archivo supera los límites de filas o columnas permitidos.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  const aliases: Record<string, string> = { codigo: 'code', nombre: 'name', creditos: 'credits', semestre: 'semester', carrera: 'career', prerrequisitos: 'prerequisites', horas_teoricas: 'theoreticalHours', horas_practicas: 'practicalHours', area: 'area' };
  return rows.map((row, index) => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[normalizeImportHeader(key)] || normalizeImportHeader(key), value])), rowNumber: index + 2 }));
};

export const sectionView = (section: any) => ({
  id: section.id,
  code: section.code,
  courseCode: section.courseCode,
  courseName: section.course.name,
  teacherId: section.teacherId,
  teacherName: section.teacher.name,
  cycleId: section.cycleId,
  scheduleDays: JSON.parse(section.scheduleDays),
  scheduleTime: section.scheduleTime,
  classroomId: section.classroomId,
  classroomName: section.classroom.code,
  modality: section.modality,
  jornada: section.jornada,
  capacity: section.capacity,
  enrolledCount: section.enrolledCount,
  status: section.status,
});

export const timeRange = (value: string) => {
  const parts = String(value || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!parts) return null;
  const start = Number(parts[1]) * 60 + Number(parts[2]);
  const end = Number(parts[3]) * 60 + Number(parts[4]);
  return start < end && start >= 0 && end <= 24 * 60 ? { start, end } : null;
};

export const schedulesOverlap = (a: string, b: string) => {
  const first = timeRange(a);
  const second = timeRange(b);
  return Boolean(first && second && first.start < second.end && second.start < first.end);
};
