import React from 'react';
import { UserRole } from '../../types';
import { useApp } from '../../context/AppContext';
import { ShieldAlert } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallback,
}) => {
  const { currentUser } = useApp();

  if (!allowedRoles.includes(currentUser.role)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-[#E2E8F0] p-8 text-center shadow-xs">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C53030]/10 text-[#C53030] mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold text-[#333333]">Acceso Restringido</h2>
        <p className="mt-2 text-xs text-[#64748B] max-w-md">
          Esta módulo requiere permisos de{' '}
          <span className="font-semibold text-[#800020]">{allowedRoles.join(', ')}</span>.
          Tu rol actual es <span className="font-semibold text-[#333333]">{currentUser.role}</span>.
        </p>
        <p className="mt-4 text-xs text-[#7D8490]">
          Puedes cambiar de rol usando el selector interactivo en la barra superior del sistema.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
