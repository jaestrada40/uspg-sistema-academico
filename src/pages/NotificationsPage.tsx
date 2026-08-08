import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, MailCheck, MailWarning, RefreshCcw, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';
import { Pagination } from '../components/common/Pagination';

interface OutboxRecord { id: string; recipientEmail: string; recipientName: string; subject: string; status: string; attempts: number; lastError?: string; sentAt?: string; createdAt: string; }

export const NotificationsPage: React.FC = () => {
  const { showToast } = useApp();
  const [form, setForm] = useState({ title: '', message: '', role: 'ESTUDIANTE', type: 'INFO', link: '/dashboard' });
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadOutbox = useCallback(async () => {
    const response = await fetch('/api/notifications/outbox');
    if (!response.ok) return;
    const result = await response.json(); setRecords(result.records); setSmtpConfigured(result.smtpConfigured); setPage(1);
  }, []);
  useEffect(() => { loadOutbox(); }, [loadOutbox]);

  const sendBroadcast = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true);
    const response = await fetch('/api/notifications/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, role: form.role === 'TODOS' ? null : form.role }) });
    const result = await response.json(); setSending(false);
    if (!response.ok) return showToast(result.message, 'error');
    showToast(`Aviso generado para ${result.recipients} usuarios`, 'success'); setForm({ ...form, title: '', message: '' }); await loadOutbox();
  };
  const retry = async (id: string) => {
    const response = await fetch(`/api/notifications/outbox/${id}/retry`, { method: 'POST' });
    if (!response.ok) return showToast('No se pudo reintentar el correo', 'error');
    showToast(smtpConfigured ? 'Reintento procesado' : 'SMTP todavía no está configurado', smtpConfigured ? 'success' : 'warning'); await loadOutbox();
  };

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <RoleGuard allowedRoles={['ADMIN', 'REGISTRO']}><div className="space-y-6"><PageHeader title="Notificaciones Institucionales" description="Avisos dentro de la plataforma y seguimiento de correos institucionales" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Notificaciones', active: true }]} />
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${smtpConfigured ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>{smtpConfigured ? <MailCheck className="h-6 w-6 text-green-700" /> : <MailWarning className="h-6 w-6 text-amber-700" />}<div><p className="text-sm font-bold">{smtpConfigured ? 'Servidor de correo configurado' : 'Correo pendiente de configuración'}</p><p className="text-xs text-[#64748B]">{smtpConfigured ? 'Los avisos se entregan en la plataforma y por correo.' : 'Los avisos se muestran en la plataforma y quedan guardados en la bandeja hasta configurar SMTP.'}</p></div></div>
    <form onSubmit={sendBroadcast} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><div className="mb-4 flex items-center gap-2"><BellRing className="h-5 w-5 text-[#800020]" /><h3 className="text-sm font-bold">Crear aviso institucional</h3></div><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Destinatarios</label><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="ESTUDIANTE">Estudiantes</option><option value="DOCENTE">Catedráticos</option><option value="ADMIN">Administradores</option><option value="TODOS">Todos los usuarios</option></select></div><div><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Tipo</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="INFO">Información</option><option value="SUCCESS">Confirmación</option><option value="WARNING">Advertencia</option><option value="DANGER">Urgente</option></select></div><div className="md:col-span-2"><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Título</label><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Ej. Recordatorio de inscripción" /></div><div className="md:col-span-2"><label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Mensaje</label><textarea required rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Contenido del aviso" /></div></div><div className="mt-4 flex justify-end"><button disabled={sending} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Generando avisos...' : 'Enviar aviso'}</button></div></form>
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs"><div className="border-b border-[#E2E8F0] p-5"><h3 className="text-sm font-bold">Bandeja de salida</h3><p className="text-xs text-[#64748B]">Últimos 100 correos generados por el sistema</p></div>{records.length === 0 ? <div className="p-8 text-center text-sm text-[#64748B]">Todavía no hay correos en la bandeja.</div> : <><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F8FAFC] uppercase text-[#64748B]"><tr><th className="px-5 py-3">Destinatario</th><th className="px-5 py-3">Asunto</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Intentos</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{visibleRecords.map((record) => <tr key={record.id}><td className="px-5 py-4"><p className="font-bold">{record.recipientName}</p><p className="text-[10px] text-[#64748B]">{record.recipientEmail}</p></td><td className="px-5 py-4">{record.subject}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${record.status === 'SENT' ? 'bg-green-100 text-green-700' : record.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{record.status}</span>{record.lastError && <p className="mt-1 max-w-xs truncate text-[10px] text-[#64748B]">{record.lastError}</p>}</td><td className="px-5 py-4">{record.attempts}</td><td className="px-5 py-4 text-right">{record.status !== 'SENT' && <button onClick={() => retry(record.id)} className="font-bold text-[#800020]"><RefreshCcw className="mr-1 inline h-3.5 w-3.5" />Reintentar</button>}</td></tr>)}</tbody></table></div><Pagination currentPage={currentPage} totalPages={totalPages} totalItems={records.length} pageSize={pageSize} onPageChange={setPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} /></>}</div>
  </div></RoleGuard>;
};
