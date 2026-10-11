# Laporan Lapangan

Aplikasi web sederhana untuk mengelola laporan lapangan — terdiri dari REST API (Express + TypeScript + PostgreSQL) dan dashboard (React + Vite + shadcn/ui).

## Cara cepat coba (~5 menit)

Ikuti langkah 1-3 di bawah (Neon + `npm run dev`):

1. Buat database di Neon, jalankan `backend/schema.sql` di SQL Editor.
2. Jalankan backend (`cd backend`, isi `.env`, `npm install`, `npm run dev`).
3. Jalankan frontend (`cd frontend`, `npm install`, `npm run dev`).

- Frontend: `http://localhost:5173` — Backend: `http://localhost:3001`
- Opsional: jalankan `backend/seed.sql` di Neon SQL Editor agar dashboard langsung ada 10 data contoh.

Alternatif tanpa Neon (butuh Docker): `docker compose up --build` — database + 10 data contoh otomatis dimuat dari `backend/schema.sql` + `backend/seed.sql`.

## Fitur

- Membuat laporan (nama + deskripsi, status awal selalu `pending` dari backend)
- Daftar laporan terbaru dulu: tabel (desktop) / kartu (mobile), kolom **No berurutan** per halaman
- Ubah status via dialog konfirmasi **Setujui** / **Tolak** (langsung berubah di UI, rollback otomatis bila gagal)
- **Bulk approve/reject**: centang beberapa laporan pending → **Setujui semua** / **Tolak semua** sekaligus
- **Status final terkunci**: laporan yang sudah Disetujui/Ditolak tidak bisa diubah lagi (backend `409`, tombol aksi disembunyikan + badge gembok)
- Ubah isi + hapus hanya untuk laporan `pending`; **data terakhir tidak bisa dihapus** (backend `409`)
- Pencarian (debounce 350ms, kata cocok di-highlight kuning), filter status, urutkan **Terbaru/Terlama**, pagination server-side, ringkasan statistik, unduh Excel (.xlsx)
- Empty-state beda per kondisi: belum ada data vs filter kosong vs pencarian tak cocok
- Refresh otomatis tiap 15 detik + saat tab kembali aktif, tanpa spinner/toast berisik
- State loading / kosong / gagal-muat + tombol **Coba lagi**
- Tema terang/gelap: mengikuti preferensi OS, bisa diganti manual, pilihan tersimpan

## Struktur repository

```
Mapid_Rekrutmen/
├── backend/          # Express.js + TypeScript + pg
│   ├── src/          # index, app, db, store, validation, errors, types
│   ├── tests/        # unit test (fake DB in-memory)
│   ├── schema.sql    # skema PostgreSQL (idempotent, aman dijalankan ulang)
│   ├── seed.sql      # 10 data contoh (idempotent, cek nama per baris)
│   ├── api.http      # tes endpoint manual via VS Code REST Client
│   ├── Dockerfile
│   └── .env.example
├── frontend/         # React + Vite + TypeScript + Tailwind v4 + shadcn/ui
│   ├── src/          # components, hooks, lib/api, types
│   ├── Dockerfile
│   └── .env.example  # VITE_API_URL
├── docker-compose.yml  # alternatif: db + backend + frontend via Docker
├── .github/workflows/ci.yml  # typecheck + lint + test + build tiap push
└── README.md
```

## Prasyarat

