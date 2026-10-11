-- Skema database aplikasi laporan lapangan.
-- Aman dijalankan ulang (idempotent): tipe, tabel, dan index memakai guard IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL CHECK (char_length(trim(nama)) BETWEEN 1 AND 200),
  deskripsi TEXT NOT NULL CHECK (char_length(trim(deskripsi)) BETWEEN 1 AND 2000),
  status report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jaga updated_at tetap akurat walau ada query UPDATE yang lupa menyentuhnya.
-- Aman dijalankan ulang: drop trigger dulu bila sudah ada.
DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE OR REPLACE FUNCTION set_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_reports_updated_at();

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);

-- Pencarian ILIKE '%kata%' tidak bisa memakai btree index (wildcard di depan).
-- pg_trgm + GIN membuat pencarian nama/deskripsi tetap cepat saat data membesar.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_reports_nama_trgm ON reports USING gin (nama gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reports_deskripsi_trgm ON reports USING gin (deskripsi gin_trgm_ops);

-- Jejak audit perpindahan status (pending -> approved/rejected).
-- ON DELETE CASCADE: riwayat ikut terhapus bila laporan pending dihapus.
CREATE TABLE IF NOT EXISTS report_status_history (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  from_status report_status NOT NULL,
  to_status report_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_report ON report_status_history (report_id);