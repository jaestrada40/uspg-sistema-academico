import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BadgeCheck, CalendarClock, CircleDollarSign, RotateCcw, Send, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';

interface EligibleGrade { id: string; studentCarnet: string; studentName: string; courseCode: string; courseName: string; sectionCode: string; total: number; }
interface RecoveryRecord {
  id: string; status: string; originalTotal: number; recoveryScore?: number; requestedAt: string; scheduledAt?: string;
  requestedBy: string; authorizedBy?: string; gradedBy?: string; authorizationNote?: string; gradeRecordId: string;
  studentCarnet: string; studentName: string; sectionCode: string; courseCode: string; courseName: string;
  charge?: { id: string; amount: number; paid: number; balance: number; status: string } | null;
}

export const RecoveriesPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [recoveries, setRecoveries] = useState<RecoveryRecord[]>([]);
  const [eligible, setEligible] = useState<EligibleGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizeId, setAuthorizeId] = useState('');
  const [authorization, setAuthorization] = useState({ scheduledAt: '', feeAmount: '0', authorizationNote: '' });
  const [scores, setScores] = useState<Record<string, string>>({});

  const loadRecoveries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/recoveries');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setRecoveries(result.recoveries); setEligible(result.eligible);
    } catch (error) { showToast(error instanceof Error ? error.message : 'No se pudieron cargar las recuperaciones', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadRecoveries(); }, [loadRecoveries]);

  const requestRecovery = async (gradeRecordId: string) => {
    const response = await fetch('/api/recoveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeRecordId }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Solicitud de recuperación enviada', 'success'); await loadRecoveries();
  };
  const authorize = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch(`/api/recoveries/${authorizeId}/authorize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...authorization, feeAmount: Number(authorization.feeAmount) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Recuperación autorizada', 'success'); setAuthorizeId(''); await loadRecoveries();
  };
  const reject = async (id: string) => {
    const response = await fetch(`/api/recoveries/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorizationNote: 'No cumple los requisitos académicos' }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Solicitud rechazada', 'warning'); await loadRecoveries();
  };
  const gradeRecovery = async (id: string) => {
    const response = await fetch(`/api/recoveries/${id}/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: Number(scores[id]) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Nota de recuperación registrada', 'success'); await loadRecoveries();
  };

  const statusClass = (status: string) => status === 'CALIFICADA' ? 'bg-green-100 text-green-700' : status === 'RECHAZADA' ? 'bg-red-100 text-red-700' : status === 'AUTORIZADA' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
  return <RoleGuard allowedRoles={['ADMIN', 'DOCENTE', 'ESTUDIANTE']}><div className="space-y-6"><PageHeader title="Recuperaciones" description="Solicitud, autorización, pago y calificación de evaluaciones de recuperación" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Recuperaciones', active: true }]} />
    {(currentUser.role === 'ESTUDIANTE' || currentUser.role === 'ADMIN') && eligible.length > 0 && <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><h3 className="mb-3 text-sm font-bold">Cursos disponibles para recuperación</h3><div className="grid gap-3 lg:grid-cols-2">{eligible.map((grade) => <div key={grade.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] p-4"><div><p className="text-xs font-bold">{grade.courseCode} - {grade.courseName}</p><p className="text-[11px] text-[#64748B]">{grade.studentCarnet} · {grade.studentName} · Nota ordinaria: {grade.total}</p></div><button onClick={() => requestRecovery(grade.id)} className="shrink-0 rounded-lg bg-[#800020] px-3 py-2 text-xs font-bold text-white"><Send className="mr-1 inline h-3.5 w-3.5" />Solicitar</button></div>)}</div></div>}
    {authorizeId && currentUser.role === 'ADMIN' && <form onSubmit={authorize} className="grid gap-4 rounded-xl border border-[#17A2B8]/30 bg-white p-5 shadow-xs md:grid-cols-4"><div><p className="text-xs text-[#64748B]">Autorización</p><p className="text-sm font-bold">Programa la evaluación y define si tiene costo.</p></div><input required type="datetime-local" value={authorization.scheduledAt} onChange={(event) => setAuthorization({ ...authorization, scheduledAt: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /><input type="number" min="0" step="0.01" value={authorization.feeAmount} onChange={(event) => setAuthorization({ ...authorization, feeAmount: event.target.value })} placeholder="Costo" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /><button className="rounded-lg bg-[#17A2B8] px-4 py-2 text-xs font-bold text-white">Confirmar autorización</button></form>}
    {loading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-[#64748B]">Cargando recuperaciones...</div> : recoveries.length === 0 ? <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">No hay solicitudes de recuperación.</div> : <div className="grid gap-4">{recoveries.map((recovery) => <div key={recovery.id} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="flex gap-3"><div className="rounded-lg bg-[#800020]/10 p-2.5"><RotateCcw className="h-5 w-5 text-[#800020]" /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{recovery.courseCode} - {recovery.courseName}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(recovery.status)}`}>{recovery.status}</span></div><p className="mt-1 text-xs text-[#64748B]">{recovery.studentCarnet} · {recovery.studentName} · Sección {recovery.sectionCode}</p><p className="mt-1 text-xs">Nota ordinaria conservada: <strong>{recovery.originalTotal}</strong>{recovery.recoveryScore != null && <> · Recuperación: <strong>{recovery.recoveryScore}</strong></>}</p></div></div><div className="flex flex-wrap gap-2">{currentUser.role === 'ADMIN' && recovery.status === 'SOLICITADA' && <><button onClick={() => setAuthorizeId(recovery.id)} className="rounded-lg bg-[#2F855A] px-3 py-2 text-xs font-bold text-white"><BadgeCheck className="mr-1 inline h-4 w-4" />Autorizar</button><button onClick={() => reject(recovery.id)} className="rounded-lg bg-[#C53030] px-3 py-2 text-xs font-bold text-white"><XCircle className="mr-1 inline h-4 w-4" />Rechazar</button></>}{(currentUser.role === 'ADMIN' || currentUser.role === 'DOCENTE') && recovery.status === 'AUTORIZADA' && <div className="flex gap-2"><input type="number" min="0" max="100" value={scores[recovery.id] || ''} onChange={(event) => setScores({ ...scores, [recovery.id]: event.target.value })} placeholder="Nota /100" className="w-28 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs" /><button onClick={() => gradeRecovery(recovery.id)} className="rounded-lg bg-[#800020] px-3 py-2 text-xs font-bold text-white">Registrar nota</button></div>}</div></div><div className="mt-4 grid gap-3 border-t border-[#E2E8F0] pt-4 text-xs sm:grid-cols-3"><div className="flex items-center gap-2 text-[#64748B]"><CalendarClock className="h-4 w-4" />{recovery.scheduledAt ? new Date(recovery.scheduledAt).toLocaleString('es-GT') : 'Pendiente de programación'}</div><div className="flex items-center gap-2 text-[#64748B]"><CircleDollarSign className="h-4 w-4" />{recovery.charge ? `Q${recovery.charge.amount.toFixed(2)} · ${recovery.charge.status}` : 'Sin costo asociado'}</div><div className="flex items-center gap-2 text-[#64748B]"><AlertCircle className="h-4 w-4" />{recovery.authorizationNote || `Solicitada por ${recovery.requestedBy}`}</div></div></div>)}</div>}
  </div></RoleGuard>;
};
