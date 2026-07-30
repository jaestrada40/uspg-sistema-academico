import React, { useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Users,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Section } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar } from '../components/common/FilterBar';
import { ProgressBar } from '../components/common/ProgressBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { RoleGuard } from '../components/common/RoleGuard';

export const SectionsPage: React.FC = () => {
  const {
    sections,
    courses,
    teachers,
    classrooms,
    currentCycle,
    enrollments,
    addSection,
    deleteSection,
    showToast,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [jornadaFilter, setJornadaFilter] = useState('ALL');
  const [modalityFilter, setModalityFilter] = useState('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  const [formData, setFormData] = useState<{
    code: string;
    courseCode: string;
    teacherId: string;
    classroomId: string;
    scheduleTime: string;
    scheduleDays: string[];
    capacity: number;
    modality: 'Presencial' | 'Virtual' | 'Híbrida';
    jornada: 'Matutina' | 'Vespertina' | 'Nocturna' | 'Sabatina';
  }>({
    code: 'A',
    courseCode: courses[0]?.code || '',
    teacherId: teachers[0]?.code || '',
    classroomId: classrooms[0]?.id || '',
    scheduleTime: '07:00 - 09:00',
    scheduleDays: ['Lunes', 'Miércoles'],
    capacity: 30,
    modality: 'Presencial',
    jornada: 'Matutina',
  });

  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    return sections.filter((s) => {
      const matchesSearch =
        s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.courseName && s.courseName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.teacherName && s.teacherName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesJornada = jornadaFilter === 'ALL' || s.jornada === jornadaFilter;
      const matchesModality = modalityFilter === 'ALL' || s.modality === modalityFilter;

      return matchesSearch && matchesJornada && matchesModality;
    });
  }, [sections, searchTerm, jornadaFilter, modalityFilter]);

  const totalPages = Math.ceil(filteredSections.length / pageSize) || 1;
  const paginatedSections = filteredSections.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Check for classroom or teacher schedule conflicts
  const validateConflicts = (
    teacherId: string,
    classroomId: string,
    days: string[],
    time: string
  ): string | null => {
    for (const sec of sections) {
      if (sec.cycleId !== currentCycle.id) continue;

      const hasSameDay = sec.scheduleDays.some((d) => days.includes(d));
      const hasSameTime = sec.scheduleTime === time;

      if (hasSameDay && hasSameTime) {
        if (sec.classroomId === classroomId && sec.modality !== 'Virtual') {
          return `Conflicto de Aula: ${sec.classroomName} ya está ocupada por la sección ${sec.code} en este horario.`;
        }
        if (sec.teacherId === teacherId) {
          return `Conflicto de Docente: El catedrático ${sec.teacherName} ya tiene asignada la sección ${sec.code} en este horario.`;
        }
      }
    }
    return null;
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const conflict = validateConflicts(
      formData.teacherId,
      formData.classroomId,
      formData.scheduleDays,
      formData.scheduleTime
    );

    if (conflict) {
      setConflictWarning(conflict);
      return;
    }

    const created = await addSection({
      code: formData.code,
      courseCode: formData.courseCode,
      teacherId: formData.teacherId,
      cycleId: currentCycle.id,
      scheduleDays: formData.scheduleDays,
      scheduleTime: formData.scheduleTime,
      classroomId: formData.classroomId,
      modality: formData.modality,
      jornada: formData.jornada,
      capacity: formData.capacity,
      status: 'Abierta',
    });
    if (!created) return;

    setShowAddModal(false);
    setConflictWarning(null);
  };

  const openStudentsList = (sec: Section) => {
    setSelectedSection(sec);
    setShowStudentsModal(true);
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Secciones"
          description={`Cupos, asignación docente, aulas y control de horarios - ${currentCycle.name}`}
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Secciones', active: true },
          ]}
          actions={
            <button
              onClick={() => {
                setConflictWarning(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Nueva Sección
            </button>
          }
        />

        {/* Search & Filters */}
        <div className="space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por código de sección, curso o docente..."
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
              {
                id: 'modality',
                label: 'Modalidad',
                value: modalityFilter,
                options: [
                  { label: 'Presencial', value: 'Presencial' },
                  { label: 'Virtual', value: 'Virtual' },
                  { label: 'Híbrida', value: 'Híbrida' },
                ],
              },
            ]}
            onFilterChange={(id, val) => {
              if (id === 'jornada') setJornadaFilter(val);
              if (id === 'modality') setModalityFilter(val);
              setCurrentPage(1);
            }}
            onReset={() => {
              setJornadaFilter('ALL');
              setModalityFilter('ALL');
              setSearchTerm('');
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {paginatedSections.length === 0 ? (
            <EmptyState
              title="No se encontraron secciones"
              description="Ajusta los filtros o apertura una nueva sección en el ciclo actual."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <th className="px-6 py-3.5">Sección</th>
                    <th className="px-6 py-3.5">Curso</th>
                    <th className="px-6 py-3.5">Docente Catedrático</th>
                    <th className="px-6 py-3.5">Horario & Aula</th>
                    <th className="px-6 py-3.5">Ocupación / Cupo</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {paginatedSections.map((sec) => (
                    <tr key={sec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#800020] whitespace-nowrap">
                        {sec.code}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#333333]">{sec.courseName}</div>
                        <div className="text-[11px] text-[#64748B]">Código: {sec.courseCode}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-[#333333]">
                        {sec.teacherName}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-semibold text-[#333333]">
                          <Clock className="h-3.5 w-3.5 text-[#800020]" />
                          <span>{sec.scheduleDays.join(', ')} ({sec.scheduleTime})</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[#64748B] mt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-[#64748B]" />
                          <span>{sec.classroomName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 w-48">
                        <ProgressBar current={sec.enrolledCount} max={sec.capacity} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={sec.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openStudentsList(sec)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 bg-slate-100 text-[#800020] font-bold hover:bg-red-50"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>{sec.enrolledCount}</span>
                          </button>
                          <button
                            onClick={() => deleteSection(sec.id)}
                            className="rounded-md p-1.5 text-[#C53030] hover:bg-red-50"
                            title="Eliminar Sección"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredSections.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Modal: Add Section */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Aperturar Nueva Sección"
        >
          <form onSubmit={handleCreateSection} className="space-y-4 text-xs">
            {conflictWarning && (
              <div className="rounded-lg bg-[#C53030]/10 border border-[#C53030]/30 p-3 text-xs font-semibold text-[#C53030] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{conflictWarning}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-[#333333] mb-1">Código Sección *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="ej. INF101-A"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Curso Asignado</label>
                <select
                  value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  {courses.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-[#333333] mb-1">Docente Catedrático</label>
                <select
                  value={formData.teacherId}
                  onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  {teachers.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name} ({t.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Aula / Recinto</label>
                <select
                  value={formData.classroomId}
                  onChange={(e) => setFormData({ ...formData, classroomId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  {classrooms.map((clr) => (
                    <option key={clr.id} value={clr.id}>
                      {clr.code} - {clr.building} (Cap: {clr.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Cupo Máximo</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Horario de Clase</label>
                <select
                  value={formData.scheduleTime}
                  onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  <option value="07:00 - 09:00">07:00 - 09:00</option>
                  <option value="09:15 - 11:15">09:15 - 11:15</option>
                  <option value="11:30 - 13:30">11:30 - 13:30</option>
                  <option value="18:00 - 20:00">18:00 - 20:00</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Modalidad</label>
                <select
                  value={formData.modality}
                  onChange={(e) => setFormData({ ...formData, modality: e.target.value as any })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  <option value="Presencial">Presencial</option>
                  <option value="Virtual">Virtual</option>
                  <option value="Híbrida">Híbrida</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 font-bold text-white hover:bg-[#5F0018]"
              >
                Crear Sección
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Enrolled Students List */}
        {selectedSection && (
          <Modal
            isOpen={showStudentsModal}
            onClose={() => setShowStudentsModal(false)}
            title={`Estudiantes Inscritos - Sección ${selectedSection.code}`}
          >
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
                <span className="font-bold text-[#333333]">{selectedSection.courseName}</span>
                <span className="font-extrabold text-[#800020]">
                  {selectedSection.enrolledCount} / {selectedSection.capacity}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {enrollments.filter((e) => e.sectionId === selectedSection.id).length === 0 ? (
                  <p className="text-[#64748B] italic py-3 text-center">No hay alumnos asignados en esta sección.</p>
                ) : (
                  enrollments
                    .filter((e) => e.sectionId === selectedSection.id)
                    .map((enr) => (
                      <div
                        key={enr.id}
                        className="flex justify-between items-center p-2.5 rounded-lg border border-[#E2E8F0] bg-white"
                      >
                        <div>
                          <span className="font-bold text-[#333333] block">{enr.studentName}</span>
                          <span className="text-[10px] text-[#800020]">Carné: {enr.studentCarnet}</span>
                        </div>
                        <StatusBadge status={enr.status} size="sm" />
                      </div>
                    ))
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setShowStudentsModal(false)}
                  className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"
                >
                  Cerrar Listado
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </RoleGuard>
  );
};
