import React, { useState } from 'react';
import {
  Menu,
  Bell,
  Search,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Calendar,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router';
import { InstitutionLogo } from '../common/InstitutionLogo';

export const TopHeader: React.FC = () => {
  const {
    currentUser,
    cycles,
    currentCycle,
    setCurrentCycleId,
    notifications,
    markNotificationAsRead,
    logout,
    globalSearch,
    setGlobalSearch,
    sidebarOpen,
    setSidebarOpen,
    resetToDefaults,
    institution,
  } = useApp();

  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCycleMenu, setShowCycleMenu] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#E2E8F0] bg-white px-4 sm:px-6 shadow-xs">
      {/* Left section: Sidebar toggle & Brand Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100 hover:text-[#333333] transition-colors"
          title="Alternar Menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <InstitutionLogo className="h-7 w-7 rounded-md bg-[#800020] text-white text-[9px]" />
          <span className="text-sm font-bold tracking-tight text-[#333333]">Sistema Académico {institution.shortName}</span>
        </div>
      </div>

      {/* Middle section: Global Search & Role Switcher */}
      <div className="flex items-center gap-3">
        {/* Global Search Input */}
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Buscar carné, curso, carrera..."
            className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] py-1.5 pl-9 pr-3 text-xs font-medium text-[#333333] placeholder-[#7D8490] focus:border-[#800020] focus:bg-white focus:outline-hidden"
          />
        </div>

      </div>

      {/* Right section: Cycle selector, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Cycle Selector Badge */}
        <div className="relative">
          <button
            onClick={() => setShowCycleMenu(!showCycleMenu)}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#333333] hover:border-[#800020] transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 text-[#800020]" />
            <span className="hidden sm:inline">{currentCycle?.name}</span>
            <span className="sm:hidden">{currentCycle?.name.split(' ')[0]}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
          </button>

          {showCycleMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-xl z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-[#7D8490] border-b border-[#E2E8F0] mb-1">
                Seleccionar Ciclo Activo
              </div>
              {cycles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCurrentCycleId(c.id);
                    setShowCycleMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    c.isCurrent ? 'bg-[#800020]/10 text-[#800020] font-bold' : 'text-[#333333] hover:bg-slate-100'
                  }`}
                >
                  <span>{c.name}</span>
                  {c.isCurrent && <Check className="h-3.5 w-3.5 text-[#800020]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-[#64748B] hover:bg-slate-100 hover:text-[#333333] transition-colors"
            title="Notificaciones"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#C53030] text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xl z-50">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] mb-2">
                <span className="text-xs font-bold text-[#333333]">Notificaciones</span>
                <span className="text-[10px] font-semibold text-[#800020]">{unreadCount} no leídas</span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => { markNotificationAsRead(n.id); if (n.link) { setShowNotifications(false); navigate(n.link); } }}
                    className={`cursor-pointer rounded-lg p-2.5 transition-colors ${
                      n.read ? 'bg-white hover:bg-slate-50' : 'bg-[#800020]/5 border-l-2 border-[#800020]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-bold text-[#333333]">{n.title}</p>
                      <span className="text-[10px] text-[#7D8490]">{new Date(n.date).toLocaleDateString('es-GT')}</span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reset System Data (Helper button) */}
        <button
          onClick={resetToDefaults}
          className="hidden lg:flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[11px] font-medium text-[#64748B] hover:bg-slate-100 hover:text-[#333333]"
          title="Restablecer Datos de Demostración"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reiniciar</span>
        </button>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100 transition-colors"
          >
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="h-8 w-8 rounded-full border border-[#E2E8F0] object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#800020] text-xs font-bold text-white">
                {currentUser.name.charAt(0)}
              </div>
            )}
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-[#333333] leading-tight truncate max-w-[120px]">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-[#64748B] uppercase">{currentUser.role}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#64748B] hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-xl z-50">
              <div className="border-b border-[#E2E8F0] px-3 py-2 mb-1">
                <p className="text-xs font-bold text-[#333333]">{currentUser.name}</p>
                <p className="text-[10px] text-[#64748B] truncate">{currentUser.email}</p>
                <p className="text-[10px] font-semibold text-[#800020] mt-0.5">
                  Carné/Código: {currentUser.carnetOrCode}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate('/configuracion');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#333333] hover:bg-slate-100 transition-colors"
              >
                <UserIcon className="h-4 w-4 text-[#64748B]" />
                Mi Perfil
              </button>

              <button
                onClick={async () => {
                  setShowProfileMenu(false);
                  await logout();
                  navigate('/login');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#C53030] hover:bg-red-50 transition-colors mt-1"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
