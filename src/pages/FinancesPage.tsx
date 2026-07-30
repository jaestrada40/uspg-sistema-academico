import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, Download, Eye, Handshake, LockKeyhole, Plus, ReceiptText, Tag, Upload, WalletCards, Wifi, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { RoleGuard } from '../components/common/RoleGuard';

interface PaymentRecord {
  id: string;
  receiptNumber: string;
  amount: number;
  method: string;
  paidAt: string;
}

interface ChargeRecord {
  id: string;
  concept: string;
  amount: number;
  grossAmount: number;
  adjusted: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: 'PENDIENTE' | 'VENCIDO' | 'PAGADO';
  studentCarnet: string;
  studentName: string;
  payments: PaymentRecord[];
  adjustments: { id: string; type: string; amount: number; reason: string; createdAt: string }[];
}

interface CareerFeeRecord {
  id: string;
  careerId: string;
  careerName: string;
  concept: string;
  amount: number;
  dueDate: string;
  assignedCount: number;
}
interface TransferProofRecord { id: string; amount: number; reference: string; fileName: string; status: string; reviewNote?: string; receiptNumber?: string; createdAt: string; concept: string; studentCarnet: string; studentName: string; }
interface StatementRecord { openingBalance: number; periodDebits: number; periodCredits: number; closingBalance: number; movements: { id: string; date: string; type: string; document: string; description: string; debit: number; credit: number; balance: number }[]; }

