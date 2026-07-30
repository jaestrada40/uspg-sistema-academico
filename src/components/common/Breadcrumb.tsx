import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav className="flex items-center text-xs text-[#64748B] mb-2" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-2">
        <li className="inline-flex items-center">
          <span className="inline-flex items-center text-[#7D8490]">
            <Home className="h-3.5 w-3.5 mr-1 text-[#800020]" />
            USPG
          </span>
        </li>
        {items.map((item, index) => (
          <li key={index}>
            <div className="flex items-center">
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 mx-1" />
              <span
                className={
                  item.active
                    ? 'font-semibold text-[#800020]'
                    : 'text-[#64748B] hover:text-[#333333]'
                }
              >
                {item.label}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
};
