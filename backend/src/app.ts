import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AppError, asyncHandler, errorHandler, notFoundHandler } from './errors';
import { authenticate, createSession, hashPassword, revokeSession, revokeUserSessions } from './auth';
import { requireAdmin, requireAuth, requireDecider, requireReporter } from './authMiddleware';
import { createRateLimiter } from './rateLimit';
import type { DbQuery } from './db';
import {
  EXPORT_MIME,
  EXPORT_ROW_MAX,
  buildExportXlsx,
  exportContextFromQuery,
  exportFilename,
} from './exportXlsx';
import {
  bulkUpdateReportStatus,
  countReports,
  createReport,
  deleteReport,
  getHistory,
  getReportById,
  getSummary,
  listAllForExport,
  listReports,
  listUsers,
  updateReport,
  updateReportStatus,
} from './store';
import {
  parseListQuery,
  parseReportId,
  validateBulkStatusChange,
  validateCreateReport,
  validateCreateUser,
  validateLogin,
  validateStatusChange,
  validateUpdateReport,
  validateUpdateUser,
} from './validation';

export interface AppOptions {
  corsOrigin?: string;
  createLimitMax?: number;
  writeLimitMax?: number;
  exportLimitMax?: number;
  /** Batas login per IP per menit. Default 10. */
  authLimitMax?: number;
}

