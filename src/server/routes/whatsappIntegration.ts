import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type express from 'express';
import type { AppPrisma, ServerHelpers } from '../types';

// Integracion con el asistente de WhatsApp (proyecto AIWhatsApp, separado de este
// repo). El agente llama a este endpoint despues de que un aspirante confirma sus
// datos en el chat. No usa la sesion de cookies del resto de la app: se autentica
// con una API key propia porque quien llama es un servidor, no una persona logueada.
//
// Reglas de negocio que este archivo respeta a proposito:
//  - El correo de un ESTUDIANTE debe terminar en @alumno.uspg.edu.gt (roleFromEmail
//    en server.ts lo exige), asi que el correo institucional se genera aqui; el
//    aspirante nunca lo escribe.
//  - El aspirante SI da un correo personal (Gmail, Outlook, etc.). Ahi se le envian
//    las credenciales, porque todavia no puede entrar a su correo institucional nuevo
//    para leerlas. Es obligatorio para poder crear la cuenta.
//  - Solo se crea la cuenta real (User + Student) si existe un CurriculumPlan
//    activo para la combinacion carrera+campus. Si no existe (todavia falta cargar
//    esa carrera en el sistema), la solicitud queda como revision manual: no se
//    inventa un plan ni se fuerza la creacion.
//  - Un mismo telefono de WhatsApp solo puede generar una cuenta. Intentos
//    repetidos devuelven los datos de la cuenta que ya existe.

const SYSTEM_ACTOR_ID = 'SYS-WHATSAPP-AGENT';
const SYSTEM_ACTOR_EMAIL = 'asistente-whatsapp@sistemas.uspg.edu.gt';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitHits: number[] = [];

