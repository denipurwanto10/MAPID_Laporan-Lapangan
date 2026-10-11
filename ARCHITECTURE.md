# Arsitektur — Pemetaan Study Case ke Supabase

Study case meminta **Express.js + PostgreSQL**. Project ini memakai **Supabase** (PostgreSQL + PostgREST + RLS + Edge Functions), komponen yang **diizinkan** dalam dokumen.

Dokumen ini menjelaskan pemetaan 1:1 antara endpoint yang diminta dan implementasi Supabase.

## Kenapa Supabase menggantikan Express di sini

| Peran | Express (umum) | Supabase (dipakai) |
|---|---|---|
| Menyajikan REST API | Route `app.ts` + `store.ts` | **PostgREST** — tiap tabel otomatis jadi `GET/POST/PATCH/DELETE /rest/v1/<tabel>` |
| Validasi status | `validation.ts`, `if (status !== 'pending') 409` | **RLS policy** `reports_insert_pending_only`, `reports_update_pending_only` |
| Cegah hapus baris terakhir | `store.ts` cek `count(*)` | **RLS policy** `reports_delete_pending_not_last` (`count(*) > 1`) |
| Jejak perubahan status | `INSERT INTO report_status_history` manual | **Trigger** `log_status_change()` — `SECURITY DEFINER` agar tidak tertahan RLS anon |
| Kunci `created_at` | Hanya menerima `{ nama, deskripsi }` di handler | **Trigger** `protect_created_at()` |
| Unduh Excel | `exportXlsx.ts` (exceljs) | **Edge Function** `export-xlsx` (Deno + SheetJS) |
| Bulk approve/reject | `PATCH /api/reports/bulk-status` | **Edge Function** `bulk-status` |
| Rate-limit | `rateLimit.ts` (in-memory) | **Supabase rate-limit** bawaan (konfigurasi dashboard) |

## Pemetaan endpoint

| Study case (Express) | Implementasi Supabase |
|---|---|
| `GET /api/reports?page&limit&status&q&sort&order` | `GET /rest/v1/reports?select=*&status=eq.<v>&order=created_at.desc` + `Prefer: count=exact` |
| `GET /api/reports/:id` | `GET /rest/v1/reports?id=eq.<id>&select=*` |
| `GET /api/reports/:id/history` | `GET /rest/v1/report_status_history?report_id=eq.<id>&order=changed_at.desc` |
| `POST /api/reports` `{ nama, deskripsi }` | `POST /rest/v1/reports` `{ nama, deskripsi, status: 'pending' }` (RLS menolak selain pending) |
| `PATCH /api/reports/:id/status` `{ status }` | `PATCH /rest/v1/reports?id=eq.<id>` `{ status }` (RLS: USING `status='pending'`) |
| `PATCH /api/reports/:id` `{ nama, deskripsi }` | `PATCH /rest/v1/reports?id=eq.<id>` `{ nama, deskripsi }` |
| `PATCH /api/reports/bulk-status` `{ ids, status }` | `POST /functions/v1/bulk-status` `{ ids, status }` |
| `DELETE /api/reports/:id` | `DELETE /rest/v1/reports?id=eq.<id>` |
| `GET /api/reports/export.xlsx?status&q&tz` | `GET /functions/v1/export-xlsx?status&q&tz` (return `.xlsx` binary) |

Frontend (`frontend/src/lib/api.ts`) membungkus semua endpoint di atas dengan interface TypeScript yang sama seperti versi Express, sehingga `hooks/useReports.ts` dan komponen tidak perlu diubah.

## Keamanan

- Frontend hanya menyimpan **publishable key** (anon). Semua aturan tulis ditegakkan **RLS di database**, bukan di client.
- `log_status_change()` memakai `SECURITY DEFINER` — tanpanya, INSERT audit akan gagal karena anon tidak punya policy INSERT di `report_status_history`.
- `protect_created_at()` menolak perubahan `created_at` dari client.

## Catatan implementasi

Semua aturan tulis ditegakkan di layer database, bukan di kode aplikasi. Kode Express asli tidak ada di repository ini — arsitektur dibangun langsung di atas Supabase sejak awal.

## File terkait

- `supabase/migrations/001_initial_schema.sql` — skema (pengganti `backend/schema.sql`)
- `supabase/migrations/002_rls_policies_and_trigger.sql` — RLS + trigger pengganti validasi Express
- `supabase/migrations/003_seed_data.sql` — seed 5 pending (pengganti `backend/seed.sql`)
- `supabase/functions/export-xlsx/index.ts`
- `supabase/functions/bulk-status/index.ts`
- `supabase/config.toml`
- `frontend/src/lib/api.ts` — client Supabase
