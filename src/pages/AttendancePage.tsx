import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, Save, UserX } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';

type AttendanceStatus = 'PRESENTE' | 'AUSENTE' | 'TARDE' | 'JUSTIFICADO';
interface RosterItem { studentCarnet: string; studentName: string; status: AttendanceStatus; note: string; }
interface StudentCourse { sectionId: string; sectionCode: string; courseName: string; percentage: number; records: Array<{ id: string; classDate: string; topic?: string; status: AttendanceStatus; note?: string }>; }

export const AttendancePage: React.FC = () => {
  const { currentUser, sections, parameters, showToast } = useApp();
  const availableSections = useMemo(() => currentUser.role === 'DOCENTE' ? sections.filter((section) => section.teacherId === currentUser.carnetOrCode) : sections, [sections, currentUser]);
  const [sectionId, setSectionId] = useState(availableSections[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [topic, setTopic] = useState('');
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [recent, setRecent] = useState<Array<{ id: string; classDate: string; topic?: string; present: number; absent: number; late: number; justified: number }>>([]);
  const [studentCourses, setStudentCourses] = useState<StudentCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    const query = currentUser.role === 'ESTUDIANTE' ? '' : `?sectionId=${encodeURIComponent(sectionId)}&date=${encodeURIComponent(date)}`;
    try {
      const response = await fetch(`/api/attendance${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (currentUser.role === 'ESTUDIANTE') setStudentCourses(result);
      else { setRoster(result.students); setRecent(result.recent); setTopic(result.session?.topic || ''); }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo cargar la asistencia', 'error');
    } finally { setLoading(false); }
  }, [currentUser.role, sectionId, date]);

  useEffect(() => { if (currentUser.role === 'ESTUDIANTE' || sectionId) loadAttendance(); }, [loadAttendance, currentUser.role, sectionId]);

  const updateStatus = (carnet: string, status: AttendanceStatus) => setRoster((items) => items.map((item) => item.studentCarnet === carnet ? { ...item, status } : item));
  const saveAttendance = async () => {
    const response = await fetch('/api/attendance/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectionId, date, topic, records: roster }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Asistencia guardada correctamente', 'success');
    await loadAttendance();
  };

  if (currentUser.role === 'ESTUDIANTE') return (
    <RoleGuard allowedRoles={['ESTUDIANTE']}><div className="space-y-6"><PageHeader title="Mi Asistencia" description={`Consulta de asistencia y alertas por debajo del ${parameters.minAttendancePercentage}%`} breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Mi Asistencia', active: true }]} />
      {loading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-[#64748B]">Cargando asistencia...</div> : studentCourses.length === 0 ? <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">Todavía no hay asistencias registradas.</div> : studentCourses.map((course) => <div key={course.sectionId} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs"><div className="flex items-center justify-between border-b border-[#E2E8F0] p-5"><div><h3 className="text-sm font-bold text-[#333333]">{course.courseName}</h3><p className="text-xs text-[#64748B]">{course.sectionCode} · {course.records.length} clases registradas</p></div><div className={`rounded-full px-4 py-2 text-sm font-extrabold ${course.percentage >= parameters.minAttendancePercentage ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{course.percentage}%</div></div>{course.percentage < parameters.minAttendancePercentage && <div className="flex items-center gap-2 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700"><AlertTriangle className="h-4 w-4" />Asistencia debajo del mínimo requerido.</div>}<div className="divide-y divide-[#E2E8F0]">{course.records.slice(0, 10).map((record) => <div key={record.id} className="flex items-center justify-between px-5 py-3 text-xs"><div><p className="font-semibold text-[#333333]">{new Date(record.classDate).toLocaleDateString('es-GT')}</p><p className="text-[#64748B]">{record.topic || 'Clase regular'}</p></div><span className="font-bold text-[#800020]">{record.status}</span></div>)}</div></div>)}</div></RoleGuard>
  );

  return (
    <RoleGuard allowedRoles={['ADMIN', 'REGISTRO', 'DOCENTE']}><div className="space-y-6"><PageHeader title="Control de Asistencia" description="Registro diario por curso, justificaciones y alertas de porcentaje mínimo" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Asistencia', active: true }]} actions={<button onClick={saveAttendance} disabled={!roster.length} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />Guardar Asistencia</button>} />
      <div className="grid gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs md:grid-cols-3"><div><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Sección</label><select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm">{availableSections.map((section) => <option key={section.id} value={section.id}>{section.code} - {section.courseName}</option>)}</select></div><div><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Fecha de clase</label><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></div><div><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Tema</label><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Tema impartido" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></div></div>
      <div className="grid gap-4 sm:grid-cols-4">{[{ label: 'Presentes', value: roster.filter((item) => item.status === 'PRESENTE').length, icon: CheckCircle2, color: 'text-green-600' }, { label: 'Ausentes', value: roster.filter((item) => item.status === 'AUSENTE').length, icon: UserX, color: 'text-red-600' }, { label: 'Tardes', value: roster.filter((item) => item.status === 'TARDE').length, icon: Clock3, color: 'text-amber-600' }, { label: 'Justificados', value: roster.filter((item) => item.status === 'JUSTIFICADO').length, icon: CalendarCheck, color: 'text-blue-600' }].map((card) => <div key={card.label} className="rounded-xl border border-[#E2E8F0] bg-white p-4"><card.icon className={`mb-2 h-5 w-5 ${card.color}`} /><p className="text-xs text-[#64748B]">{card.label}</p><p className="text-xl font-extrabold">{card.value}</p></div>)}</div>
      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">{loading ? <div className="p-8 text-center text-sm text-[#64748B]">Cargando lista...</div> : roster.length === 0 ? <div className="p-8 text-center text-sm text-[#64748B]">No hay estudiantes inscritos en esta sección.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F8FAFC] uppercase text-[#64748B]"><tr><th className="px-5 py-3">Carné</th><th className="px-5 py-3">Estudiante</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Observación</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{roster.map((item) => <tr key={item.studentCarnet}><td className="px-5 py-4 font-bold text-[#800020]">{item.studentCarnet}</td><td className="px-5 py-4 font-semibold">{item.studentName}</td><td className="px-5 py-4"><select value={item.status} onChange={(event) => updateStatus(item.studentCarnet, event.target.value as AttendanceStatus)} className="rounded-lg border border-[#E2E8F0] px-2 py-1.5"><option>PRESENTE</option><option>AUSENTE</option><option>TARDE</option><option>JUSTIFICADO</option></select></td><td className="px-5 py-4"><input value={item.note} onChange={(event) => setRoster((items) => items.map((record) => record.studentCarnet === item.studentCarnet ? { ...record, note: event.target.value } : record))} placeholder="Opcional" className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5" /></td></tr>)}</tbody></table></div>}</div>
      {recent.length > 0 && <div className="rounded-xl border border-[#E2E8F0] bg-white p-5"><h3 className="mb-3 text-sm font-bold">Clases recientes</h3><div className="grid gap-2 md:grid-cols-2">{recent.map((item) => <button key={item.id} onClick={() => setDate(new Date(item.classDate).toISOString().slice(0, 10))} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] p-3 text-left text-xs"><div><p className="font-bold">{new Date(item.classDate).toLocaleDateString('es-GT')}</p><p className="text-[#64748B]">{item.topic || 'Clase regular'}</p></div><span className="text-[#64748B]">{item.present} P · {item.absent} A · {item.late} T</span></button>)}</div></div>}
    </div></RoleGuard>
  );
};
