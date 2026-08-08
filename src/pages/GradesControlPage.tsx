import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Save,
  Send,
  Download,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  LockKeyhole,
  History,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiGet } from '../services/api';
import { GradeRecord } from '../types';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';
import { RoleGuard } from '../components/common/RoleGuard';

export const GradesControlPage: React.FC = () => {
  const {
    sections,
    grades,
    currentCycle,
    parameters,
    batchUpdateGrades,
    publishGrades,
    closeGrades,
    refreshGrades,
    showToast,
  } = useApp();

  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || '');
  const [localGrades, setLocalGrades] = useState<GradeRecord[]>([]);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; action: string; actorName: string; createdAt: string; details?: string }>>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Refresh grades from server when section changes (picks up zona recalculated by zone activities)
  useEffect(() => {
    if (selectedSectionId) void refreshGrades();
  }, [selectedSectionId]);

  // Sync local state after grades update
  useEffect(() => {
    if (selectedSectionId) {
      const currentSectionGrades = grades.filter((g) => g.sectionId === selectedSectionId);
      setLocalGrades(currentSectionGrades);
      setHasPendingChanges(false);
    }
  }, [selectedSectionId, grades]);

  useEffect(() => {
    if (!selectedSectionId) return;
    apiGet<Array<{ id: string; action: string; actorName: string; createdAt: string; details?: string }>>(`/api/grades/sections/${encodeURIComponent(selectedSectionId)}/history`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [selectedSectionId, grades]);

  const activeSection = sections.find((s) => s.id === selectedSectionId);

  const handleGradeChange = (id: string, field: 'zona' | 'parcial' | 'segundoParcial' | 'final' | 'recuperacion', val: number) => {
    setLocalGrades((prev) =>
      prev.map((g) => {
        if (g.id === id) {
          const updated = { ...g, [field]: Math.max(0, val) };
          // Range limits
          if (field === 'zona' && val > 30) updated.zona = 30;
          if (field === 'parcial' && val > 20) updated.parcial = 20;
          if (field === 'segundoParcial' && val > 20) updated.segundoParcial = 20;
          if (field === 'final' && val > 30) updated.final = 30;

          const total = updated.recuperacion > 0 ? updated.recuperacion : updated.zona + updated.parcial + updated.segundoParcial + updated.final;
          updated.total = total;
          updated.status = total >= parameters.minPassingGrade ? 'Aprobado' : total > 0 ? 'Reprobado' : 'En curso';

          return updated;
        }
        return g;
      })
    );
    setHasPendingChanges(true);
  };

  const handleSaveChanges = async () => {
    await batchUpdateGrades(
      localGrades.map((g) => ({
        id: g.id,
        zona: g.zona,
        parcial: g.parcial,
        segundoParcial: g.segundoParcial,
        final: g.final,
        recuperacion: g.recuperacion,
      }))
    );
    setHasPendingChanges(false);
  };

  const confirmPublish = async () => {
    if (selectedSectionId) {
      if (hasPendingChanges) await handleSaveChanges();
      await publishGrades(selectedSectionId);
      setShowPublishModal(false);
    }
  };

  const confirmClose = async () => {
    if (selectedSectionId && await closeGrades(selectedSectionId)) setShowCloseModal(false);
  };

  const handleDownloadActa = () => {
    if (!selectedSectionId) return;
    const link = document.createElement('a');
    link.href = `/api/grades/sections/${encodeURIComponent(selectedSectionId)}/acta.pdf`;
    link.download = `Acta_${activeSection?.code || 'Notas'}_USPG.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Generando acta oficial en PDF', 'success');
  };

  const isPublished = localGrades.some((g) => g.isPublished);
  const actaStatus = localGrades[0]?.actaStatus || 'BORRADOR';
  const isClosed = actaStatus === 'CERRADA';

  return (
    <RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Control de Calificaciones y Actas"
          description="Zona de 30 puntos, dos parciales de 20 y examen final de 30 puntos"
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Control de Notas', active: true },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadActa}
                disabled={!localGrades.length}
                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#333333] hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Download className="h-4 w-4 text-[#800020]" />
                Descargar Acta
              </button>

              <button
                onClick={handleSaveChanges}
                disabled={!hasPendingChanges || isClosed}
                className="flex items-center gap-2 rounded-lg bg-[#17A2B8] px-4 py-2 text-xs font-bold text-white hover:bg-[#138496] disabled:opacity-40 transition-colors shadow-xs"
              >
                <Save className="h-4 w-4" />
                Guardar Borrador
              </button>

              <button
                onClick={() => setShowPublishModal(true)}
                disabled={isClosed}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] disabled:opacity-40 transition-colors shadow-xs"
              >
                <Send className="h-4 w-4" />
                Publicar Acta
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={!isPublished || isClosed}
                className="flex items-center gap-2 rounded-lg bg-[#333333] px-4 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-40 transition-colors shadow-xs"
              >
                <LockKeyhole className="h-4 w-4" />
                Cerrar Acta
              </button>
            </div>
          }
        />

        {/* Section Selector Header */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-[#64748B] uppercase mb-1">
              Seleccionar Cátedra / Sección Activa
            </label>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-bold text-[#333333]"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.courseName} ({s.teacherName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-[#E2E8F0] pt-3 md:pt-0 md:pl-5">
            {isClosed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#333333]/10 px-3 py-1 text-xs font-bold text-[#333333]">
                <LockKeyhole className="h-4 w-4" /> Acta Cerrada
              </span>
            ) : isPublished ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2F855A]/10 px-3 py-1 text-xs font-bold text-[#2F855A]">
                <CheckCircle2 className="h-4 w-4" /> Actas Publicadas
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B7791F]/10 px-3 py-1 text-xs font-bold text-[#B7791F]">
                <AlertCircle className="h-4 w-4" /> Borrador Pendiente
              </span>
            )}

            {hasPendingChanges && (
              <span className="text-xs font-bold text-[#C53030] animate-pulse">
                • Cambios sin guardar
              </span>
            )}
          </div>
        </div>

        {/* Editable Grades Table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {localGrades.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No hay estudiantes inscritos en esta sección para evaluar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase">
                    <th className="px-6 py-3.5">Carné</th>
                    <th className="px-6 py-3.5">Estudiante</th>
                    <th className="px-6 py-3.5 text-center">Zona (30)</th>
                    <th className="px-6 py-3.5 text-center">1er Parcial (20)</th>
                    <th className="px-6 py-3.5 text-center">2do Parcial (20)</th>
                    <th className="px-6 py-3.5 text-center">Final (Max 30)</th>
                    <th className="px-6 py-3.5 text-center">Recuperación</th>
                    <th className="px-6 py-3.5 text-center">Total Puntos</th>
                    <th className="px-6 py-3.5 text-right">Condición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {localGrades.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-[#800020]">{g.studentCarnet}</td>
                      <td className="px-6 py-4 font-bold text-[#333333]">{g.studentName}</td>

                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={g.zona}
                          disabled={isClosed}
                          onChange={(e) => handleGradeChange(g.id, 'zona', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-md border border-[#E2E8F0] py-1 text-center font-bold text-[#333333]"
                        />
                      </td>

                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={g.parcial}
                          disabled={isClosed}
                          onChange={(e) => handleGradeChange(g.id, 'parcial', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-md border border-[#E2E8F0] py-1 text-center font-bold text-[#333333]"
                        />
                      </td>

                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={g.segundoParcial}
                          disabled={isClosed}
                          onChange={(e) => handleGradeChange(g.id, 'segundoParcial', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-md border border-[#E2E8F0] py-1 text-center font-bold text-[#333333]"
                        />
                      </td>

                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={g.final}
                          disabled={isClosed}
                          onChange={(e) => handleGradeChange(g.id, 'final', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-md border border-[#E2E8F0] py-1 text-center font-bold text-[#333333]"
                        />
                      </td>

                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={g.recuperacion}
                          disabled={isClosed}
                          onChange={(e) => handleGradeChange(g.id, 'recuperacion', parseInt(e.target.value) || 0)}
                          className="w-16 rounded-md border border-[#E2E8F0] py-1 text-center font-semibold text-[#64748B]"
                        />
                      </td>

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

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-[#800020]" />
            <h3 className="text-sm font-bold text-[#333333]">Historial del acta</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-[#64748B]">Todavía no hay movimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {(showAllHistory ? history : history.slice(0, 12)).map((item) => (
                <div key={item.id} className="flex flex-col justify-between gap-1 rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs sm:flex-row sm:items-center">
                  <span className="font-semibold text-[#333333]">{item.action === 'UPDATE_GRADE' ? 'Modificación de nota' : item.action === 'PUBLISH' ? 'Publicación del acta' : item.action === 'CLOSE' ? 'Cierre definitivo' : item.action}</span>
                  <span className="text-[#64748B]">{item.actorName} · {new Date(item.createdAt).toLocaleString('es-GT')}</span>
                </div>
              ))}
              {history.length > 12 && (
                <button onClick={() => setShowAllHistory((v) => !v)} className="mt-1 text-xs font-bold text-[#800020] hover:underline">
                  {showAllHistory ? 'Ver menos' : `Ver ${history.length - 12} entradas más`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Confirm Publish */}
        <ConfirmationDialog
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          onConfirm={confirmPublish}
          title="Publicación Oficial de Notas"
          message={`¿Estás seguro de publicar definitivamente las calificaciones de la sección ${activeSection?.code}? Una vez publicadas, los estudiantes podrán consultar sus notas.`}
          confirmText="Sí, Publicar Acta"
        />
        <ConfirmationDialog
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          onConfirm={confirmClose}
          title="Cierre Definitivo del Acta"
          message={`¿Deseas cerrar definitivamente el acta de la sección ${activeSection?.code}? Después del cierre ninguna calificación podrá modificarse.`}
          confirmText="Sí, Cerrar Acta"
        />
      </div>
    </RoleGuard>
  );
};
