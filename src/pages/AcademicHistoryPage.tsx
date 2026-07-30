import React, { useState } from 'react';
import {
  FileText,
  Award,
  Download,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { RoleGuard } from '../components/common/RoleGuard';

export const AcademicHistoryPage: React.FC = () => {
  const { currentUser, students, grades, courses, showToast } = useApp();

  const [selectedCarnet, setSelectedCarnet] = useState<string>(
    currentUser.role === 'ESTUDIANTE' ? currentUser.carnetOrCode || '20230142' : students[0]?.carnet || '20230142'
  );

  const activeStudent = students.find((s) => s.carnet === selectedCarnet) || students[0];
  const studentGrades = grades.filter((g) => g.studentCarnet === activeStudent?.carnet);

  const handleDownloadCertification = () => {
    const content = `
===================================================================
UNIVERSIDAD DE SAN PABLO DE GUATEMALA (USPG)
SECRETARÍA GENERAL - CERTIFICACIÓN OFICIAL DE ESTUDIOS
===================================================================

DATOS DEL ESTUDIANTE:
-------------------------------------------------------------------
Nombre Completo: ${activeStudent?.name}
Carné:           ${activeStudent?.carnet}
Carrera:         ${activeStudent?.careerName}
Ciclo de Ingreso:${activeStudent?.entryCycle}
Promedio General:${activeStudent?.gpa.toFixed(2)} pts
Créditos:        ${activeStudent?.creditsEarned} / ${activeStudent?.totalCreditsRequired} pts

HISTORIAL DE ASIGNATURAS EVALUADAS:
-------------------------------------------------------------------
${studentGrades
  .map(
    (g) =>
      `[${g.cycleId}] ${g.courseCode} - ${(g.courseName || '').padEnd(30)} | Nota: ${g.total.toString().padStart(3)} | Estado: ${g.status}`
  )
  .join('\n')}

===================================================================
Documento oficial generado electrónicamente por el Sistema USPG.
Fecha de emisión: ${new Date().toLocaleDateString('es-GT')}
===================================================================
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Certificacion_Estudios_${activeStudent?.carnet}_USPG.txt`;
    a.click();
    showToast('Certificación oficial generada y descargada', 'success');
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Historial Académico y Certificación"
          description="Expediente completo de notas, créditos acumulados y promedio general de rendimiento"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Historial Académico', active: true },
          ]}
          actions={
            <button
              onClick={handleDownloadCertification}
              className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
            >
              <Download className="h-4 w-4" />
              Generar Certificación
            </button>
          }
        />

        {/* Student Selector for Admins */}
        {currentUser.role === 'ADMIN' && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs">
            <label className="block text-xs font-bold text-[#64748B] uppercase mb-1">
              Consultar Expediente de Estudiante
            </label>
            <select
              value={selectedCarnet}
              onChange={(e) => setSelectedCarnet(e.target.value)}
              className="w-full max-w-md rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-bold text-[#333333]"
            >
              {students.map((s) => (
                <option key={s.carnet} value={s.carnet}>
                  {s.carnet} - {s.name} ({s.careerName})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Student Overview Header Card */}
        {activeStudent && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#800020] text-white font-black text-xl shadow-xs">
                  {activeStudent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#333333]">{activeStudent.name}</h3>
                  <p className="text-xs text-[#64748B]">{activeStudent.careerName}</p>
                  <span className="text-[11px] font-bold text-[#800020] block mt-0.5">
                    Carné: {activeStudent.carnet} | Ingreso: {activeStudent.entryCycle}
                  </span>
                </div>
              </div>
              <StatusBadge status={activeStudent.status} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                <span className="text-[10px] text-[#7D8490] block">Promedio General (GPA)</span>
                <span className="text-lg font-black text-[#800020]">
                  {activeStudent.gpa.toFixed(2)} pts
                </span>
              </div>

              <div className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                <span className="text-[10px] text-[#7D8490] block">Créditos Acumulados</span>
                <span className="text-lg font-black text-[#333333]">
                  {activeStudent.creditsEarned} / {activeStudent.totalCreditsRequired}
                </span>
              </div>

              <div className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                <span className="text-[10px] text-[#7D8490] block">Asignaturas Aprobadas</span>
                <span className="text-lg font-black text-[#2F855A]">
                  {studentGrades.filter((g) => g.status === 'Aprobado').length} Cursos
                </span>
              </div>

              <div className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                <span className="text-[10px] text-[#7D8490] block">Aprobación General</span>
                <span className="text-lg font-black text-[#17A2B8]">
                  {Math.round((activeStudent.creditsEarned / activeStudent.totalCreditsRequired) * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* History Records Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <h4 className="text-xs font-bold text-[#333333] uppercase tracking-wider">
              Registro Oficial de Asignaturas
            </h4>
          </div>

          {studentGrades.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No existen registros de calificaciones para este estudiante.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase">
                    <th className="px-6 py-3.5">Código</th>
                    <th className="px-6 py-3.5">Asignatura</th>
                    <th className="px-6 py-3.5">Ciclo Lectivo</th>
                    <th className="px-6 py-3.5 text-center">Zona</th>
                    <th className="px-6 py-3.5 text-center">1er Parcial</th>
                    <th className="px-6 py-3.5 text-center">2do Parcial</th>
                    <th className="px-6 py-3.5 text-center">Final</th>
                    <th className="px-6 py-3.5 text-center">Total</th>
                    <th className="px-6 py-3.5 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {studentGrades.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-[#800020]">{g.courseCode}</td>
                      <td className="px-6 py-4 font-bold text-[#333333]">{g.courseName}</td>
                      <td className="px-6 py-4 text-[#64748B]">{g.cycleId}</td>
                      <td className="px-6 py-4 text-center">{g.zona} pts</td>
                      <td className="px-6 py-4 text-center">{g.parcial} pts</td>
                      <td className="px-6 py-4 text-center">{g.segundoParcial} pts</td>
                      <td className="px-6 py-4 text-center">{g.final} pts</td>
                      <td className="px-6 py-4 text-center font-extrabold text-[#800020] text-sm">
                        {g.total} pts
                      </td>
                      <td className="px-6 py-4 text-right">
                        <StatusBadge status={g.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
};