const money = (value: number) => `Q${value.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const FinancesPage: React.FC = () => {
  const { currentUser, students, careers, currentCycle, showToast } = useApp();
  const [studentCarnet, setStudentCarnet] = useState(currentUser.role === 'ESTUDIANTE' ? currentUser.carnetOrCode || '' : students[0]?.carnet || '');
  const [charges, setCharges] = useState<ChargeRecord[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, balance: 0, overdue: 0, solvent: true });
  const [loading, setLoading] = useState(true);
  const [careerFees, setCareerFees] = useState<CareerFeeRecord[]>([]);
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<ChargeRecord | null>(null);
  const [adjustmentCharge, setAdjustmentCharge] = useState<ChargeRecord | null>(null);
  const [chargeForm, setChargeForm] = useState({ careerId: careers[0]?.code || '', concept: 'Mensualidad', amount: '', dueDate: '' });
  const [academicStructure, setAcademicStructure] = useState<{ campuses: { id: string; name: string; status: string }[]; plans: { id: string; code: string; version: string; careerId: string; status: string }[] }>({ campuses: [], plans: [] });
  const [scheduleForm, setScheduleForm] = useState({ careerId: careers[0]?.code || '', campusId: '', planId: '', enrollmentAmount: '', enrollmentDueDate: '', monthlyAmount: '', installments: '5', firstDueDate: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'TRANSFERENCIA', reference: '' });
  const [adjustmentForm, setAdjustmentForm] = useState({ type: 'BECA', amount: '', reason: '' });
  const [specialForm, setSpecialForm] = useState<'MORA' | 'CONVENIO' | null>(null);
  const [lateFeeForm, setLateFeeForm] = useState({ amount: '', reason: '', dueDate: '' });
  const [agreementForm, setAgreementForm] = useState({ totalAmount: '', installments: '3', startDate: '', note: '' });
  const [transferCharge, setTransferCharge] = useState<ChargeRecord | null>(null);
  const [transferForm, setTransferForm] = useState({ amount: '', reference: '', file: null as File | null });
  const [transferProofs, setTransferProofs] = useState<TransferProofRecord[]>([]);
  const [proofNotes, setProofNotes] = useState<Record<string, string>>({});
  const today = new Date().toISOString().slice(0, 10);
  const [statementDates, setStatementDates] = useState({ from: `${new Date().getFullYear()}-01-01`, to: today });
  const [statement, setStatement] = useState<StatementRecord | null>(null);
  const [cardChargeId, setCardChargeId] = useState('');
  const [cardDemoOpen, setCardDemoOpen] = useState(false);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [cardForm, setCardForm] = useState({ cardholder: '', number: '', expiry: '', cvv: '' });
  const [cardResult, setCardResult] = useState<{ authorizationCode: string; last4: string; amount: number; concept: string } | null>(null);

  const loadFinances = useCallback(async () => {
    setLoading(true);
    const query = currentUser.role === 'ADMIN' && studentCarnet ? `?studentCarnet=${encodeURIComponent(studentCarnet)}` : '';
    try {
      const response = await fetch(`/api/finances${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setCharges(result.charges);
      setSummary(result.summary);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo cargar la cuenta', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, studentCarnet]);

  useEffect(() => { loadFinances(); }, [loadFinances]);

  const loadStatement = useCallback(async () => {
    const params = new URLSearchParams({ from: statementDates.from, to: statementDates.to });
    if (currentUser.role === 'ADMIN') params.set('studentCarnet', studentCarnet);
    const response = await fetch(`/api/finances/statement?${params}`);
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    setStatement(result);
  }, [currentUser.role, showToast, statementDates.from, statementDates.to, studentCarnet]);

  useEffect(() => { if (studentCarnet) loadStatement(); }, [loadStatement, studentCarnet]);
  const statementPdfUrl = `/api/finances/statement.pdf?${new URLSearchParams({ ...(currentUser.role === 'ADMIN' ? { studentCarnet } : {}), from: statementDates.from, to: statementDates.to })}`;

  const loadTransferProofs = useCallback(async () => { const query = currentUser.role === 'ADMIN' && studentCarnet ? `?studentCarnet=${encodeURIComponent(studentCarnet)}` : ''; const response = await fetch(`/api/finances/transfer-proofs${query}`); if (response.ok) setTransferProofs(await response.json()); }, [currentUser.role, studentCarnet]);
  useEffect(() => { loadTransferProofs(); }, [loadTransferProofs]);

  const loadCareerFees = useCallback(async () => {
    if (currentUser.role !== 'ADMIN') return;
    const response = await fetch('/api/finances/career-fees');
    if (response.ok) setCareerFees(await response.json());
  }, [currentUser.role]);

  useEffect(() => { loadCareerFees(); }, [loadCareerFees]);

  useEffect(() => { if (currentUser.role === 'ADMIN') fetch('/api/academic-structure').then((response) => response.ok ? response.json() : Promise.reject()).then((result) => setAcademicStructure({ campuses: result.campuses.filter((campus: { status: string }) => campus.status === 'Activo'), plans: result.plans.filter((plan: { status: string }) => plan.status === 'Activo') })).catch(() => showToast('No se pudo cargar campus y planes', 'error')); }, [currentUser.role, showToast]);

  const createCharge = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/finances/career-fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...chargeForm, cycleId: currentCycle.id, amount: Number(chargeForm.amount) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(result.message, 'success');
    setChargeForm({ careerId: chargeForm.careerId, concept: 'Mensualidad', amount: '', dueDate: '' });
    setShowChargeForm(false);
    await Promise.all([loadFinances(), loadCareerFees()]);
  };

  const createSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/finances/career-fee-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scheduleForm, cycleId: currentCycle.id, enrollmentAmount: Number(scheduleForm.enrollmentAmount || 0), monthlyAmount: Number(scheduleForm.monthlyAmount), installments: Number(scheduleForm.installments) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(result.message, 'success');
    setShowScheduleForm(false);
    await Promise.all([loadFinances(), loadCareerFees()]);
  };

  const registerPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentCharge) return;
    const response = await fetch('/api/finances/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...paymentForm, chargeId: paymentCharge.id, amount: Number(paymentForm.amount) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(`Pago registrado. Recibo ${result.receiptNumber}`, 'success');
    setPaymentCharge(null);
    setPaymentForm({ amount: '', method: 'TRANSFERENCIA', reference: '' });
    await loadFinances();
  };

  const applyAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjustmentCharge) return;
    const response = await fetch('/api/finances/adjustments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...adjustmentForm, chargeId: adjustmentCharge.id, amount: Number(adjustmentForm.amount) }) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(`${adjustmentForm.type === 'BECA' ? 'Beca' : 'Descuento'} aplicado correctamente`, 'success');
    setAdjustmentCharge(null); setAdjustmentForm({ type: 'BECA', amount: '', reason: '' }); await loadFinances();
  };

  const createSpecial = async (event: React.FormEvent) => {
    event.preventDefault();
    const isLateFee = specialForm === 'MORA';
    const body = isLateFee ? { ...lateFeeForm, amount: Number(lateFeeForm.amount), studentCarnet, cycleId: currentCycle.id } : { ...agreementForm, totalAmount: Number(agreementForm.totalAmount), installments: Number(agreementForm.installments), studentCarnet };
    const response = await fetch(isLateFee ? '/api/finances/late-fees' : '/api/finances/agreements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return showToast(result.message, 'error');
    showToast(isLateFee ? 'Mora registrada' : 'Convenio y cuotas creados', 'success');
    setSpecialForm(null); setLateFeeForm({ amount: '', reason: '', dueDate: '' }); setAgreementForm({ totalAmount: '', installments: '3', startDate: '', note: '' }); await loadFinances();
  };

  const submitTransfer = async (event: React.FormEvent) => { event.preventDefault(); if (!transferCharge || !transferForm.file) return; if (transferForm.file.size > 3 * 1024 * 1024) return showToast('El comprobante no puede superar 3 MB', 'error'); const reader = new FileReader(); reader.onload = async () => { const response = await fetch('/api/finances/transfer-proofs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId: transferCharge.id, amount: Number(transferForm.amount), reference: transferForm.reference, fileName: transferForm.file!.name, dataUrl: reader.result }) }); const result = await response.json(); if (!response.ok) return showToast(result.message, 'error'); showToast('Comprobante enviado para validación', 'success'); setTransferCharge(null); setTransferForm({ amount: '', reference: '', file: null }); await loadTransferProofs(); }; reader.readAsDataURL(transferForm.file); };
  const reviewTransfer = async (id: string, status: string) => { const response = await fetch(`/api/finances/transfer-proofs/${id}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reviewNote: proofNotes[id] || '' }) }); const result = await response.json(); if (!response.ok) return showToast(result.message, 'error'); showToast(status === 'APROBADO' ? `Pago aprobado. Recibo ${result.receiptNumber}` : 'Comprobante rechazado', status === 'APROBADO' ? 'success' : 'warning'); await Promise.all([loadFinances(), loadTransferProofs()]); };
  const openCardDemo = () => { const charge = charges.find((item) => item.balance > 0); if (!charge) return showToast('No tienes cargos pendientes para simular', 'warning'); setCardChargeId(charge.id); setCardResult(null); setCardDemoOpen(true); };
  const simulateCardPayment = async (event: React.FormEvent) => { event.preventDefault(); const digits = cardForm.number.replace(/\D/g, ''), expiry = cardForm.expiry.replace(/\D/g, ''); if (digits.length !== 16) return showToast('Usa los 16 dígitos de la tarjeta de demostración', 'error'); if (expiry.length !== 4) return showToast('La fecha debe tener formato MM/AA', 'error'); if (!/^\d{3,4}$/.test(cardForm.cvv)) return showToast('CVV de demostración no válido', 'error'); setCardProcessing(true); const response = await fetch('/api/finances/card-payment-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId: cardChargeId, cardholder: cardForm.cardholder, last4: digits.slice(-4) }) }); const result = await response.json(); setCardProcessing(false); if (!response.ok) return showToast(result.message, 'error'); setCardResult(result); setCardForm({ cardholder: '', number: '', expiry: '', cvv: '' }); };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'ESTUDIANTE']}>
      <div className="space-y-6">
        <PageHeader
          title="Pagos y Solvencias"
          description="Control de cargos, pagos, recibos y habilitación financiera para inscripciones"
          breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Pagos y Solvencias', active: true }]}
          actions={<div className="flex flex-wrap gap-2"><a href={statementPdfUrl} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold text-[#333333]"><Download className="h-4 w-4 text-[#800020]" />Estado de Cuenta PDF</a>{currentUser.role === 'ADMIN' && <><button onClick={() => setSpecialForm('MORA')} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" />Mora</button><button onClick={() => setSpecialForm('CONVENIO')} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold"><Handshake className="h-4 w-4 text-[#17A2B8]" />Convenio</button><button onClick={() => setShowScheduleForm((value) => !value)} className="flex items-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white"><CalendarDays className="h-4 w-4" />Calendario de cuotas</button><button onClick={() => setShowChargeForm((value) => !value)} className="flex items-center gap-2 rounded-lg border border-[#800020] bg-white px-4 py-2 text-xs font-bold text-[#800020]"><Plus className="h-4 w-4" />Cargo único</button></>}</div>}
        />

        {currentUser.role === 'ESTUDIANTE' && <section className="overflow-hidden rounded-xl border border-[#800020]/20 bg-white shadow-xs"><div className="flex flex-col justify-between gap-4 bg-gradient-to-r from-[#800020] to-[#A61B3D] p-5 text-white sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="rounded-xl bg-white/15 p-3"><CreditCard className="h-6 w-6" /></div><div><div className="flex items-center gap-2"><h2 className="font-extrabold">Pago en línea con tarjeta</h2><span className="rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black text-amber-950">DEMOSTRACIÓN</span></div><p className="mt-1 max-w-2xl text-xs text-white/85">Prueba cómo funcionará el pago con crédito o débito. No se realizará ningún cobro ni se guardarán los datos ingresados.</p></div></div><button onClick={openCardDemo} className="whitespace-nowrap rounded-lg bg-white px-5 py-2.5 text-xs font-extrabold text-[#800020] shadow-sm">Probar pago con tarjeta</button></div>{cardDemoOpen && <div className="p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold">Pasarela segura · Vista de demostración</h3><p className="mt-1 flex items-center gap-1 text-[11px] text-[#64748B]"><LockKeyhole className="h-3.5 w-3.5" />Usa 4242 4242 4242 4242, cualquier fecha futura y cualquier CVV.</p></div><button onClick={() => setCardDemoOpen(false)} className="text-xs font-bold text-[#64748B]">Cerrar</button></div>{cardResult ? <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-green-600" /><h3 className="mt-2 font-extrabold text-green-900">Pago de demostración autorizado</h3><p className="mt-1 text-xs text-green-800">{cardResult.concept} · {money(cardResult.amount)} · Tarjeta terminada en {cardResult.last4}</p><p className="mt-2 font-mono text-xs font-bold text-green-900">Autorización {cardResult.authorizationCode}</p><p className="mt-3 text-[11px] text-green-700">Este resultado es una simulación. El saldo y el estado de cuenta no fueron modificados.</p><button onClick={() => setCardResult(null)} className="mt-4 rounded-lg border border-green-300 bg-white px-4 py-2 text-xs font-bold text-green-800">Realizar otra prueba</button></div> : <form onSubmit={simulateCardPayment} className="grid gap-4 lg:grid-cols-2"><label className="text-xs font-bold lg:col-span-2">Cargo a pagar<select required value={cardChargeId} onChange={(event) => setCardChargeId(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal">{charges.filter((charge) => charge.balance > 0).map((charge) => <option key={charge.id} value={charge.id}>{charge.concept} · {money(charge.balance)}</option>)}</select></label><label className="text-xs font-bold lg:col-span-2">Nombre del titular<input required minLength={3} autoComplete="cc-name" value={cardForm.cardholder} onChange={(event) => setCardForm({ ...cardForm, cardholder: event.target.value })} placeholder="Como aparece en la tarjeta" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal" /></label><label className="text-xs font-bold lg:col-span-2">Número de tarjeta<input required inputMode="numeric" autoComplete="cc-number" maxLength={19} value={cardForm.number} onChange={(event) => { const digits = event.target.value.replace(/\D/g, '').slice(0, 16); setCardForm({ ...cardForm, number: digits.replace(/(.{4})/g, '$1 ').trim() }); }} placeholder="4242 4242 4242 4242" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-mono font-normal tracking-wider" /></label><label className="text-xs font-bold">Vencimiento<input required inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={cardForm.expiry} onChange={(event) => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); setCardForm({ ...cardForm, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits }); }} placeholder="MM/AA" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal" /></label><label className="text-xs font-bold">CVV<input required type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cardForm.cvv} onChange={(event) => setCardForm({ ...cardForm, cvv: event.target.value.replace(/\D/g, '') })} placeholder="123" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal" /></label><div className="lg:col-span-2"><button disabled={cardProcessing} className="w-full rounded-lg bg-[#800020] px-5 py-3 text-xs font-extrabold text-white disabled:opacity-60">{cardProcessing ? 'Procesando demostración…' : 'Simular pago seguro'}</button><p className="mt-2 text-center text-[10px] text-[#64748B]">No ingreses una tarjeta real. Esta pantalla todavía no está conectada a un banco.</p></div></form>}</div>}</section>}

        {currentUser.role === 'ESTUDIANTE' && cardDemoOpen && !cardResult && <div className="mx-auto w-full max-w-md"><div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl bg-gradient-to-br from-[#172033] via-[#26334A] to-[#800020] p-6 text-white shadow-2xl ring-1 ring-white/20"><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/10 bg-white/5" /><div className="absolute -bottom-24 -left-16 h-52 w-52 rounded-full border border-white/10 bg-[#A61B3D]/40" /><div className="relative flex items-start justify-between"><div><p className="text-[10px] font-bold tracking-[0.28em] text-white/65">UNIVERSIDAD</p><p className="mt-0.5 font-serif text-xl font-bold tracking-wide">SAN PABLO</p><p className="text-[8px] tracking-[0.45em] text-white/65">GUATEMALA</p></div><div className="flex items-center gap-2"><Wifi className="h-5 w-5 rotate-90 text-white/75" /><span className="rounded-md bg-white/15 px-2 py-1 text-[9px] font-black">DEMO</span></div></div><div className="relative mt-7 flex items-center gap-3"><div className="h-9 w-12 rounded-md bg-gradient-to-br from-[#F7E7A8] via-[#C8A94C] to-[#F5D978] shadow-inner"><div className="mx-auto h-full w-px bg-black/15" /></div><LockKeyhole className="h-5 w-5 text-white/65" /></div><p className="relative mt-5 font-mono text-xl font-semibold tracking-[0.16em] drop-shadow-sm">{cardForm.number || '•••• •••• •••• ••••'}</p><div className="relative mt-5 flex items-end justify-between"><div className="min-w-0"><p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Titular</p><p className="truncate text-xs font-bold uppercase tracking-wider">{cardForm.cardholder || 'NOMBRE DEL ESTUDIANTE'}</p></div><div className="ml-4 text-right"><p className="text-[8px] font-bold uppercase tracking-widest text-white/50">Válida hasta</p><p className="font-mono text-xs font-bold">{cardForm.expiry || 'MM/AA'}</p></div></div></div><p className="mt-3 text-center text-[10px] text-[#64748B]">Vista previa ilustrativa; no representa una tarjeta emitida por la universidad.</p></div>}

        {currentUser.role === 'ADMIN' && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
            <label className="mb-1 block text-xs font-bold uppercase text-[#64748B]">Cuenta del estudiante</label>
            <select value={studentCarnet} onChange={(event) => setStudentCarnet(event.target.value)} className="w-full max-w-lg rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-semibold">
              {students.map((student) => <option key={student.carnet} value={student.carnet}>{student.carnet} - {student.name}</option>)}
            </select>
          </div>
        )}

        {showScheduleForm && currentUser.role === 'ADMIN' && (
          <form onSubmit={createSchedule} className="rounded-xl border border-[#800020]/20 bg-white p-5 shadow-xs">
            <div className="mb-4"><h3 className="text-sm font-bold">Generar matrícula y calendario de cuotas</h3><p className="text-xs text-[#64748B]">Se asignará una sola vez a estudiantes activos y también a quienes se inscriban posteriormente.</p></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <select required value={scheduleForm.careerId} onChange={(event) => setScheduleForm({ ...scheduleForm, careerId: event.target.value, planId: '' })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="">Carrera</option>{careers.map((career) => <option key={career.code} value={career.code}>{career.name}</option>)}</select>
              <select value={scheduleForm.campusId} onChange={(event) => setScheduleForm({ ...scheduleForm, campusId: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="">Todos los campus</option>{academicStructure.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
              <select value={scheduleForm.planId} onChange={(event) => setScheduleForm({ ...scheduleForm, planId: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="">Todos los planes</option>{academicStructure.plans.filter((plan) => plan.careerId === scheduleForm.careerId).map((plan) => <option key={plan.id} value={plan.id}>Pensum {plan.version} · {plan.code}</option>)}</select>
              <input min="0" step="0.01" type="number" value={scheduleForm.enrollmentAmount} onChange={(event) => setScheduleForm({ ...scheduleForm, enrollmentAmount: event.target.value })} placeholder="Monto matrícula (opcional)" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
              <label className="text-[10px] font-bold uppercase text-[#64748B]">Vencimiento matrícula<input required type="date" value={scheduleForm.enrollmentDueDate} onChange={(event) => setScheduleForm({ ...scheduleForm, enrollmentDueDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-normal text-[#333333]" /></label>
              <input required min="0.01" step="0.01" type="number" value={scheduleForm.monthlyAmount} onChange={(event) => setScheduleForm({ ...scheduleForm, monthlyAmount: event.target.value })} placeholder="Monto de cada cuota" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
              <input required min="1" max="12" type="number" value={scheduleForm.installments} onChange={(event) => setScheduleForm({ ...scheduleForm, installments: event.target.value })} placeholder="Cantidad de cuotas" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
              <label className="text-[10px] font-bold uppercase text-[#64748B]">Primera cuota<input required type="date" value={scheduleForm.firstDueDate} onChange={(event) => setScheduleForm({ ...scheduleForm, firstDueDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-normal text-[#333333]" /></label>
            </div>
            <div className="mt-4 flex justify-end"><button className="rounded-lg bg-[#800020] px-5 py-2 text-xs font-bold text-white">Generar calendario</button></div>
          </form>
        )}

        {showChargeForm && currentUser.role === 'ADMIN' && (
          <form onSubmit={createCharge} className="grid gap-4 rounded-xl border border-[#800020]/20 bg-white p-5 shadow-xs md:grid-cols-5">
            <select required value={chargeForm.careerId} onChange={(event) => setChargeForm({ ...chargeForm, careerId: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option value="">Selecciona carrera</option>{careers.map((career) => <option key={career.code} value={career.code}>{career.name}</option>)}</select>
            <input required value={chargeForm.concept} onChange={(event) => setChargeForm({ ...chargeForm, concept: event.target.value })} placeholder="Concepto" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
            <input required min="0.01" step="0.01" type="number" value={chargeForm.amount} onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })} placeholder="Monto en quetzales" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
            <input required type="date" value={chargeForm.dueDate} onChange={(event) => setChargeForm({ ...chargeForm, dueDate: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
            <button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Asignar a la carrera</button>
          </form>
        )}

        {specialForm && currentUser.role === 'ADMIN' && (
          <form onSubmit={createSpecial} className="grid gap-4 rounded-xl border border-[#17A2B8]/30 bg-white p-5 shadow-xs md:grid-cols-5">
            <div className="md:col-span-5"><h3 className="text-sm font-bold">{specialForm === 'MORA' ? 'Registrar mora' : 'Crear convenio de pago'} · {studentCarnet}</h3></div>
            {specialForm === 'MORA' ? <><input required min="0.01" step="0.01" type="number" value={lateFeeForm.amount} onChange={(e) => setLateFeeForm({ ...lateFeeForm, amount: e.target.value })} placeholder="Monto" className="rounded-lg border px-3 py-2 text-sm" /><input required value={lateFeeForm.reason} onChange={(e) => setLateFeeForm({ ...lateFeeForm, reason: e.target.value })} placeholder="Motivo" className="rounded-lg border px-3 py-2 text-sm md:col-span-2" /><input required type="date" value={lateFeeForm.dueDate} onChange={(e) => setLateFeeForm({ ...lateFeeForm, dueDate: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" /></> : <><input required min="0.01" step="0.01" type="number" value={agreementForm.totalAmount} onChange={(e) => setAgreementForm({ ...agreementForm, totalAmount: e.target.value })} placeholder="Monto total" className="rounded-lg border px-3 py-2 text-sm" /><input required min="2" max="24" type="number" value={agreementForm.installments} onChange={(e) => setAgreementForm({ ...agreementForm, installments: e.target.value })} placeholder="Cuotas" className="rounded-lg border px-3 py-2 text-sm" /><input required type="date" value={agreementForm.startDate} onChange={(e) => setAgreementForm({ ...agreementForm, startDate: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" /><input value={agreementForm.note} onChange={(e) => setAgreementForm({ ...agreementForm, note: e.target.value })} placeholder="Observación opcional" className="rounded-lg border px-3 py-2 text-sm" /></>}
            <button className="rounded-lg bg-[#17A2B8] px-4 py-2 text-xs font-bold text-white">{specialForm === 'MORA' ? 'Registrar mora' : 'Crear cuotas'}</button>
          </form>
        )}

        {currentUser.role === 'ADMIN' && careerFees.length > 0 && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
            <h3 className="mb-3 text-sm font-bold text-[#333333]">Precios asignados por carrera</h3>
            <div className="grid gap-3 lg:grid-cols-2">{careerFees.slice(0, 8).map((fee) => <div key={fee.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] p-3"><div><p className="text-xs font-bold text-[#333333]">{fee.concept} · {fee.careerName}</p><p className="text-[11px] text-[#64748B]">Vence {new Date(fee.dueDate).toLocaleDateString('es-GT')} · {fee.assignedCount} estudiantes</p></div><span className="text-sm font-extrabold text-[#800020]">{money(fee.amount)}</span></div>)}</div>
          </div>
        )}

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
          <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div><h3 className="text-sm font-bold">Estado de cuenta histórico</h3><p className="text-xs text-[#64748B]">Movimientos contables y saldo acumulado dentro del período.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-[10px] font-bold uppercase text-[#64748B]">Desde<input type="date" value={statementDates.from} onChange={(event) => setStatementDates({ ...statementDates, from: event.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-xs font-normal text-[#333333]" /></label><label className="text-[10px] font-bold uppercase text-[#64748B]">Hasta<input type="date" value={statementDates.to} onChange={(event) => setStatementDates({ ...statementDates, to: event.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-xs font-normal text-[#333333]" /></label><button onClick={loadStatement} className="rounded-lg bg-[#1E293B] px-4 py-2 text-xs font-bold text-white">Consultar</button></div></div>
          {statement && <><div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Saldo anterior', statement.openingBalance], ['Cargos del período', statement.periodDebits], ['Abonos del período', statement.periodCredits], ['Saldo final', statement.closingBalance]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-[#F8FAFC] p-3"><p className="text-[10px] font-bold uppercase text-[#64748B]">{label}</p><p className="mt-1 text-base font-extrabold text-[#333333]">{money(Number(value))}</p></div>)}</div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F1E7EA] text-[10px] uppercase text-[#800020]"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Cargo</th><th className="px-3 py-2 text-right">Abono</th><th className="px-3 py-2 text-right">Saldo</th></tr></thead><tbody className="divide-y">{statement.movements.length ? statement.movements.map((movement) => <tr key={movement.id}><td className="px-3 py-3">{new Date(movement.date).toLocaleDateString('es-GT')}</td><td className="px-3 py-3 font-semibold">{movement.document}</td><td className="px-3 py-3">{movement.description}</td><td className="px-3 py-3 text-right">{movement.debit ? money(movement.debit) : '-'}</td><td className="px-3 py-3 text-right text-[#2F855A]">{movement.credit ? money(movement.credit) : '-'}</td><td className="px-3 py-3 text-right font-bold">{money(movement.balance)}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-[#64748B]">No existen movimientos en este período.</td></tr>}</tbody></table></div></>}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total cargado', value: summary.total, icon: CircleDollarSign, color: 'text-[#800020]' },
            { label: 'Total pagado', value: summary.paid, icon: WalletCards, color: 'text-[#2F855A]' },
            { label: 'Saldo pendiente', value: summary.balance, icon: ReceiptText, color: 'text-[#B7791F]' },
            { label: 'Saldo vencido', value: summary.overdue, icon: AlertTriangle, color: 'text-[#C53030]' },
          ].map((card) => <div key={card.label} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><card.icon className={`mb-3 h-5 w-5 ${card.color}`} /><p className="text-xs font-semibold text-[#64748B]">{card.label}</p><p className="mt-1 text-xl font-extrabold text-[#333333]">{money(card.value)}</p></div>)}
        </div>

        <div className={`flex items-center gap-3 rounded-xl border p-4 ${summary.solvent ? 'border-[#2F855A]/30 bg-[#2F855A]/5' : 'border-[#C53030]/30 bg-[#C53030]/5'}`}>
          {summary.solvent ? <BadgeCheck className="h-6 w-6 text-[#2F855A]" /> : <AlertTriangle className="h-6 w-6 text-[#C53030]" />}
          <div><p className="text-sm font-bold text-[#333333]">{summary.solvent ? 'Estudiante solvente' : 'Estudiante con bloqueo financiero'}</p><p className="text-xs text-[#64748B]">{summary.solvent ? 'Puede realizar inscripciones y trámites académicos.' : 'Debe cancelar el saldo vencido antes de inscribirse.'}</p></div>
        </div>

        {transferCharge && currentUser.role === 'ESTUDIANTE' && <form onSubmit={submitTransfer} className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5 md:grid-cols-4"><div><p className="text-xs text-[#64748B]">Reportar transferencia</p><p className="text-sm font-bold">{transferCharge.concept} · saldo {money(transferCharge.balance)}</p></div><input required type="number" min="0.01" max={transferCharge.balance} step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} placeholder="Monto transferido" className="rounded-lg border px-3 py-2 text-sm" /><input required minLength={3} value={transferForm.reference} onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })} placeholder="Número de referencia" className="rounded-lg border px-3 py-2 text-sm" /><label className="flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"><Upload className="mr-1 h-4 w-4" />{transferForm.file ? transferForm.file.name : 'Adjuntar y enviar'}<input required type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => setTransferForm({ ...transferForm, file: e.target.files?.[0] || null })} /></label>{transferForm.file && <button className="rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white md:col-start-4">Enviar a validación</button>}</form>}

        {paymentCharge && (
          <form onSubmit={registerPayment} className="grid gap-4 rounded-xl border border-[#17A2B8]/30 bg-[#17A2B8]/5 p-5 md:grid-cols-4">
            <div><p className="text-xs text-[#64748B]">Aplicar pago a</p><p className="text-sm font-bold">{paymentCharge.concept} · saldo {money(paymentCharge.balance)}</p></div>
            <input required min="0.01" max={paymentCharge.balance} step="0.01" type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="Monto" className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
            <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"><option>TRANSFERENCIA</option><option>DEPÓSITO</option><option>TARJETA</option><option>EFECTIVO</option></select>
            <button className="rounded-lg bg-[#17A2B8] px-4 py-2 text-xs font-bold text-white">Confirmar pago</button>
          </form>
        )}

        {adjustmentCharge && currentUser.role === 'ADMIN' && (
          <form onSubmit={applyAdjustment} className="grid gap-4 rounded-xl border border-[#2F855A]/30 bg-[#2F855A]/5 p-5 md:grid-cols-4">
            <div><p className="text-xs text-[#64748B]">Ajustar cargo</p><p className="text-sm font-bold">{adjustmentCharge.concept} · saldo {money(adjustmentCharge.balance)}</p></div>
            <select value={adjustmentForm.type} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })} className="rounded-lg border px-3 py-2 text-sm"><option value="BECA">Beca</option><option value="DESCUENTO">Descuento</option></select>
            <input required min="0.01" max={adjustmentCharge.balance} step="0.01" type="number" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} placeholder="Monto" className="rounded-lg border px-3 py-2 text-sm" />
            <div className="flex gap-2"><input required value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} placeholder="Motivo" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button className="rounded-lg bg-[#2F855A] px-4 py-2 text-xs font-bold text-white">Aplicar</button></div>
          </form>
        )}

        {transferProofs.length > 0 && <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs"><h3 className="mb-3 text-sm font-bold">Comprobantes de transferencia</h3><div className="grid gap-3">{transferProofs.map((proof) => <div key={proof.id} className="flex flex-col justify-between gap-3 rounded-lg bg-[#F8FAFC] p-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold">{proof.concept} · {money(proof.amount)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${proof.status === 'APROBADO' ? 'bg-green-100 text-green-700' : proof.status === 'RECHAZADO' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{proof.status}</span></div><p className="mt-1 text-[11px] text-[#64748B]">Ref. {proof.reference} · {proof.studentCarnet} · {new Date(proof.createdAt).toLocaleString('es-GT')}</p>{proof.reviewNote && <p className="mt-1 text-[11px] text-red-700">Observación: {proof.reviewNote}</p>}</div><div className="flex flex-wrap items-center justify-end gap-2"><a target="_blank" rel="noreferrer" href={`/api/finances/transfer-proofs/${proof.id}/file`} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"><Eye className="mr-1 inline h-3.5 w-3.5" />Ver comprobante</a>{currentUser.role === 'ADMIN' && proof.status === 'PENDIENTE' && <><input value={proofNotes[proof.id] || ''} onChange={(e) => setProofNotes({ ...proofNotes, [proof.id]: e.target.value })} placeholder="Observación si se rechaza" className="rounded-lg border px-3 py-2 text-xs" /><button onClick={() => reviewTransfer(proof.id, 'APROBADO')} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Aprobar</button><button onClick={() => reviewTransfer(proof.id, 'RECHAZADO')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"><XCircle className="mr-1 inline h-3.5 w-3.5" />Rechazar</button></>}{proof.receiptNumber && <span className="text-xs font-bold text-green-700">{proof.receiptNumber}</span>}</div></div>)}</div></div>}

        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xs">
          {loading ? <div className="p-8 text-center text-sm text-[#64748B]">Cargando cuenta...</div> : charges.length === 0 ? <div className="p-8 text-center text-sm text-[#64748B]">No hay cargos registrados.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#F8FAFC] uppercase text-[#64748B]"><tr><th className="px-5 py-3">Concepto</th><th className="px-5 py-3">Vencimiento</th><th className="px-5 py-3 text-right">Cargo neto</th><th className="px-5 py-3 text-right">Pagado</th><th className="px-5 py-3 text-right">Saldo</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{charges.map((charge) => <tr key={charge.id}><td className="px-5 py-4"><p className="font-bold text-[#333333]">{charge.concept}</p><p className="text-[10px] text-[#64748B]">{charge.studentCarnet}{charge.adjusted > 0 ? ` · Ajuste ${money(charge.adjusted)}` : ''}</p></td><td className="px-5 py-4">{new Date(charge.dueDate).toLocaleDateString('es-GT')}</td><td className="px-5 py-4 text-right">{money(charge.amount)}</td><td className="px-5 py-4 text-right text-[#2F855A]">{money(charge.paid)}</td><td className="px-5 py-4 text-right font-bold">{money(charge.balance)}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${charge.status === 'PAGADO' ? 'bg-green-100 text-green-700' : charge.status === 'VENCIDO' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{charge.status}</span></td><td className="px-5 py-4 text-right"><div className="flex flex-col items-end gap-1">{currentUser.role === 'ADMIN' && charge.balance > 0 && <><button onClick={() => { setPaymentCharge(charge); setPaymentForm({ ...paymentForm, amount: String(charge.balance) }); }} className="font-bold text-[#800020] hover:underline">Registrar pago</button><button onClick={() => { setAdjustmentCharge(charge); setAdjustmentForm({ type: 'BECA', amount: '', reason: '' }); }} className="flex items-center gap-1 font-bold text-[#2F855A] hover:underline"><Tag className="h-3 w-3" />Beca/descuento</button></>}{currentUser.role === 'ESTUDIANTE' && charge.balance > 0 && <button onClick={() => { setTransferCharge(charge); setTransferForm({ amount: String(charge.balance), reference: '', file: null }); }} className="font-bold text-blue-700 hover:underline">Reportar transferencia</button>}{charge.payments[0] && <a href={`/api/finances/payments/${charge.payments[0].id}/receipt.pdf`} className="font-bold text-[#64748B] hover:text-[#800020] hover:underline">Recibo {charge.payments[0].receiptNumber}</a>}{currentUser.role !== 'ADMIN' && !charge.payments[0] && charge.balance <= 0 && '-'}</div></td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </RoleGuard>
  );
};
