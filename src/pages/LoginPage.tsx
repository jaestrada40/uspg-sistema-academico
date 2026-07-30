import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, User, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal } from '../components/common/Modal';
import { InstitutionLogo } from '../components/common/InstitutionLogo';

export const LoginPage: React.FC = () => {
  const { login, institution } = useApp();
  const navigate = useNavigate();

  const [username, setUsername] = useState('cmendoza@administrador.uspg.edu.gt');
  const [password, setPassword] = useState('Demo123!');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showRecoverModal, setShowRecoverModal] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSuccess, setRecoverSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (result.success) {
      navigate('/dashboard');
    } else {
      setErrorMessage(result.message || 'No se pudo iniciar sesión');
    }
  };

  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    if (recoverEmail) {
      setRecoverSuccess(true);
      setTimeout(() => {
        setRecoverSuccess(false);
        setShowRecoverModal(false);
        setRecoverEmail('');
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
      {/* Container */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden">
        {/* Header Branding */}
        <div className="bg-[#1E293B] border-b-4 border-[#800020] text-white px-8 py-7 text-center relative">
          <InstitutionLogo
            className="mx-auto h-32 w-32 text-white text-lg mb-3"
            imageClassName="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
          />
          <h1 className="text-xl font-bold tracking-tight uppercase">{institution.name}</h1>
          <p className="text-xs text-white/80 mt-1 font-medium">Sistema de Gestión Académica Universitaria</p>
        </div>

        {/* Form area */}
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#333333] mb-1">Iniciar Sesión</h2>
          <p className="text-xs text-[#64748B] mb-6">Ingresa tus credenciales para acceder a la plataforma.</p>

          {errorMessage && (
            <div className="mb-4 rounded-lg bg-[#C53030]/10 border border-[#C53030]/30 p-3 text-xs font-semibold text-[#C53030]">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-[#800020] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#5F0018] transition-colors disabled:opacity-60"
            >
              {isSubmitting ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>

        </div>

        <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-8 py-3 text-center text-[10px] text-[#7D8490]">
          © 2026 {institution.name}. Todos los derechos reservados.
        </div>
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
              Se ha enviado un enlace de restauración a tu correo electrónico registrado.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRecover} className="space-y-4">
            <p className="text-xs text-[#64748B]">
              Ingresa tu correo institucional. Te enviaremos un código para restablecer tu acceso.
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
                className="rounded-lg bg-[#800020] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                Enviar Código
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
