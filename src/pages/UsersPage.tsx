import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Search, ShieldOff, Users } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { PasswordInput } from '../components/common/PasswordInput';
import { useApp } from '../context/AppContext';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';

type ManagedUser = { id: string; name: string; email: string; role: string; carnetOrCode?: string; active: boolean; mustChangePassword: boolean; mfaEnabled: boolean };

export const UsersPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [credential, setCredential] = useState<{ name: string; password: string } | null>(null);
  const [pendingReset, setPendingReset] = useState<ManagedUser | null>(null);
  const [pendingMfa, setPendingMfa] = useState<ManagedUser | null>(null);
  const load = async () => { const response = await fetch('/api/admin/users'); if (response.ok) setUsers(await response.json()); };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => { const value = search.toLowerCase(); return users.filter((user) => [user.name, user.email, user.role, user.carnetOrCode || ''].some((field) => field.toLowerCase().includes(value))); }, [users, search]);
  const resetPassword = async (user: ManagedUser) => {
    setBusyId(user.id); const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' }); const result = await response.json(); setBusyId('');
    if (!response.ok) return showToast(result.message, 'error');
    setCredential({ name: user.name, password: result.temporaryPassword }); showToast('Contraseña temporal generada y sesiones cerradas', 'success'); await load();
  };
  const resetMfa = async (user: ManagedUser) => {
    setBusyId(user.id); const response = await fetch(`/api/admin/users/${user.id}/reset-mfa`, { method: 'POST' }); const result = await response.json(); setBusyId('');
    if (!response.ok) return showToast(result.message, 'error'); showToast('MFA restablecido; deberá configurarse nuevamente si su rol lo exige', 'success'); await load();
  };
  return <div className="space-y-6"><PageHeader title="Usuarios y Seguridad" description="Restablecimiento seguro de contraseñas, sesiones y MFA" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Usuarios y Seguridad', active: true }]} />{credential && <div className="rounded-xl border border-amber-300 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-950">Contraseña temporal para {credential.name}</p><p className="mt-1 text-xs text-amber-800">Muéstrala o cópiala ahora. El usuario deberá cambiarla al ingresar.</p><PasswordInput readOnly value={credential.password} aria-label="Contraseña temporal" className="mt-3 w-full max-w-md rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono font-bold" /></div>}<ConfirmationDialog isOpen={Boolean(pendingReset)} onClose={() => setPendingReset(null)} onConfirm={() => { if (pendingReset) void resetPassword(pendingReset); setPendingReset(null); }} title="Restablecer contraseña" message={pendingReset ? `Se cerrarán las sesiones de ${pendingReset.name} y se generará una contraseña temporal. El usuario deberá cambiarla al ingresar.` : ''} confirmText="Restablecer" type="warning" /><div className="rounded-xl border bg-white shadow-xs"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#800020]" /><h2 className="text-sm font-bold">Directorio de usuarios</h2></div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuario..." className="rounded-lg border py-2 pl-9 pr-3 text-xs" /></div></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F8FAFC] text-[10px] uppercase text-[#64748B]"><tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Seguridad</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody className="divide-y">{filtered.map((user) => <tr key={user.id}><td className="p-3"><p className="font-bold">{user.name}</p><p className="text-[10px] text-[#64748B]">{user.email}{user.carnetOrCode ? ` · ${user.carnetOrCode}` : ''}</p></td><td className="p-3 font-bold">{user.role}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>MFA {user.mfaEnabled ? 'activo' : 'inactivo'}</span>{user.mustChangePassword && <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Cambio pendiente</span>}</td><td className="p-3"><div className="flex justify-end gap-2"><button disabled={busyId === user.id || user.id === currentUser.id} onClick={() => setPendingReset(user)} className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold text-[#800020] disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" />Contraseña</button><button disabled={busyId === user.id || !user.mfaEnabled || user.id === currentUser.id} onClick={() => resetMfa(user)} className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold text-red-700 disabled:opacity-40"><ShieldOff className="h-3.5 w-3.5" />MFA</button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="p-8 text-center text-xs text-[#64748B]"><RefreshCw className="mx-auto mb-2 h-5 w-5" />No se encontraron usuarios.</div>}</div></div></div>;
};
