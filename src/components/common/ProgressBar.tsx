import React from 'react';

interface ProgressBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  colorClass?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  max,
  showLabel = true,
  size = 'md',
  colorClass,
}) => {
  const percentage = Math.min(100, Math.round((current / (max || 1)) * 100));

  let barColor = colorClass || 'bg-[#800020]';
  if (!colorClass) {
    if (percentage >= 95) barColor = 'bg-[#C53030]';
    else if (percentage >= 80) barColor = 'bg-[#B7791F]';
    else barColor = 'bg-[#800020]';
  }

  const heightClass = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1 flex justify-between text-xs font-medium text-[#64748B]">
          <span>{current} de {max}</span>
          <span>{percentage}%</span>
        </div>
      )}
      <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${heightClass}`}>
        <div
          className={`${heightClass} rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
