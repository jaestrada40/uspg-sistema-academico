import React, { useState } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Trash2,
  Info,
  Layers,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar } from '../components/common/FilterBar';
import { ProgressBar } from '../components/common/ProgressBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { RoleGuard } from '../components/common/RoleGuard';
import { StudentPicker } from '../components/common/StudentPicker';

export const EnrollmentPage: React.FC = () => {
  const {
    currentUser,
    sections,
    courses,
    currentCycle,
    enrollments,
    grades,
    parameters,
    enrollInCourse,
    dropEnrollment,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [jornadaFilter, setJornadaFilter] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState(currentUser.carnetOrCode || '');
  const [secPage, setSecPage] = useState(1);
  const [secPageSize, setSecPageSize] = useState(20);
  const { students } = useApp();

  // Student details
  const studentCarnet = currentUser.role === 'ESTUDIANTE' ? currentUser.carnetOrCode || '' : selectedStudent;

  // Active student enrollments
  const myEnrollments = enrollments.filter(
    (e) => e.studentCarnet === studentCarnet && e.cycleId === currentCycle.id && e.status === 'Inscrito'
  );

  // Total enrolled credits
  const totalEnrolledCredits = myEnrollments.reduce((sum, enr) => {
    const sec = sections.find((s) => s.id === enr.sectionId);
    const crs = courses.find((c) => c.code === sec?.courseCode);
    return sum + (crs?.credits || 0);
  }, 0);

  const availableCredits = parameters.maxCreditLimit - totalEnrolledCredits;

  // Student approved courses
  const approvedCourseCodes = grades
    .filter((g) => g.studentCarnet === studentCarnet && g.status === 'Aprobado')
    .map((g) => g.courseCode);

  // Filter sections
  const availableSections = sections.filter((sec) => {
    if (sec.cycleId !== currentCycle.id) return false;

    const matchesSearch =
      sec.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sec.courseName && sec.courseName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesJornada = jornadaFilter === 'ALL' || sec.jornada === jornadaFilter;

    return matchesSearch && matchesJornada;
  });

  return (
    <RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Inscripción y Asignación de Cursos"
          description={`Proceso oficial de matrícula académica para el ${currentCycle.name}`}
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Inscripción de Cursos', active: true },
          ]}
        />

        {currentUser.role === 'ADMIN' && <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><StudentPicker students={students} value={selectedStudent} onChange={setSelectedStudent} label="Asignar cursos a estudiante" /><p className="mt-3 flex items-start gap-2 text-xs text-[#64748B]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#800020]" />Esta pantalla permite inscribir o retirar cursos en el ciclo activo. El sistema valida automáticamente cupo, prerrequisitos, límite de créditos y saldos vencidos.</p></div>}

        {/* Credit Limit Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#7D8490]">Créditos Inscritos</span>
              <p className="text-xl font-extrabold text-[#800020]">{totalEnrolledCredits} pts</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#17A2B8]/10 text-[#17A2B8]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#7D8490]">Límite Permitido</span>
              <p className="text-xl font-extrabold text-[#333333]">{parameters.maxCreditLimit} pts</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2F855A]/10 text-[#2F855A]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#7D8490]">Créditos Disponibles</span>
              <p className="text-xl font-extrabold text-[#2F855A]">{availableCredits} pts</p>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar materia o código de sección para inscribirte..."
          />

          <FilterBar
            filters={[
              {
                id: 'jornada',
                label: 'Jornada',
                value: jornadaFilter,
                options: [
                  { label: 'Matutina', value: 'Matutina' },
                  { label: 'Vespertina', value: 'Vespertina' },
                  { label: 'Nocturna', value: 'Nocturna' },
                  { label: 'Sabatina', value: 'Sabatina' },
                ],
              },
            ]}
            onFilterChange={(id, val) => {
              if (id === 'jornada') setJornadaFilter(val);
            }}
            onReset={() => {
              setJornadaFilter('ALL');
              setSearchTerm('');
            }}
          />
        </div>

        {/* Section Cards List */}
        <div>
          <h3 className="text-sm font-bold text-[#333333] mb-3">Secciones Disponibles para Matrícula ({availableSections.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableSections.slice((secPage - 1) * secPageSize, secPage * secPageSize).map((sec) => {
              const courseObj = courses.find((c) => c.code === sec.courseCode);
              const isAlreadyEnrolled = myEnrollments.some((e) => e.sectionId === sec.id);

              // Check prerequisites
              const reqs = courseObj?.prerequisiteCodes || [];
              const hasMetPrereqs = reqs.every((req) => approvedCourseCodes.includes(req));

              const isFull = sec.enrolledCount >= sec.capacity;

              return (
                <div
                  key={sec.id}
                  className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="rounded-md bg-[#800020]/10 px-2 py-1 text-xs font-bold text-[#800020]">
                        {sec.code}
                      </span>
                      <div className="flex gap-1">
                        {hasMetPrereqs ? (
                          <span className="rounded-full bg-[#2F855A]/10 px-2 py-0.5 text-[10px] font-bold text-[#2F855A]">
                            ✓ Prerrequisitos OK
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#C53030]/10 px-2 py-0.5 text-[10px] font-bold text-[#C53030]">
                            ⚠ Req: {reqs.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <h4 className="text-base font-bold text-[#333333]">{sec.courseName}</h4>
                    <p className="text-xs text-[#64748B] mt-1">Catedrático: {sec.teacherName}</p>

                    <div className="mt-3 space-y-1 text-xs text-[#333333]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[#800020]" />
                        <span>{sec.scheduleDays.join(', ')} ({sec.scheduleTime})</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">
                        Aula: {sec.classroomName} | Créditos: {courseObj?.credits || 4} pts
                      </p>
                    </div>

                    <div className="mt-3">
                      <ProgressBar current={sec.enrolledCount} max={sec.capacity} size="sm" />
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[#E2E8F0] flex justify-end">
                    {isAlreadyEnrolled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2F855A]">
                        <CheckCircle2 className="h-4 w-4" /> Ya Inscrito
                      </span>
                    ) : (
                      <button
                        onClick={() => enrollInCourse(studentCarnet, sec.id)}
                        disabled={isFull || !hasMetPrereqs}
                        className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                      >
                        {isFull ? 'Sin Cupo' : !hasMetPrereqs ? 'Falta Prerrequisito' : 'Inscribirse'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {availableSections.length > secPageSize && (
            <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-xs mt-2">
              <div className="flex items-center gap-2">
                <span className="text-[#64748B]">{availableSections.length} secciones</span>
                <select value={secPageSize} onChange={(e) => { setSecPageSize(Number(e.target.value)); setSecPage(1); }} className="rounded-lg border border-[#E2E8F0] px-2 py-1 font-bold">
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#64748B]">Página {secPage} de {Math.ceil(availableSections.length / secPageSize) || 1}</span>
                <button disabled={secPage <= 1} onClick={() => setSecPage(secPage - 1)} className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40">‹</button>
                <button disabled={secPage * secPageSize >= availableSections.length} onClick={() => setSecPage(secPage + 1)} className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40">›</button>
              </div>
            </div>
          )}
        </div>

        {/* Mis Inscripciones Activas */}
        <div className="mt-8 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-[#333333] mb-4 pb-2 border-b border-[#E2E8F0]">
            Mis Inscripciones en el Ciclo Activo ({myEnrollments.length})
          </h3>

          {myEnrollments.length === 0 ? (
            <p className="text-xs text-[#64748B] italic py-4 text-center">
              Aún no tienes materias asignadas en este ciclo académico.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase">
                    <th className="p-3">Curso</th>
                    <th className="p-3">Horario</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {myEnrollments.map((enr) => {
                    const sec = sections.find((s) => s.id === enr.sectionId);
                    return (
                      <tr key={enr.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <span className="font-bold text-[#333333] block">{enr.courseName}</span>
                          <span className="text-[10px] text-[#800020]">{sec?.code}</span>
                        </td>
                        <td className="p-3 text-[#64748B]">
                          {sec?.scheduleDays.join(', ')} ({sec?.scheduleTime})
                        </td>
                        <td className="p-3">
                          <StatusBadge status={enr.status} size="sm" />
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => dropEnrollment(enr.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C53030] hover:underline"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Retirar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
};
