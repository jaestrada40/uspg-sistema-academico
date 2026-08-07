import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, User, KeyRound, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from '../components/common/Modal';
import { InstitutionLogo } from '../components/common/InstitutionLogo';

export const LoginPage: React.FC = () => {
  const { login, verifyMfa, institution } = useApp();
  const navigate = useNavigate();

  const [username, setUsername] = useState('admin@administrador.uspg.edu.gt');
  const [password, setPassword] = useState('Demo123!');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showRecoverModal, setShowRecoverModal] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSuccess, setRecoverSuccess] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaChallengeToken) {
      if (!mfaCode.trim()) return setErrorMessage('Ingresa el código de tu aplicación o un código de recuperación.');
      setIsSubmitting(true);
      const result = await verifyMfa(mfaChallengeToken, mfaCode);
      setIsSubmitting(false);
      if (result.success) navigate('/dashboard');
      else setErrorMessage(result.message || 'No se pudo verificar el segundo factor.');
      return;
    }
    if (!username.trim()) {
      setErrorMessage('Por favor ingresa tu correo institucional o número de carné');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Por favor ingresa tu contraseña');
      return;
    }

    setIsSubmitting(true);
    const result = await login(username, password, rememberMe);
    setIsSubmitting(false);
    if (result.mfaRequired && result.challengeToken) {
      setMfaChallengeToken(result.challengeToken);
      setPassword('');
      setErrorMessage('');
    } else if (result.success) {
      navigate('/dashboard');
    } else {
      setErrorMessage(result.message || 'No se pudo iniciar sesión');
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoverEmail) {
      setIsSubmitting(true);
      await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recoverEmail }) });
      setIsSubmitting(false);
      setRecoverSuccess(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-0 md:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl overflow-hidden bg-white shadow-2xl md:min-h-[680px] md:rounded-3xl">
        <section className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 md:w-[46%] lg:px-16">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <InstitutionLogo className="flex h-11 w-11 rounded-xl bg-[#800020] text-sm text-white shadow-lg" />
              <div>
                <p className="text-sm font-extrabold text-[#333333]">{institution.shortName}</p>
                <p className="text-[11px] text-[#64748B]">Gestión Académica Universitaria</p>
              </div>
            </div>
          <h2 className="text-lg font-bold text-[#333333] mb-1">{mfaChallengeToken ? 'Verificación en dos pasos' : 'Iniciar Sesión'}</h2>
          <p className="text-xs text-[#64748B] mb-6">{mfaChallengeToken ? 'Ingresa el código de 6 dígitos o uno de tus códigos de recuperación.' : 'Ingresa tus credenciales para acceder a la plataforma.'}</p>

          {errorMessage && (
            <div className="mb-4 rounded-lg bg-[#C53030]/10 border border-[#C53030]/30 p-3 text-xs font-semibold text-[#C53030]">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mfaChallengeToken ? (
              <>
                <div className="rounded-xl border border-[#800020]/20 bg-[#800020]/5 p-4 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-[#800020]" />
                  <p className="text-xs font-bold text-[#333333]">Segundo factor requerido</p>
                  <p className="mt-1 text-[11px] text-[#64748B]">Abre tu aplicación autenticadora. También puedes usar un código de recuperación.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#333333]">Código MFA</label>
                  <input autoFocus autoComplete="one-time-code" value={mfaCode} onChange={(e) => { setMfaCode(e.target.value.toUpperCase()); setErrorMessage(''); }} placeholder="000000 o XXXX-XXXX" className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-center font-mono text-base font-bold tracking-[0.2em] focus:border-[#800020] focus:outline-hidden" />
                </div>
              </>
            ) : (
              <>
            <div>
              <label className="block text-xs font-bold text-[#333333] mb-1">
                Correo Electrónico o Carné
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="ej. usuario@alumno.uspg.edu.gt"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs font-medium text-[#333333] focus:border-[#800020] focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#333333] mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage('');
                  }}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 pl-9 pr-10 text-xs font-medium text-[#333333] focus:border-[#800020] focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#333333]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-[#64748B]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded-xs border-[#E2E8F0] text-[#800020] focus:ring-[#800020]"
                />
                Recordarme
              </label>
              <button
                type="button"
                onClick={() => setShowRecoverModal(true)}
                className="font-semibold text-[#800020] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
              </>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-[#800020] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#5F0018] transition-colors disabled:opacity-60"
            >
              {isSubmitting ? 'Verificando...' : mfaChallengeToken ? 'Verificar y continuar' : 'Iniciar Sesión'}
            </button>
            {mfaChallengeToken && <button type="button" onClick={() => { setMfaChallengeToken(''); setMfaCode(''); setErrorMessage(''); }} className="w-full text-xs font-semibold text-[#64748B] hover:text-[#800020]">Volver al inicio de sesión</button>}
          </form>

          </div>
          <p className="mt-10 text-center text-[10px] text-[#7D8490]">© 2026 {institution.name}. Todos los derechos reservados.</p>
        </section>

        <aside className="relative hidden w-[54%] overflow-hidden bg-[#800020] p-12 text-white md:flex md:flex-col md:justify-center">
          <div className="absolute -left-28 -top-40 h-[430px] w-[430px] rounded-full border-[72px] border-white/[0.07]" />
          <div className="absolute -bottom-52 -right-28 h-[500px] w-[500px] rounded-full border-[78px] border-white/[0.08]" />
          <div className="absolute right-12 top-10 grid grid-cols-6 gap-3 opacity-25">
            {Array.from({ length: 36 }).map((_, index) => <span key={index} className="h-1 w-1 rounded-full bg-white" />)}
          </div>
          <div className="relative z-10 max-w-md">
            <InstitutionLogo
              className="mb-10 h-24 w-80 rounded-2xl bg-white/10 p-4 text-xl text-white ring-1 ring-white/25"
              imageClassName="h-full w-full object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.25)]"
            />
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-white/70">{institution.name}</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Sistema de Gestión Académica</h1>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-white/75">Accede a tu información académica, cursos, servicios y gestiones universitarias en un solo lugar.</p>
          </div>
        </aside>
      </div>

      {/* Recover Password Modal */}
      <Modal
        isOpen={showRecoverModal}
        onClose={() => setShowRecoverModal(false)}
        title="Recuperación de Contraseña"
        maxWidth="sm"
      >
        {recoverSuccess ? (
          <div className="text-center py-4">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#2F855A]/10 text-[#2F855A] mb-3">
              <KeyRound className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-[#333333]">Instrucciones Enviadas</h4>
            <p className="text-xs text-[#64748B] mt-1">
              Si el correo está registrado, recibirás un enlace de un solo uso válido durante 30 minutos.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRecover} className="space-y-4">
            <p className="text-xs text-[#64748B]">
              Ingresa tu correo institucional. Te enviaremos un enlace seguro para restablecer tu acceso.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#333333] mb-1">Correo Institucional</label>
              <input
                type="email"
                required
                value={recoverEmail}
                onChange={(e) => setRecoverEmail(e.target.value)}
                placeholder="ejemplo@uspg.edu.gt"
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 text-xs font-medium text-[#333333]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRecoverModal(false)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#333333]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#800020] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5F0018] disabled:opacity-50"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
