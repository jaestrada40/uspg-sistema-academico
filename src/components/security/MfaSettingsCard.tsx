import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PasswordInput } from '../common/PasswordInput';

type MfaStatus = { enabled: boolean; required: boolean; requiredRoles: string[]; recoveryCodesRemaining: number };
type MfaSetup = { secret: string; qrDataUrl: string };
const roles = ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'];

export const MfaSettingsCard: React.FC = () => {
  const { currentUser, setCurrentUser, showToast } = useApp();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [requiredRoles, setRequiredRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch('/api/auth/mfa/status');
    if (!response.ok) return;
    const next = await response.json();
    setStatus(next);
    setRequiredRoles(next.requiredRoles);
  };
  useEffect(() => { void load(); }, []);

  const startSetup = async () => {
    setBusy(true);
    const response = await fetch('/api/auth/mfa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return showToast(result.message, 'error');
    setSetup(result);
    setCode('');
  };

  const enable = async () => {
    setBusy(true);
    const response = await fetch('/api/auth/mfa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return showToast(result.message, 'error');
    setRecoveryCodes(result.recoveryCodes);
    setSetup(null); setCode(''); setCurrentPassword('');
    setCurrentUser({ ...currentUser, mfaEnabled: true, mfaEnrollmentRequired: false });
    showToast('MFA activado correctamente', 'success');
    await load();
  };

  const disable = async () => {
    setBusy(true);
    const response = await fetch('/api/auth/mfa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, code }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return showToast(result.message, 'error');
    setCurrentUser({ ...currentUser, mfaEnabled: false });
    setCode(''); setCurrentPassword(''); setRecoveryCodes([]);
    showToast('MFA desactivado', 'warning');
    await load();
  };

  const regenerate = async () => {
    setBusy(true);
    const response = await fetch('/api/auth/mfa/recovery-codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, code }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return showToast(result.message, 'error');
    setRecoveryCodes(result.recoveryCodes); setCode(''); setCurrentPassword('');
    showToast('Códigos de recuperación renovados', 'success');
    await load();
  };

  const savePolicy = async () => {
    setBusy(true);
    const response = await fetch('/api/security/mfa-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requiredRoles }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return showToast(result.message, 'error');
    showToast('Política MFA actualizada', 'success');
    await load();
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    showToast('Códigos copiados. Guárdalos en un lugar seguro.', 'success');
  };

  if (!status) return <div className="rounded-xl border bg-white p-6 text-xs text-[#64748B]">Cargando configuración MFA...</div>;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex gap-3"><div className={`rounded-xl p-3 ${status.enabled ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{status.enabled ? <ShieldCheck className="h-6 w-6" /> : <ShieldOff className="h-6 w-6" />}</div><div><h4 className="text-sm font-bold">Autenticación multifactor (MFA)</h4><p className="mt-1 text-xs text-[#64748B]">Protege tu cuenta con una aplicación autenticadora y códigos de recuperación.</p><div className="mt-2 flex gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{status.enabled ? 'ACTIVO' : 'INACTIVO'}</span>{status.required && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">OBLIGATORIO PARA TU ROL</span>}</div></div></div>
          {status.enabled && <span className="text-xs text-[#64748B]">{status.recoveryCodesRemaining} códigos disponibles</span>}
        </div>

        {!status.enabled && !setup && <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-[1fr_auto]"><PasswordInput autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Confirma tu contraseña actual" className="w-full rounded-lg border px-3 py-2 text-xs" /><button disabled={busy || !currentPassword} onClick={startSetup} className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Configurar MFA</button></div>}

        {setup && <div className="mt-5 grid gap-5 border-t pt-5 md:grid-cols-[280px_1fr]"><img src={setup.qrDataUrl} alt="Código QR para configurar MFA" className="w-full max-w-[280px] rounded-xl border" /><div className="space-y-4 text-xs"><div><p className="font-bold">1. Escanea el QR</p><p className="mt-1 text-[#64748B]">Usa Google Authenticator, Microsoft Authenticator, Authy u otra aplicación TOTP.</p></div><div><p className="font-bold">2. Clave manual</p><PasswordInput readOnly value={setup.secret} aria-label="Clave manual MFA" className="mt-1 w-full rounded-lg bg-slate-100 p-3 font-mono" /></div><div><p className="mb-1 font-bold">3. Confirma el código actual</p><div className="flex gap-2"><input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-center font-mono font-bold tracking-widest" /><button disabled={busy || !/^\d{6}$/.test(code)} onClick={enable} className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white disabled:opacity-50">Activar</button></div></div></div></div>}

        {status.enabled && <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"><PasswordInput autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Contraseña actual" className="w-full rounded-lg border px-3 py-2 text-xs" /><input autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código MFA o recuperación" className="rounded-lg border px-3 py-2 text-xs" /><button disabled={busy || !currentPassword || !code} onClick={regenerate} className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4" />Renovar códigos</button><button disabled={busy || status.required || !currentPassword || !code} onClick={disable} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Desactivar MFA</button></div>}
      </div>

      {recoveryCodes.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-start justify-between gap-4"><div><h4 className="flex items-center gap-2 text-sm font-bold text-amber-950"><KeyRound className="h-4 w-4" />Guarda estos códigos ahora</h4><p className="mt-1 text-xs text-amber-900">Cada código funciona una sola vez y no volverá a mostrarse.</p></div><button onClick={copyRecoveryCodes} className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-bold"><Copy className="h-3.5 w-3.5" />Copiar</button></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{recoveryCodes.map((item) => <code key={item} className="rounded-lg bg-white p-2 text-center font-mono text-xs font-bold">{item}</code>)}</div></div>}

      {currentUser.role === 'ADMIN' && <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs"><h4 className="text-sm font-bold">Política institucional MFA</h4><p className="mt-1 text-xs text-[#64748B]">Los roles seleccionados deberán configurar MFA antes de utilizar otros módulos.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{roles.map((role) => <label key={role} className="flex items-center gap-2 rounded-lg border p-3 text-xs font-bold"><input type="checkbox" checked={requiredRoles.includes(role)} onChange={(e) => setRequiredRoles((current) => e.target.checked ? [...current, role] : current.filter((item) => item !== role))} />{role}</label>)}</div><div className="mt-4 flex justify-end"><button disabled={busy} onClick={savePolicy} className="rounded-lg bg-[#1E293B] px-4 py-2 text-xs font-bold text-white">Guardar política</button></div></div>}
    </div>
  );
};
