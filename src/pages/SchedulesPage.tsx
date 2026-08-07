import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  Printer,
  Building,
  AlertTriangle,
  Plus,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { RoleGuard } from '../components/common/RoleGuard';

export const SchedulesPage: React.FC = () => {
  const { currentUser, sections, classrooms, currentCycle, enrollments, addClassroom, showToast } = useApp();

  const [campuses, setCampuses] = useState<{ id: string; name: string; status: string }[]>([]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    fetch('/api/academic-structure')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setCampuses(result.campuses.filter((campus: { status: string }) => campus.status === 'Activo')))
      .catch(() => undefined);
  }, [currentUser.role]);

  const [activeTab, setActiveTab] = useState<'grid' | 'classrooms'>('grid');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('ALL');
  const [teacherFilter, setTeacherFilter] = useState('ALL');

  const [showAddClassroomModal, setShowAddClassroomModal] = useState(false);
  const [newClassroom, setNewClassroom] = useState<{ code: string; building: string; capacity: number; type: 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual'; campusId: string }>({
    code: '',
    building: 'Edificio Central USPG',
    capacity: 35,
    type: 'Teórica',
    campusId: '',
  });
  const [editClassroomId, setEditClassroomId] = useState<string | null>(null);
  const [editClassroomForm, setEditClassroomForm] = useState({ code: '', building: '', capacity: 35, type: 'Teórica' });

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const enrolledSectionIds = new Set(enrollments.filter((item) => item.studentCarnet === currentUser.carnetOrCode && item.cycleId === currentCycle.id && item.status === 'Inscrito').map((item) => item.sectionId));
  const roleSections = sections.filter((section) => {
    if (section.cycleId !== currentCycle.id) return false;
    if (currentUser.role === 'ESTUDIANTE') return enrolledSectionIds.has(section.id);
    if (currentUser.role === 'DOCENTE') return section.teacherId === currentUser.carnetOrCode || section.teacherName === currentUser.name;
    return true;
  });
  const visibleSections = useMemo(() => roleSections.filter((section) => {
    const haystack = `${section.code} ${section.courseName || ''} ${section.teacherName || ''} ${section.classroomName || ''}`.toLowerCase();
    return (!searchTerm || haystack.includes(searchTerm.toLowerCase())) &&
      (selectedDay === 'ALL' || section.scheduleDays.includes(selectedDay)) &&
      (classroomFilter === 'ALL' || section.classroomId === classroomFilter) &&
      (teacherFilter === 'ALL' || section.teacherId === teacherFilter);
  }), [roleSections, searchTerm, selectedDay, classroomFilter, teacherFilter]);
  const timeSlots = Array.from(new Set(visibleSections.map((section) => section.scheduleTime).filter(Boolean))).sort((a, b) => {
    const minutes = (value: string) => { const match = value.match(/(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER; };
    return minutes(a) - minutes(b);
  });
  const calendarStart = 7 * 60, calendarEnd = 22 * 60, slot = 30;
  const parseRange = (value: string) => { const match = value.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); return match ? { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) } : null; };
  const overlaps = (first: typeof visibleSections[number], second: typeof visibleSections[number]) => {
    const a = parseRange(first.scheduleTime); const b = parseRange(second.scheduleTime);
    return Boolean(a && b && first.scheduleDays.some((day) => second.scheduleDays.includes(day)) && a.start < b.end && b.start < a.end);
  };
  const hasConflict = (section: typeof visibleSections[number]) => roleSections.some((other) => other.id !== section.id && overlaps(section, other));
  const teachersWithSchedule = Array.from(new Map(roleSections.map((section) => [section.teacherId, section.teacherName || section.teacherId])).entries());

  const handleEditClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClassroomId) return;
    const response = await fetch(`/api/classrooms/${editClassroomId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editClassroomForm, capacity: Number(editClassroomForm.capacity) }) });
    if (!response.ok) { const result = await response.json(); showToast(result.message || 'No se pudo actualizar el aula', 'error'); return; }
    showToast('Aula actualizada', 'success');
    setEditClassroomId(null);
    window.location.reload();
  };

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.code || !newClassroom.campusId) return;

    if (!(await addClassroom({
      id: `AULA-${Date.now()}`,
      code: newClassroom.code,
      building: newClassroom.building,
      capacity: newClassroom.capacity,
      type: newClassroom.type,
      status: 'Disponible',
      hasProjector: false,
      hasAirConditioning: false,
      campusId: newClassroom.campusId,
    }))) return;

    setShowAddClassroomModal(false);
  };

  const handlePrintSchedule = () => {
    window.print();
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'DOCENTE', 'ESTUDIANTE']}>
      <div className="schedule-page space-y-6">
        <PageHeader
          title="Horarios y Aulas Universitarias"
          description={`Programación de recintos, aulas físicas y matriz de distribución horaria - ${currentCycle.name}`}
          breadcrumbs={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'Horarios y Aulas', active: true },
          ]}
          actions={
            <div className="flex items-center gap-2">
              {currentUser.role === 'ADMIN' && <button
                onClick={handlePrintSchedule}
                className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#333333] hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Printer className="h-4 w-4 text-[#800020]" />
                Imprimir Horario
              </button>}

              {currentUser.role === 'ADMIN' && <button
                onClick={() => setShowAddClassroomModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white hover:bg-[#5F0018] transition-colors shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Nueva Aula
              </button>}
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
          <div className="schedule-print-area space-y-4">
            <div className="grid gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs md:grid-cols-[1.5fr_repeat(3,1fr)]">
              <label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar curso, sección, docente o aula" className="w-full rounded-lg border border-[#E2E8F0] py-2 pl-9 pr-3 text-xs" /></label>
              <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs"><option value="ALL">Todos los días</option>{days.map((day) => <option key={day}>{day}</option>)}</select>
              <select value={classroomFilter} onChange={(event) => setClassroomFilter(event.target.value)} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs"><option value="ALL">Todas las aulas</option>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.code}</option>)}</select>
              <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs"><option value="ALL">Todos los docentes</option>{teachersWithSchedule.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]"><span className="font-semibold">{visibleSections.length} secciones visibles</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#800020]" /> Cruce parcial o total</span><span>Haz clic en un bloque para abrir su registro.</span></div>
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[80px_repeat(6,minmax(145px,1fr))] border-b bg-[#1E293B] text-[10px] font-bold text-white"><div className="p-3">Hora</div>{days.map((day) => <div key={day} className="border-l border-white/10 p-3 text-center">{day}</div>)}</div>
                <div className="relative grid grid-cols-[80px_repeat(6,minmax(145px,1fr))]" style={{ height: `${((calendarEnd - calendarStart) / slot) * 32}px` }}>
                  <div className="relative border-r bg-[#F8FAFC]">{Array.from({ length: (calendarEnd - calendarStart) / slot }, (_, index) => { const minute = calendarStart + index * slot; return <div key={minute} className="h-8 border-b px-2 pt-1 text-[9px] font-bold text-[#64748B]">{String(Math.floor(minute / 60)).padStart(2, '0')}:{String(minute % 60).padStart(2, '0')}</div>; })}</div>
                  {days.map((day) => <div key={day} className="relative border-r" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #E2E8F0 31px, #E2E8F0 32px)' }}>{visibleSections.filter((section) => section.scheduleDays.includes(day)).map((section) => { const range = parseRange(section.scheduleTime); if (!range) return null; const top = ((range.start - calendarStart) / slot) * 32; const height = Math.max(28, ((range.end - range.start) / slot) * 32 - 4); const conflict = hasConflict(section); return <a href={`/secciones#section-${section.id}`} key={`${day}-${section.id}`} className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border p-1.5 text-[9px] leading-tight shadow-sm hover:brightness-95 ${conflict ? 'border-red-600 bg-red-100' : 'border-[#800020]/30 bg-[#800020]/10'}`} style={{ top, height }} title={`${section.courseName} · ${section.scheduleTime}${conflict ? ' · Cruce detectado' : ''}`}><strong className={`block ${conflict ? 'text-red-700' : 'text-[#800020]'}`}>{section.code}{conflict ? ' · CRUCE' : ''}</strong><span className="block font-bold">{section.courseName}</span><span className="block text-[#475569]">{section.scheduleTime} · {section.classroomName}</span></a>; })}</div>)}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
              <div className="flex flex-wrap gap-3 border-b bg-[#F8FAFC] p-4 text-xs text-[#475569]"><span><strong>Vista por bloques reales:</strong> cada fila corresponde al horario configurado en la sección.</span><span className="rounded-full bg-white px-3 py-1 font-semibold">Ejemplo: 07:00–09:00</span><span className="rounded-full bg-white px-3 py-1 font-semibold">Ejemplo: 07:45–10:00</span></div>
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
                            const matchingSections = visibleSections.filter(
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
                {currentUser.role === 'ADMIN' && <button onClick={() => { setEditClassroomId(clr.id); setEditClassroomForm({ code: clr.code, building: clr.building, capacity: clr.capacity, type: clr.type }); }} className="mt-3 w-full rounded-lg border border-[#E2E8F0] py-1.5 text-[11px] font-bold text-[#64748B] hover:bg-slate-50">Editar aula</button>}
              </div>
            ))}
          </div>
        )}

        {/* Modal: Edit Classroom */}
        <Modal isOpen={!!editClassroomId} onClose={() => setEditClassroomId(null)} title="Editar Aula">
          <form onSubmit={handleEditClassroom} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#333333] mb-1">Código / Nombre del Aula *</label>
              <input type="text" required value={editClassroomForm.code} onChange={(e) => setEditClassroomForm({ ...editClassroomForm, code: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium" />
            </div>
            <div>
              <label className="block font-bold text-[#333333] mb-1">Edificio / Módulo</label>
              <input type="text" value={editClassroomForm.building} onChange={(e) => setEditClassroomForm({ ...editClassroomForm, building: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-[#333333] mb-1">Capacidad</label>
                <input type="number" value={editClassroomForm.capacity} onChange={(e) => setEditClassroomForm({ ...editClassroomForm, capacity: parseInt(e.target.value) })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium" />
              </div>
              <div>
                <label className="block font-bold text-[#333333] mb-1">Tipo</label>
                <select value={editClassroomForm.type} onChange={(e) => setEditClassroomForm({ ...editClassroomForm, type: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium">
                  <option value="Teórica">Teórica</option>
                  <option value="Laboratorio">Laboratorio</option>
                  <option value="Audiovisual">Audiovisual</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
              <button type="button" onClick={() => setEditClassroomId(null)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 font-medium">Cancelar</button>
              <button type="submit" className="rounded-lg bg-[#800020] px-5 py-2 font-bold text-white">Guardar cambios</button>
            </div>
          </form>
        </Modal>

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

            <div>
              <label className="block font-bold text-[#333333] mb-1">Campus *</label>
              <select
                required
                value={newClassroom.campusId}
                onChange={(e) => setNewClassroom({ ...newClassroom, campusId: e.target.value })}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
              >
                <option value="">Selecciona campus</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </select>
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
                  onChange={(e) => setNewClassroom({ ...newClassroom, type: e.target.value as 'Teórica' | 'Laboratorio' | 'Auditorio' | 'Virtual' })}
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
