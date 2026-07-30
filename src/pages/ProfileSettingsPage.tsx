import React, { useEffect, useState } from 'react';
import {
  User,
  Sliders,
  Save,
  Building,
  Key,
  ShieldCheck,
  Bell,
  CheckCircle2,
  ImageUp,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Tabs } from '../components/common/Tabs';
import { MfaSettingsCard } from '../components/security/MfaSettingsCard';
import { PasswordInput } from '../components/common/PasswordInput';

export const ProfileSettingsPage: React.FC = () => {
  const { currentUser, parameters, updateParameters, showToast, institution, saveInstitution, changePassword } = useApp();

  const [activeTab, setActiveTab] = useState('profile');

  // Profile Form
  const [profileData, setProfileData] = useState({
    name: currentUser.name,
    email: currentUser.email,
    phone: '+502 5555-1234',
    currentPassword: '',
    newPassword: '',
  });

  // System Parameters Form
  const [systemParams, setSystemParams] = useState(parameters);
  const [institutionForm, setInstitutionForm] = useState({
    name: institution.name,
    shortName: institution.shortName,
    logoDataUrl: institution.logoDataUrl,
  });
  const [savingInstitution, setSavingInstitution] = useState(false);

  useEffect(() => {
    setInstitutionForm({
      name: institution.name,
      shortName: institution.shortName,
      logoDataUrl: institution.logoDataUrl,
    });
  }, [institution]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileData.currentPassword || profileData.newPassword) {
      if (!profileData.currentPassword || !profileData.newPassword) {
        showToast('Completa la contraseña actual y la nueva', 'error');
        return;
      }
      if (!(await changePassword(profileData.currentPassword, profileData.newPassword))) return;
      setProfileData((current) => ({ ...current, currentPassword: '', newPassword: '' }));
    } else {
      showToast('No hay cambios de contraseña pendientes', 'info');
    }
  };

  const handleSaveParameters = (e: React.FormEvent) => {
    e.preventDefault();
    updateParameters(systemParams);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Selecciona un logo PNG, JPG o WebP', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('El logo no puede pesar más de 2 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setInstitutionForm((current) => ({ ...current, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInstitution(true);
    await saveInstitution(institutionForm);
    setSavingInstitution(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil y Configuración del Sistema"
        description="Gestión de cuenta personal y parámetros institucionales USPG"
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Configuración', active: true },
        ]}
      />

      {currentUser.mustChangePassword && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          Por seguridad debes cambiar la contraseña temporal antes de utilizar el resto del sistema.
        </div>
      )}
      {currentUser.mfaEnrollmentRequired && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-semibold text-red-900">
          Tu rol requiere MFA. Configúralo en esta pantalla antes de utilizar el resto del sistema.
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'profile', label: 'Mi Perfil' },
          ...(currentUser.role === 'ADMIN' ? [{ id: 'system', label: 'Parámetros del Sistema' }] : []),
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'profile' ? (
        <div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* User Card */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#800020] text-white font-black text-2xl shadow-xs mb-3">
              {currentUser.name.charAt(0)}
            </div>
            <h3 className="text-base font-bold text-[#333333]">{currentUser.name}</h3>
            <p className="text-xs text-[#64748B] mb-2">{currentUser.email}</p>
            <span className="rounded-full bg-[#800020]/10 px-3 py-1 text-xs font-bold text-[#800020]">
              Rol: {currentUser.role}
            </span>
          </div>

          {/* Form */}
          <div className="md:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs">
            <h4 className="text-sm font-bold text-[#333333] mb-4 pb-2 border-b border-[#E2E8F0]">
              Información Personal
            </h4>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#333333] mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#333333] mb-1">Teléfono Móvil</label>
                  <input
                    type="text"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                  />
                </div>
              </div>

              <h4 className="text-sm font-bold text-[#333333] mt-6 mb-4 pb-2 border-b border-[#E2E8F0]">
                Cambiar Contraseña
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">Contraseña Actual</label>
                  <PasswordInput
                    autoComplete="current-password"
                    value={profileData.currentPassword}
                    onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#333333] mb-1">Nueva Contraseña</label>
                  <PasswordInput
                    autoComplete="new-password"
                    value={profileData.newPassword}
                    onChange={(e) => setProfileData({ ...profileData, newPassword: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#E2E8F0]">
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
                >
                  <Save className="h-4 w-4" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div><MfaSettingsCard /></div>
      ) : (
        /* System Parameters */
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs">
            <h4 className="text-sm font-bold text-[#333333] mb-4 pb-2 border-b border-[#E2E8F0]">
              Identidad Institucional
            </h4>
            <form onSubmit={handleSaveInstitution} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5">
                <div>
                  <div className="h-36 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-center overflow-hidden p-3">
                    {institutionForm.logoDataUrl ? (
                      <img src={institutionForm.logoDataUrl} alt="Vista previa del logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="text-center text-[#64748B]">
                        <Building className="h-8 w-8 mx-auto mb-2" />
                        <span className="font-bold">{institutionForm.shortName || 'LOGO'}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-[#800020] px-2 py-2 font-bold text-white hover:bg-[#5F0018]">
                      <ImageUp className="h-3.5 w-3.5" /> Cargar
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="hidden" />
                    </label>
                    <button type="button" onClick={() => setInstitutionForm((current) => ({ ...current, logoDataUrl: null }))} className="flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-2 font-bold text-[#64748B] hover:text-[#C53030]">
                      <Trash2 className="h-3.5 w-3.5" /> Quitar
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-[#7D8490]">PNG, JPG o WebP. Máximo 2 MB.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block font-bold text-[#333333] mb-1">Nombre oficial</label>
                    <input required minLength={3} maxLength={120} value={institutionForm.name} onChange={(e) => setInstitutionForm({ ...institutionForm, name: e.target.value })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-medium" />
                  </div>
                  <div>
                    <label className="block font-bold text-[#333333] mb-1">Abreviatura</label>
                    <input required minLength={2} maxLength={12} value={institutionForm.shortName} onChange={(e) => setInstitutionForm({ ...institutionForm, shortName: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-bold uppercase" />
                  </div>
                  <p className="rounded-lg bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">El logo y el nombre se aplicarán al inicio de sesión, menú lateral y encabezado.</p>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t border-[#E2E8F0]">
                <button disabled={savingInstitution} type="submit" className="flex items-center gap-2 rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018] disabled:opacity-60">
                  <Save className="h-4 w-4" /> {savingInstitution ? 'Guardando...' : 'Guardar Identidad'}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xs">
          <h4 className="text-sm font-bold text-[#333333] mb-4 pb-2 border-b border-[#E2E8F0]">
            Parámetros de Evaluación y Matrícula
          </h4>

          <form onSubmit={handleSaveParameters} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-[#333333] mb-1">
                  Nota Mínima de Aprobación (Puntos)
                </label>
                <input
                  type="number"
                  value={systemParams.minPassingGrade}
                  onChange={(e) =>
                    setSystemParams({ ...systemParams, minPassingGrade: parseInt(e.target.value) || 61 })
                  }
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-bold text-[#800020]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">
                  Límite Máximo de Créditos por Semestre
                </label>
                <input
                  type="number"
                  value={systemParams.maxCreditLimit}
                  onChange={(e) =>
                    setSystemParams({ ...systemParams, maxCreditLimit: parseInt(e.target.value) || 24 })
                  }
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-2 px-3 font-bold text-[#333333]"
                />
              </div>

            </div>

            <div className="flex justify-end pt-4 border-t border-[#E2E8F0]">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5F0018]"
              >
                <Save className="h-4 w-4" /> Guardar Parámetros
              </button>
            </div>
          </form>
          </div>
        </div>
      )}
    </div>
  );
};
