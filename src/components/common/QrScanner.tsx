import React, { useEffect, useId, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export const QrScanner: React.FC<{ onScan: (value: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  const reactId = useId(), elementId = `qr-reader-${reactId.replace(/:/g, '')}`; const [message, setMessage] = useState('Solicitando acceso a la cámara…');
  useEffect(() => {
    const scanner = new Html5Qrcode(elementId); let active = true;
    Html5Qrcode.getCameras().then((cameras) => {
      if (!active || !cameras.length) throw new Error('No se encontró una cámara.');
      setMessage('Apunta la cámara al código QR.');
      return scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (value) => { onScan(value); onClose(); }, () => undefined);
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'No fue posible abrir la cámara.'));
    return () => { active = false; if (scanner.isScanning) scanner.stop().catch(() => undefined).finally(() => scanner.clear()); else scanner.clear(); };
  }, [elementId, onClose, onScan]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Camera className="h-5 w-5 text-[#800020]"/><p className="font-bold">Escanear código QR</p></div><button onClick={onClose} aria-label="Cerrar escáner"><X className="h-5 w-5"/></button></div><div id={elementId} className="overflow-hidden rounded-xl"/><p className="mt-3 text-center text-xs text-[#64748B]">{message}</p></div></div>;
};
