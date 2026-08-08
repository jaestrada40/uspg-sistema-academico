import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Gauge, KeyRound, Plus, RefreshCw, Search, ShieldOff, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { PasswordInput } from '../components/common/PasswordInput';
import { useApp } from '../context/AppContext';
import { translateAction, translateEntity } from '../utils/auditLabels';

type ManagedUser = { id: string; name: string; email: string; role: string; carnetOrCode?: string; active: boolean; mustChangePassword: boolean; mfaEnabled: boolean };
type AuditRecord = { id: string; action: string; entityType: string; entityId?: string; details?: string; actorName: string; actorRole?: string; createdAt: string };

export const UsersPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [credential, setCredential] = useState<{ name: string; password: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'ADMIN', carnetOrCode: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [parkingConfig, setParkingConfig] = useState({ totalCapacity: '', regularReserve: '' });
  const [showParkingConfig, setShowParkingConfig] = useState(false);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);

  const load = async () => { const response = await fetch('/api/admin/users'); if (response.ok) setUsers(await response.json()); };
  const loadAudit = async () => { const response = await fetch('/api/audit-logs?limit=500'); if (response.ok) setAuditRecords(await response.json()); };
  const loadParkingConfig = async () => { const response = await fetch('/api/parking'); if (response.ok) { const result = await response.json(); setParkingConfig({ totalCapacity: String(result.config.totalCapacity), regularReserve: String(result.config.regularReserve) }); } else { showToast('No se pudo cargar la configuración de aforo', 'error'); } };

  useEffect(() => { void load(); void loadParkingConfig(); }, []);
  useEffect(() => { if (tab === 'audit' && auditRecords.length === 0) void loadAudit(); }, [tab]);

  const filtered = useMemo(() => {
    const value = search.toLowerCase();
    return users.filter((user) => [user.name, user.email, user.role, user.carnetOrCode || ''].some((field) => field.toLowerCase().includes(value)));
  }, [users, search]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filteredAudit = useMemo(() => {
    const value = auditSearch.toLowerCase();
    return auditRecords.filter((r) => `${r.action} ${r.entityType} ${r.actorName} ${r.actorRole || ''}`.toLowerCase().includes(value));
  }, [auditRecords, auditSearch]);

  const paginatedAudit = filteredAudit.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message || 'No se pudo crear el usuario', 'error');
    setCredential({ name: result.user.name, password: result.temporaryPassword });
    setNewUser({ name: '', email: '', role: 'ADMIN', carnetOrCode: '' });
    setShowCreate(false);
    showToast('Usuario creado correctamente', 'success');
    await load();
  };

  const saveParkingConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/parking/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalCapacity: Number(parkingConfig.totalCapacity), regularReserve: Number(parkingConfig.regularReserve) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message || 'No se pudo actualizar el aforo', 'error');
    showToast('Aforo actualizado', 'success');
    setShowParkingConfig(false);
  };

  const resetPassword = async (user: ManagedUser) => {
    setBusyId(user.id);
    const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
    const result = await response.json();
    setBusyId('');
    if (!response.ok) return showToast(result.message, 'error');
    setCredential({ name: user.name, password: result.temporaryPassword });
    showToast('Contraseña temporal generada', 'success');
    await load();
  };

  const resetMfa = async (user: ManagedUser) => {
    setBusyId(user.id);
    const response = await fetch(`/api/admin/users/${user.id}/reset-mfa`, { method: 'POST' });
    const result = await response.json();
    setBusyId('');
    if (!response.ok) return showToast(result.message, 'error');
    showToast('MFA restablecido', 'success');
    await load();
  };

  const toggleActive = async (user: ManagedUser) => {
    setBusyId(user.id);
    const response = await fetch(`/api/admin/users/${user.id}/toggle-active`, { method: 'PATCH' });
    const result = await response.json();
    setBusyId('');
    if (!response.ok) return showToast(result.message, 'error');
    showToast(result.active ? 'Cuenta activada' : 'Cuenta desactivada y sesiones cerradas', result.active ? 'success' : 'warning');
    await load();
  };

  const Pagination = ({ total, pg, ps, onPage, onSize }: { total: number; pg: number; ps: number; onPage: (n: number) => void; onSize: (n: number) => void }) => (
    <div className="flex items-center justify-between border-t px-5 py-3 text-xs">
      <span className="text-[#64748B]">{total} registros · pág. {pg} de {Math.max(1, Math.ceil(total / ps))}</span>
      <div className="flex items-center gap-2">
        <select value={ps} onChange={(e) => { onSize(Number(e.target.value)); onPage(1); }} className="rounded-lg border px-2 py-1 text-xs">
          {[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={pg === 1} onClick={() => onPage(pg - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">‹</button>
        <button disabled={pg * ps >= total} onClick={() => onPage(pg + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">›</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios y Seguridad" description="Creación de usuarios, contraseñas, sesiones y MFA" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Usuarios y Seguridad', active: true }]}
        actions={<div className="flex gap-2"><button onClick={() => setShowParkingConfig((v) => !v)} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-bold"><Gauge className="h-4 w-4" />Aforo de parqueo</button><button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Nuevo usuario</button></div>} />

      {showCreate && <form onSubmit={createUser} className="grid gap-3 rounded-xl border border-[#800020]/20 bg-white p-5 md:grid-cols-4">
        <input required minLength={3} value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Nombre completo" className="rounded-lg border px-3 py-2 text-xs" />
        <input required type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="Correo institucional" className="rounded-lg border px-3 py-2 text-xs" />
        <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="rounded-lg border px-3 py-2 text-xs"><option>ADMIN</option><option>DOCENTE</option><option>ESTUDIANTE</option><option>BIBLIOTECA</option><option>PARQUEO</option><option>EVENTOS</option><option>SISTEMAS</option><option>REGISTRO</option><option>FINANZAS</option></select>
        <input value={newUser.carnetOrCode} onChange={(e) => setNewUser({ ...newUser, carnetOrCode: e.target.value })} placeholder="Carné o código (opcional)" className="rounded-lg border px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2 md:col-span-4"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancelar</button><button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Crear usuario</button></div>
      </form>}

      {showParkingConfig && <form onSubmit={saveParkingConfig} className="grid gap-3 rounded-xl border border-[#800020]/20 bg-white p-5 md:grid-cols-3">
        <h3 className="font-bold md:col-span-3">Configuración del aforo de parqueo</h3>
        <label className="text-xs font-bold">Capacidad total<input required min="1" type="number" value={parkingConfig.totalCapacity} onChange={(e) => setParkingConfig({ ...parkingConfig, totalCapacity: e.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold">Reserva mínima para uso regular<input required min="0" type="number" value={parkingConfig.regularReserve} onChange={(e) => setParkingConfig({ ...parkingConfig, regularReserve: e.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
        <div className="flex items-end justify-end gap-2"><button type="button" onClick={() => setShowParkingConfig(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancelar</button><button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Guardar</button></div>
      </form>}

      {credential && <div className="rounded-xl border border-amber-300 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-950">Contraseña temporal para {credential.name}</p><p className="mt-1 text-xs text-amber-800">Cópiala ahora; el usuario deberá cambiarla al ingresar.</p><PasswordInput readOnly value={credential.password} aria-label="Contraseña temporal" className="mt-3 w-full max-w-md rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono font-bold" /></div>}

      <div className="flex border-b border-[#E2E8F0] text-xs font-bold">
        <button onClick={() => setTab('users')} className={`flex items-center gap-2 pb-3 px-4 ${tab === 'users' ? 'border-b-2 border-[#800020] text-[#800020]' : 'text-[#64748B]'}`}><Users className="h-4 w-4" />Directorio</button>
        <button onClick={() => setTab('audit')} className={`flex items-center gap-2 pb-3 px-4 ${tab === 'audit' ? 'border-b-2 border-[#800020] text-[#800020]' : 'text-[#64748B]'}`}><ClipboardList className="h-4 w-4" />Auditoría</button>
      </div>

      {tab === 'users' && <div className="rounded-xl border bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#800020]" /><h2 className="text-sm font-bold">Directorio de usuarios</h2></div>
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar usuario..." className="rounded-lg border py-2 pl-9 pr-3 text-xs" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[10px] uppercase text-[#64748B]">
              <tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3">Seguridad</th><th className="p-3 text-right">Acciones</th></tr>
            </thead>
            <tbody className="divide-y">
              {paginated.map((user) => (
                <tr key={user.id} className={!user.active ? 'bg-slate-50 opacity-60' : ''}>
                  <td className="p-3"><p className="font-bold">{user.name}</p><p className="text-[10px] text-[#64748B]">{user.email}{user.carnetOrCode ? ` · ${user.carnetOrCode}` : ''}</p></td>
                  <td className="p-3 font-bold">{user.role}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{user.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>MFA {user.mfaEnabled ? 'activo' : 'inactivo'}</span>{user.mustChangePassword && <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Cambio pendiente</span>}</td>
                  <td className="p-3"><div className="flex flex-wrap justify-end gap-2">
                    <button disabled={busyId === user.id || user.id === currentUser.id} onClick={() => toggleActive(user)} title={user.active ? 'Desactivar' : 'Activar'} className={`flex items-center gap-1 rounded-lg border px-3 py-2 font-bold disabled:opacity-40 ${user.active ? 'text-red-700' : 'text-green-700'}`}>{user.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}{user.active ? 'Desactivar' : 'Activar'}</button>
                    <button disabled={busyId === user.id || user.id === currentUser.id} onClick={() => resetPassword(user)} className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold text-[#800020] disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" />Contraseña</button>
                    <button disabled={busyId === user.id || !user.mfaEnabled || user.id === currentUser.id} onClick={() => resetMfa(user)} className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold text-red-700 disabled:opacity-40"><ShieldOff className="h-3.5 w-3.5" />MFA</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-8 text-center text-xs text-[#64748B]"><RefreshCw className="mx-auto mb-2 h-5 w-5" />No se encontraron usuarios.</div>}
        </div>
        <Pagination total={filtered.length} pg={page} ps={pageSize} onPage={setPage} onSize={setPageSize} />
      </div>}

      {tab === 'audit' && <div className="rounded-xl border bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#800020]" /><h2 className="text-sm font-bold">Registro de auditoría</h2></div>
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input value={auditSearch} onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }} placeholder="Filtrar acción..." className="rounded-lg border py-2 pl-9 pr-3 text-xs" /></div>
            <button onClick={() => void loadAudit()} className="rounded-lg border px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[10px] uppercase text-[#64748B]">
              <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Acción</th><th className="px-4 py-3">Entidad</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Detalles</th></tr>
            </thead>
            <tbody className="divide-y">
              {paginatedAudit.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-[#64748B]">{new Date(record.createdAt).toLocaleString('es-GT')}</td>
                  <td className="px-4 py-3 font-bold text-[#800020]">{translateAction(record.action)}</td>
                  <td className="px-4 py-3">{translateEntity(record.entityType)}{record.entityId ? ` · ${record.entityId.slice(0, 8)}` : ''}</td>
                  <td className="px-4 py-3 font-semibold">{record.actorName}<span className="ml-1 text-[10px] text-[#64748B]">{record.actorRole}</span></td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#64748B]">{record.details ? String(record.details).slice(0, 80) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAudit.length === 0 && <div className="p-8 text-center text-xs text-[#64748B]">No hay registros de auditoría.</div>}
        </div>
        <Pagination total={filteredAudit.length} pg={auditPage} ps={auditPageSize} onPage={setAuditPage} onSize={setAuditPageSize} />
      </div>}
    </div>
  );
};