- Node.js 20+ dan npm
- Database PostgreSQL — direkomendasikan [Neon](https://neon.tech) (gratis, sesuai ketentuan study case)

## 1. Setup database (~2 menit)

1. Buat project di Neon, salin **connection string** (yang mengandung `?sslmode=require`).
2. Buka **SQL Editor** di dashboard Neon, tempel seluruh isi `backend/schema.sql`, lalu **Run**.
   Skema idempotent — aman dijalankan ulang (`IF NOT EXISTS` + guard `DO $$` untuk tipe enum).

Verifikasi cepat: tabel `reports` harus ada dengan kolom
`id, nama, deskripsi, status, created_at, updated_at`
plus tabel `report_status_history` untuk jejak perubahan status.
Trigger `trg_reports_updated_at` menjaga `updated_at` otomatis di tiap UPDATE.

Opsional — isi data contoh agar dashboard langsung ada isi:

```bash
# Di Neon SQL Editor, tempel seluruh isi backend/seed.sql lalu Run.
# Aman dijalankan ulang (baris dengan nama sama dilewati).
```

## 2. Menjalankan backend (~2 menit)

```bash
cd backend
cp .env.example .env   # Windows: copy .env.example .env
```

Isi `backend/.env`:

```
DATABASE_URL=postgresql://USER:***@HOST:5432/DATABASE?sslmode=require
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Jangan commit file `.env` ke Git.

```bash
npm install
npm run dev      # development (http://localhost:3001)
# atau:
npm run build && npm start
```

### Endpoint

| Method | Path | Keterangan |
| ------ | ---- | ---------- |
| GET | `/api/health` | Cek server |
| GET | `/api/reports` | Daftar + `meta` pagination + `summary`; param `page, limit (max 100), status, q, sort, order` |
| GET | `/api/reports/:id` | Detail satu laporan; `404` bila tidak ada |
| GET | `/api/reports/:id/history` | Jejak perubahan status |
| GET | `/api/reports/export.xlsx` | Unduh Excel (.xlsx) sesuai filter `status, q, order` + `tz` offset menit client; 1 request 1 file (maks 5000 baris, header `X-Export-Truncated` bila dipotong); rate-limit 10/menit/IP |
| POST | `/api/reports` | Body `{ nama, deskripsi }` → `201`, status selalu `pending`; rate-limit 30/menit/IP |
| PATCH | `/api/reports/:id/status` | Body `{ status: "approved" \| "rejected" }`; final → `409` bila diulang; rate-limit tulis 120/menit/IP |
| PATCH | `/api/reports/bulk-status` | Body `{ ids: number[] (maks 100), status }` → `{ updated, skipped }`; hanya pending yang berubah; rate-limit tulis 120/menit/IP |
| PATCH | `/api/reports/:id` | Ubah nama/deskripsi; hanya `pending`, final → `409`; rate-limit tulis 120/menit/IP |
| DELETE | `/api/reports/:id` | Hapus; hanya `pending`, data terakhir → `409`; hapus atomik (anti-race); rate-limit tulis 120/menit/IP |

> Catatan: rate-limit memakai penyimpanan in-memory per proses — tepat untuk deployment single-instance study case ini. Bila di-scale ke multi-instance, ganti dengan store terdistribusi (mis. Redis).

Tes endpoint manual: buka `backend/api.http` di VS Code (ekstensi REST Client) lalu klik **Send Request** per blok — mencakup health, list, create, detail, approve, reject, bulk, edit, hapus, dan kasus 400.

Respons sukses: `{ success: true, data: ... }`.
Respons gagal: `{ success: false, message: "..." }` (`400` validasi, `404` tidak ketemu, `409` terkunci, `429` rate-limit).

Contoh sukses (`POST /api/reports` → `201`):

```json
{
  "success": true,
  "data": {
    "id": 7,
    "nama": "Jalan berlubang",
    "deskripsi": "Lubang besar di tengah jalan",
    "status": "pending",
    "created_at": "2026-10-11T12:00:00.000Z",
    "updated_at": "2026-10-11T12:00:00.000Z"
  }
}
```

Contoh gagal (`PATCH /api/reports/7/status` setelah final → `409`):

```json
{
  "success": false,
  "message": "Laporan ini sudah Disetujui atau Ditolak, jadi tidak bisa diubah lagi"
}
```

### Tes backend

```bash
cd backend
npm run typecheck
npm run lint
npm test     # 47 unit test (memakai fake DB, tanpa Postgres)
```

## 3. Menjalankan frontend (~2 menit)

```bash
cd frontend
# .env opsional — default VITE_API_URL=http://localhost:3001
# copy .env.example .env   (hanya bila ingin mengubah alamat API)
npm install
npm run dev      # http://localhost:5173
```

Pastikan backend sudah berjalan di `VITE_API_URL` agar dashboard berisi data.

```bash
npm run build    # build produksi (tsc + vite)
npm run lint     # oxlint
```

## Alur uji manual end-to-end (~3 menit)

1. Buka `http://localhost:5173` — statistik dan laporan tampil (isi seed bila pakai Docker/seed).
2. Klik **Buat laporan**, isi nama + deskripsi, simpan → toast sukses, baris baru berstatus **Menunggu**.
3. Klik **Setujui** (konfirmasi dulu) → badge langsung jadi **Disetujui** + toast; tombol aksi berubah jadi gembok. Klik **Tolak** di laporan lain → **Ditolak**.
4. Centang 2-3 laporan pending → bilah **"N laporan dipilih"** muncul → **Setujui semua** (konfirmasi dulu) → semua berubah sekaligus.
5. Coba pencarian (debounce 350ms, kata cocok di-highlight kuning), filter status (empty-state beda per filter), ganti halaman, dan **Unduh Excel**.
6. Kecilkan viewport ke 390px → tabel berubah menjadi kartu, tombol Buat laporan full-width, tanpa scroll horizontal.
7. Klik ikon bulan/matahari untuk mengganti tema; muat ulang halaman, pilihan tetap tersimpan.
8. Matikan backend → dashboard menampilkan **Gagal memuat laporan** + tombol **Coba lagi**; nyalakan backend, klik tombolnya → data kembali.

## Catatan

- Frontend tidak pernah menyimpan `DATABASE_URL` atau credential server — hanya `VITE_API_URL`.
- Status awal laporan selalu ditentukan backend (`pending`); frontend tidak mengirim status saat create.
- Kolom **No** adalah nomor tampilan per halaman (`(page-1)*limit + index + 1`), bukan id database — id tidak di-reset agar riwayat status tetap konsisten.
- Deploy online bersifat opsional sesuai study case; cantumkan URL-nya di sini bila sudah di-deploy.
