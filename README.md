# Laporan Lapangan

Aplikasi web sederhana untuk mengelola laporan lapangan — **100% Supabase** (PostgreSQL + RLS + Edge Functions), tanpa backend server sendiri. Frontend: React + Vite + TypeScript + Tailwind v4 + shadcn/ui.

## Arsitektur singkat

```
┌──────────────────┐       ┌──────────────────┐
│   Frontend       │ ◄────► │   Supabase       │
│   (Vercel)       │        │   • Postgres     │
│   supabase-js    │        │   • RLS          │
│                  │        │   • Edge Fns     │
└──────────────────┘        └──────────────────┘
```

## Fitur

- Buat laporan (nama + deskripsi, status otomatis `pending` via RLS)
- Tabel (desktop) / kartu (mobile), **No** berurutan per halaman
- Setujui / Tolak via dialog konfirmasi (optimistic UI + rollback)
- **Bulk approve/reject** via Edge Function
- Status final terkunci; edit + hapus hanya untuk `pending`; **baris terakhir tidak bisa dihapus** (RLS)
- Pencarian (debounce 350ms, highlight kuning), filter status, urutan Terbaru/Terlama, pagination, statistik, **Unduh Excel (.xlsx)**
- Empty-state berbeda per kondisi; auto-refresh 15 dtk; tema terang/gelap tersimpan

## 1. Setup Supabase (~3 menit)

Gratis, **tanpa kartu kredit**.

1. https://supabase.com → **New project** → nama `mapid-laporan`, region **Singapore**
   - Enable Data API: ON · Automatically expose new tables: OFF · Enable automatic RLS: OFF
2. **Settings → API** → catat **Project URL** (`VITE_SUPABASE_URL`) dan **Publishable key** (`VITE_SUPABASE_ANON_KEY`)

## 2. Migrasi + Seed (SQL Editor, urutan wajib)

1. Paste isi `supabase/migrations/001_initial_schema.sql` → Run
2. Paste isi `supabase/migrations/002_rls_policies_and_trigger.sql` → Run
3. Paste isi `supabase/migrations/003_seed_data.sql` → Run

## 3. Edge Functions (untuk Export Excel + Bulk)

```bash
supabase login
supabase link --project-ref <PROJECT_REF_DARI_URL_DASHBOARD>
supabase functions deploy export-xlsx
supabase functions deploy bulk-status
```

## 4. Frontend

```bash
cd frontend
cp .env.example .env     # isi VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173
npm run build && npm run lint
```

## 5. Deploy (Vercel)

Import repo → set Environment Variables `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Production + Preview + Development) → Deploy.

## Struktur repository

```
Mapid_Rekrutmen/
├── frontend/              # React + Vite + TS + Tailwind v4 + shadcn/ui
│   ├── src/
│   │   ├── components/    # ui/* + reports/* + layout/*
│   │   ├── hooks/         # useReports, useTheme, useMediaQuery
│   │   ├── lib/           # api.ts (supabase-js), export.ts, format.ts
│   │   └── types/report.ts
│   └── .env.example       # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── supabase/
│   ├── config.toml
│   ├── functions/         # bulk-status, export-xlsx (Deno Edge Functions)
│   └── migrations/        # 001 schema, 002 RLS+trigger, 003 seed
├── .github/workflows/ci.yml
├── ARCHITECTURE.md        # pemetaan endpoint study case (Express) → Supabase
└── README.md
```

> Study case menyebut "Express.js (TypeScript)". Project ini memakai **Supabase** (PostgreSQL + PostgREST + RLS + Edge Functions) — layanan yang eksplisit diizinkan di soal. Lihat **[ARCHITECTURE.md](./ARCHITECTURE.md)** untuk pemetaan 1:1 endpoint Express → Supabase.

## Catatan

- Frontend hanya menyimpan publishable key — RLS di database yang menjaga keamanan.
- Trigger `log_status_change` memakai `SECURITY DEFINER` agar INSERT audit tidak tertahan RLS anon.
- Trigger `protect_created_at` mengunci kolom `created_at` dari client.
- Folder backend Express lama **sudah dihapus total** — arsitektur kini serverless.
