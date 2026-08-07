import React, { useState } from 'react';
import { CalendarDays, CalendarCheck, MapPin, Users, Plus, X, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';
import { Pagination } from '../components/common/Pagination';

type EventStatus = 'PROGRAMADO' | 'EN_CURSO' | 'CERRADO';
type EventType = 'CONCIERTO' | 'GRADUACION' | 'CONFERENCIA' | 'DEPORTIVO' | 'CULTURAL' | 'OTRO';

interface EventRecord {
  id: string;
  name: string;
  description: string;
  type: EventType;
  location: string;
  startDate: string;
  endDate: string;
  capacity: number;
  organizer: string;
  status: EventStatus;
  attendeesCount: number;
}

interface AttendeeRecord {
  id: string;
  name: string;
  carnet: string;
  email: string;
  registeredAt: string;
  status: 'CONFIRMADO' | 'PENDIENTE' | 'CANCELADO';
}

const MOCK_EVENTS: EventRecord[] = [
  { id: '1', name: 'Graduación Promoción 2026', description: 'Ceremonia oficial de graduación de la promoción 2026 de todas las facultades.', type: 'GRADUACION', location: 'Auditorio Principal USPG', startDate: '2026-10-15T10:00', endDate: '2026-10-15T14:00', capacity: 800, organizer: 'Rectoría USPG', status: 'PROGRAMADO', attendeesCount: 312 },
  { id: '2', name: 'Conferencia Internacional de Tecnología', description: 'Ponentes internacionales presentan avances en IA y desarrollo de software.', type: 'CONFERENCIA', location: 'Salón Magna A', startDate: '2026-08-20T08:00', endDate: '2026-08-20T17:00', capacity: 200, organizer: 'Facultad de Ingeniería', status: 'PROGRAMADO', attendeesCount: 87 },
  { id: '3', name: 'Festival Cultural Universitario', description: 'Presentaciones artísticas, música en vivo y gastronomía guatemalteca.', type: 'CULTURAL', location: 'Campus Central — Plaza Exterior', startDate: '2026-08-05T14:00', endDate: '2026-08-05T20:00', capacity: 1500, organizer: 'Bienestar Estudiantil', status: 'EN_CURSO', attendeesCount: 643 },
  { id: '4', name: 'Torneo Interuniversitario de Fútbol', description: 'Equipos de distintas universidades compiten por el trofeo anual.', type: 'DEPORTIVO', location: 'Cancha Deportiva USPG', startDate: '2026-07-10T07:00', endDate: '2026-07-10T18:00', capacity: 300, organizer: 'Deportes Universitarios', status: 'CERRADO', attendeesCount: 298 },
];

const MOCK_ATTENDEES: Record<string, AttendeeRecord[]> = {
  '1': [
    { id: 'a1', name: 'María López', carnet: '20230101', email: 'maria@uspg.edu.gt', registeredAt: '2026-08-01T09:00', status: 'CONFIRMADO' },
    { id: 'a2', name: 'Carlos Pérez', carnet: '20230142', email: 'carlos@uspg.edu.gt', registeredAt: '2026-08-02T10:30', status: 'CONFIRMADO' },
    { id: 'a3', name: 'Ana Rodríguez', carnet: '20220089', email: 'ana@uspg.edu.gt', registeredAt: '2026-08-03T11:00', status: 'PENDIENTE' },
  ],
  '2': [
    { id: 'b1', name: 'Jorge Méndez', carnet: '20210055', email: 'jorge@uspg.edu.gt', registeredAt: '2026-08-05T08:00', status: 'CONFIRMADO' },
  ],
};

const statusColor: Record<EventStatus, string> = {
  PROGRAMADO: 'bg-blue-100 text-blue-700',
  EN_CURSO: 'bg-green-100 text-green-700',
  CERRADO: 'bg-slate-200 text-slate-600',
};

const attendeeStatusColor: Record<string, string> = {
  CONFIRMADO: 'bg-green-100 text-green-700',
  PENDIENTE: 'bg-amber-100 text-amber-700',
  CANCELADO: 'bg-red-100 text-red-700',
};

const eventTypeLabel: Record<EventType, string> = {
  CONCIERTO: 'Concierto',
  GRADUACION: 'Graduación',
  CONFERENCIA: 'Conferencia',
  DEPORTIVO: 'Deportivo',
  CULTURAL: 'Cultural',
  OTRO: 'Otro',
};

const emptyForm = {
  name: '',
  description: '',
  type: 'CONFERENCIA' as EventType,
  location: '',
  startDate: '',
  endDate: '',
  capacity: '100',
  organizer: '',
};

export const EventsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'mis-eventos' | 'crear' | 'asistentes' | 'estadisticas'>('mis-eventos');
  const [events, setEvents] = useState<EventRecord[]>(MOCK_EVENTS);
  const [form, setForm] = useState(emptyForm);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(10);
  const [attendeePage, setAttendeePage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'TODOS'>('TODOS');

  const filteredEvents = statusFilter === 'TODOS' ? events : events.filter((e) => e.status === statusFilter);
  const pagedEvents = filteredEvents.slice((eventPage - 1) * eventPageSize, eventPage * eventPageSize);
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const attendees = selectedEventId ? (MOCK_ATTENDEES[selectedEventId] ?? []) : [];
  const pagedAttendees = attendees.slice((attendeePage - 1) * 10, attendeePage * 10);

  const totalEvents = events.length;
  const upcoming = events.filter((e) => e.status === 'PROGRAMADO').length;
  const totalAttendees = events.reduce((s, e) => s + e.attendeesCount, 0);
  const inProgress = events.filter((e) => e.status === 'EN_CURSO').length;

  const handleCreate = (ev: React.FormEvent) => {
    ev.preventDefault();
    const newEvent: EventRecord = {
      id: String(Date.now()),
      name: form.name,
      description: form.description,
      type: form.type,
      location: form.location,
      startDate: form.startDate,
      endDate: form.endDate,
      capacity: Number(form.capacity),
      organizer: form.organizer,
      status: 'PROGRAMADO',
      attendeesCount: 0,
    };
    setEvents((prev) => [newEvent, ...prev]);
    setForm(emptyForm);
    setActiveTab('mis-eventos');
  };

  const tabs = [
    { id: 'mis-eventos' as const, label: 'Mis eventos' },
    { id: 'crear' as const, label: 'Crear evento' },
    { id: 'asistentes' as const, label: 'Asistentes' },
    { id: 'estadisticas' as const, label: 'Estadísticas' },
  ];

  return (
    <RoleGuard allowedRoles={['ADMIN', 'EVENTOS']}>
      <div className="space-y-6">
        <PageHeader
          title="Gestión de Eventos"
          description="Planificación, seguimiento de asistentes y estadísticas de eventos universitarios"
          breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Eventos', active: true }]}
          actions={
            <button onClick={() => setActiveTab('crear')} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">
              <Plus className="h-4 w-4" />Nuevo evento
            </button>
          }
        />

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap border-b border-slate-200">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${activeTab === t.id ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Mis eventos */}
        {activeTab === 'mis-eventos' && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-[#64748B]">Filtrar por estado:</span>
              {(['TODOS', 'PROGRAMADO', 'EN_CURSO', 'CERRADO'] as const).map((s) => (
                <button key={s} onClick={() => { setStatusFilter(s); setEventPage(1); }} className={`rounded-full px-3 py-1 text-[10px] font-bold transition-colors ${statusFilter === s ? 'bg-[#800020] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s === 'TODOS' ? 'Todos' : s}
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Evento</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Lugar</th>
                    <th className="p-3">Asistentes</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagedEvents.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">No hay eventos que coincidan con el filtro.</td></tr>
                  )}
                  {pagedEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-bold">{ev.name}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-1">{ev.organizer}</p>
                      </td>
                      <td className="p-3 text-slate-500">{eventTypeLabel[ev.type]}</td>
                      <td className="p-3 text-slate-500">{new Date(ev.startDate).toLocaleDateString('es-GT')}</td>
                      <td className="p-3 text-slate-500 max-w-[160px] truncate">{ev.location}</td>
                      <td className="p-3">
                        <span className="font-bold">{ev.attendeesCount}</span>
                        <span className="text-slate-400"> / {ev.capacity}</span>
                      </td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor[ev.status]}`}>{ev.status}</span></td>
                      <td className="p-3 text-right">
                        <button onClick={() => { setSelectedEventId(ev.id); setActiveTab('asistentes'); setAttendeePage(1); }} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-[#800020] hover:bg-[#800020]/5">
                          Ver asistentes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination currentPage={eventPage} totalPages={Math.ceil(filteredEvents.length / eventPageSize) || 1} totalItems={filteredEvents.length} pageSize={eventPageSize} onPageChange={setEventPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setEventPageSize(s); setEventPage(1); }} />
            </div>
          </section>
        )}

        {/* Tab: Crear evento */}
        {activeTab === 'crear' && (
          <section className="rounded-xl border bg-white p-6 shadow-xs max-w-2xl">
            <h2 className="text-sm font-bold mb-5">Nuevo evento universitario</h2>
            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1">Nombre del evento *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Graduación Promoción 2026" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1">Descripción</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descripción del evento..." className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 resize-none" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Tipo *</label>
                  <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2">
                    {(Object.keys(eventTypeLabel) as EventType[]).map((t) => <option key={t} value={t}>{eventTypeLabel[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Capacidad *</label>
                  <input required type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1">Lugar *</label>
                  <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ej. Auditorio Principal USPG" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Fecha de inicio *</label>
                  <input required type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Fecha de cierre *</label>
                  <input required type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1">Organizador *</label>
                  <input required value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} placeholder="Ej. Facultad de Ingeniería" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button type="button" onClick={() => setForm(emptyForm)} className="rounded-lg border px-4 py-2 text-xs font-bold text-slate-600">
                  <X className="inline h-3.5 w-3.5 mr-1" />Limpiar
                </button>
                <button type="submit" className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white">
                  <CalendarDays className="inline h-3.5 w-3.5 mr-1" />Crear evento
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Tab: Asistentes */}
        {activeTab === 'asistentes' && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-[#64748B]">Seleccionar evento:</span>
              <div className="relative">
                <select value={selectedEventId ?? ''} onChange={(e) => { setSelectedEventId(e.target.value || null); setAttendeePage(1); }} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs pr-8 appearance-none min-w-[240px]">
                  <option value="">— Selecciona un evento —</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
            {selectedEvent && (
              <div className="rounded-xl border border-[#800020]/20 bg-[#800020]/5 p-4 text-xs">
                <p className="font-bold text-[#800020]">{selectedEvent.name}</p>
                <p className="text-slate-600 mt-1"><MapPin className="inline h-3.5 w-3.5 mr-1" />{selectedEvent.location} · <CalendarCheck className="inline h-3.5 w-3.5 ml-1 mr-1" />{new Date(selectedEvent.startDate).toLocaleString('es-GT')} · <Users className="inline h-3.5 w-3.5 ml-1 mr-1" />{selectedEvent.attendeesCount} / {selectedEvent.capacity}</p>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border bg-white shadow-xs">
              {!selectedEventId ? (
                <p className="p-8 text-center text-xs text-slate-400">Selecciona un evento para ver sus asistentes.</p>
              ) : attendees.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-400">No hay asistentes registrados para este evento.</p>
              ) : (
                <>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Nombre</th>
                        <th className="p-3">Carné</th>
                        <th className="p-3">Correo</th>
                        <th className="p-3">Registro</th>
                        <th className="p-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pagedAttendees.map((att) => (
                        <tr key={att.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold">{att.name}</td>
                          <td className="p-3 text-slate-500">{att.carnet}</td>
                          <td className="p-3 text-slate-500">{att.email}</td>
                          <td className="p-3 text-slate-500">{new Date(att.registeredAt).toLocaleString('es-GT')}</td>
                          <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${attendeeStatusColor[att.status]}`}>{att.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination currentPage={attendeePage} totalPages={Math.ceil(attendees.length / 10) || 1} totalItems={attendees.length} pageSize={10} onPageChange={setAttendeePage} />
                </>
              )}
            </div>
          </section>
        )}

        {/* Tab: Estadísticas */}
        {activeTab === 'estadisticas' && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Total de eventos', value: totalEvents, color: 'text-[#800020] bg-[#800020]/10' },
                { label: 'Programados', value: upcoming, color: 'text-blue-700 bg-blue-50' },
                { label: 'En curso', value: inProgress, color: 'text-green-700 bg-green-50' },
                { label: 'Asistentes totales', value: totalAttendees, color: 'text-[#64748B] bg-slate-100' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border bg-white p-5 shadow-xs">
                  <div className={`mb-3 w-fit rounded-lg p-2.5 ${stat.color}`}>
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-extrabold">{stat.value}</p>
                  <p className="text-[11px] text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold mb-4">Ocupación por evento</h2>
              <div className="space-y-3">
                {events.map((ev) => {
                  const pct = Math.round((ev.attendeesCount / ev.capacity) * 100);
                  return (
                    <div key={ev.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold truncate mr-4">{ev.name}</span>
                        <span className="shrink-0 text-slate-500">{ev.attendeesCount}/{ev.capacity} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-[#800020] transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold mb-4">Eventos por tipo</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(eventTypeLabel) as EventType[]).map((type) => {
                  const count = events.filter((e) => e.type === type).length;
                  if (!count) return null;
                  return (
                    <div key={type} className="rounded-lg bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                      <p className="text-xs font-bold text-[#800020]">{eventTypeLabel[type]}</p>
                      <p className="text-lg font-extrabold mt-1">{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </RoleGuard>
  );
};
