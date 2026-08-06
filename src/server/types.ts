import type express from 'express';
import type { PrismaClient } from '../generated/prisma/client';
import type PDFDocumentType from 'pdfkit';
import type QRCodeType from 'qrcode';
import type XLSXType from 'xlsx';
import type nodemailerType from 'nodemailer';
import type { GoogleGenAI } from '@google/genai';

export type AppPrisma = PrismaClient;

export type ServerHelpers = {
  // Token / session
  hashToken: (token: string) => string;
  parseCookies: (header?: string) => Record<string, string>;
  readSessionToken: (req: express.Request) => string | undefined;
  sessionCookie: string;
  sessionCookieOptions: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string };

  // MFA
  encryptMfaSecret: (value: string) => string;
  decryptMfaSecret: (value: string) => string;
  totpAt: (secret: string, timestamp?: number) => string;
  matchingTotpStep: (secret: string, code: string) => number | null;
  defaultMfaRequiredRoles: string[];
  getMfaRequiredRoles: () => Promise<string[]>;

  // Notifications
  notifyUser: (userId: string, title: string, message: string, type?: string, link?: string) => Promise<void>;
  notifyByCarnet: (carnet: string, title: string, message: string, type?: string, link?: string) => Promise<void>;

  // Response helpers
  sendOk: (res: express.Response, data?: object) => express.Response;
  sendError: (res: express.Response, status: number, message: string) => express.Response;
  handleUniqueError: (error: unknown, res: express.Response) => boolean;

  // Gemini / assistant
  gemini: InstanceType<typeof GoogleGenAI> | null;
  improveAssistantAnswer: (question: string, role: string, answer: string) => Promise<string>;
  answerWithGemini: (question: string, role: string, context: string, fallback: string) => Promise<string>;
  assistantHistory: (history: unknown) => string;

  // Auth / rate limiting
  loginAttempts: Map<string, { count: number; blockedUntil: number }>;
  passwordRecoveryRequests: Map<string, number>;
  loginAttemptKey: (username: string) => string;
  registerFailedLogin: (key: string) => void;

  // Finance helpers
  createReceiptPdf: (data: any) => any;
  createStatementPdf: (data: any) => any;

  // Misc helpers used in auth/admin routes
  temporaryPassword: () => string;
  roleFromEmail: (email: string) => string | null;
  verifyPassword: (password: string, stored: string) => boolean;
  hashPassword: (password: string) => string;
  passwordPolicyError: (password: string) => string | null;
  publicUser: (user: any, requiredRoles?: string[]) => object;
  createAuthenticatedSession: (res: express.Response, userId: string, rememberMe: boolean) => Promise<void>;
  mailTransport: ReturnType<typeof nodemailerType.createTransport> | null;
  deliverOutboxEmail: (outboxId: string) => Promise<void>;
  emailHtml: (title: string, message: string, link?: string, hasLogo?: boolean) => string;

  // Libraries passed through
  PDFDocument: typeof PDFDocumentType;
  QRCode: typeof QRCodeType;
  XLSX: typeof XLSXType;
  nodemailer: typeof nodemailerType;
};

export type AuthMiddleware = {
  requireAdmin: express.RequestHandler;
  requireUser: express.RequestHandler;
  requireLibraryStaff: express.RequestHandler;
  requireParkingStaff: express.RequestHandler;
  requireSystems: express.RequestHandler;
};
