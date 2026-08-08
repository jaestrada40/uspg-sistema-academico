import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, ParkingCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

const money = (value: number) => `Q${value.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ParkingKioskPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [cardDemoAvailable, setCardDemoAvailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/finances');
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return showToast(data.message, 'error');
    setCharges((data.charges || []).filter((c: any) => c.vehiclePlate && c.balance > 0));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/finances/card-payment-status').then((response) => response.ok ? response.json() : { demoAvailable: false }).then((data) => setCardDemoAvailable(Boolean(data.demoAvailable))).catch(() => setCardDemoAvailable(false)); }, []);

  const pay = async (chargeId: string) => {
    setPayingId(chargeId);
    const response = await fetch('/api/finances/card-payment-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId, cardholder: currentUser.name, last4: '4242' }) });
    const data = await response.json();
    setPayingId(null);
    if (!response.ok) return showToast(data.message, 'error');
    setResult(data);
    await load();
  };

  if (currentUser.role !== 'ESTUDIANTE') return <div className="p-10 text-center text-sm">El kiosco de parqueo se usa desde una cuenta de estudiante.</div>;
  if (loading) return <div className="p-10 text-center text-sm">Cargando saldo de parqueo...</div>;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-[#F8FAFC] p-6">
      <div className="text-center"><ParkingCircle className="mx-auto h-10 w-10 text-[#800020]" /><h1 className="mt-2 text-lg font-black">Kiosco de Parqueo USPG</h1><p className="text-xs text-[#64748B]">Hola, {currentUser.name}</p></div>
      {result ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <p className="mt-2 text-sm font-bold text-green-900">Pago autorizado</p>
          <p className="mt-1 text-xs text-green-800">{result.concept} · {money(result.amount)}</p>
          <button onClick={() => setResult(null)} className="mt-4 rounded-lg border border-green-300 bg-white px-4 py-2 text-xs font-bold text-green-800">Listo</button>
        </div>
      ) : !cardDemoAvailable ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-[#64748B]">El pago con tarjeta no está habilitado en este entorno.</div>
      ) : charges.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-[#64748B]">No tienes saldo de parqueo pendiente.</div>
      ) : (
        <div className="space-y-3">
          {charges.map((charge) => (
            <div key={charge.id} className="rounded-xl border bg-white p-4">
              <p className="text-xs font-bold">{charge.concept} · 🅿 {charge.vehiclePlate}</p>
              <p className="text-lg font-black">{money(charge.balance)}</p>
              <button disabled={payingId === charge.id} onClick={() => pay(charge.id)} className="mt-2 w-full rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{payingId === charge.id ? 'Procesando...' : 'Pagar con tarjeta'}</button>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center justify-center gap-1 text-center text-[10px] text-[#64748B]"><LockKeyhole className="h-3 w-3" />Pago de demostración — no se realiza ningún cobro real.</p>
    </div>
  );
};
