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

1. [Akun Demo](#akun-demo)
2. [Fitur](#fitur)
3. [Arsitektur](#arsitektur)
4. [Endpoint API](#endpoint-api)
5. [Cara Menjalankan](#cara-menjalankan)
6. [Struktur Repository](#struktur-repository)
7. [Catatan Teknis](#catatan-teknis)

---

## Akun Demo

| Peran | Username | Password | Kemampuan |
|---|---|---|---|
| **Admin** | `admin` | `admin123` | Kelola akun pengguna + lihat semua laporan + setujui/tolak |
| **Approver** | `approver` | `approver123` | Setujui/tolak (termasuk revisi approved ↔ rejected), lihat semua laporan |
| **Pelapor** | `pelapor` | `pelapor123` | Buat laporan, kelola laporannya sendiri (edit/hapus saat `pending`) |

> Akun dibuat oleh **Admin** (menu *Kelola akun*) — tidak ada registrasi mandiri. Akun di atas otomatis dibuat oleh `backend/seed.sql`.

---

## Fitur

| Fitur | Keterangan |
|---|---|
| **Login dengan peran** | Admin, Pelapor, Approver — sesi token 12 jam, bisa logout |
| **Buat laporan** | Nama + deskripsi, status otomatis `pending` |
| **Daftar laporan** | Tabel (desktop) / kartu (mobile), dengan kolom status |
| **Akses per peran** | Pelapor hanya melihat laporannya sendiri; Admin/Approver melihat semua |
| **Setujui / Tolak** | Dialog konfirmasi, optimistic UI + rollback; Approver boleh revisi approved ↔ rejected |
| **Bulk approve/reject** | Atomik satu request, laporan yang sudah diputuskan otomatis dilewati |
| **Kunci status final** | Edit + hapus hanya untuk `pending`; **baris terakhir tidak bisa dihapus** |
| **Riwayat status** | Setiap perubahan tercatat lengkap beserta **siapa** memutuskan dan **kapan** |
| **Kelola akun** | CRUD pengguna oleh Admin (tanpa registrasi mandiri) |
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
- **Backend** (`backend/` + `api/`) — Express: routing, validasi, rate limit, excel export, **autentikasi & otorisasi per peran**
- **Database** (Supabase PostgreSQL) — data + RLS policy + trigger audit (lapisan kedua)

📄 Detail lengkap + tabel pemetaan endpoint: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Endpoint API

Semua response berbentuk `{ "success": true, "data": ... }`.
Seluruh endpoint **kecuali** `/api/health` dan `/api/auth/login` memerlukan header `Authorization: Bearer <token>`.

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/login` | Login. Body: `{ username, password }` → `{ user, token }` |
| `POST` | `/api/auth/logout` | Cabut sesi saat ini |
| `GET` | `/api/auth/me` | Profil user yang login |
| `GET` | `/api/reports` | Daftar laporan + statistik. Query: `page`, `limit`, `status`, `q`, `sort`, `order` |
| `POST` | `/api/reports` | Buat laporan (Pelapor). Body: `{ nama, deskripsi }` |
| `GET` | `/api/reports/:id` | Detail satu laporan |
| `PATCH` | `/api/reports/:id` | Ubah nama/deskripsi (pemilik saat `pending`) |
| `PATCH` | `/api/reports/:id/status` | Ubah status (Admin/Approver). Body: `{ status: "approved" \| "rejected" }` |
| `DELETE` | `/api/reports/:id` | Hapus laporan (pemilik saat `pending`, bukan baris terakhir) |
| `GET` | `/api/reports/:id/history` | Riwayat perubahan status + aktor |
| `PATCH` | `/api/reports/bulk-status` | Bulk approve/reject (Admin/Approver). Body: `{ ids: number[], status }` |
| `GET` | `/api/reports/export.xlsx` | Export Excel (`status`, `q`, `order`, `tz`) |
| `GET` | `/api/users` | Daftar akun (Admin) |
| `POST` | `/api/users` | Buat akun (Admin). Body: `{ username, password, role }` |
| `PATCH` | `/api/users/:id` | Ubah akun (Admin) — `role`, `password` |
| `DELETE` | `/api/users/:id` | Hapus akun (Admin) — admin terakhir tidak bisa dihapus |

**Contoh:**

```bash
# Login → simpan token
TOKEN=$(curl -s -X POST https://mapid-reports.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .data.token)

# Daftar laporan (peran pelapor hanya melihat laporannya sendiri)
curl https://mapid-reports.vercel.app/api/reports -H "Authorization: Bearer $TOKEN"

# Buat laporan
curl -X POST https://mapid-reports.vercel.app/api/reports \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nama":"Lampu jalan mati","deskripsi":"Lampu padam sejak semalam"}'

# Setujui
curl -X PATCH https://mapid-reports.vercel.app/api/reports/1/status \
  -H "Authorization: Bearer $TOKEN" \
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

1. `backend/schema.sql` — tabel, enum, index, kolom kepemilikan
2. `backend/rls.sql` — Row Level Security + trigger audit
3. `backend/seed.sql` — akun demo + 5 laporan (idempoten, aman diulang)

Lalu ambil connection string: **Database → Connection string → Session pooler (URI)**, format:

```
postgresql://postgres.<project-ref>:***@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
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
npm test                  # 87 tests (86 lolos, 1 dilewati)
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Frontend otomatis memanggil API di `/api`: di produksi Vercel ini satu domain dengan backend, sedangkan di `npm run dev` Vite meneruskan `/api` ke backend lokal di `:3001` via `server.proxy` di `vite.config.ts` (target bisa diubah lewat `VITE_PROXY_TARGET`).

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
│   ├── auth/                     # login, logout, me
│   ├── users/                    # CRUD akun (admin)
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
│   │   ├── auth.ts               # scrypt hash + sesi token
│   │   ├── authMiddleware.ts     # requireAuth / requireAdmin / requireDecider / requireReporter
│   │   ├── db.ts                 # pool pg (max:1, idle 10s)
│   │   ├── store.ts              # query layer + scope per peran
│   │   ├── validation.ts         # validasi input
│   │   ├── exportXlsx.ts         # workbook Excel
│   │   ├── errors.ts             # AppError + handler
│   │   ├── rateLimit.ts          # rate limiter in-memory
│   │   └── types.ts
│   ├── tests/                    # 87 tests (86 lolos, 1 dilewati)
│   ├── schema.sql / rls.sql / seed.sql
│   └── .env.example
│
├── frontend/                     # React + Vite + TS + Tailwind v4
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/               # komponen dasar
│   │   │   ├── auth/             # Login
│   │   │   ├── users/            # Kelola akun (admin)
│   │   │   ├── reports/          # tabel, kartu, dialog, toolbar
│   │   │   └── layout/           # shell, header, tema
│   │   ├── context/              # AuthContext
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

- Password di-hash **scrypt** (`node:crypto`) — tanpa dependensi native, tanpa plaintext
- Sesi token 32-byte hex di tabel `sessions`, berlaku 12 jam, bisa dicabut (logout/ganti password)
- Otorisasi per peran ditegakkan di **Express** (`requireAdmin`/`requireDecider`/`requireReporter` + scope di `store.ts`) — Pelapor *selalu* dibatasi hanya melihat laporannya sendiri
- Jejak audit dicatat trigger DB `trg_status_history` (`SECURITY DEFINER`) — **satu entri per perubahan**, dengan `decided_by` + `decided_at` (siapa & kapan)
- Trigger `protect_created_at` mengunci kolom `created_at` dari client
- RLS + `REVOKE` anon/authenticated di PostgreSQL menjadi lapisan kedua pengaman (defense in depth)
- `DATABASE_URL` hanya disimpan sebagai **Secret** di Vercel — tidak pernah masuk repository

**Serverless**

- Pool `pg` dikonfigurasi `max:1` + `idleTimeout:10s` — aman untuk instance serverless yang sering di-reuse
- `trust proxy` aktif agar rate-limit per IP benar saat di belakang proxy Vercel
- Tiap endpoint punya rate limit: login 30/menit, create 30/menit, tulis 120/menit, export 10/menit

**Zero-cost**

- Vercel (frontend + serverless function) + Supabase Free — **tanpa kartu kredit**