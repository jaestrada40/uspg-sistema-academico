import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  badgeText?: string;
  badgeType?: 'success' | 'warning' | 'info' | 'error';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  badgeText,
  badgeType = 'info',
  onClick,
}) => {
  const getBadgeClass = () => {
    switch (badgeType) {
      case 'success':
        return 'bg-[#2F855A]/10 text-[#2F855A]';
      case 'warning':
        return 'bg-[#B7791F]/10 text-[#B7791F]';
      case 'error':
        return 'bg-[#C53030]/10 text-[#C53030]';
      default:
        return 'bg-[#17A2B8]/10 text-[#17A2B8]';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-[#800020]/40 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-[#64748B] uppercase">{title}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight text-[#333333]">{value}</span>
        {badgeText && (
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getBadgeClass()}`}>
            {badgeText}
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-[#7D8490]">{description}</p>}
    </div>
  );
};
