import { randomBytes } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerFinanceRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { notifyUser, notifyByCarnet, createReceiptPdf, createStatementPdf } = helpers;
  const financeView = (charge: any) => { const paid = charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0); const adjusted = (charge.adjustments || []).reduce((sum: number, item: any) => sum + item.amount, 0); const netAmount = Math.max(0, charge.amount - adjusted); const balance = Math.max(0, netAmount - paid); const status = balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE'; return { id: charge.id, concept: charge.concept, grossAmount: charge.amount, adjusted, amount: netAmount, paid, balance, dueDate: charge.dueDate, status, cycleId: charge.cycleId, studentCarnet: charge.studentCarnet, studentName: charge.student.name, adjustments: (charge.adjustments || []).map((item: any) => ({ id: item.id, type: item.type, amount: item.amount, reason: item.reason, createdAt: item.createdAt })), payments: charge.payments.map((payment: any) => ({ id: payment.id, receiptNumber: payment.receiptNumber, amount: payment.amount, method: payment.method, reference: payment.reference, paidAt: payment.paidAt })) }; };
  const statementDates = (req: express.Request) => { const from = req.query.from ? new Date(`${String(req.query.from)}T00:00:00.000Z`) : new Date('2000-01-01T00:00:00.000Z'); const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date(); return { from, to, valid: !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to }; };
  const buildFinancialStatement = async (studentCarnet: string, from: Date, to: Date) => { const student = await prisma.student.findUnique({ where: { carnet: studentCarnet } }); if (!student) return null; const [charges, payments, adjustments] = await Promise.all([prisma.financialCharge.findMany({ where: { studentCarnet, createdAt: { lte: to } }, orderBy: { createdAt: 'asc' } }), prisma.payment.findMany({ where: { studentCarnet, paidAt: { lte: to } }, include: { charge: { select: { concept: true } } }, orderBy: { paidAt: 'asc' } }), prisma.financialAdjustment.findMany({ where: { studentCarnet, createdAt: { lte: to } }, include: { charge: { select: { concept: true } } }, orderBy: { createdAt: 'asc' } })]); const openingCharges = charges.filter((item) => item.createdAt < from).reduce((sum, item) => sum + item.amount, 0); const openingPayments = payments.filter((item) => item.paidAt < from).reduce((sum, item) => sum + item.amount, 0); const openingAdjustments = adjustments.filter((item) => item.createdAt < from).reduce((sum, item) => sum + item.amount, 0); const openingBalance = openingCharges - openingPayments - openingAdjustments; const movements = [...charges.filter((item) => item.createdAt >= from).map((item) => ({ id: `charge:${item.id}`, date: item.createdAt, type: 'CARGO', document: item.id.slice(-8).toUpperCase(), description: item.concept, debit: item.amount, credit: 0 })), ...payments.filter((item) => item.paidAt >= from).map((item) => ({ id: `payment:${item.id}`, date: item.paidAt, type: 'PAGO', document: item.receiptNumber, description: `Pago · ${item.charge.concept}`, debit: 0, credit: item.amount })), ...adjustments.filter((item) => item.createdAt >= from).map((item) => ({ id: `adjustment:${item.id}`, date: item.createdAt, type: item.type, document: item.id.slice(-8).toUpperCase(), description: `${item.type === 'BECA' ? 'Beca' : 'Descuento'} · ${item.charge.concept}`, debit: 0, credit: item.amount }))].sort((a, b) => a.date.getTime() - b.date.getTime()); let runningBalance = openingBalance; const ledger = movements.map((item) => { runningBalance += item.debit - item.credit; return { ...item, balance: runningBalance }; }); const periodDebits = movements.reduce((sum, item) => sum + item.debit, 0), periodCredits = movements.reduce((sum, item) => sum + item.credit, 0); return { student: { carnet: student.carnet, name: student.name, careerName: student.careerName || student.careerId }, period: { from, to }, openingBalance, periodDebits, periodCredits, closingBalance: runningBalance, movements: ledger }; };
  const { requireUser, requireAdmin } = middleware;

  app.get('/api/finances', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'El módulo financiero no está disponible para catedráticos.' });
    const requestedCarnet = String(req.query.studentCarnet || '');
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode : requestedCarnet || undefined;
    const charges = await prisma.financialCharge.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, adjustments: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { paidAt: 'desc' } } }, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] });
    const records = charges.map(financeView);
    const total = records.reduce((sum, charge) => sum + (charge as any).amount, 0);
    const paid = records.reduce((sum, charge) => sum + (charge as any).paid, 0);
    const overdue = records.filter((charge) => (charge as any).status === 'VENCIDO').reduce((sum, charge) => sum + (charge as any).balance, 0);
    res.json({ charges: records, summary: { total, paid, balance: total - paid, overdue, solvent: overdue <= 0 } });
  });

  app.get('/api/finances/statement', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : String(req.query.studentCarnet || '');
    const dates = statementDates(req);
    if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
    if (!dates.valid) return void res.status(400).json({ message: 'El rango de fechas no es válido.' });
    const statement = await buildFinancialStatement(studentCarnet, dates.from, dates.to);
    if (!statement) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    res.json(statement);
  });

  app.get('/api/finances/career-fees', requireAdmin, async (_req, res) => {
    const fees = await prisma.careerFee.findMany({ include: { career: { select: { name: true } }, campus: { select: { name: true } }, plan: { select: { code: true, version: true } } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }] });
    res.json(fees.map((fee) => ({ ...fee, careerName: fee.career.name, campusName: fee.campus?.name, planCode: fee.plan?.code, planVersion: fee.plan?.version })));
  });

  app.post('/api/finances/career-fee-schedules', requireAdmin, async (req, res) => {
    const careerId = String(req.body.careerId || '').trim();
    const cycleId = String(req.body.cycleId || '').trim();
    const campusId = req.body.campusId ? String(req.body.campusId) : null;
    const planId = req.body.planId ? String(req.body.planId) : null;
    const enrollmentAmount = Number(req.body.enrollmentAmount);
    const monthlyAmount = Number(req.body.monthlyAmount);
    const installments = Number(req.body.installments);
    const enrollmentDueDate = new Date(`${req.body.enrollmentDueDate}T12:00:00Z`);
    const firstDueDate = new Date(`${req.body.firstDueDate}T12:00:00Z`);
    if (!careerId || !cycleId || !Number.isFinite(enrollmentAmount) || enrollmentAmount < 0 || !Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || !Number.isInteger(installments) || installments < 1 || installments > 12 || Number.isNaN(enrollmentDueDate.getTime()) || Number.isNaN(firstDueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente los montos, fechas y cantidad de cuotas.' });
    const [career, cycle, campus, plan] = await Promise.all([
      prisma.career.findUnique({ where: { code: careerId } }),
      prisma.academicCycle.findUnique({ where: { id: cycleId } }),
      campusId ? prisma.campus.findUnique({ where: { id: campusId } }) : null,
      planId ? prisma.curriculumPlan.findUnique({ where: { id: planId } }) : null,
    ]);
    if (!career || !cycle || (campusId && !campus) || (planId && (!plan || plan.careerId !== careerId))) return void res.status(400).json({ message: 'La carrera, campus, plan o ciclo no son válidos.' });
    const definitions: { concept: string; amount: number; dueDate: Date; feeType: string; installmentNumber: number | null }[] = [];
    if (enrollmentAmount > 0) definitions.push({ concept: `Matrícula - ${cycle.name}`, amount: enrollmentAmount, dueDate: enrollmentDueDate, feeType: 'MATRICULA', installmentNumber: null });
    for (let index = 0; index < installments; index += 1) { const dueDate = new Date(firstDueDate); dueDate.setUTCMonth(dueDate.getUTCMonth() + index); definitions.push({ concept: `Cuota académica ${index + 1}/${installments} - ${cycle.name}`, amount: monthlyAmount, dueDate, feeType: 'MENSUALIDAD', installmentNumber: index + 1 }); }
    const duplicate = await prisma.careerFee.findFirst({ where: { careerId, cycleId, campusId, planId, OR: definitions.map((item) => ({ concept: item.concept, dueDate: item.dueDate })) } });
    if (duplicate) return void res.status(409).json({ message: 'Ya existe total o parcialmente este calendario para el alcance seleccionado.' });
    const studentWhere = { careerId, status: 'Activo', ...(campusId ? { campusId } : {}), ...(planId ? { planId } : {}) };
    const activeStudents = await prisma.student.findMany({ where: studentWhere, select: { carnet: true } });
    const created = await prisma.$transaction(async (tx) => {
      const fees = [];
      for (const definition of definitions) {
        const fee = await tx.careerFee.create({ data: { ...definition, installmentCount: definition.feeType === 'MENSUALIDAD' ? installments : null, careerId, cycleId, campusId, planId, createdBy: res.locals.authUser.name, assignedCount: activeStudents.length } });
        if (activeStudents.length) await tx.financialCharge.createMany({ data: activeStudents.map((studentItem) => ({ studentCarnet: studentItem.carnet, concept: fee.concept, amount: fee.amount, dueDate: fee.dueDate, cycleId, careerFeeId: fee.id })) });
        fees.push(fee);
      }
      await tx.auditLog.create({ data: { action: 'CREATE_FEE_SCHEDULE', entityType: 'FINANCE', entityId: `${careerId}:${cycleId}`, actorId: res.locals.authUser.id, details: JSON.stringify({ campusId, planId, installments, enrollmentAmount, monthlyAmount, fees: fees.length, students: activeStudents.length }) } });
      return fees;
    });
    res.status(201).json({ fees: created, assignedCount: activeStudents.length, message: `Calendario creado con ${created.length} cargos para ${activeStudents.length} estudiantes.` });
  });

  app.post('/api/finances/career-fees', requireAdmin, async (req, res) => {
    const careerId = String(req.body.careerId || '').trim();
    const cycleId = String(req.body.cycleId || '').trim();
    const concept = String(req.body.concept || '').trim();
    const amount = Number(req.body.amount);
    const dueDate = new Date(req.body.dueDate);
    if (!careerId || !cycleId || concept.length < 3 || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente carrera, ciclo, concepto, monto y vencimiento.' });
    const [career, cycle, activeStudents] = await Promise.all([
      prisma.career.findUnique({ where: { code: careerId } }),
      prisma.academicCycle.findUnique({ where: { id: cycleId } }),
      prisma.student.findMany({ where: { careerId, status: 'Activo' }, select: { carnet: true } }),
    ]);
    if (!career || !cycle) return void res.status(404).json({ message: 'Carrera o ciclo académico no encontrado.' });
    const fee = await prisma.$transaction(async (tx) => {
      const created = await tx.careerFee.create({ data: { careerId, cycleId, concept, amount, dueDate, createdBy: res.locals.authUser.name, assignedCount: activeStudents.length } });
      if (activeStudents.length) await tx.financialCharge.createMany({ data: activeStudents.map((student) => ({ studentCarnet: student.carnet, concept, amount, dueDate, cycleId, careerFeeId: created.id })) });
      await tx.auditLog.create({ data: { action: 'CREATE_CAREER_FEE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ careerId, cycleId, concept, amount, assignedCount: activeStudents.length }) } });
      return created;
    });
    res.status(201).json({ ...fee, careerName: career.name, message: `Cargo asignado a ${activeStudents.length} estudiantes activos de ${career.name}.` });
  });

  app.post('/api/finances/charges', requireAdmin, async (req, res) => {
    const studentCarnet = String(req.body.studentCarnet || '').trim();
    const concept = String(req.body.concept || '').trim();
    const amount = Number(req.body.amount);
    const dueDate = new Date(req.body.dueDate);
    if (!studentCarnet || concept.length < 3 || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente estudiante, concepto, monto y vencimiento.' });
    if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const charge = await prisma.$transaction(async (tx) => {
      const created = await tx.financialCharge.create({ data: { studentCarnet, concept, amount, dueDate, cycleId: req.body.cycleId || null }, include: { student: true, payments: true, adjustments: true } });
      await tx.auditLog.create({ data: { action: 'CREATE_CHARGE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, concept, amount }) } });
      return created;
    });
    res.status(201).json(financeView(charge));
  });

  app.post('/api/finances/adjustments', requireAdmin, async (req, res) => {
    const chargeId = String(req.body.chargeId || '');
    const type = String(req.body.type || '').trim().toUpperCase();
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || '').trim();
    if (!['BECA', 'DESCUENTO'].includes(type) || !Number.isFinite(amount) || amount <= 0 || reason.length < 3) return void res.status(400).json({ message: 'Selecciona beca o descuento e indica un monto y motivo válidos.' });
    const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true } });
    if (!charge) return void res.status(404).json({ message: 'Cargo no encontrado.' });
    const paid = charge.payments.reduce((sum, item) => sum + item.amount, 0);
    const alreadyAdjusted = charge.adjustments.reduce((sum, item) => sum + item.amount, 0);
    const maximum = Math.max(0, charge.amount - paid - alreadyAdjusted);
    if (amount > maximum) return void res.status(400).json({ message: `El ajuste no puede superar el saldo de Q${maximum.toFixed(2)}.` });
    const adjustment = await prisma.$transaction(async (tx) => {
      const created = await tx.financialAdjustment.create({ data: { chargeId, studentCarnet: charge.studentCarnet, type, amount, reason, appliedBy: res.locals.authUser.name } });
      if (amount >= maximum) await tx.financialCharge.update({ where: { id: chargeId }, data: { status: 'PAGADO' } });
      await tx.auditLog.create({ data: { action: 'APPLY_FINANCIAL_ADJUSTMENT', entityType: 'FINANCE', entityId: chargeId, actorId: res.locals.authUser.id, details: JSON.stringify({ type, amount, reason }) } });
      return created;
    });
    await notifyByCarnet(charge.studentCarnet, `${type === 'BECA' ? 'Beca' : 'Descuento'} aplicado`, `Se aplicó un ajuste de Q${amount.toFixed(2)}. Motivo: ${reason}.`, 'SUCCESS', '/pagos');
    res.status(201).json(adjustment);
  });

  app.post('/api/finances/late-fees', requireAdmin, async (req, res) => {
    const studentCarnet = String(req.body.studentCarnet || '').trim();
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || '').trim();
    const dueDate = new Date(req.body.dueDate);
    if (!studentCarnet || !Number.isFinite(amount) || amount <= 0 || reason.length < 3 || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente estudiante, monto, motivo y vencimiento de la mora.' });
    if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const charge = await prisma.$transaction(async (tx) => {
      const created = await tx.financialCharge.create({ data: { studentCarnet, concept: `Mora - ${reason}`, amount, dueDate, cycleId: req.body.cycleId || null } });
      await tx.auditLog.create({ data: { action: 'CREATE_LATE_FEE', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, amount, reason }) } });
      return created;
    });
    await notifyByCarnet(studentCarnet, 'Cargo por mora', `Se registró un cargo por mora de Q${amount.toFixed(2)}. Motivo: ${reason}.`, 'WARNING', '/pagos');
    res.status(201).json(charge);
  });

  app.post('/api/finances/agreements', requireAdmin, async (req, res) => {
    const studentCarnet = String(req.body.studentCarnet || '').trim();
    const totalAmount = Number(req.body.totalAmount);
    const installments = Number(req.body.installments);
    const startDate = new Date(req.body.startDate);
    const note = String(req.body.note || '').trim();
    if (!studentCarnet || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(installments) || installments < 2 || installments > 24 || Number.isNaN(startDate.getTime())) return void res.status(400).json({ message: 'Indica monto, entre 2 y 24 cuotas y una fecha inicial válida.' });
    if (!(await prisma.student.findUnique({ where: { carnet: studentCarnet } }))) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const agreement = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentAgreement.create({ data: { studentCarnet, totalAmount, installments, startDate, note: note || null, createdBy: res.locals.authUser.name } });
      const base = Math.floor((totalAmount / installments) * 100) / 100;
      const amounts = Array.from({ length: installments }, (_, index) => index === installments - 1 ? Number((totalAmount - base * (installments - 1)).toFixed(2)) : base);
      await tx.financialCharge.createMany({ data: amounts.map((amount, index) => { const dueDate = new Date(startDate); dueDate.setUTCMonth(dueDate.getUTCMonth() + index); return { studentCarnet, concept: `Convenio ${created.id.slice(-6).toUpperCase()} - cuota ${index + 1}/${installments}`, amount, dueDate, agreementId: created.id }; }) });
      await tx.auditLog.create({ data: { action: 'CREATE_PAYMENT_AGREEMENT', entityType: 'FINANCE', entityId: created.id, actorId: res.locals.authUser.id, details: JSON.stringify({ studentCarnet, totalAmount, installments }) } });
      return created;
    });
    await notifyByCarnet(studentCarnet, 'Convenio de pago creado', `Se creó un convenio de Q${totalAmount.toFixed(2)} en ${installments} cuotas.`, 'INFO', '/pagos');
    res.status(201).json(agreement);
  });

  app.post('/api/finances/payments', requireAdmin, async (req, res) => {
    const chargeId = String(req.body.chargeId || '');
    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').trim().toUpperCase();
    const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true } });
    if (!charge) return void res.status(404).json({ message: 'Cargo no encontrado.' });
    const paid = charge.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = Math.max(0, charge.amount - charge.adjustments.reduce((sum, item) => sum + item.amount, 0) - paid);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return void res.status(400).json({ message: `El pago debe ser mayor a cero y no superar Q${balance.toFixed(2)}.` });
    if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPÓSITO'].includes(method)) return void res.status(400).json({ message: 'Selecciona un método de pago válido.' });
    const receiptNumber = `REC-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({ data: { receiptNumber, amount, method, reference: req.body.reference ? String(req.body.reference) : null, chargeId, studentCarnet: charge.studentCarnet, registeredBy: res.locals.authUser.name } });
      if (amount >= balance) await tx.financialCharge.update({ where: { id: chargeId }, data: { status: 'PAGADO' } });
      await tx.auditLog.create({ data: { action: 'REGISTER_PAYMENT', entityType: 'FINANCE', entityId: chargeId, actorId: res.locals.authUser.id, details: JSON.stringify({ receiptNumber, amount, method }) } });
      return created;
    });
    await notifyByCarnet(charge.studentCarnet, 'Pago registrado', `Se registró el pago ${receiptNumber} por Q${amount.toFixed(2)} mediante ${method}.`, 'SUCCESS', '/pagos');
    res.status(201).json(payment);
  });

  app.post('/api/finances/card-payment-demo', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role !== 'ESTUDIANTE' || !user.carnetOrCode) return void res.status(403).json({ message: 'La demostración debe realizarse desde la cuenta del estudiante.' });
    const chargeId = String(req.body.chargeId || ''), cardholder = String(req.body.cardholder || '').trim(), last4 = String(req.body.last4 || '').replace(/\D/g, '');
    if (cardholder.length < 3 || last4.length !== 4) return void res.status(400).json({ message: 'Completa los datos de la tarjeta de demostración.' });
    const charge = await prisma.financialCharge.findFirst({ where: { id: chargeId, studentCarnet: user.carnetOrCode }, include: { payments: true, adjustments: true } });
    if (!charge) return void res.status(404).json({ message: 'Cargo no encontrado.' });
    const balance = Math.max(0, charge.amount - charge.adjustments.reduce((sum, item) => sum + item.amount, 0) - charge.payments.reduce((sum, item) => sum + item.amount, 0));
    if (balance <= 0) return void res.status(409).json({ message: 'Este cargo ya no tiene saldo pendiente.' });
    await new Promise((resolve) => setTimeout(resolve, 700));
    res.json({ demo: true, authorizationCode: `DEMO-${randomBytes(3).toString('hex').toUpperCase()}`, last4, amount: balance, concept: charge.concept, processedAt: new Date() });
  });

  app.get('/api/finances/transfer-proofs', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const requestedCarnet = String(req.query.studentCarnet || '');
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode || '' : requestedCarnet;
    const records = await prisma.transferProof.findMany({ where: studentCarnet ? { studentCarnet } : {}, include: { student: true, charge: { select: { concept: true } } }, omit: { fileData: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(records.map((item) => ({ ...item, studentName: item.student.name, concept: item.charge.concept })));
  });

  app.post('/api/finances/transfer-proofs', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role !== 'ESTUDIANTE') return void res.status(403).json({ message: 'El comprobante debe enviarse desde la cuenta del estudiante.' });
    const chargeId = String(req.body.chargeId || '');
    const amount = Number(req.body.amount);
    const reference = String(req.body.reference || '').trim();
    const fileName = String(req.body.fileName || '').trim().slice(0, 180);
    const dataUrl = String(req.body.dataUrl || '');
    const match = dataUrl.match(/^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!Number.isFinite(amount) || amount <= 0 || reference.length < 3 || !fileName || !match) return void res.status(400).json({ message: 'Completa monto, referencia y comprobante PDF, PNG o JPG.' });
    if (Buffer.byteLength(match[2], 'base64') > 3 * 1024 * 1024) return void res.status(400).json({ message: 'El comprobante no puede superar 3 MB.' });
    const charge = await prisma.financialCharge.findUnique({ where: { id: chargeId }, include: { payments: true, adjustments: true, transferProofs: { where: { status: 'PENDIENTE' } } } });
    if (!charge || charge.studentCarnet !== user.carnetOrCode) return void res.status(404).json({ message: 'Cargo no encontrado.' });
    const paid = charge.payments.reduce((sum, item) => sum + item.amount, 0), adjusted = charge.adjustments.reduce((sum, item) => sum + item.amount, 0), pending = charge.transferProofs.reduce((sum, item) => sum + item.amount, 0);
    const available = Math.max(0, charge.amount - paid - adjusted - pending);
    if (amount > available) return void res.status(400).json({ message: `El monto supera el saldo disponible para comprobantes: Q${available.toFixed(2)}.` });
    const duplicate = await prisma.transferProof.findFirst({ where: { reference, status: { in: ['PENDIENTE', 'APROBADO'] } } });
    if (duplicate) return void res.status(409).json({ message: 'La referencia ya fue registrada.' });
    const proof = await prisma.$transaction(async (tx) => {
      const saved = await tx.transferProof.create({ data: { chargeId, studentCarnet: user.carnetOrCode || '', amount, reference, fileName, mimeType: match[1], fileData: match[2] } });
      await tx.auditLog.create({ data: { action: 'SUBMIT_TRANSFER_PROOF', entityType: 'TRANSFER_PROOF', entityId: saved.id, actorId: user.id, details: JSON.stringify({ chargeId, amount, reference }) } });
      return saved;
    });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    for (const admin of admins) await notifyUser(admin.id, 'Transferencia pendiente de validar', `${user.name} envió un comprobante por Q${amount.toFixed(2)}.`, 'INFO', '/pagos');
    res.status(201).json({ id: proof.id, status: proof.status });
  });

  app.get('/api/finances/transfer-proofs/:id/file', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    const proof = await prisma.transferProof.findUnique({ where: { id: req.params.id } });
    if (!proof || user.role === 'DOCENTE' || (user.role === 'ESTUDIANTE' && proof.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Comprobante no encontrado.' });
    res.setHeader('Content-Type', proof.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${proof.fileName.replace(/["\r\n]/g, '')}"`);
    res.send(Buffer.from(proof.fileData, 'base64'));
  });

  app.patch('/api/finances/transfer-proofs/:id/review', requireAdmin, async (req, res) => {
    const status = String(req.body.status || '').trim().toUpperCase();
    const reviewNote = String(req.body.reviewNote || '').trim();
    if (!['APROBADO', 'RECHAZADO'].includes(status) || (status === 'RECHAZADO' && reviewNote.length < 3)) return void res.status(400).json({ message: 'Selecciona aprobar o rechazar; el rechazo requiere una observación.' });
    const proof = await prisma.transferProof.findUnique({ where: { id: req.params.id }, include: { charge: { include: { payments: true, adjustments: true } } } });
    if (!proof || proof.status !== 'PENDIENTE') return void res.status(409).json({ message: 'El comprobante ya fue revisado o no existe.' });
    const paid = proof.charge.payments.reduce((sum, item) => sum + item.amount, 0), adjusted = proof.charge.adjustments.reduce((sum, item) => sum + item.amount, 0), balance = Math.max(0, proof.charge.amount - paid - adjusted);
    if (status === 'APROBADO' && proof.amount > balance) return void res.status(409).json({ message: `El saldo actual es Q${balance.toFixed(2)}; revisa otros pagos antes de aprobar.` });
    const receiptNumber = status === 'APROBADO' ? `REC-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}` : null;
    await prisma.$transaction(async (tx) => {
      await tx.transferProof.update({ where: { id: proof.id }, data: { status, reviewNote: reviewNote || null, reviewedBy: res.locals.authUser.name, reviewedAt: new Date(), receiptNumber } });
      if (status === 'APROBADO') {
        await tx.payment.create({ data: { receiptNumber: receiptNumber!, amount: proof.amount, method: 'TRANSFERENCIA', reference: proof.reference, chargeId: proof.chargeId, studentCarnet: proof.studentCarnet, registeredBy: res.locals.authUser.name } });
        if (proof.amount >= balance) await tx.financialCharge.update({ where: { id: proof.chargeId }, data: { status: 'PAGADO' } });
      }
      await tx.auditLog.create({ data: { action: 'REVIEW_TRANSFER_PROOF', entityType: 'TRANSFER_PROOF', entityId: proof.id, actorId: res.locals.authUser.id, details: JSON.stringify({ status, receiptNumber, reviewNote }) } });
    });
    await notifyByCarnet(proof.studentCarnet, `Transferencia ${status.toLowerCase()}`, status === 'APROBADO' ? `Tu transferencia fue aprobada y se emitió el recibo ${receiptNumber}.` : `Tu transferencia fue rechazada. Observación: ${reviewNote}.`, status === 'APROBADO' ? 'SUCCESS' : 'WARNING', '/pagos');
    res.json({ ok: true, receiptNumber });
  });

  app.get('/api/finances/payments/:id/receipt.pdf', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { student: true, charge: true } });
    if (!payment || (user.role === 'ESTUDIANTE' && payment.studentCarnet !== user.carnetOrCode)) return void res.status(404).json({ message: 'Recibo no encontrado.' });
    const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    const doc = createReceiptPdf({ institutionName: institution?.name || 'Universidad de San Pablo de Guatemala', receiptNumber: payment.receiptNumber, paidAt: payment.paidAt, studentCarnet: payment.studentCarnet, studentName: payment.student.name, concept: payment.charge.concept, amount: payment.amount, method: payment.method, reference: payment.reference, registeredBy: payment.registeredBy });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payment.receiptNumber}.pdf"`);
    doc.pipe(res); doc.end();
  });

  app.get('/api/finances/statement.pdf', requireUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === 'DOCENTE') return void res.status(403).json({ message: 'Acción no permitida.' });
    const studentCarnet = user.role === 'ESTUDIANTE' ? user.carnetOrCode : String(req.query.studentCarnet || '');
    if (!studentCarnet) return void res.status(400).json({ message: 'Selecciona un estudiante.' });
    const dates = statementDates(req);
    if (!dates.valid) return void res.status(400).json({ message: 'El rango de fechas no es válido.' });
    const statement = await buildFinancialStatement(studentCarnet, dates.from, dates.to);
    if (!statement) return void res.status(404).json({ message: 'Estudiante no encontrado.' });
    const institution = await prisma.institutionConfig.findUnique({ where: { id: 1 } });
    const doc = createStatementPdf({ institutionName: institution?.name || 'Universidad de San Pablo de Guatemala', ...statement });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Estado_Cuenta_${studentCarnet}.pdf"`);
    doc.pipe(res); doc.end();
  });
}
