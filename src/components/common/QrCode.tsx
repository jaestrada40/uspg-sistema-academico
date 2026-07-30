import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export const QrCode: React.FC<{ value: string; label?: string; size?: number }> = ({ value, label, size = 150 }) => {
  const [source, setSource] = useState('');
  useEffect(() => { QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1E293B', light: '#FFFFFF' } }).then(setSource); }, [value, size]);
  return <div className="text-center">{source && <img src={source} alt={label || 'Código QR'} width={size} height={size} className="mx-auto rounded-lg bg-white p-2"/>}{label && <p className="mt-1 text-[10px] font-bold">{label}</p>}</div>;
};
