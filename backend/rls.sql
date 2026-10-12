-- Keamanan lapis database (defense in depth).
--
-- CATATAN PENTING — baca dulu:
--   Koneksi backend (Express di Vercel) memakai user `postgres`, yang punya
--   rolbypassrls = true. Artinya policy di file ini TIDAK ditegakkan untuk
--   koneksi tersebut; penegakan aturan peran (siapa boleh baca/ubah laporan
--   siapa) dilakukan di Express — lihat src/authMiddleware.ts dan src/store.ts.
--
--   Policy di sini tetap berguna untuk satu hal: menutup jalur PostgREST
--   publik. Aplikasi ini tidak pernah membaca atau menulis lewat Supabase
--   client — semuanya lewat REST API Express yang memverifikasi sesi. Kalau
--   anon key bocor, tabel tetap tidak bisa diakses dari luar.

-- Matikan akses PostgREST untuk peran anon/authenticated.
REVOKE ALL ON reports FROM anon, authenticated;
REVOKE ALL ON report_status_history FROM anon, authenticated;
REVOKE ALL ON users FROM anon, authenticated;
REVOKE ALL ON sessions FROM anon, authenticated;

-- RLS tetap dinyalakan sebagai jaring pengaman: kalau suatu saat ada GRANT
-- yang tidak sengaja dikembalikan, tabel tetap tertutup tanpa policy yang
-- mengizinkan (RLS tanpa policy = tolak semua untuk non-pemilik tabel).
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Buang policy versi lama bila pernah terpasang, agar tidak tersisa policy
-- "dashboard publik tanpa login" dari skema sebelum ada peran.
DROP POLICY IF EXISTS "reports_select_all" ON reports;
DROP POLICY IF EXISTS "reports_insert_pending_only" ON reports;
DROP POLICY IF EXISTS "reports_update_pending_only" ON reports;
DROP POLICY IF EXISTS "reports_delete_pending_not_last" ON reports;
DROP POLICY IF EXISTS "history_select_all" ON report_status_history;

-- Jejak audit perpindahan status dicatat trigger AFTER UPDATE.
-- Bukan INSERT terpisah dari backend — jadi cukup satu trigger, satu baris history.
-- `decided_by` diisi backend lewat NEW.decided_by sebelum UPDATE dieksekusi.
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO report_status_history (report_id, from_status, to_status, decided_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.decided_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_status_history ON reports;
CREATE TRIGGER trg_status_history
  AFTER UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- `created_at` tidak boleh diubah lewat UPDATE (mencegah penyesatan jejak audit).
CREATE OR REPLACE FUNCTION protect_created_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at tidak bisa diubah';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_protect_created_at ON reports;
CREATE TRIGGER trg_reports_protect_created_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION protect_created_at();