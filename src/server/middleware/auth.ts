import type express from 'express';
import type { AppPrisma, AuthMiddleware } from '../types';

export function createAuthMiddleware(
  prisma: AppPrisma,
  hashToken: (token: string) => string,
  getMfaRequiredRoles: () => Promise<string[]>,
  readSessionToken: (req: express.Request) => string | undefined,
): AuthMiddleware {
  const blockUntilMfaEnrollment = async (req: express.Request, res: express.Response, user: { role: string; mfaEnabled: boolean }) => {
    if (user.mfaEnabled || req.path.startsWith('/api/auth/mfa/') || req.path === '/api/auth/change-password') return false;
    const requiredRoles = await getMfaRequiredRoles();
    if (!requiredRoles.includes(user.role)) return false;
    res.status(428).json({ message: 'Debes configurar la autenticación multifactor antes de continuar.', code: 'MFA_ENROLLMENT_REQUIRED' });
    return true;
  };

  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      if (!token) {
        res.status(401).json({ message: 'Debes iniciar sesión.' });
        return;
      }
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.expiresAt <= new Date() || !session.user.active) {
        res.status(401).json({ message: 'La sesión no es válida.' });
        return;
      }
      if (session.user.role !== 'ADMIN') {
        res.status(403).json({ message: 'Solo un administrador puede realizar esta acción.' });
        return;
      }
      if (await blockUntilMfaEnrollment(req, res, session.user)) return;
      res.locals.authUser = session.user;
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireUser: express.RequestHandler = async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      if (!token) return void res.status(401).json({ message: 'Debes iniciar sesión.' });
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.expiresAt <= new Date() || !session.user.active) {
        return void res.status(401).json({ message: 'La sesión no es válida.' });
      }
      if (await blockUntilMfaEnrollment(req, res, session.user)) return;
      if (session.user.role === 'SISTEMAS' && !['/api/systems', '/api/auth/', '/api/notifications'].some((prefix) => req.path.startsWith(prefix))) {
        return void res.status(403).json({ message: 'El rol Sistemas no tiene acceso a módulos académicos, financieros ni administrativos.' });
      }
      res.locals.authUser = session.user;
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireLibraryStaff: express.RequestHandler = (_req, res, next) =>
    ['BIBLIOTECA'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Biblioteca.' });

  const requireParkingStaff: express.RequestHandler = (_req, res, next) =>
    ['PARQUEO', 'EVENTOS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Parqueo.' });

  const requireSystems: express.RequestHandler = (_req, res, next) =>
    res.locals.authUser?.role === 'SISTEMAS' ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Sistemas.' });

  const requireRegistro: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'REGISTRO'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Registro Académico.' });

  const requireFinance: express.RequestHandler = (_req, res, next) =>
    ['ADMIN', 'FINANZAS'].includes(res.locals.authUser?.role) ? next() : void res.status(403).json({ message: 'Acción disponible únicamente para Administración Financiera.' });

  return { requireAdmin, requireUser, requireLibraryStaff, requireParkingStaff, requireSystems, requireRegistro, requireFinance };
}
