-- Skema database aplikasi laporan lapangan.
-- Aman dijalankan ulang (idempotent): tipe, tabel, dan kolom memakai guard IF NOT EXISTS.
--
-- Jalankan di SQL Editor Supabase (atau psql) BERURUTAN:
--   1. backend/schema.sql   (tabel, enum, kolom, index)
--   2. backend/rls.sql      (policy RLS + trigger audit)
--   3. backend/seed.sql     (akun demo + laporan contoh)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'pelapor', 'approver');
  END IF;
END
$$;

-- Akun pengguna. Dibuat oleh admin lewat aplikasi — tidak ada registrasi mandiri.
-- password_hash berformat 'scrypt$<salt hex>$<hash hex>' (node:crypto scrypt).
-- Password TIDAK PERNAH disimpan plaintext. Nilai '!disabled' berarti akun belum
-- punya password aktif (seed.sql mengisinya dengan hash demo).
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (char_length(trim(username)) BETWEEN 3 AND 50),
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sesi login. Token acak 32 byte hex, berlaku 12 jam (diperiksa di query).
-- Disimpan di tabel, bukan JWT, supaya bisa dicabut admin dan tetap berlaku
-- lintas instance serverless Vercel.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL CHECK (char_length(trim(nama)) BETWEEN 1 AND 200),
  deskripsi TEXT NOT NULL CHECK (char_length(trim(deskripsi)) BETWEEN 1 AND 2000),
  status report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pemilik laporan, siapa yang memutuskan, dan kapan. Ditambahkan terpisah dari
-- CREATE TABLE supaya aman untuk database lama yang sudah ada barisnya.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id INTEGER REFERENCES users (id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users (id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- Migrasi database lama (sebelum ada peran): laporan yang belum punya pemilik
-- dilampirkan ke satu akun sementara, lalu seed.sql memberi password akun itu.
INSERT INTO users (username, password_hash, role)
SELECT 'pelapor', '!disabled', 'pelapor'::user_role
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'pelapor');

UPDATE reports SET reporter_id = (SELECT id FROM users WHERE username = 'pelapor')
WHERE reporter_id IS NULL;

ALTER TABLE reports ALTER COLUMN reporter_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_id);

-- updated_at selalu akurat walau ada query UPDATE yang lupa menyentuhnya.
CREATE OR REPLACE FUNCTION set_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_reports_updated_at();

-- Pencarian ILIKE '%kata%' tidak bisa dilayani btree (wildcard di depan).
-- pg_trgm + GIN membuat pencarian nama/deskripsi tetap cepat saat data membesar.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_reports_nama_trgm ON reports USING gin (nama gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reports_deskripsi_trgm ON reports USING gin (deskripsi gin_trgm_ops);

-- Jejak audit perpindahan status (pending -> approved/rejected, termasuk revisi
-- approved <-> rejected). Mencatat SIAPA yang memutuskan lewat decided_by.
-- ON DELETE CASCADE: riwayat ikut terhapus bila laporan dihapus.
CREATE TABLE IF NOT EXISTS report_status_history (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  from_status report_status NOT NULL,
  to_status report_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE report_status_history
  ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_status_history_report ON report_status_history (report_id);