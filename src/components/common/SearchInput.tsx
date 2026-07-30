import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Buscar...',
  className = '',
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3 h-4 w-4 text-[#64748B]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-8 text-xs font-medium text-[#333333] placeholder-[#7D8490] focus:border-[#800020] focus:outline-hidden focus:ring-1 focus:ring-[#800020] transition-all"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 text-[#64748B] hover:text-[#333333]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
