import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type Student = { carnet: string; name: string; email?: string };

export const StudentPicker: React.FC<{
  students: Student[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}> = ({ students, value, onChange, label }) => {
  const [query, setQuery] = useState('');
  const selected = students.find((student) => student.carnet === value);
  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return students.slice(0, 50);
    return students.filter((student) => `${student.carnet} ${student.name} ${student.email || ''}`.toLowerCase().includes(normalized)).slice(0, 50);
  }, [students, query]);
  return <div>
    <label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">{label}</label>
    <div className="relative mb-2 max-w-xl"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por carné, nombre o correo..." className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm" /></div>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full max-w-xl rounded-lg border bg-[#F8FAFC] px-3 py-2 text-sm font-semibold">
      {selected && !options.some((student) => student.carnet === selected.carnet) && <option value={selected.carnet}>{selected.carnet} - {selected.name}</option>}
      {options.map((student) => <option key={student.carnet} value={student.carnet}>{student.carnet} - {student.name}</option>)}
    </select>
    <p className="mt-1 text-[10px] text-[#64748B]">Mostrando hasta 50 coincidencias. Escribe para localizar rápidamente a un estudiante.</p>
  </div>;
};
