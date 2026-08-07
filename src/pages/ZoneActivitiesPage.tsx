import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, CalendarDays, CheckCircle2, FlaskConical, FolderKanban, Plus, Save, Send, Target } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';

interface ActivityGrade { id: string; studentCarnet: string; studentName: string; score: number | null; feedback?: string; }
interface ZoneActivity { id: string; name: string; type: string; maxScore: number; dueDate: string; isPublished: boolean; sectionId: string; sectionCode: string; courseName: string; grades: ActivityGrade[]; }

const typeIcon = (type: string) => type === 'PROYECTO' ? FolderKanban : type === 'LABORATORIO' ? FlaskConical : type === 'TAREA' ? BookOpenCheck : Target;

export const ZoneActivitiesPage: React.FC = () => {
  const { currentUser, sections, showToast } = useApp();
  const availableSections = useMemo(() => currentUser.role === 'DOCENTE' ? sections.filter((section) => section.teacherId === currentUser.carnetOrCode) : sections, [sections, currentUser]);
  const [sectionId, setSectionId] = useState(availableSections[0]?.id || '');
  const [activities, setActivities] = useState<ZoneActivity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draftGrades, setDraftGrades] = useState<ActivityGrade[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', type: 'TAREA', maxScore: '', dueDate: '' });

  const loadActivities = useCallback(async () => {
    setLoading(true);
    const query = currentUser.role === 'ESTUDIANTE' ? '' : `?sectionId=${encodeURIComponent(sectionId)}`;
    try {
      const response = await fetch(`/api/zone-activities${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setActivities(result);
      if (currentUser.role !== 'ESTUDIANTE') setSelectedId((current) => result.some((item: ZoneActivity) => item.id === current) ? current : result[0]?.id || '');
    } catch (error) { showToast(error instanceof Error ? error.message : 'No se pudieron cargar las actividades', 'error'); }
    finally { setLoading(false); }
  }, [currentUser.role, sectionId]);

  useEffect(() => { if (currentUser.role === 'ESTUDIANTE' || sectionId) loadActivities(); }, [loadActivities, currentUser.role, sectionId]);
  const selected = activities.find((activity) => activity.id === selectedId);
  useEffect(() => { setDraftGrades(selected?.grades.map((grade) => ({ ...grade })) || []); }, [selectedId, activities]);

  const assignedPoints = activities.reduce((sum, activity) => sum + activity.maxScore, 0);
  const createActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/zone-activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sectionId, maxScore: Number(form.maxScore) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Actividad creada y asignada a los estudiantes', 'success');
    setForm({ name: '', type: 'TAREA', maxScore: '', dueDate: '' }); setShowForm(false); await loadActivities();
  };
  const saveGrades = async () => {
    if (!selected) return;
    const response = await fetch(`/api/zone-activities/${selected.id}/grades`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: draftGrades }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Calificaciones guardadas y zona actualizada', 'success'); await loadActivities();
  };
  const publishActivity = async () => {
    if (!selected) return;
    const response = await fetch(`/api/zone-activities/${selected.id}/publish`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Actividad publicada para los estudiantes', 'success'); await loadActivities();
  };

  if (currentUser.role === 'ESTUDIANTE') {
    const grouped = activities.reduce<Record<string, ZoneActivity[]>>((groups, activity) => { (groups[activity.courseName] ||= []).push(activity); return groups; }, {});
    return <RoleGuard allowedRoles={['ESTUDIANTE']}><div className="space-y-6"><PageHeader title="Mis Actividades de Zona" description="Detalle de tareas, proyectos, laboratorios y actividades publicadas" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Actividades de Zona', active: true }]} />{loading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-[#64748B]">Cargando actividades...</div> : Object.keys(grouped).length === 0 ? <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">Todavía no hay actividades publicadas.</div> : Object.entries(grouped).map(([course, items]) => { const earned = items.reduce((sum, item) => sum + Number(item.grades[0]?.score || 0), 0); const possible = items.reduce((sum, item) => sum + item.maxScore, 0); return <div key={course} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs"><div className="flex items-center justify-between border-b border-[#E2E8F0] p-5"><div><h3 className="text-sm font-bold">{course}</h3><p className="text-xs text-[#64748B]">{items[0].sectionCode}</p></div><span className="text-lg font-extrabold text-[#800020]">{earned}/{possible} pts</span></div><div className="divide-y divide-[#E2E8F0]">{items.map((activity) => { const Icon = typeIcon(activity.type); const grade = activity.grades[0]; return <div key={activity.id} className="flex items-center justify-between gap-4 p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-[#800020]/10 p-2"><Icon className="h-4 w-4 text-[#800020]" /></div><div><p className="text-xs font-bold">{activity.name}</p><p className="text-[11px] text-[#64748B]">{activity.type} · Entrega {new Date(activity.dueDate).toLocaleDateString('es-GT')}</p>{grade?.feedback && <p className="mt-1 text-[11px] text-[#64748B]">{grade.feedback}</p>}</div></div><span className="text-sm font-extrabold text-[#333333]">{grade?.score ?? '-'}/{activity.maxScore}</span></div>})}</div></div>; })}</div></RoleGuard>;
  }

  return <RoleGuard allowedRoles={['ADMIN', 'DOCENTE']}><div className="space-y-6"><PageHeader title="Actividades de Zona" description="Tareas, proyectos, laboratorios y actividades que conforman los 30 puntos de zona" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Actividades de Zona', active: true }]} actions={<button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Nueva Actividad</button>} />
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs md:flex-row md:items-center"><div className="flex-1"><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Sección</label><select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="w-full max-w-xl rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm">{availableSections.map((section) => <option key={section.id} value={section.id}>{section.code} - {section.courseName}</option>)}</select></div><div className="min-w-56"><div className="mb-1 flex justify-between text-xs font-bold"><span>Zona planificada</span><span>{assignedPoints}/30 pts</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${assignedPoints > 30 ? 'bg-red-500' : 'bg-[#800020]'}`} style={{ width: `${Math.min(100, assignedPoints / 30 * 100)}%` }} /></div><p className="mt-1 text-[11px] text-[#64748B]">Disponibles: {Math.max(0, 30 - assignedPoints)} puntos</p></div></div>
    {showForm && <form onSubmit={createActivity} className="grid gap-4 rounded-xl border border-[#800020]/20 bg-white p-5 md:grid-cols-5"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre de la actividad" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option>TAREA</option><option>PROYECTO</option><option>LABORATORIO</option><option>ACTIVIDAD</option></select><input required type="number" min="0.1" max={Math.max(0.1, 30 - assignedPoints)} step="0.1" value={form.maxScore} onChange={(event) => setForm({ ...form, maxScore: event.target.value })} placeholder="Valor" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /><button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Crear y asignar</button></form>}
    {loading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-[#64748B]">Cargando actividades...</div> : activities.length === 0 ? <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">Crea la primera actividad de zona para esta sección.</div> : <div className="grid gap-5 lg:grid-cols-[320px_1fr]"><div className="space-y-2">{activities.map((activity) => { const Icon = typeIcon(activity.type); return <button key={activity.id} onClick={() => setSelectedId(activity.id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === activity.id ? 'border-[#800020] bg-[#800020]/5' : 'border-[#E2E8F0] bg-white'}`}><div className="flex items-start justify-between"><Icon className="h-5 w-5 text-[#800020]" />{activity.isPublished && <CheckCircle2 className="h-4 w-4 text-green-600" />}</div><p className="mt-2 text-sm font-bold">{activity.name}</p><p className="text-[11px] text-[#64748B]">{activity.type} · {activity.maxScore} pts</p><p className="mt-1 flex items-center gap-1 text-[11px] text-[#64748B]"><CalendarDays className="h-3 w-3" />{new Date(activity.dueDate).toLocaleDateString('es-GT')}</p></button>})}</div>{selected && <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] p-5"><div><h3 className="text-sm font-bold">Calificar: {selected.name}</h3><p className="text-xs text-[#64748B]">Valor máximo: {selected.maxScore} puntos</p></div><div className="flex items-center gap-2">{(() => { const pending = draftGrades.filter((g) => g.score === null).length; return pending > 0 && !selected.isPublished ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">{pending} sin calificar</span> : null; })()}<button onClick={saveGrades} className="flex items-center gap-2 rounded-lg bg-[#17A2B8] px-3 py-2 text-xs font-bold text-white"><Save className="h-4 w-4" />Guardar</button><button onClick={publishActivity} disabled={selected.isPublished} className="flex items-center gap-2 rounded-lg bg-[#800020] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />{selected.isPublished ? 'Publicada' : 'Publicar'}</button></div></div>{draftGrades.length === 0 ? <div className="p-8 text-center text-xs text-[#64748B]">No hay estudiantes inscritos.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F8FAFC] uppercase text-[#64748B]"><tr><th className="px-5 py-3">Carné</th><th className="px-5 py-3">Estudiante</th><th className="px-5 py-3">Punteo</th><th className="px-5 py-3">Retroalimentación</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{draftGrades.map((grade) => <tr key={grade.id} className={grade.score === null && !selected.isPublished ? 'bg-amber-50' : ''}><td className="px-5 py-4 font-bold text-[#800020]">{grade.studentCarnet}</td><td className="px-5 py-4 font-semibold">{grade.studentName}{grade.score === null && !selected.isPublished && <span className="ml-2 text-[10px] font-bold text-amber-600">Pendiente</span>}</td><td className="px-5 py-4"><input type="number" min="0" max={selected.maxScore} step="0.1" value={grade.score ?? ''} onChange={(event) => setDraftGrades((items) => items.map((item) => item.id === grade.id ? { ...item, score: event.target.value === '' ? null : Number(event.target.value) } : item))} className={`w-20 rounded-lg border px-2 py-1.5 text-center font-bold ${grade.score === null && !selected.isPublished ? 'border-amber-300' : 'border-[#E2E8F0]'}`} /></td><td className="px-5 py-4"><input value={grade.feedback || ''} onChange={(event) => setDraftGrades((items) => items.map((item) => item.id === grade.id ? { ...item, feedback: event.target.value } : item))} placeholder="Comentario opcional" className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5" /></td></tr>)}</tbody></table></div>}</div>}</div>}
  </div></RoleGuard>;
};
