import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerParkingRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { handleUniqueError, notifyUser, hashPassword, temporaryPassword, roleFromEmail } = helpers;
  const { requireUser, requireAdmin, requireParkingStaff, requireFinance } = middleware;

  const parkingCode = (prefix: string) => `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
  const normalizePlate = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const parkingQrSecret = process.env.PARKING_QR_SECRET || 'uspg-parking-development-secret';
  const dynamicParkingPass = (vehicleId: string) => { const expiresAt = Date.now() + 5 * 60 * 1000, payload = `PV1.${vehicleId}.${expiresAt}.${randomBytes(4).toString('hex')}`, signature = createHmac('sha256', parkingQrSecret).update(payload).digest('base64url'); return { code: `${payload}.${signature}`, expiresAt: new Date(expiresAt) }; };
  const verifyDynamicParkingPass = (code: string) => { const parts = code.split('.'); if (parts.length !== 5 || parts[0] !== 'PV1') return null; const payload = parts.slice(0, 4).join('.'), expected = createHmac('sha256', parkingQrSecret).update(payload).digest('base64url'), supplied = parts[4]; if (expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null; const expiresAt = Number(parts[2]); return Number.isFinite(expiresAt) && expiresAt > Date.now() ? { vehicleId: parts[1], expiresAt } : null; };
  const maskedParkingCode = (code: string) => code ? `${code.slice(0, 7)}…${code.slice(-4)}` : null;
  const notifyParkingTeam = async (title: string, message: string) => { const users = await prisma.user.findMany({ where: { role: { in: ['PARQUEO', 'EVENTOS'] }, active: true }, select: { id: true } }); await Promise.all(users.map((user) => notifyUser(user.id, title, message, 'WARNING', '/parqueo'))); };
  const createParkingAlert = async (dedupeKey: string, type: string, severity: string, message: string, eventId?: string) => { if (await prisma.parkingAlert.findUnique({ where: { dedupeKey } })) return; await prisma.parkingAlert.create({ data: { dedupeKey, type, severity, message, eventId } }); await notifyParkingTeam(`Alerta de parqueo · ${severity}`, message); };
  const evaluateOccupancyAlerts = async (occupancy: number, capacity: number) => { const percentage = capacity ? Math.round((occupancy / capacity) * 100) : 0, day = new Date().toISOString().slice(0, 10); for (const threshold of [80, 90, 100]) if (percentage >= threshold) await createParkingAlert(`OCCUPANCY:${day}:${threshold}`, 'OCUPACION', threshold === 100 ? 'CRITICA' : threshold === 90 ? 'ALTA' : 'MEDIA', `El parqueo alcanzó ${percentage}% de ocupación (${occupancy}/${capacity}).`); };

  app.get('/api/parking', requireUser, async (_req, res) => {
    const user = res.locals.authUser, staff = ['PARQUEO', 'EVENTOS'].includes(user.role), now = new Date(), fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const [config, occupancy, vehicles, activeVisits, recentVisits, events, gate1, gate2, attempts] = await Promise.all([
      prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      prisma.parkingVisit.count({ where: { status: 'DENTRO' } }),
      prisma.parkingVehicle.findMany({ where: staff ? {} : { ownerId: user.id }, include: { owner: { select: { name: true, carnetOrCode: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.parkingVisit.findMany({ where: staff ? { status: 'DENTRO' } : { userId: user.id, status: 'DENTRO' }, orderBy: { enteredAt: 'desc' } }),
      staff ? prisma.parkingVisit.findMany({ include: { user: { select: { name: true } }, event: { select: { name: true } } }, orderBy: { enteredAt: 'desc' }, take: 50 }) : Promise.resolve([]),
      prisma.parkingEvent.findMany({ where: staff ? {} : { startsAt: { lte: new Date(now.getTime() + 30 * 86400000) }, endsAt: { gte: now }, status: { not: 'CANCELADO' } }, include: { _count: { select: { guests: true, visits: true } } }, orderBy: { startsAt: 'asc' }, take: 30 }),
      prisma.parkingVisit.count({ where: { entryGate: 'ENTRADA_1', enteredAt: { gte: fifteenMinutesAgo } } }),
      prisma.parkingVisit.count({ where: { entryGate: 'ENTRADA_2', enteredAt: { gte: fifteenMinutesAgo } } }),
      staff ? prisma.parkingAccessAttempt.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) : Promise.resolve([]),
    ]);
    const available = Math.max(0, config.totalCapacity - occupancy), recommendedGate = gate1 <= gate2 ? 'ENTRADA_1' : 'ENTRADA_2';
    await evaluateOccupancyAlerts(occupancy, config.totalCapacity); const hour = now.getHours(); if (hour >= 22 && occupancy > 0) await createParkingAlert(`AFTER_HOURS:${now.toISOString().slice(0, 10)}`, 'FUERA_DE_HORARIO', 'ALTA', `${occupancy} vehículo(s) permanecen dentro después de las 22:00.`); const alerts = staff ? await prisma.parkingAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) : [];
    res.json({ config, summary: { occupancy, available, percentage: Math.round((occupancy / config.totalCapacity) * 100), gate1Last15Minutes: gate1, gate2Last15Minutes: gate2, recommendedGate }, vehicles, activeVisits, recentVisits, events, attempts, alerts });
  });

  app.post('/api/parking/staff', requireUser, requireAdmin, async (req, res) => {
    const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), code = String(req.body.code || '').trim().toUpperCase(), role = String(req.body.role || 'PARQUEO');
    if (name.length < 3 || !['PARQUEO', 'EVENTOS'].includes(role) || roleFromEmail(email) !== role || code.length < 3) return void res.status(400).json({ message: `Usa un correo @${role === 'PARQUEO' ? 'parqueo' : 'eventos'}.uspg.edu.gt.` }); const password = temporaryPassword();
    try { const created = await prisma.user.create({ data: { id: randomUUID(), name, email, role, carnetOrCode: code, passwordHash: hashPassword(password), department: role === 'PARQUEO' ? 'Seguridad y Parqueo' : 'Gestión de Eventos', mustChangePassword: true } }); await notifyUser(created.id, 'Tu acceso operativo USPG está listo', `Hola ${created.name},\n\nSe creó tu acceso de ${role === 'PARQUEO' ? 'Parqueo' : 'Eventos'}.\n\nCorreo: ${created.email}\nContraseña temporal: ${password}\n\nAl ingresar deberás cambiarla.`, 'INFO', '/login'); res.status(201).json({ user: { name: created.name, email: created.email, role }, temporaryPassword: password, emailQueued: true }); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.post('/api/parking/vehicles', requireUser, async (req, res) => {
    const user = res.locals.authUser, plate = normalizePlate(req.body.plate), ownerCode = String(req.body.ownerCode || '').trim(); let owner = user;
    if (user.role === 'PARQUEO' && ownerCode) { const found = await prisma.user.findFirst({ where: { OR: [{ carnetOrCode: ownerCode }, { email: ownerCode.toLowerCase() }] } }); if (!found) return void res.status(404).json({ message: 'Propietario no encontrado.' }); owner = found; }
    if (plate.length < 4 || String(req.body.make || '').trim().length < 2 || String(req.body.model || '').trim().length < 1) return void res.status(400).json({ message: 'Completa placa, marca, modelo y color.' });
    try { const vehicle = await prisma.parkingVehicle.create({ data: { plate, make: String(req.body.make), model: String(req.body.model), color: String(req.body.color || 'No indicado'), type: String(req.body.type || 'AUTOMOVIL'), accessCode: parkingCode('USPG'), ownerId: owner.id } }); await notifyUser(owner.id, 'Pase digital de parqueo activado', `El vehículo ${vehicle.plate} fue registrado correctamente. Abre Parqueo Inteligente antes de llegar para mostrar tu QR dinámico; el código se renueva cada 5 minutos y no debe compartirse.`, 'SUCCESS', '/parqueo'); res.status(201).json(vehicle); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.post('/api/parking/vehicles/:id/pass', requireUser, async (req, res) => {
    const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } }); if (!vehicle || vehicle.status !== 'ACTIVO') return void res.status(404).json({ message: 'Vehículo activo no encontrado.' }); if (!['PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes generar este pase.' }); res.json(dynamicParkingPass(vehicle.id));
  });

  app.patch('/api/parking/vehicles/:id/status', requireUser, async (req, res) => {
    const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } }); if (!vehicle) return void res.status(404).json({ message: 'Vehículo no encontrado.' }); if (!['PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes modificar este vehículo.' }); const status = String(req.body.status); if (!['ACTIVO', 'BLOQUEADO'].includes(status)) return void res.status(400).json({ message: 'Estado no válido.' }); const saved = await prisma.parkingVehicle.update({ where: { id: vehicle.id }, data: { status } }); await notifyUser(vehicle.ownerId, status === 'ACTIVO' ? 'Pase de parqueo reactivado' : 'Pase de parqueo bloqueado', status === 'ACTIVO' ? `El pase digital del vehículo ${vehicle.plate} está activo nuevamente.` : `El pase digital del vehículo ${vehicle.plate} fue bloqueado y ya no permitirá ingresos.`, status === 'ACTIVO' ? 'SUCCESS' : 'WARNING', '/parqueo'); res.json(saved);
  });

  app.delete('/api/parking/vehicles/:id', requireUser, async (req, res) => {
    const vehicle = await prisma.parkingVehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) return void res.status(404).json({ message: 'Vehículo no encontrado.' });
    if (!['PARQUEO'].includes(res.locals.authUser.role) && vehicle.ownerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes quitar este vehículo.' });
    if (await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id } })) return void res.status(409).json({ message: 'No puedes eliminar un vehículo con historial de cobros de parqueo.' });
    if (await prisma.parkingVisit.findFirst({ where: { vehicleId: vehicle.id, status: 'DENTRO' } })) return void res.status(409).json({ message: 'No puedes quitar un vehículo mientras aparece dentro del campus.' });
    await prisma.parkingVehicle.delete({ where: { id: vehicle.id } });
    res.json({ ok: true });
  });

  app.patch('/api/parking/config', requireUser, requireAdmin, async (req, res) => {
    const totalCapacity = Number(req.body.totalCapacity), regularReserve = Number(req.body.regularReserve || 0); if (!Number.isInteger(totalCapacity) || totalCapacity < 1 || !Number.isInteger(regularReserve) || regularReserve < 0 || regularReserve >= totalCapacity) return void res.status(400).json({ message: 'Capacidad o reserva no válida.' }); res.json(await prisma.parkingConfig.upsert({ where: { id: 1 }, update: { totalCapacity, regularReserve }, create: { id: 1, totalCapacity, regularReserve } }));
  });

  app.get('/api/parking/fee-schedules', requireUser, requireFinance, async (_req, res) => {
    res.json(await prisma.parkingFeeSchedule.findMany({ orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] }));
  });

  app.post('/api/parking/fee-schedules', requireUser, requireFinance, async (req, res) => {
    const periodType = String(req.body.periodType || '').trim().toUpperCase();
    const amount = Number(req.body.amount);
    const cycleId = String(req.body.cycleId || '').trim();
    const dueDate = new Date(`${req.body.dueDate}T12:00:00Z`);
    if (!['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL'].includes(periodType) || !Number.isFinite(amount) || amount <= 0 || !cycleId || Number.isNaN(dueDate.getTime())) return void res.status(400).json({ message: 'Completa correctamente periodicidad, monto, ciclo y vencimiento.' });
    const cycle = await prisma.academicCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return void res.status(404).json({ message: 'Ciclo académico no encontrado.' });
    const duplicate = await prisma.parkingFeeSchedule.findFirst({ where: { cycleId, periodType } });
    if (duplicate) return void res.status(409).json({ message: 'Ya existe una tarifa de parqueo con esa periodicidad para este ciclo.' });
    const activeVehicles = await prisma.parkingVehicle.findMany({
      where: { status: 'ACTIVO', owner: { role: 'ESTUDIANTE', active: true, student: { isNot: null } } },
      select: { id: true, owner: { select: { student: { select: { carnet: true } } } } },
    });
    const eligible = activeVehicles.filter((v) => v.owner.student?.carnet);
    const concept = `Parqueo ${periodType.charAt(0) + periodType.slice(1).toLowerCase()} - ${cycle.name}`;
    const created = await prisma.$transaction(async (tx) => {
      const schedule = await tx.parkingFeeSchedule.create({ data: { periodType, amount, cycleId, dueDate, createdBy: res.locals.authUser.name, assignedCount: eligible.length } });
      if (eligible.length) await tx.financialCharge.createMany({ data: eligible.map((v) => ({ studentCarnet: v.owner.student!.carnet, vehicleId: v.id, parkingFeeScheduleId: schedule.id, concept, amount, dueDate, cycleId })) });
      await tx.auditLog.create({ data: { action: 'CREATE_PARKING_FEE_SCHEDULE', entityType: 'PARKING', entityId: schedule.id, actorId: res.locals.authUser.id, details: JSON.stringify({ periodType, amount, cycleId, vehicles: eligible.length }) } });
      return schedule;
    });
    res.status(201).json({ schedule: created, assignedCount: eligible.length });
  });

  app.post('/api/parking/events', requireUser, requireParkingStaff, async (req, res) => {
    const startsAt = new Date(req.body.startsAt), endsAt = new Date(req.body.endsAt), reservedSpaces = Number(req.body.reservedSpaces); if (String(req.body.name || '').trim().length < 3 || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(reservedSpaces) || reservedSpaces < 1) return void res.status(400).json({ message: 'Completa correctamente evento, horario y espacios.' }); const config = await prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }); if (reservedSpaces > config.totalCapacity - config.regularReserve) return void res.status(400).json({ message: `Debes conservar ${config.regularReserve} espacios para la comunidad universitaria.` }); res.status(201).json(await prisma.parkingEvent.create({ data: { name: String(req.body.name), organizer: String(req.body.organizer || res.locals.authUser.name), startsAt, endsAt, reservedSpaces, createdBy: res.locals.authUser.name, status: 'ACTIVO' } }));
  });

  app.post('/api/parking/events/:id/guests', requireUser, requireParkingStaff, async (req, res) => {
    const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id }, include: { _count: { select: { guests: true } } } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); if (event._count.guests >= event.reservedSpaces) return void res.status(409).json({ message: 'El evento alcanzó los espacios reservados.' }); const guestName = String(req.body.guestName || '').trim(); if (guestName.length < 3) return void res.status(400).json({ message: 'Indica el nombre del invitado.' }); const saved = await prisma.parkingEventGuest.create({ data: { eventId: event.id, guestName, plate: req.body.plate ? normalizePlate(req.body.plate) : null, accessCode: parkingCode('EVT') } }); const used = event._count.guests + 1; if (used >= Math.ceil(event.reservedSpaces * .9)) await createParkingAlert(`EVENT_CAPACITY:${event.id}:90`, 'EVENTO', used >= event.reservedSpaces ? 'CRITICA' : 'ALTA', `${event.name} registró ${used} de ${event.reservedSpaces} invitados.`, event.id); res.status(201).json(saved);
  });

  app.get('/api/parking/events/:id', requireUser, requireParkingStaff, async (req, res) => {
    const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id }, include: { guests: { orderBy: { createdAt: 'desc' } }, visits: { orderBy: { enteredAt: 'desc' } } } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); const enteredGuestIds = new Set(event.visits.filter((visit) => visit.eventId).map((visit) => visit.accessCode)); const occupied = event.visits.filter((visit) => visit.status === 'DENTRO').length; res.json({ ...event, occupied, available: Math.max(0, event.reservedSpaces - event.guests.length), guests: event.guests.map((guest) => ({ ...guest, entered: guest.status === 'UTILIZADO' || enteredGuestIds.has(guest.accessCode) })) });
  });

  app.patch('/api/parking/events/:id/status', requireUser, requireParkingStaff, async (req, res) => {
    const status = String(req.body.status || ''); if (!['ACTIVO', 'CANCELADO', 'CERRADO'].includes(status)) return void res.status(400).json({ message: 'Estado de evento no válido.' }); const event = await prisma.parkingEvent.findUnique({ where: { id: req.params.id } }); if (!event) return void res.status(404).json({ message: 'Evento no encontrado.' }); if (status === 'CERRADO' && await prisma.parkingVisit.count({ where: { eventId: event.id, status: 'DENTRO' } })) return void res.status(409).json({ message: 'No puedes cerrar el evento mientras existan vehículos dentro.' }); const updated = await prisma.$transaction(async (tx) => { const saved = await tx.parkingEvent.update({ where: { id: event.id }, data: { status } }); if (status !== 'ACTIVO') await tx.parkingEventGuest.updateMany({ where: { eventId: event.id, status: 'AUTORIZADO' }, data: { status: 'CANCELADO' } }); return saved; }); res.json(updated);
  });

  app.post('/api/parking/events/:eventId/guests/:guestId/reissue', requireUser, requireParkingStaff, async (req, res) => {
    const guest = await prisma.parkingEventGuest.findFirst({ where: { id: req.params.guestId, eventId: req.params.eventId }, include: { event: true } }); if (!guest) return void res.status(404).json({ message: 'Invitado no encontrado.' }); if (guest.event.status !== 'ACTIVO' || guest.status === 'UTILIZADO') return void res.status(409).json({ message: 'Este pase ya no puede regenerarse.' }); res.json(await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { accessCode: parkingCode('EVT'), status: 'AUTORIZADO' } }));
  });

  app.patch('/api/parking/events/:eventId/guests/:guestId/status', requireUser, requireParkingStaff, async (req, res) => {
    const guest = await prisma.parkingEventGuest.findFirst({ where: { id: req.params.guestId, eventId: req.params.eventId } }); if (!guest) return void res.status(404).json({ message: 'Invitado no encontrado.' }); if (guest.status === 'UTILIZADO') return void res.status(409).json({ message: 'No puede cancelarse un pase que ya ingresó.' }); res.json(await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { status: 'CANCELADO' } }));
  });

  app.post('/api/parking/access', requireUser, requireParkingStaff, async (req, res) => {
    const code = String(req.body.code || '').trim(), normalizedCode = code.toUpperCase(), plateInput = normalizePlate(req.body.plate), entryGate = String(req.body.entryGate || ''), operatorId = res.locals.authUser.id; const reject = async (status: number, reason: string, vehicleId?: string) => { const masked = maskedParkingCode(code); await prisma.parkingAccessAttempt.create({ data: { outcome: 'RECHAZADO', reason, entryGate, plate: plateInput || null, codeMasked: masked, vehicleId, operatorId } }); const since = new Date(Date.now() - 10 * 60 * 1000), repeated = await prisma.parkingAccessAttempt.count({ where: { outcome: 'RECHAZADO', createdAt: { gte: since }, OR: [...(plateInput ? [{ plate: plateInput }] : []), ...(masked ? [{ codeMasked: masked }] : [])] } }); if (repeated >= 3) await createParkingAlert(`REJECTED:${plateInput || masked}:${new Date().toISOString().slice(0, 13)}`, 'INTENTOS_INVALIDOS', 'ALTA', `${repeated} intentos rechazados en 10 minutos para ${plateInput || masked || 'un pase desconocido'}.`); res.status(status).json({ message: reason }); };
    if (!['ENTRADA_1', 'ENTRADA_2'].includes(entryGate)) return void await reject(400, 'Selecciona Entrada 1 o Entrada 2.'); const dynamicPass = verifyDynamicParkingPass(code);
    const [vehicle, guest, config, occupancy] = await Promise.all([dynamicPass ? prisma.parkingVehicle.findFirst({ where: { id: dynamicPass.vehicleId, status: 'ACTIVO' }, include: { owner: true } }) : prisma.parkingVehicle.findFirst({ where: { plate: plateInput || '__NONE__', status: 'ACTIVO' }, include: { owner: true } }), prisma.parkingEventGuest.findFirst({ where: { OR: [{ accessCode: normalizedCode || '__NONE__' }, { plate: plateInput || '__NONE__' }], status: 'AUTORIZADO' }, include: { event: true } }), prisma.parkingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }), prisma.parkingVisit.count({ where: { status: 'DENTRO' } })]);
    if (!vehicle && !guest) return void await reject(404, code.startsWith('PV1.') ? 'El QR vehicular venció o no es válido.' : 'Pase o placa no autorizado.'); if (vehicle) { const overdue = await prisma.financialCharge.findFirst({ where: { vehicleId: vehicle.id, dueDate: { lt: new Date() }, status: { not: 'PAGADO' } } }); if (overdue) return void await reject(403, 'Saldo de parqueo vencido — regulariza tu pago para ingresar.', vehicle.id); } if (occupancy >= config.totalCapacity) return void await reject(409, 'Parqueo lleno. Acceso temporalmente detenido.', vehicle?.id); const plate = vehicle?.plate || guest?.plate || plateInput; if (!plate) return void await reject(400, 'Registra la placa del visitante.', vehicle?.id); if (await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' } })) return void await reject(409, 'El vehículo ya se encuentra dentro.', vehicle?.id);
    if (guest && (guest.event.status !== 'ACTIVO' || new Date() < new Date(guest.event.startsAt.getTime() - 3 * 3600000) || new Date() > guest.event.endsAt)) return void await reject(403, 'El pase del evento no está vigente.'); const visit = await prisma.parkingVisit.create({ data: { plate, accessCode: code || vehicle?.accessCode, visitorName: guest?.guestName, entryGate, vehicleId: vehicle?.id, userId: vehicle?.ownerId, eventId: guest?.eventId } }); if (guest) await prisma.parkingEventGuest.update({ where: { id: guest.id }, data: { status: 'UTILIZADO' } }); await prisma.parkingAccessAttempt.create({ data: { outcome: 'AUTORIZADO', reason: guest ? 'Invitado de evento' : dynamicPass ? 'QR dinámico válido' : 'Placa autorizada', entryGate, plate, codeMasked: maskedParkingCode(code), vehicleId: vehicle?.id, operatorId } }); await evaluateOccupancyAlerts(occupancy + 1, config.totalCapacity); res.status(201).json({ visit, occupancy: occupancy + 1, available: config.totalCapacity - occupancy - 1 });
  });

  app.patch('/api/parking/alerts/:id/acknowledge', requireUser, requireParkingStaff, async (req, res) => {
    const alert = await prisma.parkingAlert.findUnique({ where: { id: req.params.id } }); if (!alert) return void res.status(404).json({ message: 'Alerta no encontrada.' }); res.json(await prisma.parkingAlert.update({ where: { id: alert.id }, data: { status: 'ATENDIDA', acknowledgedBy: res.locals.authUser.name, acknowledgedAt: new Date() } }));
  });

  app.get('/api/parking/offline-manifest', requireUser, requireParkingStaff, async (_req, res) => {
    const now = new Date(), expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); const [vehicles, guests] = await Promise.all([prisma.parkingVehicle.findMany({ where: { status: 'ACTIVO' }, select: { plate: true } }), prisma.parkingEventGuest.findMany({ where: { status: 'AUTORIZADO', event: { status: 'ACTIVO', startsAt: { lte: expiresAt }, endsAt: { gte: now } } }, select: { plate: true, accessCode: true } })]); res.json({ generatedAt: now, expiresAt, plates: vehicles.map((item) => item.plate), guestPasses: guests.map((item) => ({ plate: item.plate, code: item.accessCode })) });
  });

  app.post('/api/parking/offline-sync', requireUser, requireParkingStaff, async (req, res) => {
    const operations = Array.isArray(req.body.operations) ? req.body.operations.slice(0, 100) : []; if (!operations.length) return void res.status(400).json({ message: 'No hay operaciones para sincronizar.' }); const results: Array<{ id: string; status: string; message?: string }> = [];
    for (const item of operations) { const id = String(item.id || ''), type = String(item.type || ''), plate = normalizePlate(item.plate), gate = String(item.gate || ''), recordedAt = new Date(item.recordedAt); if (!id || !['ENTRY', 'EXIT'].includes(type) || plate.length < 4 || Number.isNaN(recordedAt.getTime())) { results.push({ id, status: 'RECHAZADO', message: 'Datos incompletos.' }); continue; } if (await prisma.parkingOfflineOperation.findUnique({ where: { clientOperationId: id } })) { results.push({ id, status: 'DUPLICADO' }); continue; }
      try { if (type === 'ENTRY') { const vehicle = await prisma.parkingVehicle.findUnique({ where: { plate } }); if (!vehicle || vehicle.status !== 'ACTIVO') throw new Error('Vehículo no autorizado.'); if (await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' } })) throw new Error('El vehículo ya está dentro.'); const visit = await prisma.parkingVisit.create({ data: { plate, entryGate: ['ENTRADA_1','ENTRADA_2'].includes(gate) ? gate : 'ENTRADA_1', enteredAt: recordedAt, vehicleId: vehicle.id, userId: vehicle.ownerId } }); await prisma.parkingOfflineOperation.create({ data: { clientOperationId: id, type, plate, gate, reason: String(item.reason || 'Contingencia sin conexión'), recordedAt, syncedBy: res.locals.authUser.name, visitId: visit.id } }); await prisma.parkingAccessAttempt.create({ data: { outcome: 'SINCRONIZADO', reason: 'Entrada registrada durante contingencia', entryGate: gate, plate, vehicleId: vehicle.id, operatorId: res.locals.authUser.id } }); }
        else { const visit = await prisma.parkingVisit.findFirst({ where: { plate, status: 'DENTRO' }, orderBy: { enteredAt: 'desc' } }); if (!visit) throw new Error('No existe un ingreso activo.'); await prisma.parkingVisit.update({ where: { id: visit.id }, data: { status: 'SALIO', exitedAt: recordedAt, exitGate: 'SALIDA_1' } }); await prisma.parkingOfflineOperation.create({ data: { clientOperationId: id, type, plate, gate: 'SALIDA_1', reason: String(item.reason || 'Contingencia sin conexión'), recordedAt, syncedBy: res.locals.authUser.name, visitId: visit.id } }); }
        results.push({ id, status: 'SINCRONIZADO' }); } catch (error) { results.push({ id, status: 'RECHAZADO', message: error instanceof Error ? error.message : 'No fue posible sincronizar.' }); }
    } res.json({ results });
  });

  app.post('/api/parking/manual-barrier', requireUser, requireParkingStaff, async (req, res) => {
    const gate = String(req.body.gate || ''), reason = String(req.body.reason || '').trim(), plate = normalizePlate(req.body.plate); if (!['ENTRADA_1','ENTRADA_2','SALIDA_1'].includes(gate) || reason.length < 5) return void res.status(400).json({ message: 'Indica barrera y motivo de la apertura manual.' }); const attempt = await prisma.parkingAccessAttempt.create({ data: { outcome: 'APERTURA_MANUAL', reason, entryGate: gate, plate: plate || null, operatorId: res.locals.authUser.id } }); await createParkingAlert(`MANUAL:${attempt.id}`, 'APERTURA_MANUAL', 'MEDIA', `${res.locals.authUser.name} abrió manualmente ${gate.replace('_',' ')}. Motivo: ${reason}`); res.status(201).json(attempt);
  });

  app.post('/api/parking/exit', requireUser, requireParkingStaff, async (req, res) => {
    const plate = normalizePlate(req.body.plate), code = String(req.body.code || '').trim().toUpperCase(); const visit = await prisma.parkingVisit.findFirst({ where: { status: 'DENTRO', OR: [{ plate: plate || '__NONE__' }, { accessCode: code || '__NONE__' }] }, orderBy: { enteredAt: 'desc' } }); if (!visit) return void res.status(404).json({ message: 'No existe un ingreso activo para ese vehículo.' }); res.json(await prisma.parkingVisit.update({ where: { id: visit.id }, data: { status: 'SALIO', exitedAt: new Date(), exitGate: 'SALIDA_1' } }));
  });
}
