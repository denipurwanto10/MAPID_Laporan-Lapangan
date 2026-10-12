-- Row Level Security Policies
-- These replace the backend validation logic for create/update/delete
-- Idempotent: semua CREATE POLICY didahului DROP POLICY IF EXISTS,
-- sehingga file ini aman dijalankan ulang (misal saat error di tengah jalan).

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_status_history ENABLE ROW LEVEL SECURITY;

-- Read policies: everyone can read everything (public dashboard)
DROP POLICY IF EXISTS "reports_select_all" ON reports;
CREATE POLICY "reports_select_all" ON reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "history_select_all" ON report_status_history;
CREATE POLICY "history_select_all" ON report_status_history
  FOR SELECT USING (true);

-- Insert policy: only 'pending' status allowed (backend enforces this)
DROP POLICY IF EXISTS "reports_insert_pending_only" ON reports;
CREATE POLICY "reports_insert_pending_only" ON reports
  FOR INSERT WITH CHECK (status = 'pending');

-- Update policy: only 'pending' rows can be updated.
-- Status boleh bertahan 'pending' (edit nama/deskripsi) ATAU pindah ke approved/rejected (keputusan).
DROP POLICY IF EXISTS "reports_update_pending_only" ON reports;
CREATE POLICY "reports_update_pending_only" ON reports
  FOR UPDATE USING (status = 'pending')
  WITH CHECK (status IN ('pending', 'approved', 'rejected'));

-- Delete policy: only 'pending' rows can be deleted, and not the last remaining row
DROP POLICY IF EXISTS "reports_delete_pending_not_last" ON reports;
CREATE POLICY "reports_delete_pending_not_last" ON reports
  FOR DELETE USING (
    status = 'pending'
    AND (SELECT COUNT(*) FROM reports) > 1
  );

-- Jejak audit perpindahan status dicatat trigger AFTER UPDATE di bawah, bukan
-- oleh INSERT terpisah dari backend — jadi cukup satu trigger, satu baris history.

CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO report_status_history (report_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_status_history ON reports;
CREATE TRIGGER trg_status_history
  AFTER UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION log_status_change();

-- created_at tidak boleh diubah lewat UPDATE (bisa dipakai untuk menyesatkanjejak audit).
CREATE OR REPLACE FUNCTION protect_created_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at tidak bisa diubah';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_protect_created_at ON reports;
CREATE TRIGGER trg_reports_protect_created_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION protect_created_at();

GRANT INSERT, SELECT, UPDATE, DELETE ON reports TO anon;
GRANT SELECT ON report_status_history TO anon;
GRANT USAGE ON SEQUENCE reports_id_seq TO anon;
