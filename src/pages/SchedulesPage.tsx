import React, { useState } from 'react';
import {
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  Printer,
  Building,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { RoleGuard } from '../components/common/RoleGuard';

export const SchedulesPage: React.FC = () => {
  const { sections, classrooms, currentCycle, addClassroom, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'grid' | 'classrooms'>('grid');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');

  const [showAddClassroomModal, setShowAddClassroomModal] = useState(false);
  const [newClassroom, setNewClassroom] = useState({
    code: '',
    building: 'Edificio Central USPG',
    capacity: 35,
    type: 'Teórica' as const,
  });

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const timeSlots = [
    '07:00 - 09:00',
    '09:15 - 11:15',
    '11:30 - 13:30',
    '18:00 - 20:00',
  ];

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.code) return;

    if (!(await addClassroom({
      id: `AULA-${Date.now()}`,
      code: newClassroom.code,
      building: newClassroom.building,
      capacity: newClassroom.capacity,
      type: newClassroom.type,
      status: 'Disponible',
      hasProjector: false,
      hasAirConditioning: false,
    }))) return;

    setShowAddClassroomModal(false);
  };

  const handlePrintSchedule = () => {
    window.print();
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'DOCENTE', 'ESTUDIANTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Horarios y Aulas Universitarias"
          description={`Programación de recintos, aulas físicas y matriz de distribución horaria - ${currentCycle.name}`}
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Horarios y Aulas', active: true },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintSchedule}
                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#333333] hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Printer className="h-4 w-4 text-[#800020]" />
                Imprimir Horario
              </button>

              <button
                onClick={() => setShowAddClassroomModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Nueva Aula
              </button>
            </div>
          }
        />

        {/* View Tabs */}
        <div className="flex border-b border-[#E2E8F0] text-xs font-bold">
          <button
            onClick={() => setActiveTab('grid')}
            className={`pb-3 px-4 ${
              activeTab === 'grid'
                ? 'border-b-2 border-[#800020] text-[#800020]'
                : 'text-[#64748B] hover:text-[#333333]'
            }`}
          >
            Matriz Horaria Semanal
          </button>
          <button
            onClick={() => setActiveTab('classrooms')}
            className={`pb-3 px-4 ${
              activeTab === 'classrooms'
                ? 'border-b-2 border-[#800020] text-[#800020]'
                : 'text-[#64748B] hover:text-[#333333]'
            }`}
          >
            Catálogo de Aulas ({classrooms.length})
          </button>
        </div>

        {activeTab === 'grid' ? (
          /* Weekly Schedule Matrix */
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase">
                      <th className="p-3.5 w-32 border-r border-[#E2E8F0]">Bloque Horario</th>
                      {days.map((day) => (
                        <th key={day} className="p-3.5 border-r border-[#E2E8F0] text-center min-w-[150px]">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {timeSlots.map((time) => (
                      <tr key={time} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-[#800020] bg-[#F8FAFC] border-r border-[#E2E8F0]">
                          {time}
                        </td>

                        {days.map((day) => {
                          const matchingSections = sections.filter(
                            (s) => s.scheduleDays.includes(day) && s.scheduleTime === time
                          );

                          return (
                            <td key={day} className="p-2 border-r border-[#E2E8F0] vertical-top">
                              {matchingSections.length === 0 ? (
                                <span className="text-[10px] text-[#7D8490] italic block text-center py-2">
                                  —
                                </span>
                              ) : (
                                <div className="space-y-1.5">
                                  {matchingSections.map((sec) => (
                                    <div
                                      key={sec.id}
                                      className="rounded-lg border border-[#800020]/20 bg-[#800020]/5 p-2 text-[11px]"
                                    >
                                      <span className="font-extrabold text-[#800020] block">
                                        {sec.code} - {sec.courseName}
                                      </span>
                                      <span className="text-[#64748B] block mt-0.5">
                                        {sec.teacherName}
                                      </span>
                                      <span className="font-semibold text-[#333333] block mt-0.5">
                                        📍 {sec.classroomName}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Classrooms Catalog */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {classrooms.map((clr) => (
              <div
                key={clr.id}
                className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="rounded-md bg-[#800020]/10 px-2.5 py-1 text-xs font-extrabold text-[#800020]">
                      {clr.code}
                    </span>
                    <StatusBadge status={clr.status} size="sm" />
                  </div>

                  <h4 className="text-sm font-bold text-[#333333]">{clr.building}</h4>
                  <p className="text-xs text-[#64748B] mt-1">Tipo: {clr.type}</p>

                  <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex justify-between text-xs">
                    <span className="text-[#7D8490]">Capacidad Máxima</span>
                    <span className="font-bold text-[#333333]">{clr.capacity} Alumnos</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Add Classroom */}
        <Modal
          isOpen={showAddClassroomModal}
          onClose={() => setShowAddClassroomModal(false)}
          title="Registrar Nueva Aula"
        >
          <form onSubmit={handleCreateClassroom} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#333333] mb-1">Código / Nombre del Aula *</label>
              <input
                type="text"
                required
                value={newClassroom.code}
                onChange={(e) => setNewClassroom({ ...newClassroom, code: e.target.value })}
                placeholder="Aula 301 - Lab B"
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-[#333333] mb-1">Edificio / Módulo</label>
              <input
                type="text"
                value={newClassroom.building}
                onChange={(e) => setNewClassroom({ ...newClassroom, building: e.target.value })}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-[#333333] mb-1">Capacidad (Cupos)</label>
                <input
                  type="number"
                  value={newClassroom.capacity}
                  onChange={(e) => setNewClassroom({ ...newClassroom, capacity: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">Tipo de Instalación</label>
                <select
                  value={newClassroom.type}
                  onChange={(e) => setNewClassroom({ ...newClassroom, type: e.target.value as any })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                >
                  <option value="Teórica">Teórica</option>
                  <option value="Laboratorio">Laboratorio</option>
                  <option value="Audiovisual">Audiovisual</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setShowAddClassroomModal(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#800020] px-5 py-2 font-bold text-white hover:bg-[#5F0018]"
              >
                Guardar Aula
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </RoleGuard>
  );
};
