import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="border-b border-[#E2E8F0]">
      <nav className="-mb-px flex space-x-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-[#800020] text-[#800020]'
                  : 'border-transparent text-[#64748B] hover:border-slate-300 hover:text-[#333333]'
              }`}
            >
              {tab.icon && <span className={isActive ? 'text-[#800020]' : 'text-[#64748B]'}>{tab.icon}</span>}
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isActive ? 'bg-[#800020] text-white' : 'bg-slate-200 text-[#64748B]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
