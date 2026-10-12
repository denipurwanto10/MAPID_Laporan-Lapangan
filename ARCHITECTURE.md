# Arsitektur — Express.js Serverless di Vercel + PostgreSQL (Supabase)

Study case meminta **Express.js (TypeScript) + PostgreSQL**. Project ini menjalankan Express sebagai **Vercel Serverless Function** di `/api/*` dan database PostgreSQL di **Supabase** (diizinkan soal).

## Mengapa arsitektur ini

| Peran | Implementasi |
|---|---|
| REST API server | Express (`backend/src/app.ts`) → deploy sebagai **satu** Vercel Serverless Function (`api/**/*.ts`) |
| Database | PostgreSQL Supabase (Session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432`, `max:1`, `idle:10s`) |
| Validasi status | `backend/src/validation.ts` + RLS policy di DB (defense in depth) |
| Cegah hapus baris terakhir | `backend/src/store.ts` + RLS policy `reports_delete_pending_not_last` |
| Jejak perubahan status | Trigger DB `log_status_change()` (`SECURITY DEFINER`) — **satu sumber kebenaran**, berlaku untuk semua jalur tulis (Express, PostgREST, psql) |
| Kunci `created_at` | Trigger DB `protect_created_at()` (menolak UPDATE pada `created_at`) |
| Unduh Excel (.xlsx) | `backend/src/exportXlsx.ts` (exceljs 4.4) — `GET /api/reports/export.xlsx` |
| Bulk approve/reject | `backend/src/store.bulkUpdateReportStatus` — `PATCH /api/reports/bulk-status` |
| Rate-limit | `backend/src/rateLimit.ts` (in-memory per instance) |

## Pemetaan endpoint

| Study case (Express) | Vercel Serverless Function |
|---|---|
| `GET /api/reports?page&limit&status&q&sort&order` | `GET /api/reports` (handler `api/reports/index.ts` → `app.get(/reports)`) |
| `GET /api/reports/:id` | `GET /api/reports/:id` (handler `api/reports/[id]/index.ts`) |
| `GET /api/reports/:id/history` | `GET /api/reports/:id/history` (handler `api/reports/[id]/history.ts`) |
| `POST /api/reports` `{ nama, deskripsi }` | `POST /api/reports` (handler `api/reports/index.ts`) |
| `PATCH /api/reports/:id/status` `{ status }` | `PATCH /api/reports/:id/status` (handler `api/reports/[id]/status.ts`) |
| `PATCH /api/reports/:id` `{ nama, deskripsi }` | `PATCH /api/reports/:id` (handler `api/reports/[id]/index.ts`) |
| `PATCH /api/reports/bulk-status` `{ ids, status }` | `PATCH /api/reports/bulk-status` (handler `api/reports/bulk-status.ts`) |
| `DELETE /api/reports/:id` | `DELETE /api/reports/:id` (handler `api/reports/[id]/index.ts`) |
| `GET /api/reports/export.xlsx?status&q&order&tz` | `GET /api/reports/export.xlsx` (handler `api/reports/export.xlsx.ts`) |

## Keamanan

- **DATABASE_URL** diisi sebagai **Secret** di Vercel (Production + Preview + Development).
- Frontend **tidak menyimpan key Supabase** — hanya memanggil Express API di `/api`.
- RLS di PostgreSQL melindungi data walau ada yang bypass Express (PostgREST/psql).
- Trigger `log_status_change()` pakai `SECURITY DEFINER` supaya anon bisa INSERT audit.
- Trigger `protect_created_at()` mengunci `created_at` dari client.

## File terkait

- `backend/src/app.ts` — routing Express, rate-limit, CORS
- `backend/src/db.ts` — pool pg (ssl `no-verify`, `max:1`, `idleTimeout:10s`)
- `backend/src/store.ts` — query layer (CRUD, bulk, export, audit via trigger)
- `backend/src/validation.ts` — validasi input (Zod-like manual)
- `backend/src/exportXlsx.ts` — workbook Excel profesional (exceljs 4.4)
- `backend/src/errors.ts`, `rateLimit.ts`, `types.ts` — utilitas
- `api/_lib/app.ts` — entry point bersama Vercel serverless (createApp + createPool, **tanpa** `listen()`)
- `api/health.ts`, `api/reports/index.ts`, `api/reports/[id]/index.ts`, `api/reports/[id]/status.ts`, `api/reports/[id]/history.ts`, `api/reports/bulk-status.ts`, `api/reports/export.xlsx.ts` — route files eksplisit (re-export default dari `_lib/app`)
- `backend/schema.sql`, `backend/rls.sql`, `backend/seed.sql` — skema + RLS + seed (untuk Supabase SQL Editor)
- `backend/.env.example` — template `DATABASE_URL` (Session pooler, `sslmode=no-verify`)
- `vercel.json` — `buildCommand: npm run build`, `outputDirectory: frontend/dist`, `functions: api/**/*.ts` (30s, 1024MB)
- `frontend/src/lib/api.ts` — client Express (`API_BASE=/api`)
- `frontend/src/lib/export.ts` — download Excel dari `/api/reports/export.xlsx`

## Catatan implementasi

1. Express di-restore dari commit `0460b21` (versi kanonik yang 47/47 test hijau).
2. Catch-all `[[...path]].ts` dihapus — hanya petakan 1 level. Route eksplisit 7 file memastikan `/api/reports/:id/*` tidak 404 platform.
3. Pool pg dikonfig `max:1` + `idle:10s` aman untuk serverless (satu koneksi per instance).
4. SSL pooler Supabase self-signed → `sslmode=no-verify` dinormalisasi di `db.ts` via `new URL()`.
5. Trigger DB **satu-satunya** penulis audit: `store.ts` **tidak** INSERT manual ke `report_status_history` (menghindari duplikasi).
6. Bulk status dipindahkan dari Edge Function ke Express agar satu jalur tulis & audit konsisten.
7. Frontend deps **tanpa** `@supabase/supabase-js` — hanya Express API.
8. `npm workspaces` dihapus (root lock win32-only merusak `npm ci` Linux). Dua folder independen + `npm --prefix` scripts + `install:all`.
9. `vercel.json` tanpa `framework` / `rootDirectory` (invalid value → Deploy Error). Framework `vite` di-set otomatis, build/output di `vercel.json`.

## Zero-cost, no credit card

- Frontend: Vercel (gratis, 100 GB bandwidth, no card).
- Backend: Vercel Serverless Function (gratis, 100 jam/bln, no card).
- Database: Supabase Free (PostgreSQL 0.5 GB, Edge Functions 500k/bln, no card).

Semua komponen jalan tanpa biaya dan tanpa kartu kredit.
