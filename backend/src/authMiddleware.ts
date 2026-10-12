import type { NextFunction, Request, Response } from 'express';
import type { DbQuery } from './db';
import { AppError, asyncHandler } from './errors';
import { resolveSession } from './auth';
import { ADMIN_ROLES, DECIDER_ROLES, REPORTER_ROLES, type UserRole } from './types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identitas hasil login; diisi oleh requireAuth. */
      user?: import('./types').AuthUser;
      /** Token sesi mentah — dipakai revoke saat logout. */
      sessionToken?: string;
    }
  }
}

/** Header tempat token sesi dikirim (menerima "Bearer <token>" atau token polos). */
export const AUTH_HEADER = 'authorization';

function readToken(req: Request): string | null {
  const raw = req.headers[AUTH_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim();
  const token = trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : trimmed;
  return token || null;
}

/**
 * Wajibkan login. Tanpa token valid → 401.
 * Identitas disimpan di req.user untuk handler dan pengecekan peran berikutnya.
 */
export function requireAuth(db: DbQuery) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) {
      throw new AppError(401, 'Belum masuk. Silakan login terlebih dahulu.');
    }
    const user = await resolveSession(db, token);
    if (!user) {
      throw new AppError(401, 'Sesi tidak valid atau sudah berakhir. Silakan login ulang.');
    }
    req.user = user;
    req.sessionToken = token;
    next();
  });
}

/** Pastikan user yang login punya salah satu dari peran yang diizinkan. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new AppError(401, 'Belum masuk. Silakan login terlebih dahulu.'));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new AppError(403, 'Peran Anda tidak diizinkan melakukan tindakan ini'));
      return;
    }
    next();
  };
}

/** Helper peran — approver/admin boleh approve/reject (termasuk revisi). */
export const requireDecider = requireRole(...DECIDER_ROLES);
/** Admin/pelapor boleh membuat laporan. */
export const requireReporter = requireRole(...REPORTER_ROLES);
/** Hanya admin yang boleh mengelola akun pengguna. */
export const requireAdmin = requireRole(...ADMIN_ROLES);