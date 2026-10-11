import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { DbQuery } from './db';
import { asyncHandler, errorHandler, notFoundHandler } from './errors';
import {
  EXPORT_MIME,
  EXPORT_ROW_MAX,
  buildExportXlsx,
  exportContextFromQuery,
  exportFilename,
} from './exportXlsx';
import { createRateLimiter } from './rateLimit';
import {
  bulkUpdateReportStatus,
  createReport,
  deleteReport,
  getHistory,
  getReportById,
  getSummary,
  listAllForExport,
  listReports,
  updateReport,
  updateReportStatus,
} from './store';
import {
  parseListQuery,
  parseReportId,
  validateBulkStatusChange,
  validateCreateReport,
  validateStatusChange,
  validateUpdateReport,
} from './validation';

export interface AppOptions {
  corsOrigin?: string;
  /** Batas POST /api/reports per IP per menit. Default 30. */
  createLimitMax?: number;
  /** Batas PATCH/DELETE per IP per menit. Default 120. */
  writeLimitMax?: number;
  /** Batas GET /api/reports/export.xlsx per IP per menit. Default 10. */
  exportLimitMax?: number;
}

export function createApp(db: DbQuery, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  // Wajib saat di-deploy di balik proxy (Render/Fly/Vercel): tanpa ini req.ip selalu
  // IP proxy sehingga rate-limit per IP tidak berfungsi (semua user terbaca 1 IP).
  app.set('trust proxy', 1);
  app.use(helmet());

  const origins = (options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length === 1 ? origins[0] : origins }));
  app.use(express.json({ limit: '100kb' }));

  // Anti-spam pengiriman laporan: 30x/menit/IP cukup untuk pemakaian wajar.
  const createLimiter = createRateLimiter({
    windowMs: 60_000,
    max: options.createLimitMax ?? 30,
  });
  // Batasi spam ubah status/isi/hapus: 120x/menit/IP — normal jauh di bawah ini.
  const writeLimiter = createRateLimiter({
    windowMs: 60_000,
    max: options.writeLimitMax ?? 120,
  });
  // Unduh Excel berat (satu file sampai 5000 baris): 10x/menit/IP.
  const exportLimiter = createRateLimiter({
    windowMs: 60_000,
    max: options.exportLimitMax ?? 10,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { ok: true, time: new Date().toISOString() } });
  });

  app.get(
    '/api/reports',
    asyncHandler(async (req, res) => {
      const q = parseListQuery(req.query);
      const [{ items, total }, summary] = await Promise.all([
        listReports(db, q),
        getSummary(db),
      ]);
      res.json({
        success: true,
        data: items,
        meta: { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
        summary,
      });
    }),
  );

  app.get(
    '/api/reports/export.xlsx',
    exportLimiter,
    asyncHandler(async (req, res) => {
      // Satu request, satu query: jauh lebih ringan daripada loop per-halaman dari frontend.
      // Ditempatkan sebelum '/api/reports/:id/...' agar 'export.xlsx' tak dibaca sebagai :id.
      const q = parseListQuery(req.query);
      const tzRaw = typeof req.query.tz === 'string' ? Number(req.query.tz) : NaN;
      const tz = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 840 ? tzRaw : 0;
      const { rows, truncated } = await listAllForExport(db, q, EXPORT_ROW_MAX);
      const buf = await buildExportXlsx(rows, exportContextFromQuery(q, tz));
      res.setHeader('Content-Type', EXPORT_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
      if (truncated) res.setHeader('X-Export-Truncated', `true; limit=${EXPORT_ROW_MAX}`);
      res.send(buf);
    }),
  );

  // Bulk approve/reject satu request — ditaruh sebelum rute ':id' agar tidak
  // terbaca sebagai id. Hanya baris pending yang berubah; mengembalikan yang berubah + yang dilewati.
  app.patch(
    '/api/reports/bulk-status',
    writeLimiter,
    asyncHandler(async (req, res) => {
      const { ids, status } = validateBulkStatusChange(req.body);
      const result = await bulkUpdateReportStatus(db, ids, status);
      res.json({ success: true, data: result });
    }),
  );

  app.get(
    '/api/reports/:id',
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      res.json({ success: true, data: await getReportById(db, id) });
    }),
  );

  app.get(
    '/api/reports/:id/history',
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      res.json({ success: true, data: await getHistory(db, id) });
    }),
  );

  app.post(
    '/api/reports',
    createLimiter,
    asyncHandler(async (req, res) => {
      const { nama, deskripsi } = validateCreateReport(req.body);
      const report = await createReport(db, nama, deskripsi);
      res.status(201).json({ success: true, data: report });
    }),
  );

  app.patch(
    '/api/reports/:id/status',
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const status = validateStatusChange(req.body);
      const report = await updateReportStatus(db, id, status);
      res.json({ success: true, data: report });
    }),
  );

  app.patch(
    '/api/reports/:id',
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      const { nama, deskripsi } = validateUpdateReport(req.body);
      const report = await updateReport(db, id, nama, deskripsi);
      res.json({ success: true, data: report });
    }),
  );

  app.delete(
    '/api/reports/:id',
    writeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseReportId(req.params.id);
      await deleteReport(db, id);
      res.json({ success: true, data: { id } });
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
