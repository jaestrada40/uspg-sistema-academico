import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Student,
  Teacher,
  Career,
  Course,
  AcademicCycle,
  Section,
  Classroom,
  Enrollment,
  GradeRecord,
  NotificationItem,
  AcademicParameters,
  InstitutionConfig,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_CYCLES,
  INITIAL_CAREERS,
  INITIAL_COURSES,
  INITIAL_TEACHERS,
  INITIAL_CLASSROOMS,
  INITIAL_SECTIONS,
  INITIAL_STUDENTS,
  INITIAL_ENROLLMENTS,
  INITIAL_GRADES,
  INITIAL_NOTIFICATIONS,
  INITIAL_PARAMETERS,
} from '../data/mockData';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface AppContextType {
  // Auth & Role
  isAuthenticated: boolean;
  authLoading: boolean;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  login: (username: string, password: string, rememberMe: boolean) => Promise<{ success: boolean; message?: string; mfaRequired?: boolean; challengeToken?: string }>;
  verifyMfa: (challengeToken: string, code: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;

  // Cycles
  cycles: AcademicCycle[];
  currentCycle: AcademicCycle;
  setCurrentCycleId: (id: string) => Promise<void>;
  addCycle: (cycle: Omit<AcademicCycle, 'id'>) => Promise<boolean>;
  updateCycle: (id: string, cycle: Partial<AcademicCycle>) => Promise<boolean>;

  // Students
  students: Student[];
  addStudent: (student: Student) => Promise<boolean>;
  updateStudent: (carnet: string, student: Partial<Student>) => Promise<boolean>;
  toggleStudentStatus: (carnet: string) => Promise<void>;

  // Teachers
  teachers: Teacher[];
  addTeacher: (teacher: Teacher) => Promise<boolean>;
  updateTeacher: (code: string, teacher: Partial<Teacher>) => Promise<boolean>;
  toggleTeacherStatus: (code: string) => Promise<void>;

  // Careers
  careers: Career[];
  addCareer: (career: Career) => Promise<boolean>;
  updateCareer: (code: string, career: Partial<Career>) => Promise<boolean>;
  toggleCareerStatus: (code: string) => Promise<void>;

  // Courses
  courses: Course[];
  addCourse: (course: Course) => Promise<boolean>;
  updateCourse: (code: string, course: Partial<Course>) => Promise<boolean>;
  toggleCourseStatus: (code: string) => Promise<void>;

  // Sections
  sections: Section[];
  addSection: (section: Omit<Section, 'id' | 'enrolledCount'>) => Promise<boolean>;
  updateSection: (id: string, section: Partial<Section>) => Promise<boolean>;
  deleteSection: (id: string) => Promise<void>;

  // Classrooms
  classrooms: Classroom[];
  addClassroom: (classroom: Classroom) => Promise<boolean>;
  updateClassroom: (id: string, classroom: Partial<Classroom>) => Promise<boolean>;

  // Enrollments
  enrollments: Enrollment[];
  enrollInCourse: (studentCarnet: string, sectionId: string) => Promise<{ success: boolean; message: string }>;
  dropEnrollment: (enrollmentId: string) => Promise<void>;

  // Grades
  grades: GradeRecord[];
  updateGrade: (id: string, gradeData: Partial<GradeRecord>) => Promise<void>;
  batchUpdateGrades: (updates: { id: string; zona: number; parcial: number; segundoParcial: number; final: number; recuperacion: number }[]) => Promise<void>;
  publishGrades: (sectionId: string) => Promise<void>;
  closeGrades: (sectionId: string) => Promise<boolean>;

  // Notifications & UI Alerts
  notifications: NotificationItem[];
  markNotificationAsRead: (id: string) => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;

  // Parameters
  parameters: AcademicParameters;
  updateParameters: (newParams: Partial<AcademicParameters>) => void;

  // Institutional identity
  institution: InstitutionConfig;
  saveInstitution: (config: Omit<InstitutionConfig, 'updatedAt'>) => Promise<boolean>;

  // Utility
  resetToDefaults: () => void;
  globalSearch: string;
  setGlobalSearch: (term: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Local storage keys
  const loadInitial = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(`uspg_${key}`);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  };

  const [users] = useState<User[]>(INITIAL_USERS);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User>(() => loadInitial('currentUser', INITIAL_USERS[0]));
  const [cycles, setCycles] = useState<AcademicCycle[]>(() => loadInitial('cycles', INITIAL_CYCLES));
  const [students, setStudents] = useState<Student[]>(() => loadInitial('students', INITIAL_STUDENTS));
  const [teachers, setTeachers] = useState<Teacher[]>(() => loadInitial('teachers', INITIAL_TEACHERS));
  const [careers, setCareers] = useState<Career[]>(() => loadInitial('careers', INITIAL_CAREERS));
  const [courses, setCourses] = useState<Course[]>(() => loadInitial('courses', INITIAL_COURSES));
  const [sections, setSections] = useState<Section[]>(() => loadInitial('sections', INITIAL_SECTIONS));
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => loadInitial('classrooms', INITIAL_CLASSROOMS));
  const [enrollments, setEnrollments] = useState<Enrollment[]>(() => loadInitial('enrollments', INITIAL_ENROLLMENTS));
  const [grades, setGrades] = useState<GradeRecord[]>(() => loadInitial('grades', INITIAL_GRADES));
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => loadInitial('notifications', INITIAL_NOTIFICATIONS));
  const [parameters, setParameters] = useState<AcademicParameters>(() => loadInitial('parameters', INITIAL_PARAMETERS));
  const [institution, setInstitution] = useState<InstitutionConfig>({
    name: 'Universidad de San Pablo de Guatemala',
    shortName: 'USPG',
      logoDataUrl: null,
      mfaRequiredRoles: undefined,
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sync to local storage
  useEffect(() => { localStorage.setItem('uspg_cycles', JSON.stringify(cycles)); }, [cycles]);
  useEffect(() => { localStorage.setItem('uspg_students', JSON.stringify(students)); }, [students]);
  useEffect(() => { localStorage.setItem('uspg_teachers', JSON.stringify(teachers)); }, [teachers]);
  useEffect(() => { localStorage.setItem('uspg_careers', JSON.stringify(careers)); }, [careers]);
  useEffect(() => { localStorage.setItem('uspg_courses', JSON.stringify(courses)); }, [courses]);
  useEffect(() => { localStorage.setItem('uspg_sections', JSON.stringify(sections)); }, [sections]);
  useEffect(() => { localStorage.setItem('uspg_classrooms', JSON.stringify(classrooms)); }, [classrooms]);
  useEffect(() => { localStorage.setItem('uspg_enrollments', JSON.stringify(enrollments)); }, [enrollments]);
  useEffect(() => { localStorage.setItem('uspg_grades', JSON.stringify(grades)); }, [grades]);
  useEffect(() => { localStorage.setItem('uspg_notifications', JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('uspg_parameters', JSON.stringify(parameters)); }, [parameters]);
  useEffect(() => {
    fetch('/api/institution')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración institucional');
        return response.json();
      })
      .then((record: InstitutionConfig | null) => {
        if (record?.name && record?.shortName) setInstitution(record);
      })
      .catch(() => showToast('No se pudo conectar con la configuración institucional', 'warning'));
  }, []);
  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'ADMIN') return;
    Promise.all([fetch('/api/students'), fetch('/api/teachers'), fetch('/api/careers'), fetch('/api/courses')])
      .then(async ([studentResponse, teacherResponse, careerResponse, courseResponse]) => {
        if (![studentResponse, teacherResponse, careerResponse, courseResponse].every((response) => response.ok)) throw new Error('No se pudieron cargar los datos académicos');
        const [studentRecords, teacherRecords, careerRecords, courseRecords] = await Promise.all([studentResponse.json(), teacherResponse.json(), careerResponse.json(), courseResponse.json()]);
        setStudents(studentRecords);
        setTeachers(teacherRecords);
        setCareers(careerRecords);
        setCourses(courseRecords);
      })
      .catch(() => showToast('No se pudieron cargar estudiantes y catedráticos desde la base', 'warning'));
  }, [isAuthenticated, currentUser.role]);
  useEffect(() => {
    if (!isAuthenticated) return;
    Promise.all([fetch('/api/cycles'), fetch('/api/classrooms'), fetch('/api/sections'), fetch('/api/enrollments'), fetch('/api/grades')]).then(async (responses) => {
      if (!responses.every((response) => response.ok)) return;
      const [cycleRecords, classroomRecords, sectionRecords, enrollmentRecords, gradeRecords] = await Promise.all(responses.map((response) => response.json()));
      setCycles(cycleRecords); setClassrooms(classroomRecords); setSections(sectionRecords); setEnrollments(enrollmentRecords); setGrades(gradeRecords);
    });
  }, [isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const loadNotifications = () => fetch('/api/notifications').then((response) => response.ok ? response.json() : []).then(setNotifications).catch(() => undefined);
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated]);
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('Sin sesión');
        return response.json();
      })
      .then(({ user }) => {
        setCurrentUser(user);
        setIsAuthenticated(true);
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthLoading(false));
  }, []);

  // Current Cycle
  const currentCycle = cycles.find((c) => c.isCurrent) || cycles[0];

  const setCurrentCycleId = async (id: string) => {
    if (!(await updateCycle(id, { isCurrent: true }))) return;
    showToast(`Ciclo activo cambiado a: ${cycles.find((c) => c.id === id)?.name || id}`, 'info');
  };

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, message.includes('Contraseña temporal') ? 15000 : 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Server-backed authentication
  const login = async (username: string, password: string, rememberMe: boolean) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const result = await response.json();
      if (!response.ok) return { success: false, message: result.message || 'No se pudo iniciar sesión.' };
      if (result.mfaRequired) return { success: false, mfaRequired: true, challengeToken: result.challengeToken };
      setCurrentUser(result.user);
      setIsAuthenticated(true);
      showToast(`Sesión iniciada como ${result.user.name} (${result.user.role})`, 'success');
      return { success: true };
    } catch {
      return { success: false, message: 'No se pudo conectar con el servidor.' };
    }
  };

  const verifyMfa = async (challengeToken: string, code: string) => {
    try {
      const response = await fetch('/api/auth/mfa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code }) });
      const result = await response.json();
      if (!response.ok) return { success: false, message: result.message || 'No se pudo verificar el segundo factor.' };
      setCurrentUser(result.user);
      setIsAuthenticated(true);
      showToast(result.recoveryCodeUsed ? 'Código de recuperación utilizado. Genera códigos nuevos si quedan pocos.' : 'Segundo factor verificado', result.recoveryCodeUsed ? 'warning' : 'success');
      return { success: true };
    } catch { return { success: false, message: 'No se pudo conectar con el servidor.' }; }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setIsAuthenticated(false);
    setCurrentUser(INITIAL_USERS[0]);
    showToast('Sesión cerrada exitosamente', 'info');
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo cambiar la contraseña', 'error'); return false; }
    setCurrentUser((user) => ({ ...user, mustChangePassword: false }));
    showToast('Contraseña actualizada correctamente', 'success');
    return true;
  };

  // Cycles CRUD
  const addCycle = async (newCycleData: Omit<AcademicCycle, 'id'>) => {
    const response = await fetch('/api/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => result.isCurrent ? [...prev.map((cycle) => ({ ...cycle, isCurrent: false })), result] : [...prev, result]); showToast(`Ciclo ${result.name} creado correctamente`, 'success'); return true;
  };

  const updateCycle = async (id: string, cycleData: Partial<AcademicCycle>) => {
    const response = await fetch(`/api/cycles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycleData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setCycles((prev) => prev.map((cycle) => result.isCurrent ? { ...cycle, isCurrent: cycle.id === id } : cycle.id === id ? result : cycle)); showToast('Ciclo académico actualizado', 'success'); return true;
  };

  // Students CRUD
  const addStudent = async (student: Student) => {
    const response = await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(student) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo registrar el estudiante', 'error'); return false; }
    setStudents((prev) => [...prev, result.student]);
    showToast(`Cuenta creada. Contraseña temporal: ${result.temporaryPassword}`, 'success');
    return true;
  };

  const updateStudent = async (carnet: string, updated: Partial<Student>) => {
    const response = await fetch(`/api/students/${encodeURIComponent(carnet)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo actualizar el estudiante', 'error'); return false; }
    setStudents((prev) => prev.map((student) => (student.carnet === carnet ? result : student)));
    showToast('Datos del estudiante actualizados', 'success');
    return true;
  };

  const toggleStudentStatus = async (carnet: string) => {
    const student = students.find((candidate) => candidate.carnet === carnet);
    if (!student) return;
    const nextStatus = student.status === 'Activo' ? 'Inactivo' : 'Activo';
    if (await updateStudent(carnet, { status: nextStatus })) showToast(`Estado de ${student.name} cambiado a ${nextStatus}`, 'info');
  };

  // Teachers CRUD
  const addTeacher = async (teacher: Teacher) => {
    const response = await fetch('/api/teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teacher) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo registrar el catedrático', 'error'); return false; }
    setTeachers((prev) => [...prev, result.teacher]);
    showToast(`Cuenta creada. Contraseña temporal: ${result.temporaryPassword}`, 'success');
    return true;
  };

  const updateTeacher = async (code: string, updated: Partial<Teacher>) => {
    const response = await fetch(`/api/teachers/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo actualizar el catedrático', 'error'); return false; }
    setTeachers((prev) => prev.map((teacher) => (teacher.code === code ? result : teacher)));
    showToast('Datos del docente actualizados', 'success');
    return true;
  };

  const toggleTeacherStatus = async (code: string) => {
    const teacher = teachers.find((candidate) => candidate.code === code);
    if (!teacher) return;
    const nextStatus = teacher.status === 'Activo' ? 'Inactivo' : 'Activo';
    if (await updateTeacher(code, { status: nextStatus })) showToast(`Docente ${teacher.name} ahora está ${nextStatus}`, 'info');
  };

  // Careers CRUD
  const addCareer = async (career: Career) => {
    const response = await fetch('/api/careers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(career) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo crear la carrera', 'error'); return false; }
    setCareers((prev) => [...prev, result]);
    showToast(`Carrera ${career.name} agregada con éxito`, 'success');
    return true;
  };

  const updateCareer = async (code: string, updated: Partial<Career>) => {
    const response = await fetch(`/api/careers/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo actualizar la carrera', 'error'); return false; }
    setCareers((prev) => prev.map((career) => (career.code === code ? result : career)));
    showToast('Carrera actualizada', 'success');
    return true;
  };

  const toggleCareerStatus = async (code: string) => {
    const career = careers.find((candidate) => candidate.code === code);
    if (!career) return;
    const nextStatus = career.status === 'Activo' ? 'Inactivo' : 'Activo';
    if (await updateCareer(code, { status: nextStatus })) showToast(`Carrera ${career.name} ${nextStatus}`, 'info');
  };

  // Courses CRUD
  const addCourse = async (course: Course) => {
    const response = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(course) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo crear el curso', 'error'); return false; }
    setCourses((prev) => [...prev, result]);
    showToast(`Curso ${course.name} creado correctamente`, 'success');
    return true;
  };

  const updateCourse = async (code: string, updated: Partial<Course>) => {
    const response = await fetch(`/api/courses/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message || 'No se pudo actualizar el curso', 'error'); return false; }
    setCourses((prev) => prev.map((course) => (course.code === code ? result : course)));
    showToast('Curso actualizado', 'success');
    return true;
  };

  const toggleCourseStatus = async (code: string) => {
    const course = courses.find((candidate) => candidate.code === code);
    if (!course) return;
    const nextStatus = course.status === 'Activo' ? 'Inactivo' : 'Activo';
    if (await updateCourse(code, { status: nextStatus })) showToast(`Curso ${course.name} cambiado a ${nextStatus}`, 'info');
  };

  // Sections CRUD
  const addSection = async (secData: Omit<Section, 'id' | 'enrolledCount'>) => {
    const response = await fetch('/api/sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(secData) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; } setSections((prev) => [...prev, result]); showToast(`Sección ${result.code} creada con éxito`, 'success'); return true;
  };

  const updateSection = async (id: string, updated: Partial<Section>) => {
    const response = await fetch(`/api/sections/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; } setSections((prev) => prev.map((section) => section.id === id ? result : section)); showToast('Sección actualizada', 'success'); return true;
  };

  const deleteSection = async (id: string) => {
    const response = await fetch(`/api/sections/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) { showToast('No se pudo eliminar la sección', 'error'); return; } setSections((prev) => prev.filter((section) => section.id !== id)); showToast('Sección eliminada', 'warning');
  };

  // Classrooms CRUD
  const addClassroom = async (classroom: Classroom) => {
    const response = await fetch('/api/classrooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(classroom) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; } setClassrooms((prev) => [...prev, result]); showToast(`Aula ${result.code} registrada con éxito`, 'success'); return true;
  };

  const updateClassroom = async (id: string, updated: Partial<Classroom>) => {
    const response = await fetch(`/api/classrooms/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }); const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; } setClassrooms((prev) => prev.map((classroom) => classroom.id === id ? result : classroom)); showToast('Información de aula actualizada', 'success'); return true;
  };

  // Enrollments
  const enrollInCourse = async (studentCarnet: string, sectionId: string) => {
    const response = await fetch('/api/enrollments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentCarnet, sectionId }) });
    const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return { success: false, message: result.message }; }
    setEnrollments((prev) => [...prev, result]); setSections((prev) => prev.map((section) => section.id === sectionId ? { ...section, enrolledCount: section.enrolledCount + 1 } : section)); showToast(`¡Inscripción exitosa en ${result.courseName}!`, 'success'); return { success: true, message: 'Inscripción realizada con éxito' };
    /*
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return { success: false, message: 'Sección no encontrada' };

    const course = courses.find((c) => c.code === sec.courseCode);

    // 1. Quota check
    if (sec.enrolledCount >= sec.capacity) {
      showToast(`Error: La sección ${sec.code} no tiene cupos disponibles.`, 'error');
      return { success: false, message: 'Sección sin cupo disponible' };
    }

    // 2. Already enrolled check
    const existing = enrollments.find(
      (e) => e.studentCarnet === studentCarnet && e.sectionId === sectionId && e.status === 'Inscrito'
    );
    if (existing) {
      showToast('Ya estás inscrito en esta sección.', 'warning');
      return { success: false, message: 'Ya estás inscrito en esta sección' };
    }

    // 3. Prerequisite check
    if (course && course.prerequisiteCodes && course.prerequisiteCodes.length > 0) {
      const studentGrades = grades.filter((g) => g.studentCarnet === studentCarnet && g.status === 'Aprobado');
      const approvedCourseCodes = studentGrades.map((g) => g.courseCode);

      const missingPrereqs = course.prerequisiteCodes.filter((req) => !approvedCourseCodes.includes(req));
      if (missingPrereqs.length > 0) {
        const msg = `No cumples con el prerrequisito obligatorio (${missingPrereqs.join(', ')}) para llevar ${course.name}.`;
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
    }

    // 4. Max credits check
    const currentStudentEnrollments = enrollments.filter(
      (e) => e.studentCarnet === studentCarnet && e.cycleId === currentCycle.id && e.status === 'Inscrito'
    );
    const totalEnrolledCredits = currentStudentEnrollments.reduce((sum, enr) => {
      const s = sections.find((secItem) => secItem.id === enr.sectionId);
      const c = courses.find((cItem) => cItem.code === s?.courseCode);
      return sum + (c?.credits || 0);
    }, 0);

    if (totalEnrolledCredits + (course?.credits || 0) > parameters.maxCreditLimit) {
      const msg = `Límite de créditos excedido (${totalEnrolledCredits + (course?.credits || 0)} / máx ${parameters.maxCreditLimit}).`;
      showToast(msg, 'error');
      return { success: false, message: msg };
    }

    // Process enrollment
    const studentObj = students.find((s) => s.carnet === studentCarnet);
    const newEnr: Enrollment = {
      id: `ENR-${Date.now().toString().slice(-5)}`,
      studentCarnet,
      studentName: studentObj?.name || studentCarnet,
      sectionId,
      courseCode: sec.courseCode,
      courseName: sec.courseName || sec.courseCode,
      cycleId: currentCycle.id,
      enrollmentDate: new Date().toISOString().split('T')[0],
      status: 'Inscrito',
    };

    setEnrollments((prev) => [...prev, newEnr]);
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, enrolledCount: s.enrolledCount + 1 } : s))
    );

    // Create active grade record
    const newGrade: GradeRecord = {
      id: `GRD-${Date.now().toString().slice(-5)}`,
      studentCarnet,
      studentName: studentObj?.name || studentCarnet,
      sectionId,
      courseCode: sec.courseCode,
      courseName: sec.courseName || sec.courseCode,
      cycleId: currentCycle.id,
      zona: 0,
      parcial: 0,
      segundoParcial: 0,
      final: 0,
      recuperacion: 0,
      total: 0,
      status: 'En curso',
      isPublished: false,
    };
    setGrades((prev) => [...prev, newGrade]);

    showToast(`¡Inscripción exitosa en ${sec.courseName}!`, 'success');
    return { success: true, message: 'Inscripción realizada con éxito' };
    */
  };

  const dropEnrollment = async (enrollmentId: string) => {
    const response = await fetch(`/api/enrollments/${encodeURIComponent(enrollmentId)}`, { method: 'DELETE' });
    if (!response.ok) { const result = await response.json(); showToast(result.message, 'error'); return; }
    const enrollment = enrollments.find((item) => item.id === enrollmentId); setEnrollments((prev) => prev.map((item) => item.id === enrollmentId ? { ...item, status: 'Retirado' } : item)); if (enrollment) setSections((prev) => prev.map((section) => section.id === enrollment.sectionId ? { ...section, enrolledCount: Math.max(0, section.enrolledCount - 1) } : section)); showToast(`Inscripción de ${enrollment?.courseName || 'curso'} retirada`, 'warning');
    /*
    const enr = enrollments.find((e) => e.id === enrollmentId);
    if (!enr) return;

    setEnrollments((prev) =>
      prev.map((e) => (e.id === enrollmentId ? { ...e, status: 'Retirado' } : e))
    );

    setSections((prev) =>
      prev.map((s) => (s.id === enr.sectionId ? { ...s, enrolledCount: Math.max(0, s.enrolledCount - 1) } : s))
    );

    setGrades((prev) =>
      prev.map((g) =>
        g.studentCarnet === enr.studentCarnet && g.sectionId === enr.sectionId
          ? { ...g, status: 'Retirado' }
          : g
      )
    );

    showToast(`Inscripción de ${enr.courseName} ha sido retirada`, 'warning');
    */
  };

  // Grades CRUD
  const updateGrade = async (id: string, updated: Partial<GradeRecord>) => {
    const response = await fetch(`/api/grades/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }); const result = await response.json(); if (!response.ok) { showToast(result.message, 'error'); return; } setGrades((prev) => prev.map((grade) => grade.id === id ? result : grade));
  };

  const batchUpdateGrades = async (
    updates: { id: string; zona: number; parcial: number; segundoParcial: number; final: number; recuperacion: number }[]
  ) => {
    await Promise.all(updates.map((update) => updateGrade(update.id, update)));
    showToast('Calificaciones guardadas correctamente', 'success');
  };

  const publishGrades = async (sectionId: string) => {
    const response = await fetch(`/api/grades/sections/${encodeURIComponent(sectionId)}/publish`, { method: 'POST' }); const result = await response.json(); if (!response.ok) { showToast(result.message, 'error'); return; } setGrades((prev) => prev.map((grade) => grade.sectionId === sectionId ? { ...grade, isPublished: true, actaStatus: 'PUBLICADA', gradesPublishedAt: result.publishedAt } : grade));
    showToast('Acta de notas publicada oficialmente. Los estudiantes ya pueden visualizar su resultado.', 'success');
  };

  const closeGrades = async (sectionId: string) => {
    const response = await fetch(`/api/grades/sections/${encodeURIComponent(sectionId)}/close`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) { showToast(result.message, 'error'); return false; }
    setGrades((prev) => prev.map((grade) => grade.sectionId === sectionId ? { ...grade, actaStatus: 'CERRADA', gradesClosedAt: result.closedAt, gradesClosedBy: result.closedBy } : grade));
    showToast('Acta cerrada definitivamente. Las calificaciones quedaron bloqueadas.', 'success');
    return true;
  };

  // Notifications
  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }).catch(() => undefined);
  };

  // Parameters
  const updateParameters = (newParams: Partial<AcademicParameters>) => {
    setParameters((prev) => ({ ...prev, ...newParams }));
    showToast('Parámetros académicos actualizados', 'success');
  };

  const saveInstitution = async (config: Omit<InstitutionConfig, 'updatedAt'>) => {
    try {
      const response = await fetch('/api/institution', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'No se pudo guardar la configuración');
      setInstitution(result);
      showToast('Identidad institucional guardada correctamente', 'success');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar la configuración', 'error');
      return false;
    }
  };

  // Reset local storage
  const resetToDefaults = () => {
    localStorage.clear();
    setCurrentUser(INITIAL_USERS[0]);
    setCycles(INITIAL_CYCLES);
    setStudents(INITIAL_STUDENTS);
    setTeachers(INITIAL_TEACHERS);
    setCareers(INITIAL_CAREERS);
    setCourses(INITIAL_COURSES);
    setSections(INITIAL_SECTIONS);
    setClassrooms(INITIAL_CLASSROOMS);
    setEnrollments(INITIAL_ENROLLMENTS);
    setGrades(INITIAL_GRADES);
    setNotifications(INITIAL_NOTIFICATIONS);
    setParameters(INITIAL_PARAMETERS);
    showToast('Sistema reiniciado a datos por defecto de la USPG', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        authLoading,
        currentUser,
        setCurrentUser,
        users,
        login,
        verifyMfa,
        logout,
        changePassword,
        cycles,
        currentCycle,
        setCurrentCycleId,
        addCycle,
        updateCycle,
        students,
        addStudent,
        updateStudent,
        toggleStudentStatus,
        teachers,
        addTeacher,
        updateTeacher,
        toggleTeacherStatus,
        careers,
        addCareer,
        updateCareer,
        toggleCareerStatus,
        courses,
        addCourse,
        updateCourse,
        toggleCourseStatus,
        sections,
        addSection,
        updateSection,
        deleteSection,
        classrooms,
        addClassroom,
        updateClassroom,
        enrollments,
        enrollInCourse,
        dropEnrollment,
        grades,
        updateGrade,
        batchUpdateGrades,
        publishGrades,
        closeGrades,
        notifications,
        markNotificationAsRead,
        toasts,
        showToast,
        removeToast,
        parameters,
        updateParameters,
        institution,
        saveInstitution,
        resetToDefaults,
        globalSearch,
        setGlobalSearch,
        sidebarOpen,
        setSidebarOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
