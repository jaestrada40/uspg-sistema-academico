import React from 'react';
import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  BookCheck,
  Calendar,
  Layers,
  ClipboardList,
  FileCheck,
  Clock,
  History,
  BarChart3,
  Settings,
  X,
  Building2,
  BookMarked,
  WalletCards,
  CalendarCheck,
  ListChecks,
  RotateCcw,
  BellRing,
  Files,
  FolderCheck,
  Network,
  Wrench,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { InstitutionLogo } from '../common/InstitutionLogo';

export const Sidebar: React.FC = () => {
  const { currentUser, sidebarOpen, setSidebarOpen, institution } = useApp();

  const navItems = [
    { path: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/estudiantes', label: 'Estudiantes', icon: Users, roles: ['ADMIN'] },
    { path: '/usuarios', label: 'Usuarios y Seguridad', icon: Users, roles: ['ADMIN'] },
    { path: '/docentes', label: 'Docentes', icon: GraduationCap, roles: ['ADMIN'] },
    { path: '/carreras', label: 'Carreras', icon: BookOpen, roles: ['ADMIN'] },
    { path: '/estructura-academica', label: 'Campus y Planes', icon: Building2, roles: ['ADMIN'] },
    { path: '/cursos', label: 'Cursos y Prerrequisitos', icon: BookCheck, roles: ['ADMIN'] },
    { path: '/organizar-pensum', label: 'Organizar Pensum', icon: Network, roles: ['ADMIN'] },
    { path: '/ciclos', label: 'Ciclos Académicos', icon: Calendar, roles: ['ADMIN'] },
    { path: '/secciones', label: 'Secciones', icon: Layers, roles: ['ADMIN', 'DOCENTE'] },
    { path: '/inscripcion', label: 'Inscripción de Cursos', icon: ClipboardList, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/pagos', label: 'Pagos y Solvencias', icon: WalletCards, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/solicitudes', label: 'Solicitudes y Trámites', icon: Files, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/expediente', label: 'Expediente', icon: FolderCheck, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/plan-estudios', label: 'Plan de Estudios', icon: BookOpen, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/malla', label: 'Mi Avance Académico', icon: Network, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/biblioteca', label: 'Biblioteca', icon: BookMarked, roles: ['ADMIN', 'BIBLIOTECA', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/parqueo', label: 'Parqueo Inteligente', icon: Building2, roles: ['ADMIN', 'PARQUEO', 'EVENTOS', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/notas', label: 'Control de Notas', icon: FileCheck, roles: ['ADMIN', 'DOCENTE'] },
    { path: '/actividades-zona', label: 'Actividades de Zona', icon: ListChecks, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/recuperaciones', label: 'Recuperaciones', icon: RotateCcw, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/asistencia', label: 'Control de Asistencia', icon: CalendarCheck, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/horarios', label: 'Horarios y Aulas', icon: Clock, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/aulas-virtuales', label: 'Mis Clases', icon: BookMarked, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE'] },
    { path: '/historial', label: 'Historial Académico', icon: History, roles: ['ADMIN', 'ESTUDIANTE'] },
    { path: '/reportes', label: 'Reportes Académicos', icon: BarChart3, roles: ['ADMIN'] },
    { path: '/notificaciones', label: 'Notificaciones', icon: BellRing, roles: ['ADMIN'] },
    { path: '/sistemas', label: 'Operación de Sistemas', icon: Wrench, roles: ['SISTEMAS'] },
    { path: '/perfil', label: 'Perfil y Configuración', icon: Settings, roles: ['ADMIN', 'DOCENTE', 'ESTUDIANTE', 'BIBLIOTECA', 'PARQUEO', 'EVENTOS', 'SISTEMAS'] },
  ];

  const visibleNav = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex w-[280px] flex-col bg-white border-r border-[#E2E8F0] shadow-sm transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* USPG Institutional Logo Header */}
        <div className="flex items-center justify-between border-b-4 border-[#800020] px-5 py-3 bg-[#1E293B] text-white">
          <div className="flex flex-1 items-center justify-center">
            <InstitutionLogo
              className="h-16 w-52 text-white text-sm"
              imageClassName="h-full w-full object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.4)]"
            />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/80 hover:text-white p-1 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Role Banner */}
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#64748B]">Módulo:</span>
            <span className="font-bold text-[#800020] uppercase">{currentUser.role}</span>
          </div>
          <span className="inline-flex items-center rounded-full bg-[#2F855A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2F855A]">
            En línea
          </span>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#7D8490]">
            Navegación Principal
          </div>

          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-[#800020] text-white shadow-xs'
                      : 'text-[#333333] hover:bg-[#F8FAFC] hover:text-[#800020]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-[#64748B] group-hover:text-[#800020]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#2F855A] animate-pulse" />
            <div>
              <p className="text-[11px] font-bold text-[#333333]">USPG Academic Cloud v2.6</p>
              <p className="text-[10px] text-[#7D8490]">Campus Guatemala 2026</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
