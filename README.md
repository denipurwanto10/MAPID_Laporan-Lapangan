# Laporan Lapangan

Aplikasi web untuk mengelola laporan lapangan — **Express.js (TypeScript) + PostgreSQL (Supabase)**. Frontend React + Vite di Vercel, backend Express jalan sebagai Vercel Serverless Function di `/api/*`, database PostgreSQL di Supabase. Semua logika bisnis (workflow pending, audit trail, bulk, export Excel, proteksi hapus-baris-terakhir) dipertahankan.

## Arsitektur singkat

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   Frontend       │ ──► │   Express API     │ ──► │   PostgreSQL     │
│   (Vercel)       │     │   (Vercel         │     │   (Supabase)     │
│                  │     │   serverless /api)│     │   RLS + trigger  │
└──────────────────┘     └───────────────────┘     └──────────────────┘
```

Lihat **[ARCHITECTURE.md](./ARCHITECTURE.md)** untuk pemetaan 1:1 endpoint study case → implementasi.

## Fitur

- Buat laporan (nama + deskripsi, status otomatis `pending`)
- Tabel (desktop) / kartu (mobile), **No** berurutan per halaman
- Setujui / Tolak via dialog konfirmasi (optimistic UI + rollback)
- **Bulk approve/reject** atomik via Express (`PATCH /api/reports/bulk-status`)
- Status final terkunci; edit + hapus hanya untuk `pending`; **baris terakhir tidak bisa dihapus**
- Pencarian (debounce 350ms, highlight kuning), filter status, urutan Terbaru/Terlama, pagination, statistik, **Unduh Excel (.xlsx)**
- Empty-state berbeda per kondisi; auto-refresh 15 dtk; tema terang/gelap tersimpan

## 1. Database Supabase (~3 menit)

Gratis, **tanpa kartu kredit**.

1. https://supabase.com → **New project** → nama `mapid-laporan`, region **Singapore**
2. **SQL Editor** → jalankan berurutan:
   1. `backend/schema.sql`
   2. `backend/rls.sql` (RLS + trigger audit + grant anon)
   3. `backend/seed.sql` (5 laporan demo, idempoten)
3. **Project Settings → Data API** → catat host Session pooler (`aws-0-ap-southeast-1.pooler.supabase.com:5432`)
4. **Database → Connection string → Session pooler (URI)** → copy full string (format: `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify`)

## 2. Backend Express (lokal)

```bash
cd backend
cp .env.example .env   # isi DATABASE_URL dengan Session pooler URI
npm install
npm run dev            # http://localhost:3001
npm run lint && npm run typecheck && npm test
```

## 3. Frontend (lokal)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (butuh backend di :3001 agar /api tersedia)
npm run build && npm run lint && npm test
```

## Output

- **Link repository**: https://github.com/denipurwanto10/MAPID_Laporan-Lapangan
- **Aplikasi online (live)**: https://mapid-reports.vercel.app
  - API: https://mapid-reports.vercel.app/api/health · https://mapid-reports.vercel.app/api/reports
- **Cara menjalankan**: lihat section [2](#2-backend-express-lokal) dan [3](#3-frontend-lokal) di bawah.

## 4. Deploy (Vercel)

Import repo → set **Secret** `DATABASE_URL` (Session pooler URI lengkap, Production + Preview + Development) → Deploy.

- `vercel.json`: `buildCommand: npm run build`, `outputDirectory: frontend/dist`, `installCommand: npm --prefix backend install && npm --prefix frontend install`, `functions: api/**/*.ts` (30s, 1024MB).
- Frontend tidak butuh env var apa pun — hanya memanggil `/api` di origin yang sama.

## Struktur repository

```
Mapid_Rekrutmen/
├── api/                      # Vercel serverless entry (route eksplisit, re-export dari _lib/app)
│   ├── _lib/app.ts           # createApp + createPool, tanpa listen()
│   ├── health.ts
│   └── reports/
│       ├── index.ts            # GET list + POST create
│       ├── bulk-status.ts        # PATCH bulk approve/reject
│       ├── export.xlsx.ts        # GET export Excel
│       └── [id]/
│           ├── index.ts          # GET detail + PATCH edit + DELETE
│           ├── status.ts         # PATCH status
│           └── history.ts        # GET history
├── backend/                  # Express.js (TypeScript) — sumber kebenaran API
│   ├── src/                  # app.ts, db.ts, store.ts, validation.ts, exportXlsx.ts, ...
│   ├── tests/                # 47 tests
│   ├── schema.sql, rls.sql, seed.sql
│   └── .env.example          # template DATABASE_URL
├── frontend/                 # React + Vite + TS + Tailwind v4 + shadcn/ui
│   ├── src/
│   │   ├── components/       # ui/* + reports/* + layout/*
│   │   ├── hooks/            # useReports, useTheme, useMediaQuery
│   │   ├── lib/              # api.ts (Express /api), export.ts, format.ts
│   │   └── types/report.ts
│   └── .env.example
├── .github/workflows/ci.yml  # backend (lint+typecheck+test) + frontend (lint+test+build)
├── ARCHITECTURE.md           # pemetaan endpoint study case → implementasi
└── README.md
```

## Catatan

- Jejak audit dicatat trigger DB `trg_status_history` (`SECURITY DEFINER`) — tepat satu entri per perubahan, untuk semua jalur tulis.
- Trigger `protect_created_at` mengunci `created_at` dari client.
- Backend memakai Session pooler (port 5432, IPv4 proxy) — Direct connection IPv6 tidak bisa dipakai Vercel, Transaction pooler berisiko `prepared statement already exists`.
- Pool dikonfig `max:1` + `idleTimeout:10s` aman untuk serverless.
- Zero-cost, no credit card: Vercel (frontend + serverless) + Supabase Free.
