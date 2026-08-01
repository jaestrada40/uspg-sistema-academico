import React, { useState } from 'react';
import {
  FileChartColumn,
  Download,
  FileSpreadsheet,
  Printer,
  Users,
  GraduationCap,
  Award,
  CheckCircle2,
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
  Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { FilterBar } from '../components/common/FilterBar';
import { RoleGuard } from '../components/common/RoleGuard';

export const ReportsPage: React.FC = () => {
  const { students, careers, sections, grades, currentCycle, showToast } = useApp();

  const [careerFilter, setCareerFilter] = useState('ALL');

  // Chart 1: Students per Career
  const studentsPerCareerData = careers.map((c) => {
    const count = students.filter((s) => s.careerId === c.code).length;
    return { name: c.code, estudiantes: count, fullName: c.name };
  });

  // Chart 2: Grade Approval Ratio
  const approvedCount = grades.filter((g) => g.status === 'Aprobado').length;
  const reprovedCount = grades.filter((g) => g.status === 'Reprobado').length;
  const inProgressCount = grades.filter((g) => g.status === 'En curso').length;

  const approvalPieData = [
    { name: 'Aprobados', value: approvedCount || 1, color: '#2F855A' },
    { name: 'Reprobados', value: reprovedCount, color: '#C53030' },
    { name: 'En Curso', value: inProgressCount, color: '#17A2B8' },
  ];

  // Chart 3: Section Occupancy
  const sectionOccupancyData = sections.slice(0, 6).map((s) => ({
    name: s.code,
    Inscritos: s.enrolledCount,
    Capacidad: s.capacity,
  }));

  const handleExportCSV = () => {
    const headers = 'Carné,Nombre,Carrera,Promedio,Estado\n';
    const rows = students
      .map((s) => `"${s.carnet}","${s.name}","${s.careerName}","${s.gpa}","${s.status}"`)
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Estadistico_USPG.csv`;
    a.click();
    showToast('Reporte exportado exitosamente', 'success');
  };

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <div className="report-page space-y-6">
        <PageHeader
          title="Reportes Académicos y Estadísticas"
          description={`Análisis de rendimiento, distribución de matrículas y métricas del ${currentCycle.name}`}
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Reportes', active: true },
          ]}
          actions={
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#333333] hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Printer className="h-4 w-4 text-[#800020]" />
                Imprimir
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Exportar CSV
              </button>
            </div>
          }
        />

        {/* Filter Bar */}
        <FilterBar
          filters={[
            {
              id: 'career',
              label: 'Carrera',
              value: careerFilter,
              options: careers.map((c) => ({ label: c.name, value: c.code })),
            },
          ]}
          onFilterChange={(id, val) => setCareerFilter(val)}
          onReset={() => setCareerFilter('ALL')}
        />

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Students per Career */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#333333] mb-4">
              Distribución de Estudiantes por Carrera
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studentsPerCareerData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="estudiantes" fill="#800020" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Approval Ratio */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#333333] mb-4">
              Rendimiento Académico Global (Aprobación vs Reprobación)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={approvalPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {approvalPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Section Capacity vs Enrolled */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs lg:col-span-2">
            <h3 className="text-sm font-bold text-[#333333] mb-4">
              Ocupación de Secciones Aperturadas
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectionOccupancyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="Inscritos" fill="#800020" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Capacidad" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
};
