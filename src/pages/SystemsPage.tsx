import React, { useEffect, useState } from 'react';
import { Activity, KeyRound, MailWarning, RefreshCw, ShieldCheck, Wrench, LogOut, UserCheck, UserX, Search, Monitor, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';
import { Pagination } from '../components/common/Pagination';
import { useApp } from '../context/AppContext';
import { translateAction, translateEntity, translateProvider, translateSyncStatus } from '../utils/auditLabels';

type Account = { id: string; name: string; email: string; role: string; active: boolean; mustChangePassword: boolean; mfaEnabled: boolean };
type Audit = { id: string; action: string; entityType: string; actor: string; actorRole: string | null; details?: string | null; createdAt: string };
type Outbox = { id: string; recipientEmail: string; subject: string; status: string; attempts: number; lastError?: string | null; createdAt: string };
type Overview = { health: { ok: boolean; database: string; smtpConfigured: boolean }; metrics: { managedUsers: number; activeSessions: number; mfaEnabled: number; pendingEmails: number; failedEmails: number }; audit: Audit[] };
type SessionRecord = { id: string; userId: string; name: string; email: string; role: string; createdAt: string; expiresAt: string };
type InactiveUser = { id: string; name: string; email: string; role: string; active: boolean; updatedAt: string };
type AuditPage = { total: number; page: number; pageSize: number; records: Audit[] };
type Classroom = { id: string; provider: string; syncStatus: string; externalCourseId: string | null; syncError: string | null; lastSyncedAt: string | null; courseName: string; courseCode: string; sectionId: string; updatedAt: string };

export const SystemsPage: React.FC = () => {
  const { showToast } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [outbox, setOutbox] = useState<Outbox[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUser[]>([]);
  const [auditPage, setAuditPage] = useState<AuditPage | null>(null);
  const [auditFilter, setAuditFilter] = useState('');
  const [auditCurrentPage, setAuditCurrentPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'sessions' | 'inactive' | 'audit' | 'classrooms' | 'outbox'>('overview');
  const [overviewAuditPage, setOverviewAuditPage] = useState(1);
  const [overviewAuditPageSize, setOverviewAuditPageSize] = useState(10);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsPageSize, setAccountsPageSize] = useState(20);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsPageSize, setSessionsPageSize] = useState(20);
  const [inactivePage, setInactivePage] = useState(1);
  const [inactivePageSize, setInactivePageSize] = useState(20);
  const [classroomsPage, setClassroomsPage] = useState(1);
  const [classroomsPageSize, setClassroomsPageSize] = useState(20);
  const [outboxPage, setOutboxPage] = useState(1);
  const [outboxPageSize, setOutboxPageSize] = useState(20);

  const loadOverview = async () => {
    const [overviewResponse, accountsResponse, outboxResponse] = await Promise.all([fetch('/api/systems/overview'), fetch('/api/systems/accounts'), fetch('/api/systems/outbox')]);
    if (![overviewResponse, accountsResponse, outboxResponse].every((r) => r.ok)) return showToast('No se pudo cargar la operación técnica.', 'error');
    setOverview(await overviewResponse.json());
    setAccounts(await accountsResponse.json());
    setOutbox((await outboxResponse.json()).records);
  };

  const loadSessions = async () => {
    const r = await fetch('/api/systems/sessions');
    if (r.ok) setSessions(await r.json());
  };

  const loadInactive = async () => {
    const r = await fetch('/api/systems/inactive-users');
    if (r.ok) setInactiveUsers(await r.json());
  };

  const loadAudit = async (page = 1, action = '', pageSize = 20) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (action) params.set('action', action);
    const r = await fetch(`/api/systems/audit?${params}`);
    if (r.ok) setAuditPage(await r.json());
  };

  const loadClassrooms = async () => {
    const r = await fetch('/api/systems/virtual-classrooms');
    if (r.ok) setClassrooms(await r.json());
  };

  useEffect(() => { void loadOverview(); }, []);

  useEffect(() => {
    if (activeTab === 'sessions') void loadSessions();
    if (activeTab === 'inactive') void loadInactive();
    if (activeTab === 'audit') void loadAudit(auditCurrentPage, auditFilter, auditPageSize);
    if (activeTab === 'classrooms') void loadClassrooms();
  }, [activeTab]);

  const support = async (id: string, action: 'reset-password' | 'reset-mfa') => {
    setBusy(`${action}-${id}`);
    const r = await fetch(`/api/systems/accounts/${id}/${action}`, { method: 'POST' });
    const result = await r.json(); setBusy('');
    if (!r.ok) return showToast(result.message || 'No se pudo completar el soporte.', 'error');
    if (action === 'reset-password') showToast(`Contraseña temporal: ${result.temporaryPassword}`, 'success');
    else showToast('MFA restablecido; el usuario deberá configurarlo de nuevo.', 'success');
    await loadOverview();
  };

  const toggleActive = async (id: string) => {
    setBusy(`toggle-${id}`);
    const r = await fetch(`/api/systems/accounts/${id}/toggle-active`, { method: 'PATCH' });
    const result = await r.json(); setBusy('');
    if (!r.ok) return showToast(result.message || 'Error al cambiar estado.', 'error');
    showToast(result.active ? 'Usuario activado.' : 'Usuario desactivado.', 'success');
    await Promise.all([loadOverview(), loadInactive()]);
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, active: result.active } : a));
  };

  const closeSession = async (id: string) => {
    setBusy(`session-${id}`);
    const r = await fetch(`/api/systems/sessions/${id}`, { method: 'DELETE' });
    const result = await r.json(); setBusy('');
    if (!r.ok) return showToast(result.message || 'Error al cerrar sesión.', 'error');
    showToast('Sesión cerrada.', 'success');
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setOverview((prev) => prev ? { ...prev, metrics: { ...prev.metrics, activeSessions: prev.metrics.activeSessions - 1 } } : prev);
  };

  const retry = async (id: string) => {
    setBusy(`retry-${id}`);
    const r = await fetch(`/api/systems/outbox/${id}/retry`, { method: 'POST' });
    const result = await r.json(); setBusy('');
    if (!r.ok) return showToast(result.message || 'No se pudo reintentar el correo.', 'error');
    showToast(`Correo procesado: ${result.status}`, 'success');
    await loadOverview();
  };

  const filteredAccounts = accounts.filter((a) => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()) || a.email.toLowerCase().includes(accountSearch.toLowerCase()) || a.role.toLowerCase().includes(accountSearch.toLowerCase()));
  const pagedAccounts = filteredAccounts.slice((accountsPage - 1) * accountsPageSize, accountsPage * accountsPageSize);
  const pagedSessions = sessions.slice((sessionsPage - 1) * sessionsPageSize, sessionsPage * sessionsPageSize);
  const pagedInactive = inactiveUsers.slice((inactivePage - 1) * inactivePageSize, inactivePage * inactivePageSize);
  const pagedClassrooms = classrooms.slice((classroomsPage - 1) * classroomsPageSize, classroomsPage * classroomsPageSize);
  const pagedOutbox = outbox.slice((outboxPage - 1) * outboxPageSize, outboxPage * outboxPageSize);

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'accounts', label: 'Cuentas' },
    { id: 'sessions', label: 'Sesiones activas' },
    { id: 'inactive', label: 'Usuarios inactivos' },
    { id: 'audit', label: 'Auditoría' },
    { id: 'classrooms', label: 'Aulas virtuales' },
    { id: 'outbox', label: 'Cola de correo' },
  ];

  return (
    <RoleGuard allowedRoles={['SISTEMAS']}>
      <div className="space-y-6">
        <PageHeader
          title="Operación de Sistemas"
          description="Monitoreo, auditoría y soporte técnico con privilegios restringidos"
          breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Sistemas', active: true }]}
          actions={<button onClick={() => { void loadOverview(); if (activeTab === 'sessions') void loadSessions(); if (activeTab === 'inactive') void loadInactive(); if (activeTab === 'audit') void loadAudit(auditCurrentPage, auditFilter); if (activeTab === 'classrooms') void loadClassrooms(); }} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4" />Actualizar</button>}
        />

        {!overview ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Cargando estado del sistema...</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Estado" value={overview.health.ok ? 'Operativo' : 'Revisar'} icon={Activity} tone="green" />
              <Stat label="Sesiones activas" value={overview.metrics.activeSessions} icon={ShieldCheck} tone="blue" />
              <Stat label="Cuentas atendibles" value={overview.metrics.managedUsers} icon={Wrench} tone="maroon" />
              <Stat label="MFA habilitado" value={overview.metrics.mfaEnabled} icon={ShieldCheck} tone="green" />
              <Stat label="Correos pendientes" value={overview.metrics.pendingEmails} icon={MailWarning} tone="amber" />
            </div>

            <div className="flex gap-1 flex-wrap border-b border-slate-200">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${activeTab === t.id ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border bg-white p-5 shadow-xs">
                  <h2 className="text-sm font-bold">Servicios</h2>
                  <dl className="mt-4 space-y-3 text-xs">
                    <Row label="Base de datos" value={overview.health.database} />
                    <Row label="SMTP" value={overview.health.smtpConfigured ? 'Configurado' : 'Pendiente de configuración'} />
                    <Row label="Correos fallidos" value={String(overview.metrics.failedEmails)} />
                  </dl>
                </section>
                <section className="rounded-xl border bg-white p-5 shadow-xs">
                  <h2 className="text-sm font-bold">Restricción del rol</h2>
                  <p className="mt-3 text-xs leading-5 text-slate-600">Este rol no puede administrar usuarios ADMIN, política MFA, institución, datos académicos, pagos ni comunicaciones masivas. Todas las acciones de soporte quedan auditadas.</p>
                </section>
                <section className="overflow-hidden rounded-xl border bg-white shadow-xs lg:col-span-2">
                  <div className="border-b p-5"><h2 className="text-sm font-bold">Auditoría reciente</h2></div>
                  <div className="divide-y">
                    {overview.audit.slice((overviewAuditPage - 1) * overviewAuditPageSize, overviewAuditPage * overviewAuditPageSize).map((record) => (
                      <div key={record.id} className="p-3 text-xs">
                        <p className="font-bold">{translateAction(record.action)}</p>
                        <p className="text-slate-500">{translateEntity(record.entityType)} · {record.actor} {record.actorRole ? `(${record.actorRole})` : ''} · {new Date(record.createdAt).toLocaleString('es-GT')}</p>
                      </div>
                    ))}
                  </div>
                  <Pagination currentPage={overviewAuditPage} totalPages={Math.ceil(overview.audit.length / overviewAuditPageSize) || 1} totalItems={overview.audit.length} pageSize={overviewAuditPageSize} onPageChange={setOverviewAuditPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setOverviewAuditPageSize(s); setOverviewAuditPage(1); }} />
                </section>
              </div>
            )}

            {activeTab === 'accounts' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold">Soporte de cuentas</h2>
                    <p className="mt-1 text-xs text-slate-500">Solo cuentas no administrativas.</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Buscar..." className="rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs w-56" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                      <tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Seguridad</th><th className="p-3">Estado</th><th className="p-3 text-right">Soporte</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {pagedAccounts.map((account) => (
                        <tr key={account.id} className={!account.active ? 'bg-slate-50 opacity-60' : ''}>
                          <td className="p-3"><p className="font-bold">{account.name}</p><p className="text-[10px] text-slate-500">{account.email}</p></td>
                          <td className="p-3 font-bold">{account.role}</td>
                          <td className="p-3">MFA {account.mfaEnabled ? 'activo' : 'inactivo'}{account.mustChangePassword ? ' · cambio pendiente' : ''}</td>
                          <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${account.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}>{account.active ? 'Activo' : 'Inactivo'}</span></td>
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <button disabled={Boolean(busy)} onClick={() => void support(account.id, 'reset-password')} className="rounded-lg border px-3 py-2 font-bold text-[#800020] disabled:opacity-50"><KeyRound className="mr-1 inline h-3.5 w-3.5" />Contraseña</button>
                              <button disabled={Boolean(busy) || !account.mfaEnabled} onClick={() => void support(account.id, 'reset-mfa')} className="rounded-lg border px-3 py-2 font-bold text-red-700 disabled:opacity-50">MFA</button>
                              <button disabled={Boolean(busy)} onClick={() => void toggleActive(account.id)} className={`rounded-lg border px-3 py-2 font-bold disabled:opacity-50 ${account.active ? 'text-slate-600' : 'text-green-700'}`}>{account.active ? <><UserX className="mr-1 inline h-3.5 w-3.5" />Desactivar</> : <><UserCheck className="mr-1 inline h-3.5 w-3.5" />Activar</>}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAccounts.length === 0 && <p className="p-5 text-xs text-slate-500">Sin resultados.</p>}
                  {filteredAccounts.length > 0 && <Pagination currentPage={accountsPage} totalPages={Math.ceil(filteredAccounts.length / accountsPageSize) || 1} totalItems={filteredAccounts.length} pageSize={accountsPageSize} onPageChange={setAccountsPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setAccountsPageSize(s); setAccountsPage(1); }} />}
                </div>
              </section>
            )}

            {activeTab === 'sessions' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5"><h2 className="text-sm font-bold">Sesiones activas ({sessions.length})</h2><p className="mt-1 text-xs text-slate-500">Usuarios conectados en este momento.</p></div>
                {sessions.length === 0 ? <p className="p-5 text-xs text-slate-500">No hay sesiones activas.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Inicio</th><th className="p-3">Expira</th><th className="p-3 text-right">Acción</th></tr></thead>
                      <tbody className="divide-y">
                        {pagedSessions.map((s) => (
                          <tr key={s.id}>
                            <td className="p-3"><p className="font-bold">{s.name}</p><p className="text-[10px] text-slate-500">{s.email}</p></td>
                            <td className="p-3 font-bold">{s.role}</td>
                            <td className="p-3 text-slate-500">{new Date(s.createdAt).toLocaleString('es-GT')}</td>
                            <td className="p-3 text-slate-500">{new Date(s.expiresAt).toLocaleString('es-GT')}</td>
                            <td className="p-3 text-right"><button disabled={Boolean(busy)} onClick={() => void closeSession(s.id)} className="rounded-lg border px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><LogOut className="mr-1 inline h-3.5 w-3.5" />Cerrar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination currentPage={sessionsPage} totalPages={Math.ceil(sessions.length / sessionsPageSize) || 1} totalItems={sessions.length} pageSize={sessionsPageSize} onPageChange={setSessionsPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setSessionsPageSize(s); setSessionsPage(1); }} />
                  </div>
                )}
              </section>
            )}

            {activeTab === 'inactive' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5"><h2 className="text-sm font-bold">Usuarios inactivos ({inactiveUsers.length})</h2><p className="mt-1 text-xs text-slate-500">Cuentas desactivadas que pueden ser reactivadas.</p></div>
                {inactiveUsers.length === 0 ? <p className="p-5 text-xs text-slate-500">No hay usuarios inactivos.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Última actualización</th><th className="p-3 text-right">Acción</th></tr></thead>
                      <tbody className="divide-y">
                        {pagedInactive.map((u) => (
                          <tr key={u.id}>
                            <td className="p-3"><p className="font-bold">{u.name}</p><p className="text-[10px] text-slate-500">{u.email}</p></td>
                            <td className="p-3 font-bold">{u.role}</td>
                            <td className="p-3 text-slate-500">{new Date(u.updatedAt).toLocaleString('es-GT')}</td>
                            <td className="p-3 text-right"><button disabled={Boolean(busy)} onClick={() => void toggleActive(u.id)} className="rounded-lg border px-3 py-2 text-xs font-bold text-green-700 disabled:opacity-50"><UserCheck className="mr-1 inline h-3.5 w-3.5" />Activar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination currentPage={inactivePage} totalPages={Math.ceil(inactiveUsers.length / inactivePageSize) || 1} totalItems={inactiveUsers.length} pageSize={inactivePageSize} onPageChange={setInactivePage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setInactivePageSize(s); setInactivePage(1); }} />
                  </div>
                )}
              </section>
            )}

            {activeTab === 'audit' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-bold">Auditoría completa</h2>
                  <div className="flex gap-2 items-center">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setAuditCurrentPage(1); void loadAudit(1, auditFilter); } }} placeholder="Filtrar por acción..." className="rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs w-52" />
                    </div>
                    <button onClick={() => { setAuditCurrentPage(1); void loadAudit(1, auditFilter, auditPageSize); }} className="rounded-lg bg-[#800020] px-3 py-2 text-xs font-bold text-white">Buscar</button>
                    <select value={auditPageSize} onChange={(e) => { const s = Number(e.target.value); setAuditPageSize(s); setAuditCurrentPage(1); void loadAudit(1, auditFilter, s); }} className="rounded-lg border border-slate-200 py-2 px-3 text-xs font-bold">
                      {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
                    </select>
                  </div>
                </div>
                {!auditPage ? <p className="p-5 text-xs text-slate-500">Cargando...</p> : (
                  <>
                    <div className="divide-y">
                      {auditPage.records.map((r) => (
                        <div key={r.id} className="p-3 text-xs">
                          <p className="font-bold">{translateAction(r.action)}</p>
                          <p className="text-slate-500">{translateEntity(r.entityType)} · {r.actor} {r.actorRole ? `(${r.actorRole})` : ''} · {new Date(r.createdAt).toLocaleString('es-GT')}</p>
                          {r.details && <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">{r.details}</p>}
                        </div>
                      ))}
                      {auditPage.records.length === 0 && <p className="p-5 text-xs text-slate-500">Sin registros.</p>}
                    </div>
                    <Pagination currentPage={auditPage.page} totalPages={Math.ceil(auditPage.total / auditPage.pageSize) || 1} totalItems={auditPage.total} pageSize={auditPage.pageSize} onPageChange={(p) => { setAuditCurrentPage(p); void loadAudit(p, auditFilter, auditPageSize); }} />
                  </>
                )}
              </section>
            )}

            {activeTab === 'classrooms' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5"><h2 className="text-sm font-bold">Aulas virtuales ({classrooms.length})</h2><p className="mt-1 text-xs text-slate-500">Estado de sincronización con proveedores externos.</p></div>
                {classrooms.length === 0 ? <p className="p-5 text-xs text-slate-500">No hay aulas virtuales configuradas.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Curso</th><th className="p-3">Proveedor</th><th className="p-3">Estado</th><th className="p-3">Última sincronización</th><th className="p-3">Error</th></tr></thead>
                      <tbody className="divide-y">
                        {pagedClassrooms.map((vc) => (
                          <tr key={vc.id}>
                            <td className="p-3"><p className="font-bold">{vc.courseName}</p><p className="text-[10px] text-slate-500">{vc.courseCode}</p></td>
                            <td className="p-3 text-slate-500">{translateProvider(vc.provider)}</td>
                            <td className="p-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${vc.syncStatus === 'SYNCED' ? 'bg-green-100 text-green-800' : vc.syncStatus === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{translateSyncStatus(vc.syncStatus)}</span>
                            </td>
                            <td className="p-3 text-slate-500">{vc.lastSyncedAt ? new Date(vc.lastSyncedAt).toLocaleString('es-GT') : '—'}</td>
                            <td className="p-3 text-red-600 max-w-xs truncate">{vc.syncError ? <><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{vc.syncError}</> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination currentPage={classroomsPage} totalPages={Math.ceil(classrooms.length / classroomsPageSize) || 1} totalItems={classrooms.length} pageSize={classroomsPageSize} onPageChange={setClassroomsPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setClassroomsPageSize(s); setClassroomsPage(1); }} />
                  </div>
                )}
              </section>
            )}

            {activeTab === 'outbox' && (
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
                <div className="border-b p-5"><h2 className="text-sm font-bold">Cola de correo con incidencias</h2></div>
                {outbox.length === 0 ? <p className="p-5 text-xs text-slate-500">No hay correos pendientes o fallidos.</p> : (
                  <><div className="divide-y">
                    {pagedOutbox.map((email) => (
                      <div key={email.id} className="flex items-center justify-between gap-3 p-4 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{email.subject}</p>
                          <p className="truncate text-slate-500">{email.recipientEmail} · {email.status} · intento {email.attempts}</p>
                          {email.lastError && <p className="mt-1 text-red-700">{email.lastError}</p>}
                        </div>
                        <button disabled={Boolean(busy)} onClick={() => void retry(email.id)} className="shrink-0 rounded-lg border px-3 py-2 font-bold disabled:opacity-50">Reintentar</button>
                      </div>
                    ))}
                  </div>
                  <Pagination currentPage={outboxPage} totalPages={Math.ceil(outbox.length / outboxPageSize) || 1} totalItems={outbox.length} pageSize={outboxPageSize} onPageChange={setOutboxPage} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={(s) => { setOutboxPageSize(s); setOutboxPage(1); }} /></>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
};

const Stat = ({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: React.ElementType; tone: string }) => (
  <div className="rounded-xl border bg-white p-4 shadow-xs">
    <div className={`mb-2 w-fit rounded-lg p-2 ${tone === 'green' ? 'bg-green-50 text-green-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-[#800020]/10 text-[#800020]'}`}>
      <Icon className="h-4 w-4" />
    </div>
    <p className="text-xl font-extrabold">{value}</p>
    <p className="text-[11px] text-slate-500">{label}</p>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
    <dt className="text-slate-500">{label}</dt>
    <dd className="font-bold">{value}</dd>
  </div>
);

