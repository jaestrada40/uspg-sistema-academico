import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { PasswordInput } from '../components/common/PasswordInput';
import { InstitutionLogo } from '../components/common/InstitutionLogo';

export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return setMessage('El enlace no contiene un token válido.');
    if (password !== confirmation) return setMessage('Las contraseñas no coinciden.');
    setBusy(true);
    const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.message || 'No se pudo restablecer la contraseña.');
    setSuccess(true); setMessage('');
  };

  return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4"><div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-xl"><InstitutionLogo className="mx-auto mb-5 h-24 w-24 text-[#800020]" imageClassName="h-full w-full object-contain" />{success ? <div className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-green-600" /><h1 className="mt-4 text-lg font-bold">Contraseña actualizada</h1><p className="mt-2 text-xs text-[#64748B]">Las sesiones anteriores fueron cerradas. MFA continúa activo si ya estaba configurado.</p><Link to="/login" className="mt-5 inline-block rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white">Ir al inicio de sesión</Link></div> : <><div className="text-center"><KeyRound className="mx-auto h-9 w-9 text-[#800020]" /><h1 className="mt-3 text-lg font-bold">Restablecer contraseña</h1><p className="mt-1 text-xs text-[#64748B]">Mínimo 8 caracteres, con mayúscula, minúscula y número.</p></div>{message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{message}</p>}<form onSubmit={submit} className="mt-5 space-y-4"><div><label className="mb-1 block text-xs font-bold">Nueva contraseña</label><PasswordInput required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border bg-[#F8FAFC] px-3 py-2 text-xs" /></div><div><label className="mb-1 block text-xs font-bold">Confirmar contraseña</label><PasswordInput required autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-full rounded-lg border bg-[#F8FAFC] px-3 py-2 text-xs" /></div><button disabled={busy || !token} className="w-full rounded-lg bg-[#800020] py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Actualizando...' : 'Guardar nueva contraseña'}</button></form></>}</div></div>;
};
