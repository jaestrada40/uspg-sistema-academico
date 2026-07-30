import React from 'react';
import { useApp } from '../../context/AppContext';

interface InstitutionLogoProps {
  className?: string;
  imageClassName?: string;
}

export const InstitutionLogo: React.FC<InstitutionLogoProps> = ({
  className = 'h-11 w-11 rounded-lg bg-white/10 border border-white/20 text-white',
  imageClassName = 'h-full w-full object-contain p-1',
}) => {
  const { institution } = useApp();

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden font-black tracking-tighter ${className}`}>
      {institution.logoDataUrl ? (
        <img src={institution.logoDataUrl} alt={`Logo de ${institution.name}`} className={imageClassName} />
      ) : (
        institution.shortName
      )}
    </div>
  );
};
