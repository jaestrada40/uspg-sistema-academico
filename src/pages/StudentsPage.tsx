import React, { useEffect, useState, useMemo } from 'react';
import {
  UserPlus,
  FileSpreadsheet,
  Edit2,
  Power,
  Eye,
  Award,
  Phone,
  Mail,
  MapPin,
  FileText,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Student } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar } from '../components/common/FilterBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { RoleGuard } from '../components/common/RoleGuard';

export const StudentsPage: React.FC = () => {
  const { students, careers, addStudent, updateStudent, toggleStudentStatus, showToast } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [careerFilter, setCareerFilter] = useState('ALL');
  const [jornadaFilter, setJornadaFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Student>>({
    carnet: '',
    name: '',
    email: '',
    phone: '',
    careerId: careers[0]?.code || '',
    entryCycle: '2026-1',
    jornada: 'Matutina',
    status: 'Activo',
    dpi: '',
    address: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [academicStructure, setAcademicStructure] = useState<{ campuses: { id: string; code: string; name: string; status: string }[]; plans: { id: string; code: string; name: string; version: string; careerId: string; status: string }[] }>({ campuses: [], plans: [] });

  useEffect(() => {
    fetch('/api/academic-structure').then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setAcademicStructure({ campuses: result.campuses.filter((campus: { status: string }) => campus.status === 'Activo'), plans: result.plans.filter((plan: { status: string }) => plan.status === 'Activo') });
      setFormData((current) => ({ ...current, campusId: current.campusId || result.campuses.find((campus: { status: string }) => campus.status === 'Activo')?.id, planId: current.planId || result.plans.find((plan: { careerId: string; status: string }) => plan.careerId === current.careerId && plan.status === 'Activo')?.id }));
    }).catch(() => showToast('No se pudo cargar la estructura académica', 'error'));
  }, [showToast]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.carnet.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCareer = careerFilter === 'ALL' || s.careerId === careerFilter;
      const matchesJornada = jornadaFilter === 'ALL' || s.jornada === jornadaFilter;
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

      return matchesSearch && matchesCareer && matchesJornada && matchesStatus;
    });
  }, [students, searchTerm, careerFilter, jornadaFilter, statusFilter]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.carnet?.trim()) errors.carnet = 'El carné es obligatorio';
    if (!formData.name?.trim()) errors.name = 'El nombre completo es obligatorio';
    const normalizedEmail = formData.email?.trim().toLowerCase();
    if (!normalizedEmail) errors.email = 'El correo electrónico es obligatorio';
    else if (!normalizedEmail.endsWith('@alumno.uspg.edu.gt')) errors.email = 'Debe usar un correo @alumno.uspg.edu.gt';
    if (!formData.careerId) errors.careerId = 'Debes seleccionar una carrera';
    if (!formData.campusId) errors.campusId = 'Debes seleccionar un campus';
    if (!formData.planId) errors.planId = 'Debes seleccionar un plan académico';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const selectedCareer = careers.find((c) => c.code === formData.careerId);
    const newStudent: Student = {
      carnet: formData.carnet!,
      name: formData.name!,
      email: formData.email!.trim().toLowerCase(),
      phone: formData.phone || '+502 0000-0000',
      careerId: formData.careerId!,
      careerName: selectedCareer?.name || 'Carrera USPG',
      entryCycle: formData.entryCycle || '2026-1',
      jornada: (formData.jornada as any) || 'Matutina',
      status: 'Activo',
      gpa: 85.0,
      creditsEarned: 0,
      totalCreditsRequired: selectedCareer?.totalCredits || 210,
      dpi: formData.dpi || '',
      address: formData.address || '',
      campusId: formData.campusId,
      planId: formData.planId,
    };

    if (!(await addStudent(newStudent))) return;
    setShowAddModal(false);
    resetForm();
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !selectedStudent) return;

    if (!(await updateStudent(selectedStudent.carnet, { ...formData, email: formData.email?.trim().toLowerCase() }))) return;
    setShowEditModal(false);
    setSelectedStudent(null);
    resetForm();
  };

  const openEdit = (student: Student) => {
    setSelectedStudent(student);
    setFormData(student);
    setShowEditModal(true);
  };

  const openDetail = (student: Student) => {
    setSelectedStudent(student);
    setShowDetailModal(true);
  };

  const resetForm = () => {
    setFormData({
      carnet: '',
      name: '',
      email: '',
      phone: '',
      careerId: careers[0]?.code || '',
      entryCycle: '2026-1',
      jornada: 'Matutina',
      status: 'Activo',
      dpi: '',
      address: '',
      campusId: academicStructure.campuses[0]?.id,
      planId: academicStructure.plans.find((plan) => plan.careerId === careers[0]?.code)?.id,
    });
    setFormErrors({});
  };

  const handleExportCSV = () => {
    const headers = 'Carné,Nombre,Correo,Carrera,Jornada,Estado,Promedio\n';
    const rows = filteredStudents
      .map(
        (s) =>
          `"${s.carnet}","${s.name}","${s.email}","${s.careerName || s.careerId}","${s.jornada}","${s.status}","${s.gpa}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Estudiantes_USPG_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('Listado exportado correctamente a CSV', 'success');
  };

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Estudiantes"
          description="Registro, consulta y administración del expediente estudiantil de la USPG"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Estudiantes', active: true },
          ]}
          actions={
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#333333] hover:bg-slate-50 transition-colors shadow-xs"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#2F855A]" />
                Exportar CSV
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
              >
                <UserPlus className="h-4 w-4" />
                Registrar Estudiante
              </button>
            </div>
          }
        />

        {/* Filter Bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Buscar por carné, nombre o correo..."
              className="flex-1"
            />
          </div>

          <FilterBar
            filters={[
              {
                id: 'career',
                label: 'Carrera',
                value: careerFilter,
                options: careers.map((c) => ({ label: c.name, value: c.code })),
              },
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
                id: 'status',
                label: 'Estado',
                value: statusFilter,
                options: [
                  { label: 'Activo', value: 'Activo' },
                  { label: 'Inactivo', value: 'Inactivo' },
                  { label: 'Egresado', value: 'Egresado' },
                  { label: 'Suspendido', value: 'Suspendido' },
                ],
              },
            ]}
            onFilterChange={(id, val) => {
              if (id === 'career') setCareerFilter(val);
              if (id === 'jornada') setJornadaFilter(val);
              if (id === 'status') setStatusFilter(val);
              setCurrentPage(1);
            }}
            onReset={() => {
              setCareerFilter('ALL');
              setJornadaFilter('ALL');
              setStatusFilter('ALL');
              setSearchTerm('');
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {paginatedStudents.length === 0 ? (
            <EmptyState
              title="No se encontraron estudiantes"
              description="Intenta ajustar los criterios de búsqueda o registra un nuevo estudiante."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <th className="px-6 py-3.5">Carné</th>
                    <th className="px-6 py-3.5">Estudiante</th>
                    <th className="px-6 py-3.5">Carrera</th>
                    <th className="px-6 py-3.5">Jornada</th>
                    <th className="px-6 py-3.5">Promedio</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {paginatedStudents.map((student) => (
                    <tr key={student.carnet} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#800020] whitespace-nowrap">
                        {student.carnet}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#333333]">{student.name}</div>
                        <div className="text-[11px] text-[#64748B]">{student.email}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-[#333333] max-w-xs truncate">
                        {student.careerName || student.careerId}
                      </td>
                      <td className="px-6 py-4 text-[#64748B]">{student.jornada}</td>
                      <td className="px-6 py-4 font-bold text-[#333333]">{student.gpa.toFixed(1)} pts</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={student.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(student)}
                            className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#800020]"
                            title="Ver Expediente"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(student)}
                            className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#800020]"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleStudentStatus(student.carnet)}
                            className={`rounded-md p-1.5 ${
                              student.status === 'Activo'
                                ? 'text-[#C53030] hover:bg-red-50'
                                : 'text-[#2F855A] hover:bg-green-50'
                            }`}
                            title={student.status === 'Activo' ? 'Desactivar' : 'Activar'}
                          >
                            <Power className="h-4 w-4" />
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
            totalItems={filteredStudents.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Modal: Add Student */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Registrar Nuevo Estudiante"
          subtitle="Formulario oficial de ingreso de expediente USPG"
        >
          <form onSubmit={handleCreateStudent} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Carné *</label>
                <input
                  type="text"
                  value={formData.carnet}
                  onChange={(e) => setFormData({ ...formData, carnet: e.target.value })}
                  placeholder="ej. 20260012"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.carnet && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.carnet}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Ana Lucía Morales"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.name && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="amorales@alumno.uspg.edu.gt"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.email && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+502 5555-4444"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#333333] mb-1">Carrera Asignada *</label>
                <select
                  value={formData.careerId}
                  onChange={(e) => setFormData({ ...formData, careerId: e.target.value, planId: academicStructure.plans.find((plan) => plan.careerId === e.target.value)?.id })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  {careers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus *</label>
                <select value={formData.campusId || ''} onChange={(e) => setFormData({ ...formData, campusId: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]">
                  <option value="">Selecciona un campus</option>
                  {academicStructure.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name} ({campus.code})</option>)}
                </select>
                {formErrors.campusId && <p className="mt-0.5 text-[10px] font-semibold text-[#C53030]">{formErrors.campusId}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Plan académico / Pensum *</label>
                <select value={formData.planId || ''} onChange={(e) => setFormData({ ...formData, planId: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]">
                  <option value="">Selecciona un plan</option>
                  {academicStructure.plans.filter((plan) => plan.careerId === formData.careerId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.code}</option>)}
                </select>
                {formErrors.planId && <p className="mt-0.5 text-[10px] font-semibold text-[#C53030]">{formErrors.planId}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Jornada</label>
                <select
                  value={formData.jornada}
                  onChange={(e) => setFormData({ ...formData, jornada: e.target.value as any })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="Matutina">Matutina</option>
                  <option value="Vespertina">Vespertina</option>
                  <option value="Nocturna">Nocturna</option>
                  <option value="Sabatina">Sabatina</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">DPI / Documento</label>
                <input
                  type="text"
                  value={formData.dpi}
                  onChange={(e) => setFormData({ ...formData, dpi: e.target.value })}
                  placeholder="3000 12345 0101"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#333333]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                Guardar Estudiante
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Edit Student */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={`Editar Estudiante: ${selectedStudent?.carnet}`}
        >
          <form onSubmit={handleEditStudent} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Nombre Completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors((current) => ({ ...current, email: '' })); }}
                  onBlur={() => setFormData((current) => ({ ...current, email: current.email?.trim().toLowerCase() }))}
                  className={`w-full rounded-lg border bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333] ${formErrors.email ? 'border-[#C53030]' : 'border-[#E2E8F0]'}`}
                />
                {formErrors.email && <p className="mt-1 text-[10px] font-semibold text-[#C53030]">{formErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Estado</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Egresado">Egresado</option>
                  <option value="Suspendido">Suspendido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus</label>
                <select value={formData.campusId || ''} onChange={(e) => setFormData({ ...formData, campusId: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]">{academicStructure.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name} ({campus.code})</option>)}</select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Plan académico / Pensum</label>
                <select value={formData.planId || ''} onChange={(e) => setFormData({ ...formData, planId: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]">{academicStructure.plans.filter((plan) => plan.careerId === formData.careerId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.code}</option>)}</select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#333333]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                Actualizar Cambios
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Quick Detail View */}
        {selectedStudent && (
          <Modal
            isOpen={showDetailModal}
            onClose={() => setShowDetailModal(false)}
            title={`Expediente Estudiantil - Carné: ${selectedStudent.carnet}`}
            maxWidth="lg"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-4 border-b border-[#E2E8F0] pb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#800020] text-white font-bold text-xl">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#333333]">{selectedStudent.name}</h3>
                  <p className="text-xs text-[#64748B]">{selectedStudent.careerName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={selectedStudent.status} size="sm" />
                    <span className="text-[11px] text-[#7D8490]">
                      Ciclo Ingreso: {selectedStudent.entryCycle}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] p-3">
                  <Mail className="h-4 w-4 text-[#800020]" />
                  <div>
                    <span className="text-[10px] text-[#7D8490] block">Correo</span>
                    <span className="font-semibold text-[#333333]">{selectedStudent.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] p-3">
                  <Phone className="h-4 w-4 text-[#800020]" />
                  <div>
                    <span className="text-[10px] text-[#7D8490] block">Teléfono</span>
                    <span className="font-semibold text-[#333333]">{selectedStudent.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] p-3">
                  <Award className="h-4 w-4 text-[#800020]" />
                  <div>
                    <span className="text-[10px] text-[#7D8490] block">Promedio General</span>
                    <span className="font-extrabold text-[#800020] text-sm">
                      {selectedStudent.gpa.toFixed(1)} pts
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] p-3">
                  <FileText className="h-4 w-4 text-[#800020]" />
                  <div>
                    <span className="text-[10px] text-[#7D8490] block">Créditos Aprobados</span>
                    <span className="font-bold text-[#333333]">
                      {selectedStudent.creditsEarned} / {selectedStudent.totalCreditsRequired}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"
                >
                  Cerrar Expediente
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </RoleGuard>
  );
};
