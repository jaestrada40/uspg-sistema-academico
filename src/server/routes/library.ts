import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

export function registerLibraryRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { handleUniqueError, notifyUser, hashPassword, temporaryPassword, roleFromEmail } = helpers;
  const evaluateLibraryAlerts = async () => { const overdueLoans = await prisma.libraryLoan.findMany({ where: { status: 'PRESTADO', dueAt: { lt: new Date() } }, include: { copy: { include: { book: true } }, borrower: true } }); for (const loan of overdueLoans) { const existing = await prisma.appNotification.findFirst({ where: { userId: loan.borrowerId, title: { contains: 'Préstamo vencido' }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }); if (!existing) await notifyUser(loan.borrowerId, 'Préstamo vencido', `Tu préstamo de "${loan.copy.book.title}" venció el ${loan.dueAt.toLocaleDateString('es-GT')}. Por favor devuélvelo a la brevedad.`, 'WARNING', '/biblioteca'); } };
  const { requireUser, requireAdmin, requireLibraryStaff } = middleware;

  app.post('/api/library/staff', requireUser, requireAdmin, async (req, res) => {
    const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), code = String(req.body.code || '').trim().toUpperCase();
    if (name.length < 3 || roleFromEmail(email) !== 'BIBLIOTECA' || code.length < 3) return void res.status(400).json({ message: 'Indica nombre, código y correo @biblioteca.uspg.edu.gt.' });
    const password = temporaryPassword();
    try { const user = await prisma.user.create({ data: { id: randomUUID(), name, email, role: 'BIBLIOTECA', carnetOrCode: code, passwordHash: hashPassword(password), department: 'Biblioteca', mustChangePassword: true } }); await notifyUser(user.id, 'Tu acceso a Biblioteca USPG está listo', `Hola ${user.name},\n\nSe creó tu acceso al módulo de Biblioteca USPG.\n\nCorreo: ${user.email}\nContraseña temporal: ${password}\n\nAl ingresar deberás cambiarla.`, 'INFO', '/login'); res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, temporaryPassword: password, emailQueued: true }); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.get('/api/library', requireUser, async (_req, res) => {
    const user = res.locals.authUser;
    const staff = user.role === 'BIBLIOTECA';
    await evaluateLibraryAlerts();
    await prisma.user.updateMany({ where: { librarySuspendedUntil: { lt: new Date(), not: null } }, data: { librarySuspendedUntil: null, librarySuspensionReason: null } });
    const expired = await prisma.libraryReservation.findMany({ where: { status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] }, expiresAt: { lt: new Date() } } }); for (const item of expired) await prisma.$transaction(async (tx) => { await tx.libraryReservation.update({ where: { id: item.id }, data: { status: 'EXPIRADA' } }); if (item.assignedCopyId) await tx.libraryCopy.updateMany({ where: { id: item.assignedCopyId, status: 'RESERVADO' }, data: { status: 'DISPONIBLE' } }); });
    const [books, loans, reservations] = await Promise.all([
      prisma.libraryBook.findMany({ where: { status: 'ACTIVO' }, include: { copies: true, _count: { select: { reservations: true } } }, orderBy: { title: 'asc' } }),
      prisma.libraryLoan.findMany({ where: staff ? {} : { borrowerId: user.id }, include: { borrower: { select: { id: true, name: true, carnetOrCode: true, librarySuspendedUntil: true, librarySuspensionReason: true } }, copy: { include: { book: true } } }, orderBy: { loanedAt: 'desc' }, take: 200 }),
      prisma.libraryReservation.findMany({ where: staff ? {} : { userId: user.id }, include: { user: { select: { name: true, carnetOrCode: true, email: true } }, book: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    const popularity = new Map<string, number>(); loans.forEach((loan) => popularity.set(loan.copy.book.title, (popularity.get(loan.copy.book.title) || 0) + 1)); const popularBooks = [...popularity.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([title,count])=>({title,count}));
    res.json({ books: books.map((book) => ({ ...book, available: book.copies.filter((copy) => copy.status === 'DISPONIBLE').length, totalCopies: book.copies.length })), loans: loans.map((loan) => ({ id: loan.id, loanedAt: loan.loanedAt, dueAt: loan.dueAt, returnedAt: loan.returnedAt, status: loan.status === 'PRESTADO' && loan.dueAt < new Date() ? 'VENCIDO' : loan.status, renewalCount: loan.renewalCount, borrowerId: loan.borrower.id, borrowerName: loan.borrower.name, borrowerCode: loan.borrower.carnetOrCode, suspendedUntil: loan.borrower.librarySuspendedUntil, suspensionReason: loan.borrower.librarySuspensionReason, barcode: loan.copy.barcode, bookTitle: loan.copy.book.title })), reservations, metrics: { popularBooks, overdue: loans.filter((loan)=>loan.status === 'PRESTADO' && loan.dueAt < new Date()).length, damagedCopies: books.flatMap((book)=>book.copies).filter((copy)=>['DANADO','PERDIDO','MANTENIMIENTO'].includes(copy.status)).length } });
  });

  app.post('/api/library/books', requireUser, requireLibraryStaff, async (req, res) => {
    const title = String(req.body.title || '').trim(), author = String(req.body.author || '').trim(), category = String(req.body.category || '').trim(), barcode = String(req.body.barcode || '').trim().toUpperCase();
    if (title.length < 2 || author.length < 2 || category.length < 2 || barcode.length < 3) return void res.status(400).json({ message: 'Completa título, autor, categoría y código del ejemplar.' });
    try { const book = await prisma.$transaction(async (tx) => { const created = await tx.libraryBook.create({ data: { title, author, category, isbn: req.body.isbn ? String(req.body.isbn) : null, publisher: req.body.publisher ? String(req.body.publisher) : null, publicationYear: req.body.publicationYear ? Number(req.body.publicationYear) : null, copies: { create: { barcode, location: String(req.body.location || 'Biblioteca Central') } } } }); await tx.auditLog.create({ data: { action: 'CREATE_LIBRARY_BOOK', entityType: 'LIBRARY_BOOK', entityId: created.id, actorId: res.locals.authUser.id } }); return created; }); res.status(201).json(book); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.post('/api/library/books/:id/copies', requireUser, requireLibraryStaff, async (req, res) => {
    const barcode = String(req.body.barcode || '').trim().toUpperCase(); if (barcode.length < 3) return void res.status(400).json({ message: 'Indica el código de barras.' });
    try { res.status(201).json(await prisma.libraryCopy.create({ data: { bookId: req.params.id, barcode, location: String(req.body.location || 'Biblioteca Central') } })); } catch (error) { if (!handleUniqueError(error, res)) throw error; }
  });

  app.post('/api/library/loans', requireUser, requireLibraryStaff, async (req, res) => {
    const borrowerCode = String(req.body.borrowerCode || '').trim(), barcode = String(req.body.barcode || '').trim().toUpperCase(), days = Number(req.body.days || 7);
    const [borrower, copy] = await Promise.all([prisma.user.findFirst({ where: { OR: [{ carnetOrCode: borrowerCode }, { email: borrowerCode.toLowerCase() }], active: true } }), prisma.libraryCopy.findUnique({ where: { barcode }, include: { book: true } })]);
    if (!borrower || !copy) return void res.status(404).json({ message: 'Usuario o ejemplar no encontrado.' }); if (borrower.librarySuspendedUntil && borrower.librarySuspendedUntil > new Date()) return void res.status(403).json({ message: `Usuario suspendido hasta ${borrower.librarySuspendedUntil.toLocaleDateString('es-GT')}: ${borrower.librarySuspensionReason || 'incidencia bibliotecaria'}.` }); const reservation = await prisma.libraryReservation.findFirst({ where: { userId: borrower.id, bookId: copy.bookId, status: 'LISTA', assignedCopyId: copy.id } }); if (copy.status !== 'DISPONIBLE' && !(copy.status === 'RESERVADO' && reservation)) return void res.status(409).json({ message: 'El ejemplar no está disponible para este usuario.' }); if (!Number.isInteger(days) || days < 1 || days > 30) return void res.status(400).json({ message: 'El préstamo debe durar entre 1 y 30 días.' });
    const activeCount = await prisma.libraryLoan.count({ where: { borrowerId: borrower.id, status: 'PRESTADO' } }); if (activeCount >= 3) return void res.status(409).json({ message: 'El usuario ya alcanzó el máximo de 3 préstamos.' });
    const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + days);
    const loan = await prisma.$transaction(async (tx) => { const created = await tx.libraryLoan.create({ data: { borrowerId: borrower.id, copyId: copy.id, dueAt } }); await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: 'PRESTADO' } }); if (reservation) await tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'ENTREGADA', fulfilledAt: new Date() } }); await tx.auditLog.create({ data: { action: 'LIBRARY_LOAN', entityType: 'LIBRARY_LOAN', entityId: created.id, actorId: res.locals.authUser.id } }); return created; });
    await notifyUser(borrower.id, 'Préstamo de biblioteca', `${copy.book.title} debe devolverse el ${dueAt.toLocaleDateString('es-GT')}.`, 'INFO', '/biblioteca'); res.status(201).json(loan);
  });

  app.post('/api/library/loans/:id/return', requireUser, requireLibraryStaff, async (req, res) => {
    const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: { include: { book: true } } } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' }); const waiting = await prisma.libraryReservation.findFirst({ where: { bookId: loan.copy.bookId, status: { in: ['ACTIVA','SOLICITADA'] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' } }), readyUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => { await tx.libraryLoan.update({ where: { id: loan.id }, data: { status: 'DEVUELTO', returnedAt: new Date() } }); await tx.libraryCopy.update({ where: { id: loan.copyId }, data: { status: waiting ? 'RESERVADO' : 'DISPONIBLE', condition: String(req.body.condition || 'BUENO') } }); if (waiting) await tx.libraryReservation.update({ where: { id: waiting.id }, data: { status: 'LISTA', assignedCopyId: loan.copyId, readyAt: new Date(), expiresAt: readyUntil } }); await tx.auditLog.create({ data: { action: 'LIBRARY_RETURN', entityType: 'LIBRARY_LOAN', entityId: loan.id, actorId: res.locals.authUser.id } }); }); if (waiting) await notifyUser(waiting.userId, 'Tu reserva ya está disponible', `${loan.copy.book.title} está listo para recoger hasta el ${readyUntil.toLocaleString('es-GT')}. Presenta tu QR.`, 'SUCCESS', '/biblioteca'); res.json({ ok: true, assignedToWaitingUser: Boolean(waiting) });
  });

  app.post('/api/library/loans/:id/incident', requireUser, requireLibraryStaff, async (req, res) => {
    const type = String(req.body.type || ''), notes = String(req.body.notes || '').trim(), suspensionDays = Number(req.body.suspensionDays || 0); if (!['DANADO','PERDIDO'].includes(type) || notes.length < 5 || !Number.isInteger(suspensionDays) || suspensionDays < 0 || suspensionDays > 365) return void res.status(400).json({ message: 'Completa tipo, detalle y días de suspensión.' }); const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: { include: { book: true } }, borrower: true } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' }); const suspendedUntil = suspensionDays ? new Date(Date.now() + suspensionDays * 86400000) : null; await prisma.$transaction([prisma.libraryLoan.update({ where: { id: loan.id }, data: { status: type, returnedAt: new Date(), notes } }), prisma.libraryCopy.update({ where: { id: loan.copyId }, data: { status: type, condition: type } }), ...(suspendedUntil ? [prisma.user.update({ where: { id: loan.borrowerId }, data: { librarySuspendedUntil: suspendedUntil, librarySuspensionReason: `${type}: ${notes}` } })] : []), prisma.auditLog.create({ data: { action: 'LIBRARY_INCIDENT', entityType: 'LIBRARY_LOAN', entityId: loan.id, actorId: res.locals.authUser.id, details: JSON.stringify({ type, notes, suspensionDays }) } })]); await notifyUser(loan.borrowerId, `Incidencia de Biblioteca: ${type}`, `${loan.copy.book.title}: ${notes}${suspendedUntil ? ` Suspensión hasta ${suspendedUntil.toLocaleDateString('es-GT')}.` : ''}`, 'ERROR', '/biblioteca'); res.json({ ok: true, suspendedUntil });
  });

  app.patch('/api/library/users/:id/suspension', requireUser, requireLibraryStaff, async (req, res) => { const user = await prisma.user.findUnique({ where: { id: req.params.id } }); if (!user) return void res.status(404).json({ message: 'Usuario no encontrado.' }); res.json(await prisma.user.update({ where: { id: user.id }, data: { librarySuspendedUntil: null, librarySuspensionReason: null } })); });

  app.post('/api/library/loans/:id/renew', requireUser, async (req, res) => {
    const loan = await prisma.libraryLoan.findUnique({ where: { id: req.params.id }, include: { copy: true } }); if (!loan || loan.status !== 'PRESTADO') return void res.status(409).json({ message: 'El préstamo no está activo.' });
    if (!['BIBLIOTECA'].includes(res.locals.authUser.role) && loan.borrowerId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes renovar este préstamo.' }); if (loan.renewalCount >= 1) return void res.status(409).json({ message: 'Solo se permite una renovación.' });
    if (await prisma.libraryReservation.findFirst({ where: { bookId: loan.copy.bookId, status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] } } })) return void res.status(409).json({ message: 'El libro tiene solicitudes pendientes.' }); const dueAt = new Date(loan.dueAt); dueAt.setDate(dueAt.getDate() + 7); res.json(await prisma.libraryLoan.update({ where: { id: loan.id }, data: { dueAt, renewalCount: { increment: 1 } } }));
  });

  app.post('/api/library/books/:id/reserve', requireUser, async (req, res) => {
    if (!['ESTUDIANTE', 'DOCENTE'].includes(res.locals.authUser.role)) return void res.status(403).json({ message: 'La reserva corresponde a estudiantes y docentes.' }); const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 2);
    if (await prisma.libraryReservation.findFirst({ where: { bookId: req.params.id, userId: res.locals.authUser.id, status: { in: ['ACTIVA', 'SOLICITADA', 'LISTA'] } } })) return void res.status(409).json({ message: 'Ya tienes una solicitud activa para este libro.' }); const book = await prisma.libraryBook.findUnique({ where: { id: req.params.id } }); if (!book) return void res.status(404).json({ message: 'Libro no encontrado.' }); const reservation = await prisma.libraryReservation.create({ data: { bookId: book.id, userId: res.locals.authUser.id, expiresAt, status: 'SOLICITADA' } }); await notifyUser(res.locals.authUser.id, 'Solicitud recibida', `Biblioteca recibió tu solicitud de ${book.title}.`, 'INFO', '/biblioteca'); res.status(201).json(reservation);
  });

  app.post('/api/library/reservations/:id/prepare', requireUser, requireLibraryStaff, async (req, res) => {
    const reservation = await prisma.libraryReservation.findUnique({ where: { id: req.params.id }, include: { book: true } }); if (!reservation || !['ACTIVA','SOLICITADA'].includes(reservation.status)) return void res.status(409).json({ message: 'La solicitud ya no puede prepararse.' }); const copy = await prisma.libraryCopy.findFirst({ where: { bookId: reservation.bookId, status: 'DISPONIBLE' }, orderBy: { createdAt: 'asc' } }); if (!copy) return void res.status(409).json({ message: 'No existe un ejemplar disponible todavía.' }); const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); const saved = await prisma.$transaction(async (tx) => { await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: 'RESERVADO' } }); return tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'LISTA', assignedCopyId: copy.id, readyAt: new Date(), expiresAt } }); }); await notifyUser(reservation.userId, 'Libro listo para recoger', `${reservation.book.title} está listo. Presenta tu QR antes del ${expiresAt.toLocaleString('es-GT')}.`, 'SUCCESS', '/biblioteca'); res.json({ ...saved, barcode: copy.barcode });
  });

  app.patch('/api/library/reservations/:id/cancel', requireUser, async (req, res) => {
    const reservation = await prisma.libraryReservation.findUnique({ where: { id: req.params.id } }); if (!reservation || !['ACTIVA','SOLICITADA','LISTA'].includes(reservation.status)) return void res.status(409).json({ message: 'La solicitud ya no puede cancelarse.' }); if (!['BIBLIOTECA'].includes(res.locals.authUser.role) && reservation.userId !== res.locals.authUser.id) return void res.status(403).json({ message: 'No puedes cancelar esta solicitud.' }); const saved = await prisma.$transaction(async (tx) => { if (reservation.assignedCopyId) await tx.libraryCopy.updateMany({ where: { id: reservation.assignedCopyId, status: 'RESERVADO' }, data: { status: 'DISPONIBLE' } }); return tx.libraryReservation.update({ where: { id: reservation.id }, data: { status: 'CANCELADA', cancelledAt: new Date() } }); }); res.json(saved);
  });

  app.patch('/api/library/books/:id', requireUser, requireLibraryStaff, async (req, res) => {
    const { title, author, category, isbn, publisher } = req.body;
    const book = await prisma.libraryBook.findUnique({ where: { id: req.params.id } });
    if (!book) return void res.status(404).json({ message: 'Libro no encontrado.' });
    const updated = await prisma.libraryBook.update({
      where: { id: req.params.id },
      data: { ...(title && { title }), ...(author && { author }), ...(category && { category }), ...(isbn !== undefined && { isbn: isbn || null }), ...(publisher !== undefined && { publisher: publisher || null }) },
    });
    res.json(updated);
  });

  app.patch('/api/library/copies/:id/status', requireUser, requireLibraryStaff, async (req, res) => {
    const { status, condition, location } = req.body;
    const validStatuses = ['DISPONIBLE', 'MANTENIMIENTO', 'FUERA_CIRCULACION'];
    if (status && !validStatuses.includes(status)) return void res.status(400).json({ message: 'Estado inválido.' });
    const copy = await prisma.libraryCopy.findUnique({ where: { id: req.params.id } });
    if (!copy) return void res.status(404).json({ message: 'Ejemplar no encontrado.' });
    const updated = await prisma.libraryCopy.update({
      where: { id: req.params.id },
      data: { ...(status && { status }), ...(condition && { condition }), ...(location && { location }) },
    });
    res.json(updated);
  });
}
