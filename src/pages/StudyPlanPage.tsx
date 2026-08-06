import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Circle, GraduationCap, LockKeyhole } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';
import { useApp } from '../context/AppContext';
import { StudentPicker } from '../components/common/StudentPicker';

interface PlanCourse {
  code: string;
  name: string;
  credits: number;
  semester: number;
  status: 'APROBADO' | 'EN_CURSO' | 'DISPONIBLE' | 'BLOQUEADO';
  prerequisites: { code: string; name: string; completed: boolean }[];
  unlocks: { code: string; name: string; semester: number }[];
}

interface PlanData {
  student: { carnet: string; name: string; careerName: string; planCode: string; planName: string; planVersion: string };
  curriculum: { totalCourses: number; totalCredits: number; semesters: number };
  courses: PlanCourse[];
}

const statusLabel = { APROBADO: 'Aprobado', EN_CURSO: 'En curso', DISPONIBLE: 'Puede cursarlo', BLOQUEADO: 'Requiere cursos previos' };
const statusStyle = { APROBADO: 'bg-green-100 text-green-800', EN_CURSO: 'bg-blue-100 text-blue-800', DISPONIBLE: 'bg-amber-100 text-amber-800', BLOQUEADO: 'bg-slate-100 text-slate-600' };

export const StudyPlanPage: React.FC = () => {
  const { currentUser, students, showToast } = useApp();
  const [studentCarnet, setStudentCarnet] = useState(currentUser.role === 'ESTUDIANTE' ? currentUser.carnetOrCode || '' : students[0]?.carnet || '');
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!studentCarnet) return;
    setLoading(true);
    try {
      const query = currentUser.role === 'ADMIN' ? `?studentCarnet=${encodeURIComponent(studentCarnet)}` : '';
      const response = await fetch(`/api/curriculum-map${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setData(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo cargar el plan de estudios', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, showToast, studentCarnet]);
  useEffect(() => { load(); }, [load]);

  return <RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}><div className="space-y-6">
    <PageHeader title="Plan de Estudios" description="Guía completa de los cursos que debes llevar en cada semestre" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Plan de Estudios', active: true }]} />
    {currentUser.role === 'ADMIN' && <div className="rounded-xl border bg-white p-5"><StudentPicker students={students} value={studentCarnet} onChange={setStudentCarnet} label="Consultar plan del estudiante" /></div>}
    {loading ? <div className="rounded-xl border bg-white p-12 text-center text-sm text-[#64748B]">Cargando plan de estudios...</div> : data && <>
      <section className="overflow-hidden rounded-xl border border-[#800020]/20 bg-white shadow-xs"><div className="bg-gradient-to-r from-[#800020] to-[#A61B3D] p-6 text-white"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{data.student.careerName}</p><h2 className="mt-1 text-xl font-extrabold">{data.student.planName}</h2><p className="mt-1 text-xs text-white/80">Pensum {data.student.planVersion} · {data.student.planCode}</p></div><div className="flex gap-6 text-center"><div><p className="text-2xl font-black">{data.curriculum.semesters}</p><p className="text-[9px] uppercase text-white/70">Semestres</p></div><div><p className="text-2xl font-black">{data.curriculum.totalCourses}</p><p className="text-[9px] uppercase text-white/70">Cursos</p></div><div><p className="text-2xl font-black">{data.curriculum.totalCredits}</p><p className="text-[9px] uppercase text-white/70">Créditos</p></div></div></div></div><div className="grid gap-3 p-5 text-xs md:grid-cols-3"><div className="flex gap-2"><BookOpen className="h-5 w-5 shrink-0 text-[#800020]" /><p><strong>Orden sugerido:</strong> revisa cada columna de semestre de izquierda a derecha.</p></div><div className="flex gap-2"><LockKeyhole className="h-5 w-5 shrink-0 text-[#800020]" /><p><strong>Debe aprobar antes:</strong> muestra los prerrequisitos de cada curso.</p></div><div className="flex gap-2"><ArrowRight className="h-5 w-5 shrink-0 text-[#800020]" /><p><strong>Después habilita:</strong> indica qué cursos podrás tomar a continuación.</p></div></div></section>
      <div className="rounded-xl border bg-[#F8FAFC] p-4 shadow-inner"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: data.curriculum.semesters }, (_, index) => index + 1).map((semester) => {
          const courses = data.courses.filter((course) => course.semester === semester);
          const credits = courses.reduce((sum, course) => sum + course.credits, 0);
          return <section key={semester} className="self-start overflow-hidden rounded-xl border bg-white shadow-xs"><header className="bg-[#1E293B] px-4 py-3 text-white"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /><h3 className="text-sm font-extrabold">Semestre {semester}</h3></div><span className="text-[10px] text-white/70">{credits} CR</span></div><p className="mt-1 text-[9px] text-white/60">{courses.length} cursos programados</p></header><div className="divide-y">{courses.length ? courses.map((course) => <article key={course.code} className="p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-extrabold text-[#800020]">{course.code}</p><h4 className="text-xs font-bold leading-snug">{course.name}</h4></div><span className="shrink-0 rounded bg-slate-100 px-1.5 py-1 text-[9px] font-bold">{course.credits} CR</span></div><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[8px] font-bold ${statusStyle[course.status]}`}>{statusLabel[course.status]}</span><div className="mt-3 rounded-lg bg-slate-50 p-2"><p className="text-[8px] font-extrabold uppercase tracking-wide text-[#64748B]">Debe aprobar antes</p>{course.prerequisites.length ? <div className="mt-1 space-y-1">{course.prerequisites.map((item) => <p key={item.code} className="flex items-start gap-1 text-[9px] leading-tight">{item.completed ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" /> : <Circle className="h-3 w-3 shrink-0 text-slate-400" />}<span><strong>{item.code}</strong> · {item.name}</span></p>)}</div> : <p className="mt-1 text-[9px] text-[#64748B]">Ninguno</p>}</div>{course.unlocks.length > 0 && <div className="mt-2 border-l-2 border-blue-300 pl-2"><p className="text-[8px] font-extrabold uppercase tracking-wide text-blue-700">Después habilita</p>{course.unlocks.map((item) => <p key={item.code} className="mt-1 text-[9px] leading-tight text-blue-900"><ArrowRight className="mr-1 inline h-2.5 w-2.5" /><strong>{item.code}</strong> · {item.name} ({item.semester}°)</p>)}</div>}</article>) : <p className="p-5 text-center text-xs text-[#64748B]">Sin cursos registrados</p>}</div></section>;
        })}
      </div></div>
      <p className="text-center text-[10px] text-[#64748B]">Esta pantalla se actualiza con el pensum asignado al estudiante. No es necesario descargar ningún PDF.</p>
    </>}
  </div></RoleGuard>;
};