export function createApp(db: DbQuery, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());

  const origins = (options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length === 1 ? origins[0] : origins }));
  app.use(express.json({ limit: '100kb' }));

  const createLimiter = createRateLimiter({ windowMs: 60_000, max: options.createLimitMax ?? 30 });
  const writeLimiter = createRateLimiter({ windowMs: 60_000, max: options.writeLimitMax ?? 120 });
  const exportLimiter = createRateLimiter({ windowMs: 60_000, max: options.exportLimitMax ?? 10 });
  const authLimiter = createRateLimiter({ windowMs: 60_000, max: options.authLimitMax ?? 10 });

  // ---------- Publik (tanpa login) ----------

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { ok: true, time: new Date().toISOString() } });
  });

  app.post(
    '/api/auth/login',
    authLimiter,
    asyncHandler(async (req, res) => {
      const { username, password } = validateLogin(req.body);
      const user = await authenticate(db, username, password);
      const token = await createSession(db, user.id);
      res.json({ success: true, data: { user, token } });
    }),
  );

  // ---------- Butuh login untuk semua rute di bawah ----------

  const auth = requireAuth(db);

  app.post(
    '/api/auth/logout',
    auth,
    asyncHandler(async (req, res) => {
      if (req.sessionToken) await revokeSession(db, req.sessionToken);
      res.json({ success: true, data: { ok: true } });
    }),
  );

  app.get(
    '/api/auth/me',
    auth,
    asyncHandler(async (req, res) => {
      res.json({ success: true, data: req.user });
    }),
  );

  // ---------- Manajemen akun (hanya admin) ----------

  app.get('/api/users', auth, requireAdmin, asyncHandler(async (_req, res) => {
    const users = await listUsers(db);
    res.json({ success: true, data: users });
  }));

  app.post(
    '/api/users',
    auth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { username, password, role } = validateCreateUser(req.body);
      const password_hash = hashPassword(password);
      try {
        const result = await db.query(
          `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3::user_role)
           RETURNING id, username, role, created_at`,
          [username, password_hash, role],
        );
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
          throw new AppError(409, 'Username sudah terpakai');
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/users/:id',
    auth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const patch = validateUpdateUser(req.body);
      const current = await db.query(`SELECT id, username, role FROM users WHERE id = $1`, [id]);
      if (current.rows.length === 0) throw new AppError(404, 'Akun tidak ditemukan');

      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.username !== undefined) {
        params.push(patch.username);
        sets.push(`username = $${params.length}`);
      }
      if (patch.password !== undefined) {
        params.push(hashPassword(patch.password));
        sets.push(`password_hash = $${params.length}`);
      }
      if (patch.role !== undefined) {
        params.push(patch.role);
        sets.push(`role = $${params.length}::user_role`);
      }
      // Cegah admin mengubah role dirinya sendiri menjadi non-admin bila dia satu-satunya admin.
      if (patch.role !== undefined && patch.role !== 'admin' && req.user!.id === id) {
        const adminCount = await db.query(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`);
        if ((adminCount.rows[0] as { c: number }).c <= 1) {
          throw new AppError(409, 'Tidak bisa menurunkan peran — Anda satu-satunya admin');
        }
      }

      params.push(id);
      try {
        const result = await db.query(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
           RETURNING id, username, role, created_at`,
          params,
        );
        if (patch.password !== undefined) {
          await revokeUserSessions(db, id);
        }
        res.json({ success: true, data: result.rows[0] });
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
          throw new AppError(409, 'Username sudah terpakai');
        }
        throw err;
      }
    }),
  );

  app.delete(
    '/api/users/:id',
    auth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      if (req.user!.id === id) throw new AppError(409, 'Tidak bisa menghapus akun sendiri');

      const target = await db.query(`SELECT id, role FROM users WHERE id = $1`, [id]);
      const row = target.rows[0] as { id: number; role: string } | undefined;
      if (!row) throw new AppError(404, 'Akun tidak ditemukan');

      // Jangan sampai menyisakan aplikasi tanpa admin sama sekali.
      if (row.role === 'admin') {
        const adminCount = await db.query(
          `SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`,
        );
        if ((adminCount.rows[0] as { c: number }).c <= 1) {
          throw new AppError(409, 'Tidak bisa menghapus admin terakhir');
        }
      }

      await db.query(`DELETE FROM users WHERE id = $1`, [id]);
      res.json({ success: true, data: { id } });
    }),
  );

  // ---------- Laporan (butuh login; cakupan dibatasi di store) ----------

  app.get(
    '/api/reports',
    auth,
    asyncHandler(async (req, res) => {
      const q = parseListQuery(req.query);
      const user = req.user!;
      const total = await countReports(db, q, user);
      // Halaman di luar jangkauan (mis. akibat filter/hapus) dikembalikan ke
      // halaman terakhir yang benar-benar ada, supaya daftar tidak kosong.
      const totalPages = Math.max(1, Math.ceil(total / q.limit));
      const page = Math.min(q.page, totalPages);
      const requests = [
        listReports(db, { ...q, page }, user),
        getSummary(db, q, user),
      ];
      const [items, summary] = await Promise.all(requests);
      res.json({
        success: true,
        data: items,
        meta: { total, page, limit: q.limit, totalPages },
        summary,
      });
    }),
  );

  app.get(
    '/api/reports/export.xlsx',
    auth,
    exportLimiter,
    asyncHandler(async (req, res) => {
      const q = parseListQuery(req.query);
      const user = req.user!;
      const tzRaw = typeof req.query.tz === 'string' ? Number(req.query.tz) : NaN;
      const tz = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 840 ? tzRaw : 0;
      const { rows, truncated } = await listAllForExport(db, q, user, EXPORT_ROW_MAX);
      const buf = await buildExportXlsx(rows, exportContextFromQuery(q, tz));
      res.setHeader('Content-Type', EXPORT_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
      if (truncated) res.setHeader('X-Export-Truncated', `true; limit=${EXPORT_ROW_MAX}`);
      res.send(buf);
    }),
  );

  app.patch(
    '/api/reports/bulk-status',
    auth,
    requireDecider,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const { ids, status } = validateBulkStatusChange(req.body);
      const result = await bulkUpdateReportStatus(db, ids, status, req.user!);
      res.json({ success: true, data: result });
    }),
  );

  app.get(
    '/api/reports/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const report = await getReportById(db, id);
      // Pelapor hanya boleh melihat laporan miliknya.
      if (req.user!.role === 'pelapor' && report.reporter_id !== req.user!.id) {
        throw new AppError(403, 'Anda hanya bisa melihat laporan milik sendiri');
      }
      res.json({ success: true, data: report });
    }),
  );

  app.get(
    '/api/reports/:id/history',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      // Cek akses dulu seperti detail — pelapor tidak bisa intip riwayat orang lain.
      const report = await getReportById(db, id);
      if (req.user!.role === 'pelapor' && report.reporter_id !== req.user!.id) {
        throw new AppError(403, 'Anda hanya bisa melihat laporan milik sendiri');
      }
      res.json({ success: true, data: await getHistory(db, id) });
    }),
  );

  app.post(
    '/api/reports',
    auth,
    requireReporter,
    createLimiter,
    asyncHandler(async (req, res) => {
      const { nama, deskripsi } = validateCreateReport(req.body);
      const report = await createReport(db, nama, deskripsi, req.user!);
      res.status(201).json({ success: true, data: report });
    }),
  );

  app.patch(
    '/api/reports/:id/status',
    auth,
    requireDecider,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const status = validateStatusChange(req.body);
      const report = await updateReportStatus(db, id, status, req.user!);
      res.json({ success: true, data: report });
    }),
  );

  app.patch(
    '/api/reports/:id',
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const { nama, deskripsi } = validateUpdateReport(req.body);
      const report = await updateReport(db, id, nama, deskripsi, req.user!);
      res.json({ success: true, data: report });
    }),
  );

  app.delete(
    '/api/reports/:id',
    auth,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      await deleteReport(db, id, req.user!);
      res.json({ success: true, data: { id } });
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
