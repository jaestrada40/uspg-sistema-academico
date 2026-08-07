import React, { useState, useMemo, useEffect } from 'react';
import {
  UserPlus,
  Edit2,
  Power,
  Eye,
  GraduationCap,
  Mail,
  Phone,
  BookOpen,
  Clock,
  Briefcase,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Teacher } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar } from '../components/common/FilterBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { RoleGuard } from '../components/common/RoleGuard';

export const TeachersPage: React.FC = () => {
  const { currentUser, teachers, sections, addTeacher, updateTeacher, toggleTeacherStatus } = useApp();
  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  const [formData, setFormData] = useState<Partial<Teacher>>({
    code: '',
    name: '',
    email: '',
    phone: '',
    specialty: '',
    academicDegree: '',
    status: 'Activo',
    maxHoursPerWeek: 20,
    campusId: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.specialty.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [teachers, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredTeachers.length / pageSize) || 1;
  const paginatedTeachers = filteredTeachers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.code?.trim()) errors.code = 'El código es obligatorio';
    if (!formData.name?.trim()) errors.name = 'El nombre es obligatorio';
    if (!formData.email?.trim()) errors.email = 'El correo es obligatorio';
    else if (!formData.email.toLowerCase().endsWith('@catedratico.uspg.edu.gt')) errors.email = 'Debe usar un correo @catedratico.uspg.edu.gt';
    if (!formData.specialty?.trim()) errors.specialty = 'La especialidad es obligatoria';
    if (!formData.campusId) errors.campusId = 'Selecciona el campus';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const newTeacher: Teacher = {
      code: formData.code!,
      name: formData.name!,
      email: formData.email!,
      phone: formData.phone || '+502 0000-0000',
      specialty: formData.specialty!,
      academicDegree: formData.academicDegree || 'Licenciado',
      assignedSectionIds: [],
      status: 'Activo',
      maxHoursPerWeek: formData.maxHoursPerWeek || 20,
      campusId: formData.campusId!,
    };

    if (!(await addTeacher(newTeacher))) return;
    setShowAddModal(false);
    resetForm();
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !selectedTeacher) return;

    if (!(await updateTeacher(selectedTeacher.code, formData))) return;
    setShowEditModal(false);
    setSelectedTeacher(null);
    resetForm();
  };

  const openEdit = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFormData(teacher);
    setShowEditModal(true);
  };

  const openLoadModal = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowLoadModal(true);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      email: '',
      phone: '',
      specialty: '',
      academicDegree: '',
      status: 'Activo',
      maxHoursPerWeek: 20,
      campusId: '',
    });
    setFormErrors({});
  };

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Docentes"
          description="Cuerpo docente, grados académicos, carga horaria y asignación de cátedras USPG"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Docentes', active: true },
          ]}
          actions={
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
            >
              <UserPlus className="h-4 w-4" />
              Registrar Docente
            </button>
          }
        />

        {/* Filters */}
        <div className="space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nombre, código o especialidad..."
          />

          <FilterBar
            filters={[
              {
                id: 'status',
                label: 'Estado',
                value: statusFilter,
                options: [
                  { label: 'Activo', value: 'Activo' },
                  { label: 'Inactivo', value: 'Inactivo' },
                ],
              },
            ]}
            onFilterChange={(id, val) => {
              if (id === 'status') setStatusFilter(val);
              setCurrentPage(1);
            }}
            onReset={() => {
              setStatusFilter('ALL');
              setSearchTerm('');
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {paginatedTeachers.length === 0 ? (
            <EmptyState
              title="No se encontraron docentes"
              description="Ajusta los filtros o agrega un nuevo catedrático al claustro."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <th className="px-6 py-3.5">Código</th>
                    <th className="px-6 py-3.5">Catedrático</th>
                    <th className="px-6 py-3.5">Especialidad & Grado</th>
                    <th className="px-6 py-3.5">Carga Horaria</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {paginatedTeachers.map((teacher) => {
                    const assignedSections = sections.filter((s) => s.teacherId === teacher.code);
                    return (
                      <tr key={teacher.code} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-bold text-[#800020] whitespace-nowrap">
                          {teacher.code}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#333333]">{teacher.name}</div>
                          <div className="text-[11px] text-[#64748B]">{teacher.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-[#333333]">{teacher.specialty}</div>
                          <div className="text-[11px] text-[#7D8490]">{teacher.academicDegree}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-md bg-[#800020]/10 px-2 py-1 text-xs font-bold text-[#800020]">
                            {assignedSections.length} secciones
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={teacher.status} size="sm" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openLoadModal(teacher)}
                              className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#800020]"
                              title="Ver Carga Académica"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEdit(teacher)}
                              className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#800020]"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleTeacherStatus(teacher.code)}
                              className={`rounded-md p-1.5 ${
                                teacher.status === 'Activo'
                                  ? 'text-[#C53030] hover:bg-red-50'
                                  : 'text-[#2F855A] hover:bg-green-50'
                              }`}
                              title={teacher.status === 'Activo' ? 'Desactivar' : 'Activar'}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredTeachers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        </div>

        {/* Modal: Add Teacher */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Registrar Catedrático USPG"
        >
          <form onSubmit={handleCreateTeacher} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Código Docente *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="DOC-1099"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.code && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.code}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Dra. María José Reyes"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.name && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Correo Institucional *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="mreyes@uspg.edu.gt"
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
                  placeholder="+502 5555-1111"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Especialidad *</label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  placeholder="ej. Inteligencia Artificial"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
                {formErrors.specialty && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.specialty}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus *</label>
                <select
                  value={formData.campusId || ''}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
                {formErrors.campusId && <p className="text-[10px] font-semibold text-[#C53030] mt-0.5">{formErrors.campusId}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Grado Académico</label>
                <input
                  type="text"
                  value={formData.academicDegree}
                  onChange={(e) => setFormData({ ...formData, academicDegree: e.target.value })}
                  placeholder="ej. Doctora en Ingeniería"
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
                Guardar Docente
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Edit Teacher */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={`Editar Catedrático: ${selectedTeacher?.code}`}
        >
          <form onSubmit={handleEditTeacher} className="space-y-4">
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
                <label className="block text-xs font-bold text-[#333333] mb-1">Correo Institucional</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Especialidad</label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Campus</label>
                <select
                  value={formData.campusId || ''}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Grado Académico</label>
                <input
                  type="text"
                  value={formData.academicDegree}
                  onChange={(e) => setFormData({ ...formData, academicDegree: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
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

        {/* Modal: Academic Load Detail */}
        {selectedTeacher && (
          <Modal
            isOpen={showLoadModal}
            onClose={() => setShowLoadModal(false)}
            title={`Carga Académica - ${selectedTeacher.name}`}
            maxWidth="lg"
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-[#333333]">{selectedTeacher.specialty}</span>
                  <p className="text-[#64748B]">{selectedTeacher.academicDegree}</p>
                </div>
                <StatusBadge status={selectedTeacher.status} size="sm" />
              </div>

              <h4 className="text-xs font-bold text-[#333333] uppercase tracking-wider">Secciones Asignadas</h4>
              {sections.filter((s) => s.teacherId === selectedTeacher.code).length === 0 ? (
                <p className="text-xs text-[#64748B] italic">No tiene secciones asignadas actualmente.</p>
              ) : (
                <div className="space-y-2">
                  {sections
                    .filter((s) => s.teacherId === selectedTeacher.code)
                    .map((sec) => (
                      <div key={sec.id} className="rounded-lg border border-[#E2E8F0] p-3 text-xs bg-white">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-[#800020]">{sec.code} - {sec.courseName}</span>
                          <span className="font-semibold text-[#2F855A]">{sec.enrolledCount} Estudiantes</span>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-1">
                          Horario: {sec.scheduleDays.join(', ')} ({sec.scheduleTime}) | Aula: {sec.classroomName}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setShowLoadModal(false)}
                  className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"
                >
                  Cerrar Detalle
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </RoleGuard>
  );
};
