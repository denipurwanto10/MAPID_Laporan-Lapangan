# Laporan Lapangan

Aplikasi web untuk mengelola laporan lapangan: **Express.js (TypeScript)** + **PostgreSQL (Supabase)** + **React (Vite)**.

Dashboard untuk membuat laporan lapangan lalu memprosesnya jadi **approved** atau **rejected**, dengan jejak audit, approve/reject massal, dan ekspor Excel.

| | |
|---|---|
| 🌐 **Aplikasi online** | https://mapid-reports.vercel.app |
| 📦 **Repository** | https://github.com/denipurwanto10/MAPID_Laporan-Lapangan |
| 🔌 **API (live)** | [`/api/health`](https://mapid-reports.vercel.app/api/health) · [`/api/reports`](https://mapid-reports.vercel.app/api/reports) |
| 🛠 **Stack** | Express 4 · TypeScript · PostgreSQL · pg · exceljs · React 19 · Vite · Tailwind v4 |

---

## Daftar Isi

1. [Fitur](#fitur)
2. [Arsitektur](#arsitektur)
3. [Endpoint API](#endpoint-api)
4. [Cara Menjalankan](#cara-menjalankan)
5. [Struktur Repository](#struktur-repository)
6. [Catatan Teknis](#catatan-teknis)

---

## Fitur

| Fitur | Keterangan |
|---|---|
| **Buat laporan** | Nama + deskripsi, status otomatis `pending` |
| **Daftar laporan** | Tabel (desktop) / kartu (mobile), dengan kolom status |
| **Setujui / Tolak** | Dialog konfirmasi, optimistic UI + rollback |
| **Bulk approve/reject** | Atomik satu request, laporan yang sudah diputuskan otomatis dilewati |
| **Kunci status final** | Edit + hapus hanya untuk `pending`; **baris terakhir tidak bisa dihapus** |
| **Riwayat status** | Setiap perubahan status tercatat lengkap |
| **Cari & filter** | Pencarian (debounce 350ms + highlight), filter status, urutan |
| **Statistik & pagination** | Ringkasan per status, ukuran halaman bebas |
| **Export Excel** | `.xlsx` profesional dengan formatting, filter, dan freeze header |

---

## Arsitektur

```
┌──────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   Frontend       │ ───► │   Express API     │ ───► │   PostgreSQL     │
│   React + Vite   │      │   Vercel serverless│      │   Supabase       │
│   (Vercel)       │      │   /api/*          │      │   RLS + trigger  │
└──────────────────┘      └───────────────────┘      └──────────────────┘
```

**Layer responsibility:**

- **Frontend** (`frontend/`) — React + Vite, memanggil Express API di `/api`
- **Backend** (`backend/` + `api/`) — Express: routing, validasi, rate limit, excel export
- **Database** (Supabase PostgreSQL) — data + RLS policy + trigger audit (lapisan kedua)

📄 Detail lengkap + tabel pemetaan endpoint: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Endpoint API

Semua response berbentuk `{ "success": true, "data": ... }`.

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/reports` | Daftar laporan + statistik. Query: `page`, `limit`, `status`, `q`, `sort`, `order` |
| `POST` | `/api/reports` | Buat laporan. Body: `{ nama, deskripsi }` |
| `GET` | `/api/reports/:id` | Detail satu laporan |
| `PATCH` | `/api/reports/:id` | Ubah nama/deskripsi (hanya `pending`) |
| `PATCH` | `/api/reports/:id/status` | Ubah status. Body: `{ status: "approved" \| "rejected" }` |
| `DELETE` | `/api/reports/:id` | Hapus laporan (hanya `pending`, bukan baris terakhir) |
| `GET` | `/api/reports/:id/history` | Riwayat perubahan status |
| `PATCH` | `/api/reports/bulk-status` | Bulk approve/reject. Body: `{ ids: number[], status }` |
| `GET` | `/api/reports/export.xlsx` | Export Excel (`status`, `q`, `order`, `tz`) |

**Contoh:**

```bash
# Daftar laporan
curl https://mapid-reports.vercel.app/api/reports

# Buat laporan
curl -X POST https://mapid-reports.vercel.app/api/reports \
  -H "Content-Type: application/json" \
  -d '{"nama":"Lampu jalan mati","deskripsi":"Lampu padam sejak semalam"}'

# Setujui
curl -X PATCH https://mapid-reports.vercel.app/api/reports/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

---

## Cara Menjalankan

### Prasyarat

- **Node.js 20+** dan npm
- **Akun Supabase** (gratis, tanpa kartu kredit) — hanya untuk database

### 1. Setup Database

Buat project di [supabase.com](https://supabase.com) → **New project** → region **Singapore**.

Di **SQL Editor**, jalankan berurutan:

1. `backend/schema.sql` — tabel, enum, index
2. `backend/rls.sql` — Row Level Security + trigger audit
3. `backend/seed.sql` — 5 laporan demo (idempoten, aman diulang)

Lalu ambil connection string: **Database → Connection string → Session pooler (URI)**, format:

```
postgresql://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
```

> **Wajib pakai Session pooler (port 5432)** — Direct connection IPv6 tidak bisa dijangkau Vercel, Transaction pooler (6543) berisiko error prepared statement.

### 2. Backend (Express)

```bash
cd backend
npm install
cp .env.example .env      # isi DATABASE_URL dengan string di atas
npm run dev               # http://localhost:3001
```

**Verifikasi:**

```bash
npm run lint
npm run typecheck
npm test                  # 47 tests
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Frontend otomatis memanggil API di `/api`. Untuk dev lokal, Vercel tidak ada di depan — gunakan proxy Vite atau jalankan backend di `:3001`.

**Verifikasi:**

```bash
npm run build
npm run lint
npm test                  # 8 tests
```

### 4. Deploy ke Vercel

Import repository di [vercel.com](https://vercel.com), lalu:

1. Set **Secret** `DATABASE_URL` (Production + Preview + Development)
2. Deploy — `vercel.json` sudah mengatur build, output, dan routing API

Konfigurasi (`vercel.json`):

| Key | Value |
|---|---|
| `buildCommand` | `npm run build` |
| `outputDirectory` | `frontend/dist` |
| `installCommand` | `npm --prefix backend install && npm --prefix frontend install` |
| `functions` | `api/**/*.ts` — 30s, 1024 MB |

---

## Struktur Repository

```
Mapid_Rekrutmen/
├── api/                          # Vercel serverless entry
│   ├── _lib/app.ts               # createApp + createPool (tanpa listen)
│   ├── health.ts
│   └── reports/
│       ├── index.ts              # GET list + POST create
│       ├── bulk-status.ts        # PATCH bulk
│       ├── export.xlsx.ts        # GET export Excel
│       └── [id]/
│           ├── index.ts          # GET detail + PATCH edit + DELETE
│           ├── status.ts         # PATCH status
│           └── history.ts        # GET history
│
├── backend/                      # Express.js (TypeScript) — sumber kebenaran API
│   ├── src/
│   │   ├── app.ts                # routing, rate limit, CORS
│   │   ├── db.ts                 # pool pg (max:1, idle 10s)
│   │   ├── store.ts              # query layer
│   │   ├── validation.ts         # validasi input
│   │   ├── exportXlsx.ts         # workbook Excel
│   │   ├── errors.ts             # AppError + handler
│   │   ├── rateLimit.ts          # rate limiter in-memory
│   │   └── types.ts
│   ├── tests/                    # 47 tests
│   ├── schema.sql / rls.sql / seed.sql
│   └── .env.example
│
├── frontend/                     # React + Vite + TS + Tailwind v4
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/               # komponen dasar
│   │   │   ├── reports/          # tabel, kartu, dialog, toolbar
│   │   │   └── layout/           # shell, header, tema
│   │   ├── hooks/                # useReports, useTheme, useMediaQuery
│   │   ├── lib/                  # api.ts, export.ts, format.ts
│   │   └── types/report.ts
│   └── .env.example
│
├── .github/workflows/ci.yml      # CI: backend + frontend
├── ARCHITECTURE.md               # pemetaan endpoint & keputusan desain
└── README.md
```

---

## Catatan Teknis

**Keamanan & integritas data**

- Jejak audit dicatat trigger DB `trg_status_history` (`SECURITY DEFINER`) — **satu entri per perubahan**, berlaku untuk semua jalur tulis (Express, PostgREST, psql)
- Trigger `protect_created_at` mengunci kolom `created_at` dari client
- RLS di PostgreSQL menjadi lapisan kedua pengaman (defense in depth)
- `DATABASE_URL` hanya disimpan sebagai **Secret** di Vercel — tidak pernah masuk repository

**Serverless**

- Pool `pg` dikonfigurasi `max:1` + `idleTimeout:10s` — aman untuk instance serverless yang sering di-reuse
- `trust proxy` aktif agar rate-limit per IP benar saat di belakang proxy Vercel
- Tiap endpoint punya rate limit: create 30/menit, tulis 120/menit, export 10/menit

**Zero-cost**

- Vercel (frontend + serverless function) + Supabase Free — **tanpa kartu kredit**