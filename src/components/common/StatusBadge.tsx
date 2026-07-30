import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStyle = (st: string) => {
    switch (st.toLowerCase()) {
      case 'activo':
      case 'aprobado':
      case 'disponible':
      case 'abierta':
      case 'inscrito':
      case 'completado':
      case 'inscripciones abiertas':
        return 'bg-[#2F855A]/10 text-[#2F855A] border-[#2F855A]/30';

      case 'inactivo':
      case 'reprobado':
      case 'cancelada':
      case 'cerrado':
      case 'cerrada':
      case 'suspendido':
        return 'bg-[#C53030]/10 text-[#C53030] border-[#C53030]/30';

      case 'en curso':
      case 'planificado':
      case 'en espera':
      case 'egresado':
        return 'bg-[#17A2B8]/10 text-[#17A2B8] border-[#17A2B8]/30';

      case 'retirado':
      case 'mantenimiento':
      case 'advertencia':
        return 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/30';

      case 'finalizado':
        return 'bg-slate-100 text-slate-700 border-slate-300';

      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs font-medium' : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClasses} ${getStyle(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
};
