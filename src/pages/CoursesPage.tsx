import React, { useState, useMemo } from 'react';
import {
  BookCheck,
  Plus,
  Edit2,
  Power,
  GitBranch,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Download,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Course } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar } from '../components/common/FilterBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { RoleGuard } from '../components/common/RoleGuard';

export const CoursesPage: React.FC = () => {
  const { courses, careers, addCourse, updateCourse, toggleCourseStatus, showToast } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [careerFilter, setCareerFilter] = useState('ALL');
  const [areaFilter, setAreaFilter] = useState('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [formData, setFormData] = useState<Partial<Course>>({
    code: '',
    name: '',
    credits: 4,
    semester: 1,
    careerId: careers[0]?.code || '',
    prerequisiteCodes: [],
    theoreticalHours: 3,
    practicalHours: 2,
    area: 'Básica',
    status: 'Activo',
  });

  const [circularError, setCircularError] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [importDataUrl, setImportDataUrl] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [importing, setImporting] = useState(false);

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCareer = careerFilter === 'ALL' || c.careerId === careerFilter;
      const matchesArea = areaFilter === 'ALL' || c.area === areaFilter;

      return matchesSearch && matchesCareer && matchesArea;
    });
  }, [courses, searchTerm, careerFilter, areaFilter]);

  const totalPages = Math.ceil(filteredCourses.length / pageSize) || 1;
  const paginatedCourses = filteredCourses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Circular Dependency Detection Helper
  const checkCircularDependency = (targetCode: string, prerequisites: string[]): boolean => {
    // If target code is in its own prerequisites
    if (prerequisites.includes(targetCode)) return true;

    // Direct circular check
    for (const reqCode of prerequisites) {
      const parentCourse = courses.find((c) => c.code === reqCode);
      if (parentCourse && parentCourse.prerequisiteCodes.includes(targetCode)) {
        return true;
      }
    }
    return false;
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCircularError('');

    if (!formData.code || !formData.name) return;

    if (checkCircularDependency(formData.code, formData.prerequisiteCodes || [])) {
      setCircularError('¡Atención! Se ha detectado una dependencia circular de prerrequisitos. Un curso no puede depender directamente de sí mismo o en bucle.');
      return;
    }

    const selectedCareer = careers.find((cr) => cr.code === formData.careerId);
    const newCourse: Course = {
      code: formData.code,
      name: formData.name,
      credits: formData.credits || 4,
      semester: formData.semester || 1,
      careerId: formData.careerId || careers[0]?.code,
      careerName: selectedCareer?.name,
      prerequisiteCodes: formData.prerequisiteCodes || [],
      theoreticalHours: formData.theoreticalHours || 3,
      practicalHours: formData.practicalHours || 0,
      area: formData.area as any || 'Básica',
      status: 'Activo',
    };

    if (!(await addCourse(newCourse))) return;
    setShowAddModal(false);
    resetForm();
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCircularError('');

    if (!selectedCourse || !formData.code) return;

    if (checkCircularDependency(formData.code, formData.prerequisiteCodes || [])) {
      setCircularError('¡Atención! Se ha detectado una dependencia circular de prerrequisitos.');
      return;
    }

    if (!(await updateCourse(selectedCourse.code, formData))) return;
    setShowEditModal(false);
    setSelectedCourse(null);
    resetForm();
  };

  const openEdit = (course: Course) => {
    setSelectedCourse(course);
    setFormData(course);
    setShowEditModal(true);
  };

  const openDependencyGraph = (course: Course) => {
    setSelectedCourse(course);
    setShowDependencyModal(true);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      credits: 4,
      semester: 1,
      careerId: careers[0]?.code || '',
      prerequisiteCodes: [],
      theoreticalHours: 3,
      practicalHours: 2,
      area: 'Básica',
      status: 'Activo',
    });
    setCircularError('');
  };

  const handleImportFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) return showToast('Selecciona un archivo Excel .xlsx', 'error');
    if (file.size > 5 * 1024 * 1024) return showToast('El archivo no puede superar 5 MB', 'error');
    const reader = new FileReader();
    reader.onload = () => { setImportDataUrl(String(reader.result)); setImportFileName(file.name); setImportPreview([]); setImportErrors([]); };
    reader.readAsDataURL(file);
  };

  const validateImport = async (commit = false) => {
    if (!importDataUrl) return showToast('Selecciona primero un archivo Excel', 'error');
    setImporting(true);
    try {
      const response = await fetch('/api/courses/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: importDataUrl, commit }) });
      const result = await response.json();
      setImportPreview(result.preview || []);
      setImportErrors(result.errors || []);
      if (!response.ok) return showToast(result.message || 'El archivo contiene errores', 'error');
      if (commit) { showToast(result.message, 'success'); setImportModal(false); setImportDataUrl(''); setImportPreview([]); setImportErrors([]); window.location.reload(); }
      else showToast('Archivo validado. Revisa la vista previa antes de importar.', 'success');
    } catch { showToast('No se pudo procesar el archivo Excel', 'error'); } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const content = 'codigo,nombre,creditos,semestre,carrera,prerrequisitos,horas_teoricas,horas_practicas,area\nINF-101,Introducción a Sistemas,4,1,SIS,,3,2,Básica\nINF-201,Programación I,5,2,SIS,INF-101,3,2,Especialidad\n';
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); link.download = 'plantilla-cursos-prerrequisitos.csv'; link.click(); URL.revokeObjectURL(link.href);
  };

  return (
    <RoleGuard allowedRoles={['ADMIN']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Cursos y Prerrequisitos"
          description="Catálogo de asignaturas, créditos académicos, semestres y malla de dependencias"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Cursos', active: true },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setImportModal(true)} className="flex items-center gap-2 rounded-lg border border-[#800020] bg-white px-4 py-2 text-xs font-bold text-[#800020] hover:bg-[#800020]/5"><FileSpreadsheet className="h-4 w-4" />Importar Excel</button>
              <button onClick={() => { resetForm(); setShowAddModal(true); }} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"><Plus className="h-4 w-4" />Nuevo Curso</button>
            </div>
          }
        />

        <Modal isOpen={importModal} onClose={() => setImportModal(false)} title="Importar cursos desde Excel" subtitle="Carga cursos y prerrequisitos sin guardar hasta validar el archivo." maxWidth="2xl">
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">Usa las columnas: <strong>codigo, nombre, creditos, semestre, carrera, prerrequisitos</strong>. Los prerrequisitos deben ser códigos separados por coma.</div>
            <div className="flex flex-wrap items-center gap-2"><label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 font-bold text-white"><Upload className="h-4 w-4" />{importFileName || 'Seleccionar .xlsx'}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => handleImportFile(event.target.files?.[0])} /></label><button type="button" onClick={downloadTemplate} className="flex items-center gap-2 rounded-lg border px-4 py-2 font-bold text-[#800020]"><Download className="h-4 w-4" />Descargar plantilla</button></div>
            {importErrors.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"><p className="font-bold">Errores encontrados</p>{importErrors.map((error) => <p key={`${error.row}-${error.message}`}>Fila {error.row}: {error.message}</p>)}</div>}
            {importPreview.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left"><thead className="bg-[#F8FAFC]"><tr><th className="p-2">Código</th><th className="p-2">Nombre</th><th className="p-2">Carrera</th><th className="p-2">Semestre</th><th className="p-2">Prerrequisitos</th></tr></thead><tbody className="divide-y">{importPreview.slice(0, 12).map((row) => <tr key={row.rowNumber}><td className="p-2 font-bold">{row.code}</td><td className="p-2">{row.name}</td><td className="p-2">{row.careerId}</td><td className="p-2">{row.semester}</td><td className="p-2">{row.prerequisiteCodes?.join(', ') || '—'}</td></tr>)}</tbody></table>{importPreview.length > 12 && <p className="p-2 text-[#64748B]">Mostrando 12 de {importPreview.length} filas.</p>}</div>}
            <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setImportModal(false)} className="rounded-lg border px-4 py-2 font-bold">Cancelar</button><button type="button" disabled={importing || !importDataUrl} onClick={() => validateImport(false)} className="rounded-lg border border-[#800020] px-4 py-2 font-bold text-[#800020] disabled:opacity-50">{importing ? 'Validando...' : 'Validar archivo'}</button><button type="button" disabled={importing || !importDataUrl || importPreview.length === 0 || importErrors.length > 0} onClick={() => validateImport(true)} className="rounded-lg bg-[#800020] px-4 py-2 font-bold text-white disabled:opacity-50">Importar cursos</button></div>
          </div>
        </Modal>

        {/* Filters */}
        <div className="space-y-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por código o nombre del curso..."
          />

          <FilterBar
            filters={[
              {
                id: 'career',
                label: 'Carrera',
                value: careerFilter,
                options: careers.map((c) => ({ label: c.name, value: c.code })),
              },
              {
                id: 'area',
                label: 'Área',
                value: areaFilter,
                options: [
                  { label: 'Básica', value: 'Básica' },
                  { label: 'Especialidad', value: 'Especialidad' },
                  { label: 'Humanística', value: 'Humanística' },
                  { label: 'Investigación', value: 'Investigación' },
                ],
              },
            ]}
            onFilterChange={(id, val) => {
              if (id === 'career') setCareerFilter(val);
              if (id === 'area') setAreaFilter(val);
              setCurrentPage(1);
            }}
            onReset={() => {
              setCareerFilter('ALL');
              setAreaFilter('ALL');
              setSearchTerm('');
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {paginatedCourses.length === 0 ? (
            <EmptyState
              title="No se encontraron cursos"
              description="Ajusta los filtros o agrega una nueva materia al catálogo."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <th className="px-6 py-3.5">Código</th>
                    <th className="px-6 py-3.5">Curso</th>
                    <th className="px-6 py-3.5">Créditos</th>
                    <th className="px-6 py-3.5">Semestre</th>
                    <th className="px-6 py-3.5">Prerrequisitos</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {paginatedCourses.map((course) => (
                    <tr key={course.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#800020] whitespace-nowrap">
                        {course.code}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#333333]">{course.name}</div>
                        <div className="text-[11px] text-[#64748B]">{course.area}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-[#17A2B8]">{course.credits} pts</td>
                      <td className="px-6 py-4 font-semibold text-[#333333]">{course.semester}° Semestre</td>
                      <td className="px-6 py-4">
                        {course.prerequisiteCodes.length === 0 ? (
                          <span className="text-[11px] text-[#7D8490] italic">Ninguno</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {course.prerequisiteCodes.map((req) => (
                              <span
                                key={req}
                                className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-[#333333]"
                              >
                                {req}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={course.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDependencyGraph(course)}
                            className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#800020]"
                            title="Ver Árbol de Prerrequisitos"
                          >
                            <GitBranch className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(course)}
                            className="rounded-md p-1.5 text-[#64748B] hover:bg-slate-100"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleCourseStatus(course.code)}
                            className={`rounded-md p-1.5 ${
                              course.status === 'Activo' ? 'text-[#C53030]' : 'text-[#2F855A]'
                            }`}
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
            totalItems={filteredCourses.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Modal: Add Course */}
        <Modal
          isOpen={showAddModal || showEditModal}
          onClose={() => { setShowAddModal(false); setShowEditModal(false); setSelectedCourse(null); setCircularError(''); }}
          title={showEditModal ? 'Editar Curso y Prerrequisitos' : 'Crear Nueva Asignatura'}
        >
          <form onSubmit={showEditModal ? handleEditCourse : handleCreateCourse} className="space-y-4">
            {circularError && (
              <div className="rounded-lg bg-[#C53030]/10 border border-[#C53030]/30 p-3 text-xs font-semibold text-[#C53030] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{circularError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Código del Curso *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="INF-501"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Nombre del Curso *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Inteligencia Artificial"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Créditos Académicos</label>
                <input
                  type="number"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#333333] mb-1">Semestre de Malla</label>
                <input
                  type="number"
                  value={formData.semester}
                  onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#333333] mb-1">Carrera</label>
                <select
                  value={formData.careerId}
                  onChange={(e) => setFormData({ ...formData, careerId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
                >
                  {careers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#333333] mb-1">Prerrequisitos (Selección múltiple)</label>
                <select
                  multiple
                  value={formData.prerequisiteCodes}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, (option) => (option as HTMLOptionElement).value);
                    setFormData({ ...formData, prerequisiteCodes: selected });
                  }}
                  className="w-full h-28 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2 text-xs font-medium text-[#333333]"
                >
                  {courses
                    .filter((c) => c.code !== formData.code)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-[#7D8490] mt-1">Mantén presionada la tecla Ctrl/Cmd para seleccionar varios.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setSelectedCourse(null); setCircularError(''); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#333333]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                {showEditModal ? 'Guardar cambios' : 'Guardar Curso'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Dependency Graph */}
        {selectedCourse && (
          <Modal
            isOpen={showDependencyModal}
            onClose={() => setShowDependencyModal(false)}
            title={`Malla de Dependencia: ${selectedCourse.code} - ${selectedCourse.name}`}
          >
            <div className="space-y-4 text-xs">
              <div className="flex items-center gap-3 justify-center p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                {selectedCourse.prerequisiteCodes.length === 0 ? (
                  <span className="text-[#2F855A] font-bold">Curso inicial (Sin prerrequisitos)</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {selectedCourse.prerequisiteCodes.map((req) => (
                        <span key={req} className="rounded-lg bg-[#800020]/10 px-2.5 py-1 font-bold text-[#800020]">
                          {req}
                        </span>
                      ))}
                    </div>
                    <span className="text-[#64748B] font-bold">➜</span>
                    <span className="rounded-lg bg-[#800020] px-3 py-1 font-bold text-white shadow-xs">
                      {selectedCourse.code}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setShowDependencyModal(false)}
                  className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </RoleGuard>
  );
};
