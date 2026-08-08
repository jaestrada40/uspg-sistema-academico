import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  Check,
  Edit2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AcademicCycle } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';
import { RoleGuard } from '../components/common/RoleGuard';

export const CyclesPage: React.FC = () => {
  const { currentUser, cycles, addCycle, updateCycle, setCurrentCycleId } = useApp();
  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<AcademicCycle | null>(null);

  const [formData, setFormData] = useState<Omit<AcademicCycle, 'id'>>({
    year: 2026,
    name: 'Segundo Semestre 2026',
    startDate: '2026-07-13',
    endDate: '2026-11-27',
    enrollmentStartDate: '2026-06-15',
    enrollmentEndDate: '2026-07-08',
    gradeSubmissionDeadline: '2026-12-08',
    status: 'Planificado',
    isCurrent: false,
    campusId: '',
  });

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await addCycle(formData))) return;
    setShowAddModal(false);
  };

  const handleEditCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCycle) return;

    if (!(await updateCycle(selectedCycle.id, formData))) return;
    setShowEditModal(false);
  };

  const confirmCloseCycle = () => {
    if (!selectedCycle) return;
    updateCycle(selectedCycle.id, { status: 'Finalizado', isCurrent: false });
  };

  const openEdit = (cycle: AcademicCycle) => {
    setSelectedCycle(cycle);
    setFormData(cycle);
    setShowEditModal(true);
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'REGISTRO']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Ciclos Académicos"
          description="Períodos lectivos, cronograma de inscripción, fechas límite de actas de notas y estado"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Ciclos Académicos', active: true },
          ]}
          actions={
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Nuevo Ciclo
            </button>
          }
        />

        {/* Cycles Cards Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className={`rounded-xl border p-5 bg-white shadow-xs transition-all ${
                cycle.isCurrent ? 'border-[#800020] ring-2 ring-[#800020]/20' : 'border-[#E2E8F0]'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020] font-black text-sm">
                    {cycle.year}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#333333]">{cycle.name}</h3>
                    {cycle.isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#800020] uppercase">
                        <Check className="h-3 w-3" /> Ciclo Activo en Sistema
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={cycle.status} />
              </div>

              {/* Dates grid */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-[#E2E8F0] mt-3 bg-[#F8FAFC] p-3 rounded-lg">
                <div>
                  <span className="text-[10px] text-[#7D8490] block">Inscripciones</span>
                  <span className="font-semibold text-[#333333]">
                    {cycle.enrollmentStartDate} al {cycle.enrollmentEndDate}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7D8490] block">Duración Clases</span>
                  <span className="font-semibold text-[#333333]">
                    {cycle.startDate} al {cycle.endDate}
                  </span>
                </div>
                <div className={cycle.examStartDate ? '' : 'col-span-2'}>
                  <span className="text-[10px] text-[#7D8490] block">Límite de Entrega de Notas</span>
                  <span className="font-bold text-[#C53030]">{cycle.gradeSubmissionDeadline}</span>
                </div>
                {cycle.examStartDate && (
                  <div>
                    <span className="text-[10px] text-[#7D8490] block">Exámenes Finales</span>
                    <span className="font-semibold text-[#333333]">{cycle.examStartDate} al {cycle.examEndDate ?? '—'}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
                {!cycle.isCurrent ? (
                  <button
                    onClick={() => setCurrentCycleId(cycle.id)}
                    className="flex items-center gap-1 rounded-lg border border-[#800020] px-3 py-1.5 text-xs font-bold text-[#800020] hover:bg-[#800020] hover:text-white transition-colors"
                  >
                    Establecer como Activo
                  </button>
                ) : (
                  <span className="text-xs font-bold text-[#2F855A]">✓ Seleccionado</span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(cycle)}
                    className="rounded-lg border border-[#E2E8F0] p-1.5 text-[#64748B] hover:bg-slate-100"
                    title="Editar Fechas"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  {cycle.status !== 'Finalizado' && (
                    <button
                      onClick={() => {
                        setSelectedCycle(cycle);
                        setShowCloseConfirm(true);
                      }}
                      className="rounded-lg border border-red-200 p-1.5 text-[#C53030] hover:bg-red-50"
                      title="Cerrar Ciclo"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal: Create Cycle */}
        <Modal
          isOpen={showAddModal || showEditModal}
          onClose={() => { setShowAddModal(false); setShowEditModal(false); }}
          title={showEditModal ? 'Editar Ciclo Académico' : 'Crear Ciclo Académico'}
        >
          <form onSubmit={showEditModal ? handleEditCycle : handleCreateCycle} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-[#333333] mb-1">Año Lectivo</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Nombre del Ciclo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Primer Semestre 2027"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Campus</label>
                <select
                  required
                  value={formData.campusId}
                  onChange={(e) => setFormData({ ...formData, campusId: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  <option value="">Selecciona campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Inicio de Inscripciones</label>
                <input
                  type="date"
                  value={formData.enrollmentStartDate}
                  onChange={(e) => setFormData({ ...formData, enrollmentStartDate: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Fin de Inscripciones</label>
                <input
                  type="date"
                  value={formData.enrollmentEndDate}
                  onChange={(e) => setFormData({ ...formData, enrollmentEndDate: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Inicio de Clases</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Fin de Clases</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-bold text-[#333333] mb-1">Límite para Entrega de Notas</label>
                <input
                  type="date"
                  value={formData.gradeSubmissionDeadline}
                  onChange={(e) => setFormData({ ...formData, gradeSubmissionDeadline: e.target.value })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Inicio de Exámenes Finales <span className="font-normal text-[#7D8490]">(opcional)</span></label>
                <input
                  type="date"
                  value={formData.examStartDate ?? ''}
                  onChange={(e) => setFormData({ ...formData, examStartDate: e.target.value || undefined })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Fin de Exámenes Finales <span className="font-normal text-[#7D8490]">(opcional)</span></label>
                <input
                  type="date"
                  value={formData.examEndDate ?? ''}
                  onChange={(e) => setFormData({ ...formData, examEndDate: e.target.value || undefined })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 font-bold text-white hover:bg-[#5F0018]"
              >
                {showEditModal ? 'Guardar cambios' : 'Guardar Ciclo'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal Close Confirm */}
        <ConfirmationDialog
          isOpen={showCloseConfirm}
          onClose={() => setShowCloseConfirm(false)}
          onConfirm={confirmCloseCycle}
          title="Cerrar Ciclo Académico"
          message={`¿Estás seguro de cerrar definitivamente el ciclo ${selectedCycle?.name}? Se archivarán las inscripciones y actas.`}
          confirmText="Sí, Cerrar Ciclo"
        />
      </div>
    </RoleGuard>
  );
};
