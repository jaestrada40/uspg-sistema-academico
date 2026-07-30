import React from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  Layers,
  ClipboardList,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  Award,
  BookCheck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { ProgressBar } from '../components/common/ProgressBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { useNavigate } from 'react-router';

export const DashboardPage: React.FC = () => {
  const {
    currentUser,
    students,
    teachers,
    careers,
    courses,
    sections,
    enrollments,
    currentCycle,
    grades,
  } = useApp();

  const navigate = useNavigate();

  // Role specific view rendering
  const isAdmin = currentUser.role === 'ADMIN';
  const isDocente = currentUser.role === 'DOCENTE';
  const isEstudiante = currentUser.role === 'ESTUDIANTE';

  // Data for Admin charts
  const careerEnrollmentData = careers.map((c) => ({
    name: c.code.replace('CAR-', ''),
    fullName: c.name,
    estudiantes: c.studentCount,
  }));

  const studentStatusData = [
    { name: 'Activos', value: students.filter((s) => s.status === 'Activo').length, color: '#2F855A' },
    { name: 'Inactivos', value: students.filter((s) => s.status === 'Inactivo').length, color: '#C53030' },
    { name: 'Egresados', value: students.filter((s) => s.status === 'Egresado').length, color: '#17A2B8' },
  ];

  // High capacity sections
  const highCapacitySections = sections.filter(
    (s) => s.enrolledCount / s.capacity >= 0.85
  );

  // Student specific calculations
  const studentCarnet = currentUser.carnetOrCode || '20230142';
  const studentData = students.find((s) => s.carnet === studentCarnet) || students[0];
  const studentEnrollments = enrollments.filter(
    (e) => e.studentCarnet === studentCarnet && e.cycleId === currentCycle.id && e.status === 'Inscrito'
  );
  const studentGrades = grades.filter((g) => g.studentCarnet === studentCarnet);
  const totalEnrolledCredits = studentEnrollments.reduce((sum, enr) => {
    const sec = sections.find((s) => s.id === enr.sectionId);
    const crs = courses.find((c) => c.code === sec?.courseCode);
    return sum + (crs?.credits || 0);
  }, 0);

  // Teacher specific calculations
  const teacherCode = currentUser.carnetOrCode || 'DOC-1042';
  const teacherSections = sections.filter((s) => s.teacherId === teacherCode && s.cycleId === currentCycle.id);
  const teacherStudentsCount = teacherSections.reduce((sum, sec) => sum + sec.enrolledCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bienvenido, ${currentUser.name}`}
        description={`Panel Administrativo de la Universidad de San Pablo de Guatemala - Ciclo ${currentCycle.name}`}
        breadcrumbs={[{ label: 'Inicio', active: true }]}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#64748B]">Rol actual:</span>
            <span className="rounded-md bg-[#800020] px-3 py-1 text-xs font-bold text-white shadow-xs">
              {currentUser.role}
            </span>
          </div>
        }
      />

      {/* ==================== ADMIN DASHBOARD ==================== */}
      {isAdmin && (
        <>
          {/* Top Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard
              title="Estudiantes"
              value={students.length}
              description="Registrados en sistema"
              icon={Users}
              badgeText="100% Activos"
              badgeType="success"
              onClick={() => navigate('/estudiantes')}
            />
            <StatCard
              title="Docentes"
              value={teachers.length}
              description="Cuerpo docente activo"
              icon={GraduationCap}
              onClick={() => navigate('/docentes')}
            />
            <StatCard
              title="Carreras"
              value={careers.length}
              description="Programas académicos"
              icon={BookOpen}
              onClick={() => navigate('/carreras')}
            />
            <StatCard
              title="Cursos"
              value={courses.length}
              description="Catálogo general"
              icon={BookCheck}
              onClick={() => navigate('/cursos')}
            />
            <StatCard
              title="Secciones"
              value={sections.length}
              description="Abiertas en ciclo actual"
              icon={Layers}
              onClick={() => navigate('/secciones')}
            />
            <StatCard
              title="Inscripciones"
              value={enrollments.length}
              description="Total en el ciclo"
              icon={ClipboardList}
              onClick={() => navigate('/inscripciones')}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar chart: Estudiantes por Carrera */}
            <div className="lg:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <h3 className="text-sm font-bold text-[#333333]">Inscripciones por Carrera</h3>
                  <p className="text-xs text-[#64748B]">Distribución de estudiantes por programa académico</p>
                </div>
                <span className="text-xs font-semibold text-[#800020]">Actualizado</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={careerEnrollmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#E2E8F0', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="estudiantes" fill="#800020" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut chart: Estado de Estudiantes */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col justify-between">
              <div className="pb-3 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-bold text-[#333333]">Estado de Estudiantes</h3>
                <p className="text-xs text-[#64748B]">Proporción según condición académica</p>
              </div>
              <div className="h-48 w-full my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={studentStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {studentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 text-xs font-medium">
                {studentStatusData.map((st) => (
                  <div key={st.name} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                    <span className="text-[#64748B]">{st.name}:</span>
                    <span className="font-bold text-[#333333]">{st.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lower section: Occupancy alert & Calendar dates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Secciones con cupo casi completo */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#B7791F]" />
                  <h3 className="text-sm font-bold text-[#333333]">Secciones con Cupo Cerca del Límite</h3>
                </div>
                <button
                  onClick={() => navigate('/secciones')}
                  className="text-xs font-semibold text-[#800020] hover:underline flex items-center gap-1"
                >
                  Ver todas <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-3">
                {highCapacitySections.map((sec) => (
                  <div key={sec.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-xs font-bold text-[#333333]">{sec.code} - {sec.courseName}</span>
                        <p className="text-[11px] text-[#64748B]">Docente: {sec.teacherName}</p>
                      </div>
                      <StatusBadge status={sec.enrolledCount >= sec.capacity ? 'Cerrada' : 'Disponible'} size="sm" />
                    </div>
                    <ProgressBar current={sec.enrolledCount} max={sec.capacity} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Próximas Fechas Académicas */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#800020]" />
                  <h3 className="text-sm font-bold text-[#333333]">Próximas Fechas Clave</h3>
                </div>
                <span className="text-xs font-semibold text-[#64748B]">{currentCycle.name}</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020]">
                    <span className="text-[10px] font-bold uppercase">ENE</span>
                    <span className="text-sm font-extrabold leading-none">31</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#333333]">Cierre de Inscripciones Ordinarias</h4>
                    <p className="text-[11px] text-[#64748B]">Último día para asignación de cursos del Primer Semestre 2026.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[#17A2B8]/10 text-[#17A2B8]">
                    <span className="text-[10px] font-bold uppercase">MAR</span>
                    <span className="text-sm font-extrabold leading-none">15</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#333333]">Exámenes Parciales</h4>
                    <p className="text-[11px] text-[#64748B]">Período de evaluaciones de zona media.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] p-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[#2F855A]/10 text-[#2F855A]">
                    <span className="text-[10px] font-bold uppercase">JUN</span>
                    <span className="text-sm font-extrabold leading-none">25</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#333333]">Límite de Entrega de Actas de Notas</h4>
                    <p className="text-[11px] text-[#64748B]">Fecha oficial límite para publicación de notas finales por docentes.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== DOCENTE DASHBOARD ==================== */}
      {isDocente && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Cursos Asignados"
              value={teacherSections.length}
              description="En ciclo actual"
              icon={BookOpen}
              onClick={() => navigate('/secciones')}
            />
            <StatCard
              title="Secciones Activas"
              value={teacherSections.length}
              description="Docencia presencial y virtual"
              icon={Layers}
            />
            <StatCard
              title="Estudiantes Atendidos"
              value={teacherStudentsCount}
              description="Inscritos en tus secciones"
              icon={Users}
            />
            <StatCard
              title="Notas Pendientes"
              value={teacherSections.length}
              description="Por publicar en acta"
              icon={Clock}
              badgeText="Requerido"
              badgeType="warning"
              onClick={() => navigate('/control-notas')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mis Secciones Asignadas */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <h3 className="text-sm font-bold text-[#333333]">Secciones en Cátedra</h3>
                <button
                  onClick={() => navigate('/control-notas')}
                  className="text-xs font-bold text-[#800020] hover:underline"
                >
                  Ingresar Notas
                </button>
              </div>

              <div className="space-y-3">
                {teacherSections.map((sec) => (
                  <div key={sec.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-[#800020]">{sec.code}</span>
                        <h4 className="text-sm font-bold text-[#333333]">{sec.courseName}</h4>
                        <p className="text-xs text-[#64748B] mt-1">
                          {sec.scheduleDays.join(', ')} • {sec.scheduleTime} • {sec.classroomName}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#800020]/10 px-2.5 py-1 text-xs font-bold text-[#800020]">
                        {sec.enrolledCount} Estudiantes
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Horario Semanal Docente */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <h3 className="text-sm font-bold text-[#333333]">Mi Horario de Clases</h3>
                <button
                  onClick={() => navigate('/horarios-aulas')}
                  className="text-xs font-bold text-[#800020] hover:underline"
                >
                  Ver Calendario
                </button>
              </div>

              <div className="space-y-3">
                {teacherSections.map((sec) => (
                  <div key={sec.id} className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020]">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#333333]">{sec.courseName}</h4>
                      <p className="text-[11px] text-[#64748B]">
                        {sec.scheduleDays.join(', ')} ({sec.scheduleTime}) - {sec.classroomName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== ESTUDIANTE DASHBOARD ==================== */}
      {isEstudiante && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Cursos Inscritos"
              value={studentEnrollments.length}
              description={`Semestre ${currentCycle.name}`}
              icon={BookOpen}
              onClick={() => navigate('/inscripciones')}
            />
            <StatCard
              title="Créditos del Ciclo"
              value={`${totalEnrolledCredits} / 24`}
              description="Límite máximo por período"
              icon={Layers}
            />
            <StatCard
              title="Promedio General (GPA)"
              value={studentData.gpa.toFixed(1)}
              description="Sobre 100 puntos"
              icon={Award}
              badgeText="Sobresaliente"
              badgeType="success"
            />
            <StatCard
              title="Créditos Aprobados"
              value={`${studentData.creditsEarned} / ${studentData.totalCreditsRequired}`}
              description="Progreso de pensum"
              icon={CheckCircle2}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Mis Cursos Inscritos */}
            <div className="lg:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <h3 className="text-sm font-bold text-[#333333]">Mis Cursos en El Ciclo Actual</h3>
                <button
                  onClick={() => navigate('/inscripciones')}
                  className="text-xs font-bold text-[#800020] hover:underline"
                >
                  Gestionar Asignación
                </button>
              </div>

              {studentEnrollments.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#64748B]">
                  Aún no tienes cursos inscritos en el ciclo actual.{' '}
                  <button
                    onClick={() => navigate('/inscripciones')}
                    className="font-bold text-[#800020] underline ml-1"
                  >
                    Ir a Inscripción
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {studentEnrollments.map((enr) => {
                    const sec = sections.find((s) => s.id === enr.sectionId);
                    return (
                      <div key={enr.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-bold text-[#800020]">{sec?.code}</span>
                            <h4 className="text-sm font-bold text-[#333333]">{sec?.courseName}</h4>
                            <p className="text-xs text-[#64748B] mt-1">
                              Docente: {sec?.teacherName} • Horario: {sec?.scheduleDays.join(', ')} ({sec?.scheduleTime})
                            </p>
                          </div>
                          <StatusBadge status="Inscrito" size="sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Calificaciones Recientes */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                <h3 className="text-sm font-bold text-[#333333]">Calificaciones Recientes</h3>
                <button
                  onClick={() => navigate('/historial')}
                  className="text-xs font-bold text-[#800020] hover:underline"
                >
                  Historial Completo
                </button>
              </div>

              <div className="space-y-3">
                {studentGrades.slice(0, 3).map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-3">
                    <div>
                      <h4 className="text-xs font-bold text-[#333333]">{g.courseName}</h4>
                      <p className="text-[11px] text-[#64748B]">Zona: {g.zona} | P1: {g.parcial} | P2: {g.segundoParcial}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-extrabold text-[#800020]">{g.total} pts</span>
                      <div>
                        <StatusBadge status={g.status} size="sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
