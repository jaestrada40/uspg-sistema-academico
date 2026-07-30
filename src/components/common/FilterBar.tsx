import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  value: string;
  options: { label: string; value: string }[];
}

interface FilterBarProps {
  filters: FilterOption[];
  onFilterChange: (id: string, value: string) => void;
  onReset?: () => void;
  extraActions?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onReset,
  extraActions,
}) => {
  const hasActiveFilter = filters.some((f) => f.value !== 'ALL' && f.value !== '');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
          <Filter className="h-3.5 w-3.5 text-[#800020]" />
          <span>Filtros:</span>
        </div>

        {filters.map((filter) => (
          <div key={filter.id} className="flex items-center gap-1">
            <select
              value={filter.value}
              onChange={(e) => onFilterChange(filter.id, e.target.value)}
              className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-medium text-[#333333] focus:border-[#800020] focus:outline-hidden"
            >
              <option value="ALL">{filter.label}: Todos</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {hasActiveFilter && onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#C53030] hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      {extraActions && <div className="flex items-center gap-2">{extraActions}</div>}
    </div>
  );
};