function consumeLocalRateLimit(): boolean {
  const now = Date.now();
  while (rateLimitHits.length && now - rateLimitHits[0] > RATE_LIMIT_WINDOW_MS) rateLimitHits.shift();
  if (rateLimitHits.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  rateLimitHits.push(now);
  return true;
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// Validacion minima de correo: algo@algo.dominio. No cubre el RFC entero, solo
// atrapa typos evidentes antes de crear la cuenta.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254;
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function localPartFromName(name: string): string {
  const words = stripAccents(name.trim().toLowerCase())
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'estudiante';
  if (words.length === 1) return words[0];
  const firstName = words[0];
  const lastName = words[words.length - 1];
  return `${firstName[0]}${lastName}`;
}

export function registerWhatsAppIntegrationRoutes(
  app: express.Express,
  prisma: AppPrisma,
  helpers: ServerHelpers,
) {
  const { hashPassword, temporaryPassword, notifyUser } = helpers;

  // Envia una notificacion (feed + correo) a una direccion de correo distinta a la
  // institucional del usuario. Se usa para mandarle las credenciales al correo
  // PERSONAL del aspirante: su correo institucional recien creado todavia no lo
  // puede abrir sin esas mismas credenciales.
  async function notifyUserAtEmail(
    userId: string,
    recipientEmail: string,
    title: string,
    message: string,
    type = 'INFO',
    link?: string,
  ) {
    const notification = await prisma.appNotification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
        email: { create: { recipientEmail, subject: title, textBody: message } },
      },
      include: { email: true },
    });
    if (notification.email) await helpers.deliverOutboxEmail(notification.email.id);
  }

  const requireApiKey: express.RequestHandler = (req, res, next) => {
    const configured = process.env.WHATSAPP_AGENT_API_KEY || '';
    const provided = String(req.header('X-API-Key') || '');
    if (!configured) {
      res.status(503).json({ message: 'La integración con WhatsApp no está configurada en este servidor.' });
      return;
    }
    if (!provided || !safeEqual(provided, configured)) {
      res.status(401).json({ message: 'API key inválida.' });
      return;
    }
    next();
  };

  async function ensureSystemActor(): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { id: SYSTEM_ACTOR_ID } });
    if (existing) return existing.id;
    const created = await prisma.user.create({
      data: {
        id: SYSTEM_ACTOR_ID,
        name: 'Asistente de WhatsApp (automático)',
        email: SYSTEM_ACTOR_EMAIL,
        passwordHash: hashPassword(randomBytes(24).toString('hex')),
        role: 'SISTEMAS',
        active: false, // nunca debe poder iniciar sesión; solo existe como actor de auditoría
        mustChangePassword: true,
      },
    });
    return created.id;
  }

  async function nextCarnet(): Promise<string> {
    const yearPrefix = String(new Date().getFullYear() % 100).padStart(2, '0');
    const last = await prisma.student.findFirst({
      where: { carnet: { startsWith: yearPrefix } },
      orderBy: { carnet: 'desc' },
    });
    const lastSequence = last ? Number.parseInt(last.carnet.slice(yearPrefix.length), 10) || 0 : 0;
    return `${yearPrefix}${String(lastSequence + 1).padStart(5, '0')}`;
  }

  async function uniqueInstitutionalEmail(name: string): Promise<string> {
    const base = localPartFromName(name);
    let candidate = `${base}@alumno.uspg.edu.gt`;
    let suffix = 2;
    while (await prisma.user.findUnique({ where: { email: candidate } })) {
      candidate = `${base}${suffix}@alumno.uspg.edu.gt`;
      suffix += 1;
    }
    return candidate;
  }

  async function notifyAdmissionsStaff(title: string, message: string, link?: string) {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'REGISTRO'] }, active: true },
      select: { id: true },
    });
    await Promise.all(staff.map((person) => notifyUser(person.id, title, message, 'INFO', link)));
  }

  // Ninguna respuesta de este endpoint debe esperar a que salga un correo. El envío
  // por SMTP puede tardar o colgarse, y el agente de WhatsApp corta la llamada a los
  // pocos segundos: si esperáramos, el aspirante vería "falló" aunque su solicitud sí
  // quedó registrada. Los correos que fallen quedan en email_outbox para reintento.
  function enviarCorreosEnSegundoPlano(etiqueta: string, tarea: () => Promise<unknown>) {
    void tarea().catch((error) =>
      console.error(
        `WhatsApp inscripción (${etiqueta}): la solicitud se registró pero fallaron las notificaciones por correo:`,
        error instanceof Error ? error.message : 'error desconocido',
      ),
    );
  }

  app.post('/api/integrations/whatsapp/solicitudes-inscripcion', requireApiKey, async (req, res) => {
    if (!consumeLocalRateLimit()) {
      res.status(429).json({ message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const careerName = String(req.body?.careerName || '').trim();
    const personalEmail = String(req.body?.personalEmail || '').trim().toLowerCase();

    if (name.length < 3 || phone.length < 6 || careerName.length < 3) {
      res.status(400).json({ message: 'Nombre, teléfono y carrera son obligatorios.' });
      return;
    }
    if (!isValidEmail(personalEmail)) {
      res.status(400).json({
        status: 'error',
        message: 'El correo personal es obligatorio y debe tener un formato válido (ejemplo: nombre@gmail.com).',
      });
      return;
    }

    // Un teléfono ya usado para inscribirse no puede volver a generar otra cuenta.
    const existingStudent = await prisma.student.findFirst({ where: { phone } });
    if (existingStudent) {
      await prisma.whatsAppInscriptionRequest.create({
        data: { name, phone, careerName, personalEmail, status: 'DUPLICATE', studentCarnet: existingStudent.carnet },
      });
      res.status(409).json({
        status: 'duplicate',
        message: 'Este número de WhatsApp ya tiene una cuenta registrada.',
        carnet: existingStudent.carnet,
      });
      return;
    }

    const careers = await prisma.career.findMany({ where: { status: 'Activo' } });
    const normalizedTarget = stripAccents(careerName.toLowerCase());
    const career = careers.find((item) => stripAccents(item.name.toLowerCase()) === normalizedTarget)
      || careers.find((item) => stripAccents(item.name.toLowerCase()).includes(normalizedTarget)
        || normalizedTarget.includes(stripAccents(item.name.toLowerCase())));

    if (!career) {
      await prisma.whatsAppInscriptionRequest.create({
        data: { name, phone, careerName, personalEmail, status: 'PENDING_NO_CAREER' },
      });
      res.status(202).json({
        status: 'pending',
        message: 'Tu solicitud quedó registrada. Alguien del equipo de admisiones te va a contactar para continuar.',
      });
      enviarCorreosEnSegundoPlano('carrera no cargada', () =>
        notifyAdmissionsStaff(
          'Nueva solicitud de inscripción (WhatsApp)',
          `${name} (${phone}) quiere inscribirse en "${careerName}", pero esa carrera todavía no está cargada en el sistema. Requiere seguimiento manual.`,
        ),
      );
      return;
    }

    const plan = await prisma.curriculumPlan.findFirst({
      where: { careerId: career.code, status: 'Activo' },
      orderBy: { effectiveFrom: 'desc' },
      include: { campus: true },
    });

    if (!plan || !plan.campus) {
      await prisma.whatsAppInscriptionRequest.create({
        data: { name, phone, careerName: career.name, personalEmail, status: 'PENDING_NO_PLAN' },
      });
      res.status(202).json({
        status: 'pending',
        message: 'Tu solicitud quedó registrada. Alguien del equipo de admisiones te va a contactar para continuar.',
      });
      enviarCorreosEnSegundoPlano('carrera sin plan', () =>
        notifyAdmissionsStaff(
          'Nueva solicitud de inscripción (WhatsApp)',
          `${name} (${phone}) quiere inscribirse en ${career.name}, pero esa carrera todavía no tiene un plan curricular activo cargado. Requiere seguimiento manual.`,
        ),
      );
      return;
    }

    const email = await uniqueInstitutionalEmail(name);
    const carnet = await nextCarnet();
    const password = temporaryPassword();
    const userId = randomUUID();
    const currentCycle = await prisma.academicCycle.findFirst({
      where: { campusId: plan.campus.id, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    // Resuelto antes de abrir la transacción: es una operación find-or-create que
    // solo hace trabajo real la primera vez, y no debe correr con el cliente `tx`
    // (fuera de la transacción) ni consumir su ventana de tiempo (5s por defecto).
    const actorId = await ensureSystemActor();

    try {
      const student = await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            name,
            email,
            passwordHash: hashPassword(password),
            role: 'ESTUDIANTE',
            carnetOrCode: carnet,
            phone,
            department: career.name,
            mustChangePassword: true,
          },
        });
        const created = await tx.student.create({
          data: {
            carnet,
            name,
            email,
            phone,
            careerId: career.code,
            careerName: career.name,
            entryCycle: currentCycle?.id || 'PENDIENTE',
            jornada: 'Sabatina',
            status: 'Activo',
            totalCreditsRequired: plan.totalCredits,
            campusId: plan.campus!.id,
            planId: plan.id,
            userId,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'USER_CREATED_WHATSAPP_AGENT',
            entityType: 'STUDENT',
            entityId: carnet,
            actorId,
            details: JSON.stringify({ phone, careerName: career.name }),
          },
        });
        return created;
      });

      await prisma.whatsAppInscriptionRequest.create({
        data: { name, phone, careerName: career.name, personalEmail, status: 'CREATED', studentCarnet: carnet },
      });

      // Se responde AHORA, antes de enviar los correos. Crear la cuenta ya terminó;
      // el envío por SMTP puede tardar bastante (o colgarse si el host no alcanza al
      // servidor de correo) y el agente de WhatsApp corta la llamada a los ~20-40s.
      // Si esperáramos al correo, el aspirante recibiría "falló" aunque su cuenta sí
      // quedó creada, y el reintento chocaría con un 409 de duplicado.
      res.status(201).json({
        status: 'created',
        carnet,
        email,
        temporaryPassword: password,
        loginUrl: process.env.APP_URL || null,
        message: `Cuenta creada. Carné ${carnet}, correo ${email}. Las credenciales también se enviaron a ${personalEmail}.`,
      });

      // Notificaciones fuera del ciclo de respuesta. Si el envío falla, el correo
      // queda en la cola (email_outbox) para reintento manual; no afecta al aspirante,
      // que ya tiene sus credenciales en el chat de WhatsApp.
      enviarCorreosEnSegundoPlano('cuenta creada', async () => {
        // Las credenciales van al correo PERSONAL: el institucional recién creado
        // no lo puede abrir todavía sin estas mismas credenciales.
        await notifyUserAtEmail(
          userId,
          personalEmail,
          'Bienvenido/a a USPG',
          `Tu cuenta fue creada a partir de tu conversación por WhatsApp.\n\nCarné: ${carnet}\nCorreo institucional: ${email}\nContraseña temporal: ${password}\n\nDebes cambiar la contraseña la primera vez que inicies sesión.`,
          'SUCCESS',
          process.env.APP_URL,
        );
        await notifyAdmissionsStaff(
          'Cuenta creada automáticamente (WhatsApp)',
          `Se creó la cuenta de ${name} (carné ${carnet}, ${career.name}) a partir de una conversación de WhatsApp, sin revisión previa. Correo personal declarado: ${personalEmail}. Verifica que corresponda a una inscripción real.`,
          `/estudiantes/${carnet}`,
        );
      });
    } catch (error) {
      await prisma.whatsAppInscriptionRequest.create({
        data: {
          name,
          phone,
          careerName: career.name,
          personalEmail,
          status: 'ERROR',
          detail: error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido',
        },
      });
      throw error;
    }
  });
}
