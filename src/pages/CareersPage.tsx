import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Power,
  Eye,
  GraduationCap,
  Award,
  Layers,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Career } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { RoleGuard } from '../components/common/RoleGuard';

export const CareersPage: React.FC = () => {
  const { careers, courses, students, addCareer, updateCareer, toggleCareerStatus } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPensumModal, setShowPensumModal] = useState(false);
  const [selectedCareer, setSelectedCareer] = useState<Career | null>(null);

  const [formData, setFormData] = useState<Partial<Career>>({
    code: '',
    name: '',
    faculty: 'Facultad de Ingeniería y Tecnologías',
    durationSemesters: 10,
    totalCredits: 220,
    modality: 'Presencial',
    degreeType: 'Licenciatura',
    status: 'Activo',
  });

  const filteredCareers = careers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.faculty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateCareer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    const newCareer: Career = {
      code: formData.code,
      name: formData.name,
      faculty: formData.faculty || 'Facultad de Ciencias Empresariales',
      durationSemesters: formData.durationSemesters || 10,
      totalCredits: formData.totalCredits || 210,
      modality: formData.modality || 'Presencial',
      degreeType: formData.degreeType || 'Licenciatura',
      status: 'Activo',
      studentCount: 0,
      courseCount: 0,
    };

    if (!(await addCareer(newCareer))) return;
    setShowAddModal(false);
    resetForm();
  };

  const handleEditCareer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCareer) return;

    if (!(await updateCareer(selectedCareer.code, formData))) return;
    setShowEditModal(false);
    setSelectedCareer(null);
    resetForm();
  };

  const openEdit = (career: Career) => {
    setSelectedCareer(career);
    setFormData(career);
    setShowEditModal(true);
  };

  const openPensum = (career: Career) => {
    setSelectedCareer(career);
    setShowPensumModal(true);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      faculty: 'Facultad de Ingeniería y Tecnologías',
      durationSemesters: 10,
      totalCredits: 220,
      modality: 'Presencial',
      degreeType: 'Licenciatura',
      status: 'Activo',
    });
  };

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Carreras Académicas"
          description="Programas universitarios, facultades, pensum de estudios y grado conferido"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Carreras', active: true },
          ]}
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-xs">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-[#800020] text-white' : 'text-[#64748B]'}`}
                  title="Vista en Tarjetas"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-[#800020] text-white' : 'text-[#64748B]'}`}
                  title="Vista en Tabla"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Crear Carrera
              </button>
            </div>
          }
        />

        {/* Search */}
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar carrera, código o facultad..."
        />

        {/* Grid View */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCareers.map((career) => {
              const careerCourses = courses.filter((c) => c.careerId === career.code);
              const careerStudents = students.filter((s) => s.careerId === career.code);

              return (
                <div
                  key={career.code}
                  className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col justify-between hover:border-[#800020]/40 transition-all"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="rounded-md bg-[#800020]/10 px-2 py-1 text-xs font-extrabold text-[#800020]">
                        {career.code}
                      </span>
                      <StatusBadge status={career.status} size="sm" />
                    </div>

                    <h3 className="text-base font-bold text-[#333333] leading-snug">{career.name}</h3>
                    <p className="text-xs font-medium text-[#64748B] mt-1">{career.faculty}</p>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs pt-3 border-t border-[#E2E8F0]">
                      <div>
                        <span className="text-[10px] text-[#7D8490] block">Modalidad</span>
                        <span className="font-semibold text-[#333333]">{career.modality}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7D8490] block">Duración</span>
                        <span className="font-semibold text-[#333333]">{career.durationSemesters} Semestres</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7D8490] block">Total Créditos</span>
                        <span className="font-semibold text-[#333333]">{career.totalCredits} Créditos</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7D8490] block">Estudiantes</span>
                        <span className="font-bold text-[#800020]">{careerStudents.length}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
                    <button
                      onClick={() => openPensum(career)}
                      className="flex items-center gap-1 text-xs font-bold text-[#800020] hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver Pensum ({careerCourses.length})
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(career)}
                        className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleCareerStatus(career.code)}
                        className={`rounded-md p-1.5 ${
                          career.status === 'Activo' ? 'text-[#C53030]' : 'text-[#2F855A]'
                        }`}
                        title={career.status === 'Activo' ? 'Desactivar' : 'Activar'}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <th className="px-6 py-3.5">Código</th>
                  <th className="px-6 py-3.5">Carrera</th>
                  <th className="px-6 py-3.5">Facultad</th>
                  <th className="px-6 py-3.5">Modalidad</th>
                  <th className="px-6 py-3.5">Duración</th>
                  <th className="px-6 py-3.5">Estado</th>
                  <th className="px-6 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {filteredCareers.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-[#800020]">{c.code}</td>
                    <td className="px-6 py-4 font-bold text-[#333333]">{c.name}</td>
                    <td className="px-6 py-4 text-[#64748B]">{c.faculty}</td>
                    <td className="px-6 py-4 text-[#333333]">{c.modality}</td>
                    <td className="px-6 py-4 text-[#333333]">{c.durationSemesters} semestres</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPensum(c)} className="p-1 text-[#800020]" title="Pensum">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-1 text-[#64748B]" title="Editar">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleCareerStatus(c.code)} className="p-1 text-[#C53030]">
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

        {/* Modal: Add Career */}
        <Modal
          isOpen={showAddModal || showEditModal}
          onClose={() => { setShowAddModal(false); setShowEditModal(false); }}
          title={showEditModal ? 'Editar Carrera Académica' : 'Crear Nueva Carrera Académica'}
        >
          <form onSubmit={showEditModal ? handleEditCareer : handleCreateCareer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Código de Carrera *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="CAR-ING"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Nombre de la Carrera *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Licenciatura en Mercadotecnia"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#333333] mb-1">Facultad</label>
                <select
                  value={formData.faculty}
                  onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  <option value="Facultad de Ingeniería y Tecnologías">Facultad de Ingeniería y Tecnologías</option>
                  <option value="Facultad de Ciencias Empresariales">Facultad de Ciencias Empresariales</option>
                  <option value="Facultad de Derecho y Ciencias Políticas">Facultad de Derecho y Ciencias Políticas</option>
                  <option value="Facultad de Teología y Humanidades">Facultad de Teología y Humanidades</option>
                  <option value="Facultad de Postgrados">Facultad de Postgrados</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Duración (Semestres)</label>
                <input
                  type="number"
                  value={formData.durationSemesters}
                  onChange={(e) => setFormData({ ...formData, durationSemesters: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Total Créditos</label>
                <input
                  type="number"
                  value={formData.totalCredits}
                  onChange={(e) => setFormData({ ...formData, totalCredits: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Modalidad</label>
                <select
                  value={formData.modality}
                  onChange={(e) => setFormData({ ...formData, modality: e.target.value as 'Presencial' | 'Virtual' | 'Híbrida' })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
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
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#333333]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                {showEditModal ? 'Guardar cambios' : 'Guardar Carrera'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Pensum View */}
        {selectedCareer && (
          <Modal
            isOpen={showPensumModal}
            onClose={() => setShowPensumModal(false)}
            title={`Pensum Académico: ${selectedCareer.name}`}
            maxWidth="xl"
          >
            <div className="space-y-4">
              <div className="rounded-lg bg-[#800020]/10 p-3 text-xs text-[#800020] font-semibold flex justify-between">
                <span>{selectedCareer.faculty}</span>
                <span>Total: {selectedCareer.totalCredits} Créditos</span>
              </div>

              <div className="space-y-3">
                {courses.filter((c) => c.careerId === selectedCareer.code).length === 0 ? (
                  <p className="text-xs text-[#64748B] italic py-4 text-center">
                    No hay cursos configurados en el pensum de esta carrera.
                  </p>
                ) : (
                  courses
                    .filter((c) => c.careerId === selectedCareer.code)
                    .map((crs) => (
                      <div key={crs.code} className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-3 text-xs">
                        <div>
                          <span className="font-bold text-[#800020] mr-2">{crs.code}</span>
                          <span className="font-bold text-[#333333]">{crs.name}</span>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            Semestre: {crs.semester} | Prerrequisitos:{' '}
                            {crs.prerequisiteCodes.length > 0 ? crs.prerequisiteCodes.join(', ') : 'Ninguno'}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#17A2B8]/10 px-2.5 py-1 text-xs font-bold text-[#17A2B8]">
                          {crs.credits} Créditos
                        </span>
                      </div>
                    ))
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setShowPensumModal(false)}
                  className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"
                >
                  Cerrar Pensum
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </RoleGuard>
  );
};
