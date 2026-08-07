import { randomUUID } from 'node:crypto';
import type express from 'express';
import XLSX from 'xlsx';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerAcademicRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { handleUniqueError, hashPassword, temporaryPassword, roleFromEmail } = helpers;
  const enrollmentView = (record: any) => ({ id: record.id, studentCarnet: record.studentCarnet, studentName: record.student?.name, sectionId: record.sectionId, courseCode: record.section?.courseCode, courseName: record.section?.course?.name, cycleId: record.section?.cycleId, enrollmentDate: record.enrollmentDate.toISOString().slice(0, 10), status: record.status });
  const cycleView = (cycle: any) => ({ ...cycle, startDate: cycle.startDate.toISOString().slice(0, 10), endDate: cycle.endDate.toISOString().slice(0, 10), enrollmentStartDate: cycle.enrollmentStartDate.toISOString().slice(0, 10), enrollmentEndDate: cycle.enrollmentEndDate.toISOString().slice(0, 10), gradeSubmissionDeadline: cycle.gradeSubmissionDeadline.toISOString().slice(0, 10) });
  const { requireAdmin, requireUser } = middleware;

  const studentView = (student: any) => ({ ...student, campusName: student.campus?.name, planCode: student.plan?.code, planName: student.plan?.name, planVersion: student.plan?.version, campus: undefined, plan: undefined });

  // ── Academic Structure ──────────────────────────────────────────────────────

  app.get('/api/academic-structure', requireUser, async (_req, res) => {
    const admin = res.locals.authUser.role === 'ADMIN';
    const [campuses, plans] = await Promise.all([
      prisma.campus.findMany({ where: admin ? {} : { status: 'Activo' }, include: { _count: { select: { students: true } } }, orderBy: { name: 'asc' } }),
      prisma.curriculumPlan.findMany({ where: admin ? {} : { status: 'Activo' }, include: { career: { select: { name: true } }, campus: { select: { id: true, code: true, name: true } }, _count: { select: { courses: true, students: true } } }, orderBy: [{ careerId: 'asc' }, { effectiveFrom: 'desc' }] }),
    ]);
    res.json({ campuses, plans: plans.map((plan) => ({ ...plan, careerName: plan.career.name, career: undefined })) });
  });

  app.post('/api/academic-structure/campuses', requireAdmin, async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase(), name = String(req.body.name || '').trim(), address = String(req.body.address || '').trim();
    if (!/^[A-Z0-9-]{2,12}$/.test(code) || name.length < 3) return void res.status(400).json({ message: 'Indica un código válido y el nombre del campus.' });
    try {
      const campus = await prisma.$transaction(async (tx) => { const created = await tx.campus.create({ data: { id: `CAMPUS-${randomUUID()}`, code, name, address: address || null } }); await tx.auditLog.create({ data: { action: 'CREATE_CAMPUS', entityType: 'CAMPUS', entityId: created.id, actorId: res.locals.authUser.id } }); return created; });
      res.status(201).json(campus);
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.patch('/api/academic-structure/campuses/:id', requireAdmin, async (req, res) => {
    const current = await prisma.campus.findUnique({ where: { id: req.params.id }, include: { _count: { select: { students: true } } } });
    if (!current) return void res.status(404).json({ message: 'Campus no encontrado.' });
    const name = String(req.body.name ?? current.name).trim(), address = String(req.body.address ?? current.address ?? '').trim(), status = String(req.body.status ?? current.status);
    if (name.length < 3 || !['Activo', 'Inactivo'].includes(status)) return void res.status(400).json({ message: 'Nombre o estado no válido.' });
    const campus = await prisma.$transaction(async (tx) => { const updated = await tx.campus.update({ where: { id: current.id }, data: { name, address: address || null, status } }); await tx.auditLog.create({ data: { action: 'UPDATE_CAMPUS', entityType: 'CAMPUS', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, students: current._count.students }) } }); return updated; });
    res.json(campus);
  });

  app.post('/api/academic-structure/plans', requireAdmin, async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase(), name = String(req.body.name || '').trim(), version = String(req.body.version || '').trim().toUpperCase(), careerId = String(req.body.careerId || ''), sourcePlanId = String(req.body.sourcePlanId || ''), campusId = String(req.body.campusId || '');
    const effectiveFrom = new Date(`${req.body.effectiveFrom}T12:00:00Z`), totalCredits = Number(req.body.totalCredits), durationSemesters = Number(req.body.durationSemesters);
    if (!/^[A-Z0-9-]{3,30}$/.test(code) || name.length < 5 || !version || !careerId || !campusId || Number.isNaN(effectiveFrom.getTime()) || !Number.isInteger(totalCredits) || totalCredits <= 0 || !Number.isInteger(durationSemesters) || durationSemesters <= 0) return void res.status(400).json({ message: 'Completa carrera, campus, código, nombre, versión, vigencia, créditos y semestres.' });
    const campus = await prisma.campus.findFirst({ where: { id: campusId, status: 'Activo' } });
    if (!campus) return void res.status(400).json({ message: 'Selecciona un campus activo válido.' });
    const source = sourcePlanId ? await prisma.curriculumPlan.findUnique({ where: { id: sourcePlanId }, include: { courses: true } }) : null;
    if (sourcePlanId && (!source || source.careerId !== careerId)) return void res.status(400).json({ message: 'El plan de origen debe pertenecer a la misma carrera.' });
    const existingPlans = await prisma.curriculumPlan.count({ where: { careerId } });
    if (!source && existingPlans > 0) return void res.status(400).json({ message: 'Selecciona el plan de origen para crear una nueva versión.' });
    const sourceCourses = source?.courses || (await prisma.course.findMany({ where: { careerId }, select: { code: true, semester: true } })).map((course) => ({ courseCode: course.code, semester: course.semester }));
    try {
      const plan = await prisma.$transaction(async (tx) => { const created = await tx.curriculumPlan.create({ data: { id: `PLAN-${randomUUID()}`, code, name, version, effectiveFrom, totalCredits, durationSemesters, careerId, campusId, status: existingPlans === 0 ? 'Activo' : 'Planificado' } }); if (sourceCourses.length) await tx.curriculumPlanCourse.createMany({ data: sourceCourses.map((item) => ({ planId: created.id, courseCode: item.courseCode, semester: item.semester })) }); await tx.auditLog.create({ data: { action: 'CREATE_CURRICULUM_PLAN', entityType: 'CURRICULUM_PLAN', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ campusId, sourcePlanId: sourcePlanId || null, courses: sourceCourses.length }) } }); return created; });
      res.status(201).json(plan);
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.patch('/api/academic-structure/plans/:id', requireAdmin, async (req, res) => {
    const current = await prisma.curriculumPlan.findUnique({ where: { id: req.params.id }, include: { _count: { select: { students: true } } } });
    if (!current) return void res.status(404).json({ message: 'Plan académico no encontrado.' });
    const status = String(req.body.status ?? current.status), name = String(req.body.name ?? current.name).trim(), campusId = String(req.body.campusId ?? current.campusId ?? '');
    const effectiveTo = req.body.effectiveTo ? new Date(`${req.body.effectiveTo}T12:00:00Z`) : null;
    const campus = campusId ? await prisma.campus.findFirst({ where: { id: campusId, status: 'Activo' } }) : null;
    if (!['Planificado', 'Activo', 'Cerrado'].includes(status) || name.length < 5 || !campus || (effectiveTo && (Number.isNaN(effectiveTo.getTime()) || effectiveTo < current.effectiveFrom))) return void res.status(400).json({ message: 'Nombre, estado, campus o fecha de cierre no válidos.' });
    const plan = await prisma.$transaction(async (tx) => { const updated = await tx.curriculumPlan.update({ where: { id: current.id }, data: { name, status, effectiveTo, campusId } }); await tx.auditLog.create({ data: { action: 'UPDATE_CURRICULUM_PLAN', entityType: 'CURRICULUM_PLAN', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, campusId, students: current._count.students }) } }); return updated; });
    res.json(plan);
  });

  // ── Curriculum Plans ────────────────────────────────────────────────────────

  app.get('/api/curriculum-plans/organizer', requireAdmin, async (_req, res) => {
    const [careers, plans] = await Promise.all([
      prisma.career.findMany({ where: { status: 'Activo' }, select: { code: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.curriculumPlan.findMany({ include: { courses: { include: { course: { include: { prerequisites: { include: { prerequisite: { select: { name: true } } } } } } }, orderBy: [{ semester: 'asc' }, { courseCode: 'asc' }] } }, orderBy: [{ careerId: 'asc' }, { effectiveFrom: 'desc' }] }),
    ]);
    res.json({ careers, plans: plans.map((plan) => ({ id: plan.id, code: plan.code, name: plan.name, version: plan.version, careerId: plan.careerId, status: plan.status, durationSemesters: plan.durationSemesters, totalCredits: plan.totalCredits, courses: plan.courses.map((item) => ({ code: item.course.code, name: item.course.name, credits: item.course.credits, semester: item.semester, prerequisites: item.course.prerequisites.map((prerequisite) => ({ code: prerequisite.prerequisiteCode, name: prerequisite.prerequisite.name })) })) })) });
  });

  app.patch('/api/curriculum-plans/:id/layout', requireAdmin, async (req, res) => {
    const durationSemesters = Number(req.body.durationSemesters), assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    if (!Number.isInteger(durationSemesters) || durationSemesters < 1 || durationSemesters > 12) return void res.status(400).json({ message: 'La duración debe estar entre 1 y 12 semestres.' });
    const plan = await prisma.curriculumPlan.findUnique({ where: { id: req.params.id }, include: { courses: { include: { course: { include: { prerequisites: true } } } } } });
    if (!plan) return void res.status(404).json({ message: 'Plan académico no encontrado.' });
    const assignmentMap = new Map<string, number>();
    for (const item of assignments) { const code = String(item?.courseCode || ''), semester = Number(item?.semester); if (!code || !Number.isInteger(semester) || semester < 1 || semester > durationSemesters || assignmentMap.has(code)) return void res.status(400).json({ message: 'La distribución contiene cursos duplicados o semestres no válidos.' }); assignmentMap.set(code, semester); }
    const planCodes = new Set(plan.courses.map((item) => item.courseCode));
    if (assignmentMap.size !== planCodes.size || [...assignmentMap.keys()].some((code) => !planCodes.has(code))) return void res.status(400).json({ message: 'Todos los cursos del pensum deben estar asignados exactamente una vez.' });
    const issues = plan.courses.flatMap((item) => item.course.prerequisites.flatMap((prerequisite) => { const prerequisiteSemester = assignmentMap.get(prerequisite.prerequisiteCode), courseSemester = assignmentMap.get(item.courseCode)!; return prerequisiteSemester && prerequisiteSemester >= courseSemester ? [{ courseCode: item.courseCode, prerequisiteCode: prerequisite.prerequisiteCode, message: `${prerequisite.prerequisiteCode} debe estar antes que ${item.courseCode}.` }] : []; }));
    if (issues.length) return void res.status(409).json({ message: 'Corrige los prerrequisitos ubicados en el mismo semestre o en uno posterior.', issues });
    await prisma.$transaction(async (tx) => {
      await tx.curriculumPlan.update({ where: { id: plan.id }, data: { durationSemesters } });
      for (const [courseCode, semester] of assignmentMap) await tx.curriculumPlanCourse.update({ where: { planId_courseCode: { planId: plan.id, courseCode } }, data: { semester } });
      await tx.auditLog.create({ data: { action: 'ORGANIZE_CURRICULUM_PLAN', entityType: 'CURRICULUM_PLAN', entityId: plan.id, actorId: res.locals.authUser.id, details: JSON.stringify({ durationSemesters, courses: assignmentMap.size }) } });
    });
    res.json({ message: 'Distribución del pensum guardada correctamente.', durationSemesters, courses: assignmentMap.size });
  });

  // ── Students ────────────────────────────────────────────────────────────────

  app.get('/api/students', requireAdmin, async (_req, res) => {
    const records = await prisma.student.findMany({ include: { campus: true, plan: true }, orderBy: { name: 'asc' } });
    res.json(records.map(studentView));
  });

  app.post('/api/students', requireAdmin, async (req, res) => {
    const data = req.body;
    const normalizedEmail = String(data.email || '').trim().toLowerCase();
    if (roleFromEmail(normalizedEmail) !== 'ESTUDIANTE') {
      return void res.status(400).json({ message: 'El estudiante debe usar un correo @alumno.uspg.edu.gt.' });
    }
    const password = temporaryPassword();
    const userId = randomUUID();
    try {
      const plan = data.planId ? await prisma.curriculumPlan.findUnique({ where: { id: data.planId } }) : await prisma.curriculumPlan.findFirst({ where: { careerId: data.careerId, status: 'Activo' }, orderBy: { effectiveFrom: 'desc' } });
      const campus = data.campusId ? await prisma.campus.findUnique({ where: { id: data.campusId } }) : await prisma.campus.findFirst({ where: { status: 'Activo' }, orderBy: { name: 'asc' } });
      if (!plan || plan.careerId !== data.careerId || plan.campusId !== campus?.id) return void res.status(400).json({ message: 'Selecciona un plan académico vigente para la carrera y campus elegidos.' });
      if (!campus) return void res.status(400).json({ message: 'Selecciona un campus válido.' });
      const student = await prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { id: userId, name: data.name, email: normalizedEmail, passwordHash: hashPassword(password), role: 'ESTUDIANTE', carnetOrCode: data.carnet, phone: data.phone, department: data.careerName, mustChangePassword: true } });
        const created = await tx.student.create({ data: { carnet: data.carnet, name: data.name, email: normalizedEmail, phone: data.phone, careerId: data.careerId, careerName: data.careerName, entryCycle: data.entryCycle, jornada: data.jornada, status: data.status || 'Activo', gpa: data.gpa || 0, creditsEarned: data.creditsEarned || 0, totalCreditsRequired: plan.totalCredits, address: data.address, dpi: data.dpi, campusId: campus.id, planId: plan.id, userId }, include: { campus: true, plan: true } });
        await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'STUDENT', entityId: data.carnet, actorId: res.locals.authUser.id } });
        return created;
      });
      res.status(201).json({ student: studentView(student), temporaryPassword: password });
    } catch (error) {
      if (!handleUniqueError(error, res)) throw error;
    }
  });

  app.patch('/api/students/:carnet', requireAdmin, async (req, res) => {
    const current = await prisma.student.findUnique({ where: { carnet: req.params.carnet } });
    if (!current) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const next = { ...current, ...req.body };
    const normalizedEmail = String(next.email || '').trim().toLowerCase();
    if (roleFromEmail(normalizedEmail) !== 'ESTUDIANTE') return void res.status(400).json({ message: 'El estudiante debe usar un correo @alumno.uspg.edu.gt.' });
    try {
      const plan = next.planId ? await prisma.curriculumPlan.findUnique({ where: { id: next.planId } }) : null;
      const campus = next.campusId ? await prisma.campus.findUnique({ where: { id: next.campusId } }) : null;
      if (!plan || plan.careerId !== next.careerId || plan.campusId !== campus?.id) return void res.status(400).json({ message: 'Selecciona un plan académico vigente para la carrera y campus elegidos.' });
      if (!campus) return void res.status(400).json({ message: 'Selecciona un campus válido.' });
      const student = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: current.userId }, data: { name: next.name, email: normalizedEmail, phone: next.phone, active: next.status === 'Activo' } });
        const updated = await tx.student.update({ where: { carnet: req.params.carnet }, data: { name: next.name, email: normalizedEmail, phone: next.phone, careerId: next.careerId, careerName: next.careerName, entryCycle: next.entryCycle, jornada: next.jornada, status: next.status, gpa: next.gpa, creditsEarned: next.creditsEarned, totalCreditsRequired: plan.totalCredits, address: next.address, dpi: next.dpi, campusId: campus.id, planId: plan.id }, include: { campus: true, plan: true } });
        await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'STUDENT', entityId: req.params.carnet, actorId: res.locals.authUser.id } });
        return updated;
      });
      res.json(studentView(student));
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  // ── Teachers ────────────────────────────────────────────────────────────────

  app.get('/api/teachers', requireAdmin, async (_req, res) => {
    const records = await prisma.teacher.findMany({ orderBy: { name: 'asc' } });
    res.json(records.map(({ assignedSectionIds, ...teacher }) => ({ ...teacher, assignedSectionIds: JSON.parse(assignedSectionIds) })));
  });

  app.post('/api/teachers', requireAdmin, async (req, res) => {
    const data = req.body;
    if (roleFromEmail(String(data.email || '')) !== 'DOCENTE') return void res.status(400).json({ message: 'El catedrático debe usar un correo @catedratico.uspg.edu.gt.' });
    if (!data.campusId) return void res.status(400).json({ message: 'Selecciona el campus del docente.' });
    const password = temporaryPassword();
    const userId = randomUUID();
    try {
      const teacher = await prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { id: userId, name: data.name, email: data.email.toLowerCase(), passwordHash: hashPassword(password), role: 'DOCENTE', carnetOrCode: data.code, phone: data.phone, department: data.specialty, mustChangePassword: true } });
        const created = await tx.teacher.create({ data: { code: data.code, name: data.name, email: data.email.toLowerCase(), phone: data.phone, specialty: data.specialty, academicDegree: data.academicDegree, assignedSectionIds: JSON.stringify(data.assignedSectionIds || []), status: data.status || 'Activo', maxHoursPerWeek: data.maxHoursPerWeek, userId, campusId: data.campusId } });
        await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'TEACHER', entityId: data.code, actorId: res.locals.authUser.id } });
        return created;
      });
      res.status(201).json({ teacher: { ...teacher, assignedSectionIds: JSON.parse(teacher.assignedSectionIds) }, temporaryPassword: password });
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.patch('/api/teachers/:code', requireAdmin, async (req, res) => {
    const current = await prisma.teacher.findUnique({ where: { code: req.params.code } });
    if (!current) return void res.status(404).json({ message: 'Catedrático no encontrado.' });
    const next = { ...current, ...req.body };
    if (roleFromEmail(String(next.email)) !== 'DOCENTE') return void res.status(400).json({ message: 'El catedrático debe usar un correo @catedratico.uspg.edu.gt.' });
    try {
      const teacher = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: current.userId }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, active: next.status === 'Activo' } });
        const updated = await tx.teacher.update({ where: { code: req.params.code }, data: { name: next.name, email: next.email.toLowerCase(), phone: next.phone, specialty: next.specialty, academicDegree: next.academicDegree, assignedSectionIds: Array.isArray(next.assignedSectionIds) ? JSON.stringify(next.assignedSectionIds) : next.assignedSectionIds, status: next.status, maxHoursPerWeek: next.maxHoursPerWeek, campusId: next.campusId } });
        await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'TEACHER', entityId: req.params.code, actorId: res.locals.authUser.id } });
        return updated;
      });
      res.json({ ...teacher, assignedSectionIds: JSON.parse(teacher.assignedSectionIds) });
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  // ── Careers ─────────────────────────────────────────────────────────────────

  const careerView = async (career: { code: string; name: string; faculty: string; durationSemesters: number; totalCredits: number; modality: string; status: string; degreeType: string }) => ({
    ...career,
    studentCount: await prisma.student.count({ where: { careerId: career.code } }),
    courseCount: await prisma.course.count({ where: { careerId: career.code } }),
  });

  app.get('/api/careers', requireAdmin, async (_req, res) => {
    const records = await prisma.career.findMany({ orderBy: { name: 'asc' } });
    res.json(await Promise.all(records.map(careerView)));
  });

  app.post('/api/careers', requireAdmin, async (req, res) => {
    const data = req.body;
    if (!data.code?.trim() || !data.name?.trim()) return void res.status(400).json({ message: 'El código y nombre son obligatorios.' });
    try {
      const career = await prisma.$transaction(async (tx) => {
        const created = await tx.career.create({ data: { code: data.code.trim().toUpperCase(), name: data.name.trim(), faculty: data.faculty, durationSemesters: data.durationSemesters, totalCredits: data.totalCredits, modality: data.modality, status: data.status || 'Activo', degreeType: data.degreeType } });
        await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CAREER', entityId: created.code, actorId: res.locals.authUser.id } });
        return created;
      });
      res.status(201).json(await careerView(career));
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.patch('/api/careers/:code', requireAdmin, async (req, res) => {
    const current = await prisma.career.findUnique({ where: { code: req.params.code } });
    if (!current) return void res.status(404).json({ message: 'Carrera no encontrada.' });
    const next = { ...current, ...req.body, code: current.code };
    const career = await prisma.$transaction(async (tx) => {
      const updated = await tx.career.update({ where: { code: current.code }, data: { name: next.name, faculty: next.faculty, durationSemesters: next.durationSemesters, totalCredits: next.totalCredits, modality: next.modality, status: next.status, degreeType: next.degreeType } });
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'CAREER', entityId: current.code, actorId: res.locals.authUser.id } });
      return updated;
    });
    res.json(await careerView(career));
  });

  // ── Courses ─────────────────────────────────────────────────────────────────

  const courseView = (course: any) => ({
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

  const validatePrerequisites = async (courseCode: string, prerequisiteCodes: string[]) => {
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

  const normalizeImportHeader = (value: unknown) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  const parseCourseImport = (dataUrl: string) => {
    const match = String(dataUrl || '').match(/^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('Carga un archivo Excel .xlsx válido.');
    const workbook = XLSX.read(Buffer.from(match[1], 'base64'), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('El archivo no contiene hojas.');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const aliases: Record<string, string> = { codigo: 'code', nombre: 'name', creditos: 'credits', semestre: 'semester', carrera: 'career', prerrequisitos: 'prerequisites', horas_teoricas: 'theoreticalHours', horas_practicas: 'practicalHours', area: 'area' };
    return rows.map((row, index) => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[normalizeImportHeader(key)] || normalizeImportHeader(key), value])), rowNumber: index + 2 }));
  };

  app.post('/api/courses/import', requireAdmin, async (req, res) => {
    let rows: any[];
    try { rows = parseCourseImport(req.body.dataUrl); } catch (error) { return void res.status(400).json({ message: error instanceof Error ? error.message : 'No se pudo leer el archivo Excel.' }); }
    if (!rows.length) return void res.status(400).json({ message: 'El archivo Excel no contiene cursos.' });
    const careers = await prisma.career.findMany({ select: { code: true } });
    const careerCodes = new Set(careers.map((career) => career.code));
    const existing = await prisma.course.findMany({ select: { code: true, careerId: true } });
    const existingByCode = new Map(existing.map((course) => [course.code, course.careerId]));
    const codes = new Set<string>();
    const errors: Array<{ row: number; message: string }> = [];
    const normalizedRows = rows.map((row) => {
      const code = String(row.code || '').trim().toUpperCase();
      const name = String(row.name || '').trim();
      const rawCareerId = String(row.career || '').trim().toUpperCase();
      const careerId = rawCareerId === 'CC' && careerCodes.has('CAR-ITI') ? 'CAR-ITI' : rawCareerId;
      const credits = Number(row.credits), semester = Number(row.semester);
      const prerequisiteCodes = String(row.prerequisites || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
      if (!code || !name || !careerId || !Number.isInteger(credits) || credits < 1 || !Number.isInteger(semester) || semester < 1) errors.push({ row: row.rowNumber, message: 'Código, nombre, carrera, créditos y semestre son obligatorios y válidos.' });
      if (careerId && !careerCodes.has(careerId)) errors.push({ row: row.rowNumber, message: `La carrera ${careerId} no existe.` });
      if (codes.has(code)) errors.push({ row: row.rowNumber, message: `El código ${code} está repetido dentro del archivo.` });
      if (existingByCode.has(code) && existingByCode.get(code) !== careerId) errors.push({ row: row.rowNumber, message: `El curso ${code} ya pertenece a otra carrera.` });
      codes.add(code);
      return { code, name, careerId, credits, semester, prerequisiteCodes, theoreticalHours: Number(row.theoreticalHours || 0), practicalHours: Number(row.practicalHours || 0), area: String(row.area || 'Básica'), status: 'Activo', rowNumber: row.rowNumber };
    });
    const incomingCodes = new Set(normalizedRows.map((row) => row.code));
    for (const row of normalizedRows) for (const prerequisite of row.prerequisiteCodes) if (!incomingCodes.has(prerequisite) && !existing.some((course) => course.code === prerequisite)) errors.push({ row: row.rowNumber, message: `El prerrequisito ${prerequisite} no existe.` });
    if (errors.length) return void res.status(400).json({ message: 'Corrige los errores antes de importar.', errors, preview: normalizedRows });
    if (req.body.commit !== true) return res.json({ message: 'Validación completada. Confirma la importación para guardar.', preview: normalizedRows });
    const activePlan = await prisma.curriculumPlan.findFirst({ where: { careerId: normalizedRows[0].careerId, status: 'Activo' }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      for (const row of normalizedRows) {
        await tx.course.upsert({ where: { code: row.code }, update: { name: row.name, credits: row.credits, semester: row.semester, careerId: row.careerId, theoreticalHours: row.theoreticalHours, practicalHours: row.practicalHours, area: row.area, status: row.status }, create: { code: row.code, name: row.name, credits: row.credits, semester: row.semester, careerId: row.careerId, theoreticalHours: row.theoreticalHours, practicalHours: row.practicalHours, area: row.area, status: row.status } });
        await tx.coursePrerequisite.deleteMany({ where: { courseCode: row.code } });
        if (row.prerequisiteCodes.length) await tx.coursePrerequisite.createMany({ data: row.prerequisiteCodes.map((prerequisiteCode: string) => ({ courseCode: row.code, prerequisiteCode })) });
        if (activePlan) await tx.curriculumPlanCourse.upsert({ where: { planId_courseCode: { planId: activePlan.id, courseCode: row.code } }, update: { semester: row.semester }, create: { planId: activePlan.id, courseCode: row.code, semester: row.semester } });
        await tx.auditLog.create({ data: { action: 'IMPORT', entityType: 'COURSE', entityId: row.code, actorId: res.locals.authUser.id, details: JSON.stringify({ row: row.rowNumber, source: 'xlsx' }) } });
      }
    });
    res.status(201).json({ message: `Se importaron ${normalizedRows.length} cursos correctamente.`, imported: normalizedRows.length });
  });

  app.get('/api/courses', requireAdmin, async (_req, res) => {
    const records = await prisma.course.findMany({ include: { career: true, prerequisites: true }, orderBy: [{ careerId: 'asc' }, { semester: 'asc' }, { code: 'asc' }] });
    res.json(records.map(courseView));
  });

  app.post('/api/courses', requireAdmin, async (req, res) => {
    const data = req.body;
    const code = String(data.code || '').trim().toUpperCase();
    const prerequisiteCodes = Array.isArray(data.prerequisiteCodes) ? data.prerequisiteCodes : [];
    const validationError = await validatePrerequisites(code, prerequisiteCodes);
    if (validationError) return void res.status(400).json({ message: validationError });
    try {
      const course = await prisma.$transaction(async (tx) => {
        await tx.course.create({ data: { code, name: data.name, credits: data.credits, semester: data.semester, careerId: data.careerId, theoreticalHours: data.theoreticalHours, practicalHours: data.practicalHours, area: data.area, status: data.status || 'Activo' } });
        if (prerequisiteCodes.length) await tx.coursePrerequisite.createMany({ data: prerequisiteCodes.map((prerequisiteCode: string) => ({ courseCode: code, prerequisiteCode })) });
        await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'COURSE', entityId: code, actorId: res.locals.authUser.id } });
        return tx.course.findUniqueOrThrow({ where: { code }, include: { career: true, prerequisites: true } });
      });
      res.status(201).json(courseView(course));
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.patch('/api/courses/:code', requireAdmin, async (req, res) => {
    const current = await prisma.course.findUnique({ where: { code: req.params.code } });
    if (!current) return void res.status(404).json({ message: 'Curso no encontrado.' });
    const next = { ...current, ...req.body, code: current.code };
    const prerequisiteCodes = Array.isArray(req.body.prerequisiteCodes) ? req.body.prerequisiteCodes : undefined;
    if (prerequisiteCodes) {
      const validationError = await validatePrerequisites(current.code, prerequisiteCodes);
      if (validationError) return void res.status(400).json({ message: validationError });
    }
    const course = await prisma.$transaction(async (tx) => {
      await tx.course.update({ where: { code: current.code }, data: { name: next.name, credits: next.credits, semester: next.semester, careerId: next.careerId, theoreticalHours: next.theoreticalHours, practicalHours: next.practicalHours, area: next.area, status: next.status } });
      if (prerequisiteCodes) {
        await tx.coursePrerequisite.deleteMany({ where: { courseCode: current.code } });
        if (prerequisiteCodes.length) await tx.coursePrerequisite.createMany({ data: prerequisiteCodes.map((prerequisiteCode: string) => ({ courseCode: current.code, prerequisiteCode })) });
      }
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'COURSE', entityId: current.code, actorId: res.locals.authUser.id } });
      return tx.course.findUniqueOrThrow({ where: { code: current.code }, include: { career: true, prerequisites: true } });
    });
    res.json(courseView(course));
  });

  // ── Curriculum Map ──────────────────────────────────────────────────────────

  app.get('/api/curriculum-map', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'La malla estudiantil no está disponible para catedráticos.' });
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
    if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
    const student = await prisma.student.findUnique({ where: { carnet: studentCarnet }, include: {
      campus: true,
      plan: {
        include: {
          courses: {
            include: { course: { include: { prerequisites: { include: { prerequisite: { select: { name: true } } } } } } },
            orderBy: [{ semester: 'asc' }, { courseCode: 'asc' }],
          },
        },
      },
      enrollments: { include: { section: true } },
      gradeRecords: { include: { section: true } },
      financialCharges: { include: { payments: true, adjustments: true } },
      enrollmentDocuments: true,
    } });
    if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const courses = student.plan
      ? student.plan.courses.map((item) => ({ ...item.course, semester: item.semester }))
      : await prisma.course.findMany({ where: { careerId: student.careerId, status: 'Activo' }, include: { prerequisites: { include: { prerequisite: { select: { name: true } } } } }, orderBy: [{ semester: 'asc' }, { code: 'asc' }] });
    const approved = new Set<string>();
    for (const enrollment of student.enrollments) if (enrollment.status === 'Completado') approved.add(enrollment.section.courseCode);
    for (const grade of student.gradeRecords) if ((grade.isPublished || grade.section.gradeActStatus !== 'BORRADOR') && grade.total >= 61) approved.add(grade.section.courseCode);
    const active = new Set(student.enrollments.filter((item) => item.status === 'Inscrito').map((item) => item.section.courseCode));
    const mapped = courses.map((course) => {
      const prerequisiteCodes = course.prerequisites.map((item) => item.prerequisiteCode);
      const prerequisites = course.prerequisites.map((item) => ({ code: item.prerequisiteCode, name: item.prerequisite.name, completed: approved.has(item.prerequisiteCode) }));
      const missingPrerequisites = course.prerequisites.filter((item) => !approved.has(item.prerequisiteCode)).map((item) => ({ code: item.prerequisiteCode, name: item.prerequisite.name }));
      const status = approved.has(course.code) ? 'APROBADO' : active.has(course.code) ? 'EN_CURSO' : missingPrerequisites.length ? 'BLOQUEADO' : 'DISPONIBLE';
      const unlocks = courses.filter((candidate) => candidate.prerequisites.some((item) => item.prerequisiteCode === course.code)).map((candidate) => ({ code: candidate.code, name: candidate.name, semester: candidate.semester }));
      return { code: course.code, name: course.name, credits: course.credits, semester: course.semester, prerequisiteCodes, prerequisites, missingPrerequisites, unlocks, status };
    });
    const charges = student.financialCharges.map((charge) => ({ dueDate: charge.dueDate, balance: Math.max(0, charge.amount - charge.adjustments.reduce((sum, item) => sum + item.amount, 0) - charge.payments.reduce((sum, item) => sum + item.amount, 0)) }));
    const financialSolvent = !charges.some((charge) => charge.dueDate < new Date() && charge.balance > 0);
    const expedienteComplete = student.enrollmentDocuments.length >= 5 && student.enrollmentDocuments.every((document) => document.status === 'APROBADO');
    const totalCredits = Math.max(student.plan?.totalCredits || 0, mapped.reduce((sum, course) => sum + course.credits, 0)), approvedCredits = mapped.filter((course) => course.status === 'APROBADO').reduce((sum, course) => sum + course.credits, 0);
    res.json({ student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId, campusName: student.campus?.name || 'Sin campus', planCode: student.plan?.code || 'Plan general', planName: student.plan?.name || 'Pensum vigente', planVersion: student.plan?.version || 'Actual' }, curriculum: { totalCourses: mapped.length, totalCredits, semesters: student.plan?.durationSemesters || Math.max(0, ...mapped.map((course) => course.semester)), approvedCourses: mapped.filter((course) => course.status === 'APROBADO').length, approvedCredits, progress: totalCredits ? Math.round((approvedCredits / totalCredits) * 100) : 0 }, courses: mapped, graduationRequirements: [
      { code: 'LECTURES', label: 'Lectures (12)', completed: false, detail: 'Pendiente de registro institucional' },
      { code: 'ENGLISH_TEST', label: 'Constancia de test de inglés', completed: false, detail: 'Pendiente de validación' },
      { code: 'FINANCIAL', label: 'Solvencia de caja', completed: financialSolvent, detail: financialSolvent ? 'Sin saldos vencidos' : 'Existen saldos vencidos' },
      { code: 'FILE', label: 'Solvencia de expediente (C1)', completed: expedienteComplete, detail: expedienteComplete ? 'Expediente completo' : 'Documentos pendientes' },
      { code: 'FINAL_WORK', label: 'Trabajo final', completed: false, detail: 'Pendiente de registro institucional' },
    ] });
  });

  // ── Cycles ──────────────────────────────────────────────────────────────────

  app.get('/api/cycles', requireUser, async (_req, res) => res.json((await prisma.academicCycle.findMany({ orderBy: { startDate: 'desc' } })).map(cycleView)));
  app.post('/api/cycles', requireAdmin, async (req, res) => {
    const data = req.body;
    if (new Date(data.startDate) >= new Date(data.endDate) || new Date(data.enrollmentStartDate) > new Date(data.enrollmentEndDate)) return void res.status(400).json({ message: 'Las fechas del ciclo no son válidas.' });
    const id = `CYC-${data.year}-${Date.now().toString().slice(-5)}`;
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ data: { isCurrent: false } });
      const created = await tx.academicCycle.create({ data: { ...data, id, startDate: new Date(data.startDate), endDate: new Date(data.endDate), enrollmentStartDate: new Date(data.enrollmentStartDate), enrollmentEndDate: new Date(data.enrollmentEndDate), gradeSubmissionDeadline: new Date(data.gradeSubmissionDeadline) } });
      await tx.auditLog.create({ data: { action: 'CREATE', entityType: 'CYCLE', entityId: id, actorId: res.locals.authUser.id } });
      return created;
    });
    res.status(201).json(cycleView(cycle));
  });
  app.patch('/api/cycles/:id', requireAdmin, async (req, res) => {
    const current = await prisma.academicCycle.findUnique({ where: { id: req.params.id } });
    if (!current) return void res.status(404).json({ message: 'Ciclo no encontrado.' });
    const data = req.body;
    if (current.status === 'Finalizado') return void res.status(409).json({ message: 'Un ciclo finalizado no puede editarse.' });
    const start = data.startDate ? new Date(data.startDate) : current.startDate;
    const end = data.endDate ? new Date(data.endDate) : current.endDate;
    const enrollmentStart = data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : current.enrollmentStartDate;
    const enrollmentEnd = data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : current.enrollmentEndDate;
    const gradeDeadline = data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : current.gradeSubmissionDeadline;
    if ([start, end, enrollmentStart, enrollmentEnd, gradeDeadline].some((date) => Number.isNaN(date.getTime())) || start >= end || enrollmentStart > enrollmentEnd || gradeDeadline < end) return void res.status(400).json({ message: 'Revisa las fechas: las clases, inscripciones y límite de actas deben mantener un orden válido.' });
    if (data.status === 'Finalizado' && current.isCurrent) return void res.status(409).json({ message: 'Primero establece otro ciclo como activo antes de finalizar este ciclo.' });
    const cycle = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicCycle.updateMany({ where: { id: { not: current.id } }, data: { isCurrent: false } });
      const saved = await tx.academicCycle.update({ where: { id: current.id }, data: { ...data, id: undefined, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined, enrollmentStartDate: data.enrollmentStartDate ? new Date(data.enrollmentStartDate) : undefined, enrollmentEndDate: data.enrollmentEndDate ? new Date(data.enrollmentEndDate) : undefined, gradeSubmissionDeadline: data.gradeSubmissionDeadline ? new Date(data.gradeSubmissionDeadline) : undefined } });
      if (data.isCurrent) {
        const openEnrollments = await tx.enrollment.findMany({ where: { status: 'Inscrito', section: { cycleId: { not: current.id }, cycle: { isCurrent: false } } }, select: { id: true } });
        if (openEnrollments.length) await tx.enrollment.updateMany({ where: { id: { in: openEnrollments.map((e) => e.id) } }, data: { status: 'Retirado' } });
      }
      await tx.auditLog.create({ data: { action: 'UPDATE', entityType: 'CYCLE', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ before: current.status, after: saved.status }) } });
      return saved;
    });
    res.json(cycleView(cycle));
  });

  // ── Sections ────────────────────────────────────────────────────────────────

  const sectionView = (section: any) => ({ id: section.id, code: section.code, courseCode: section.courseCode, courseName: section.course.name, teacherId: section.teacherId, teacherName: section.teacher.name, cycleId: section.cycleId, scheduleDays: JSON.parse(section.scheduleDays), scheduleTime: section.scheduleTime, classroomId: section.classroomId, classroomName: section.classroom.code, modality: section.modality, jornada: section.jornada, capacity: section.capacity, enrolledCount: section.enrolledCount, status: section.status });
  const timeRange = (value: string) => { const parts = String(value || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); if (!parts) return null; const start = Number(parts[1]) * 60 + Number(parts[2]); const end = Number(parts[3]) * 60 + Number(parts[4]); return start < end && start >= 0 && end <= 24 * 60 ? { start, end } : null; };
  const schedulesOverlap = (a: string, b: string) => { const first = timeRange(a); const second = timeRange(b); return Boolean(first && second && first.start < second.end && second.start < first.end); };

  app.get('/api/sections', requireUser, async (_req, res) => res.json((await prisma.section.findMany({ include: { course: true, teacher: true, classroom: true } })).map(sectionView)));
  app.post('/api/sections', requireAdmin, async (req, res) => {
    const data = req.body;
    const range = timeRange(data.scheduleTime); if (!range || !Array.isArray(data.scheduleDays) || data.scheduleDays.length === 0) return void res.status(400).json({ message: 'Indica un horario válido (ej. 07:45 - 10:00) y al menos un día.' });
    const classroom = await prisma.classroom.findUnique({ where: { id: data.classroomId } });
    if (!classroom || classroom.status === 'Mantenimiento') return void res.status(400).json({ message: 'El aula no está disponible.' });
    if (data.modality !== 'Virtual' && data.capacity > classroom.capacity) return void res.status(400).json({ message: 'El cupo supera la capacidad del aula.' });
    const days = data.scheduleDays || [];
    const candidates = await prisma.section.findMany({ where: { cycleId: data.cycleId }, include: { teacher: true, classroom: true } });
    for (const section of candidates) {
      if (!JSON.parse(section.scheduleDays).some((day: string) => days.includes(day))) continue;
      if (!schedulesOverlap(section.scheduleTime, data.scheduleTime)) continue;
      if (section.teacherId === data.teacherId) return void res.status(409).json({ message: `El catedrático ya tiene la sección ${section.code} en ese horario.` });
      if (data.modality !== 'Virtual' && section.classroomId === data.classroomId) return void res.status(409).json({ message: `El aula ya está ocupada por la sección ${section.code}.` });
    }
    const id = `SEC-${data.courseCode}-${Date.now().toString().slice(-6)}`;
    try {
      const section = await prisma.$transaction(async (tx) => {
        const created = await tx.section.create({ data: { ...data, id, scheduleDays: JSON.stringify(days), enrolledCount: 0 }, include: { course: true, teacher: true, classroom: true } });
        await tx.virtualClassroom.create({ data: { sectionId: id } });
        return created;
      });
      res.status(201).json(sectionView(section));
    } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });
  app.patch('/api/sections/:id', requireAdmin, async (req, res) => {
    const current = await prisma.section.findUnique({ where: { id: req.params.id } }); if (!current) return void res.status(404).json({ message: 'Sección no encontrada.' });
    const nextDays = Array.isArray(req.body.scheduleDays) ? req.body.scheduleDays : JSON.parse(current.scheduleDays); const nextTime = req.body.scheduleTime || current.scheduleTime; const range = timeRange(nextTime); if (!range || !nextDays.length) return void res.status(400).json({ message: 'Indica un horario válido y al menos un día.' });
    if (req.body.capacity !== undefined && Number(req.body.capacity) < current.enrolledCount) return void res.status(400).json({ message: `El cupo no puede ser menor que los ${current.enrolledCount} estudiantes inscritos.` });
    const candidates = await prisma.section.findMany({ where: { id: { not: current.id }, cycleId: current.cycleId }, select: { scheduleDays: true, scheduleTime: true, teacherId: true, classroomId: true, modality: true, code: true } });
    for (const candidate of candidates) { if (!JSON.parse(candidate.scheduleDays).some((day: string) => nextDays.includes(day)) || !schedulesOverlap(candidate.scheduleTime, nextTime)) continue; if (candidate.teacherId === (req.body.teacherId || current.teacherId)) return void res.status(409).json({ message: `El catedrático ya tiene la sección ${candidate.code} en ese horario.` }); if ((req.body.modality || current.modality) !== 'Virtual' && candidate.classroomId === (req.body.classroomId || current.classroomId) && candidate.modality !== 'Virtual') return void res.status(409).json({ message: `El aula ya está ocupada por la sección ${candidate.code}.` }); }
    const data = { ...req.body, scheduleDays: Array.isArray(req.body.scheduleDays) ? JSON.stringify(req.body.scheduleDays) : undefined };
    const section = await prisma.section.update({ where: { id: req.params.id }, data, include: { course: true, teacher: true, classroom: true } });
    res.json(sectionView(section));
  });
  app.delete('/api/sections/:id', requireAdmin, async (req, res) => { await prisma.section.delete({ where: { id: req.params.id } }); res.json({ ok: true }); });

  // ── Enrollments ─────────────────────────────────────────────────────────────

  app.get('/api/enrollments', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    const where = user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode } : {};
    const records = await prisma.enrollment.findMany({ where, include: { student: true, section: { include: { course: true } } }, orderBy: { enrollmentDate: 'desc' } });
    res.json(records.map(enrollmentView));
  });
  app.post('/api/enrollments', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const studentCarnet = String(req.body?.studentCarnet || '');
    const sectionId = String(req.body?.sectionId || '');
    if (user.role === 'ESTUDIANTE' && user.carnetOrCode !== studentCarnet) return void res.status(403).json({ message: 'Solo puedes inscribirte a ti mismo.' });
    const student = await prisma.student.findUnique({ where: { carnet: studentCarnet }, include: { plan: { include: { courses: { select: { courseCode: true } } } } } });
    if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const overdueCharges = await prisma.financialCharge.findMany({ where: { studentCarnet, dueDate: { lt: new Date() }, status: { not: 'PAGADO' } }, include: { payments: true, adjustments: true } });
    const overdueBalance = overdueCharges.reduce((sum, charge) => sum + Math.max(0, charge.amount - charge.adjustments.reduce((adjusted, item) => adjusted + item.amount, 0) - charge.payments.reduce((paid, payment) => paid + payment.amount, 0)), 0);
    if (overdueBalance > 0) return void res.status(409).json({ message: `La inscripción está bloqueada por un saldo vencido de Q${overdueBalance.toFixed(2)}.` });
    const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: { include: { prerequisites: true } }, cycle: true } });
    if (!section || section.status !== 'Abierta') return void res.status(400).json({ message: 'La sección no está disponible.' });
    if (student.plan && !student.plan.courses.some((item) => item.courseCode === section.courseCode)) return void res.status(400).json({ message: 'El curso no pertenece al pensum asignado al estudiante.' });
    const now = new Date();
    if (now < section.cycle.enrollmentStartDate || now > section.cycle.enrollmentEndDate) return void res.status(400).json({ message: 'El período de inscripción está cerrado.' });
    if (section.enrolledCount >= section.capacity) return void res.status(409).json({ message: 'La sección ya no tiene cupo.' });
    const duplicate = await prisma.enrollment.findUnique({ where: { studentCarnet_sectionId: { studentCarnet, sectionId } } });
    if (duplicate?.status === 'Inscrito') return void res.status(409).json({ message: 'Ya estás inscrito en esta sección.' });
    const active = await prisma.enrollment.findMany({ where: { studentCarnet, status: 'Inscrito', section: { cycleId: section.cycleId } }, include: { section: { include: { course: true } } } });
    const credits = active.reduce((sum, item) => sum + item.section.course.credits, 0);
    if (credits + section.course.credits > 24) return void res.status(400).json({ message: 'La inscripción supera el límite de 24 créditos.' });
    const prerequisiteCodes = section.course.prerequisites.map((item) => item.prerequisiteCode);
    if (prerequisiteCodes.length) {
      const completed = await prisma.enrollment.findMany({ where: { studentCarnet, status: 'Completado', section: { courseCode: { in: prerequisiteCodes } } }, include: { section: true } });
      const completedCodes = new Set(completed.map((item) => item.section.courseCode));
      const missing = prerequisiteCodes.filter((code) => !completedCodes.has(code));
      if (missing.length) return void res.status(400).json({ message: `Faltan prerrequisitos: ${missing.join(', ')}.` });
    }
    const record = await prisma.$transaction(async (tx) => {
      const enrollment = duplicate ? await tx.enrollment.update({ where: { id: duplicate.id }, data: { status: 'Inscrito', enrollmentDate: now } }) : await tx.enrollment.create({ data: { studentCarnet, sectionId, enrollmentDate: now } });
      await tx.section.update({ where: { id: sectionId }, data: { enrolledCount: { increment: 1 } } });
      const applicableFees = await tx.careerFee.findMany({ where: { careerId: student.careerId, cycleId: section.cycleId, AND: [{ OR: [{ campusId: null }, { campusId: student.campusId }] }, { OR: [{ planId: null }, { planId: student.planId }] }] } });
      for (const fee of applicableFees) await tx.financialCharge.upsert({ where: { careerFeeId_studentCarnet: { careerFeeId: fee.id, studentCarnet } }, update: {}, create: { studentCarnet, concept: fee.concept, amount: fee.amount, dueDate: fee.dueDate, cycleId: fee.cycleId, careerFeeId: fee.id } });
      await tx.auditLog.create({ data: { action: 'ENROLL', entityType: 'ENROLLMENT', entityId: enrollment.id, actorId: user.id } });
      return tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id }, include: { student: true, section: { include: { course: true } } } });
    });
    res.status(201).json(enrollmentView(record));
  });
  app.delete('/api/enrollments/:id', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const record = await prisma.enrollment.findUnique({ where: { id: req.params.id } });
    if (!record) return void res.status(404).json({ message: 'Inscripción no encontrada.' });
    if (user.role === 'ESTUDIANTE' && user.carnetOrCode !== record.studentCarnet) return void res.status(403).json({ message: 'No puedes retirar esta inscripción.' });
    if (record.status === 'Inscrito') await prisma.$transaction([prisma.enrollment.update({ where: { id: record.id }, data: { status: 'Retirado' } }), prisma.section.update({ where: { id: record.sectionId }, data: { enrolledCount: { decrement: 1 } } })]);
    res.json({ ok: true });
  });

  // ── Virtual Classrooms ───────────────────────────────────────────────────────

  app.get('/api/virtual-classrooms', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    const where = user.role === 'DOCENTE'
      ? { section: { teacherId: user.carnetOrCode } }
      : user.role === 'ESTUDIANTE'
        ? { section: { enrollments: { some: { studentCarnet: user.carnetOrCode, status: 'Inscrito' } } } }
        : {};
    const records = await prisma.virtualClassroom.findMany({ where, include: { section: { include: { course: true, teacher: true, cycle: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(records.map((record) => ({ id: record.id, provider: record.provider, syncStatus: record.syncStatus, enrollmentCode: record.enrollmentCode, alternateLink: record.alternateLink, lastSyncedAt: record.lastSyncedAt, syncError: record.syncError, sectionId: record.sectionId, sectionCode: record.section.code, courseCode: record.section.courseCode, courseName: record.section.course.name, teacherName: record.section.teacher.name, cycleName: record.section.cycle.name })));
  });

  app.post('/api/virtual-classrooms/:id/sync', requireAdmin, async (_req, res) => {
    if (!process.env.GOOGLE_CLASSROOM_CLIENT_ID) return void res.status(503).json({ message: 'Google Workspace todavía no está configurado. TI debe proporcionar las credenciales OAuth institucionales.' });
    res.status(501).json({ message: 'Las credenciales fueron detectadas, pero la autorización administrativa todavía debe completarse.' });
  });

  // ── Student Requests & Enrollment Documents ──────────────────────────────────

  app.get('/api/student-requests', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Este módulo no está disponible para catedráticos.' });
    const records = await prisma.studentServiceRequest.findMany({ where: user.role === 'ESTUDIANTE' ? { studentCarnet: user.carnetOrCode || '' } : {}, include: { student: true }, orderBy: { createdAt: 'desc' } });
    res.json(records.map((record) => ({ id: record.id, type: record.type, status: record.status, purpose: record.purpose, deliveryType: record.deliveryType, adminNote: record.adminNote, handledBy: record.handledBy, reviewedAt: record.reviewedAt, completedAt: record.completedAt, createdAt: record.createdAt, studentCarnet: record.studentCarnet, studentName: record.student.name, careerName: record.student.careerName || record.student.careerId, creditsEarned: record.student.creditsEarned, totalCreditsRequired: record.student.totalCreditsRequired })));
  });

  app.post('/api/student-requests', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role !== 'ESTUDIANTE') return void res.status(403).json({ message: 'La solicitud debe ser creada desde la cuenta del estudiante.' });
    const type = String(req.body.type || '').trim().toUpperCase();
    const purpose = String(req.body.purpose || '').trim();
    const deliveryType = String(req.body.deliveryType || 'DIGITAL').trim().toUpperCase();
    if (!['CONSTANCIA_ESTUDIOS', 'CERTIFICACION_NOTAS', 'CIERRE_PENSUM'].includes(type) || purpose.length < 5 || !['DIGITAL', 'FISICA'].includes(deliveryType)) return void res.status(400).json({ message: 'Selecciona un trámite e indica el propósito y forma de entrega.' });
    const duplicate = await prisma.studentServiceRequest.findFirst({ where: { studentCarnet: user.carnetOrCode || '', type, status: { in: ['SOLICITADA', 'EN_REVISION', 'APROBADA'] } } });
    if (duplicate) return void res.status(409).json({ message: 'Ya tienes una solicitud activa de este trámite.' });
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.studentServiceRequest.create({ data: { studentCarnet: user.carnetOrCode || '', type, purpose, deliveryType } });
      await tx.auditLog.create({ data: { action: 'CREATE_STUDENT_REQUEST', entityType: 'STUDENT_REQUEST', entityId: created.id, actorId: user.id, details: JSON.stringify({ type, deliveryType }) } });
      return created;
    });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    for (const admin of admins) await helpers.notifyUser(admin.id, 'Nueva solicitud estudiantil', `${user.name} solicitó ${type.replaceAll('_', ' ').toLowerCase()}.`, 'INFO', '/solicitudes');
    res.status(201).json(record);
  });

  app.patch('/api/student-requests/:id', requireAdmin, async (req, res) => {
    const status = String(req.body.status || '').trim().toUpperCase();
    const adminNote = String(req.body.adminNote || '').trim();
    if (!['EN_REVISION', 'APROBADA', 'RECHAZADA', 'ENTREGADA'].includes(status)) return void res.status(400).json({ message: 'Selecciona un estado válido.' });
    if (['RECHAZADA', 'ENTREGADA'].includes(status) && adminNote.length < 3) return void res.status(400).json({ message: 'Agrega una observación para informar al estudiante.' });
    const current = await prisma.studentServiceRequest.findUnique({ where: { id: req.params.id } });
    if (!current) return void res.status(404).json({ message: 'Solicitud no encontrada.' });
    if (['RECHAZADA', 'ENTREGADA'].includes(current.status)) return void res.status(409).json({ message: 'La solicitud ya está cerrada.' });
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.studentServiceRequest.update({ where: { id: current.id }, data: { status, adminNote: adminNote || null, handledBy: res.locals.authUser.name, reviewedAt: current.reviewedAt || now, completedAt: ['RECHAZADA', 'ENTREGADA'].includes(status) ? now : null } });
      await tx.auditLog.create({ data: { action: 'UPDATE_STUDENT_REQUEST', entityType: 'STUDENT_REQUEST', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ from: current.status, to: status, adminNote }) } });
      return saved;
    });
    const labels: Record<string, string> = { EN_REVISION: 'está en revisión', APROBADA: 'fue aprobada', RECHAZADA: 'fue rechazada', ENTREGADA: 'fue completada y entregada' };
    await helpers.notifyByCarnet(current.studentCarnet, 'Actualización de solicitud', `Tu solicitud ${labels[status]}.${adminNote ? ` Observación: ${adminNote}` : ''}`, status === 'RECHAZADA' ? 'WARNING' : status === 'ENTREGADA' ? 'SUCCESS' : 'INFO', '/solicitudes');
    res.json(updated);
  });

  const enrollmentDocumentTypes: Record<string, string> = {
    DPI: 'Documento de identificación (DPI)',
    CERTIFICADO_NACIMIENTO: 'Certificado de nacimiento',
    TITULO_DIVERSIFICADO: 'Título de nivel diversificado',
    CERTIFICACION_ESTUDIOS: 'Certificación de estudios',
    FOTOGRAFIA: 'Fotografía reciente',
  };

  app.get('/api/enrollment-documents', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
    if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
    const student = await prisma.student.findUnique({ where: { carnet: studentCarnet } });
    if (!student) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const documents = await prisma.enrollmentDocument.findMany({ where: { studentCarnet }, orderBy: { createdAt: 'desc' }, omit: { fileData: true } });
    const byType = new Map(documents.map((document) => [document.type, document]));
    res.json({ student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId }, requirements: Object.entries(enrollmentDocumentTypes).map(([type, label]) => ({ type, label, document: byType.get(type) || null })), summary: { total: Object.keys(enrollmentDocumentTypes).length, uploaded: documents.length, approved: documents.filter((item) => item.status === 'APROBADO').length, complete: documents.length === Object.keys(enrollmentDocumentTypes).length && documents.every((item) => item.status === 'APROBADO') } });
  });

  app.post('/api/enrollment-documents', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (!['ESTUDIANTE', 'ADMIN'].includes(user.role)) return void res.status(403).json({ message: 'El archivo debe cargarse desde la cuenta del estudiante o administración.' });
    const targetCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.body.studentCarnet || '').trim();
    const type = String(req.body.type || '').trim().toUpperCase();
    const fileName = String(req.body.fileName || '').trim().slice(0, 180);
    const dataUrl = String(req.body.dataUrl || '');
    const match = dataUrl.match(/^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!enrollmentDocumentTypes[type] || !fileName || !match) return void res.status(400).json({ message: 'Selecciona un requisito y carga un archivo PDF, PNG o JPG válido.' });
    if (Buffer.byteLength(match[2], 'base64') > 3 * 1024 * 1024) return void res.status(400).json({ message: 'El archivo no puede superar 3 MB.' });
    const document = await prisma.$transaction(async (tx) => {
      const saved = await tx.enrollmentDocument.upsert({ where: { studentCarnet_type: { studentCarnet: targetCarnet, type } }, update: { fileName, mimeType: match[1], fileData: match[2], status: 'PENDIENTE', reviewNote: null, reviewedBy: null, reviewedAt: null }, create: { studentCarnet: targetCarnet, type, fileName, mimeType: match[1], fileData: match[2] } });
      await tx.auditLog.create({ data: { action: 'UPLOAD_ENROLLMENT_DOCUMENT', entityType: 'ENROLLMENT_DOCUMENT', entityId: saved.id, actorId: user.id, details: JSON.stringify({ type, fileName }) } });
      return saved;
    });
    if (user.role === 'ESTUDIANTE') { const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } }); for (const admin of admins) await helpers.notifyUser(admin.id, 'Documento pendiente de revisión', `${user.name} cargó ${enrollmentDocumentTypes[type]}.`, 'INFO', '/expediente'); }
    else await helpers.notifyByCarnet(targetCarnet, 'Documento cargado en tu expediente', `Administración cargó ${enrollmentDocumentTypes[type]} en tu expediente.`, 'INFO', '/expediente');
    res.status(201).json({ id: document.id, status: document.status });
  });

  app.get('/api/enrollment-documents/:id/file', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const document = await prisma.enrollmentDocument.findUnique({ where: { id: req.params.id } });
    if (!document || user.role === 'DOCENTE' || (user.role === 'ESTUDIANTE' && document.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Documento no encontrado.' });
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`);
    res.send(Buffer.from(document.fileData, 'base64'));
  });

  app.patch('/api/enrollment-documents/:id/review', requireAdmin, async (req, res) => {
    const status = String(req.body.status || '').trim().toUpperCase();
    const reviewNote = String(req.body.reviewNote || '').trim();
    if (!['APROBADO', 'RECHAZADO'].includes(status) || (status === 'RECHAZADO' && reviewNote.length < 3)) return void res.status(400).json({ message: 'Selecciona aprobar o rechazar; el rechazo requiere una observación.' });
    const current = await prisma.enrollmentDocument.findUnique({ where: { id: req.params.id } });
    if (!current) return void res.status(404).json({ message: 'Documento no encontrado.' });
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.enrollmentDocument.update({ where: { id: current.id }, data: { status, reviewNote: reviewNote || null, reviewedBy: res.locals.authUser.name, reviewedAt: new Date() } });
      await tx.auditLog.create({ data: { action: 'REVIEW_ENROLLMENT_DOCUMENT', entityType: 'ENROLLMENT_DOCUMENT', entityId: current.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, reviewNote }) } });
      return saved;
    });
    await helpers.notifyByCarnet(current.studentCarnet, `Documento ${status.toLowerCase()}`, `${enrollmentDocumentTypes[current.type] || 'El documento'} fue ${status.toLowerCase()}.${reviewNote ? ` Observación: ${reviewNote}` : ''}`, status === 'APROBADO' ? 'SUCCESS' : 'WARNING', '/expediente');
    res.json(updated);
  });
}
