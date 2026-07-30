import React from 'react';
import { FolderOpen, LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionButton?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FolderOpen,
  actionButton,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-white p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#800020]/10 text-[#800020] mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-[#333333]">{title}</h3>
      <p className="mt-1 text-xs text-[#64748B] max-w-sm">{description}</p>
      {actionButton && <div className="mt-5">{actionButton}</div>}
    </div>
  );
};
