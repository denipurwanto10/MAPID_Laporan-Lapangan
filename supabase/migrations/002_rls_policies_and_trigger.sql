a/C:\Website\Mapid_Rekrutmen\supabase\migrations\002_rls_policies_and_trigger.sql → b/C:\Website\Mapid_Rekrutmen\supabase\migrations\002_rls_policies_and_trigger.sql
@@ -1,27 +1,34 @@
 -- Row Level Security Policies
 -- These replace the backend validation logic for create/update/delete
+-- Idempotent: semua CREATE POLICY didahului DROP POLICY IF EXISTS,
+-- sehingga file ini aman dijalankan ulang (misal saat error di tengah jalan).
 
 ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
 ALTER TABLE report_status_history ENABLE ROW LEVEL SECURITY;
 
 -- Read policies: everyone can read everything (public dashboard)
+DROP POLICY IF EXISTS "reports_select_all" ON reports;
 CREATE POLICY "reports_select_all" ON reports
   FOR SELECT USING (true);
 
+DROP POLICY IF EXISTS "history_select_all" ON report_status_history;
 CREATE POLICY "history_select_all" ON report_status_history
   FOR SELECT USING (true);
 
 -- Insert policy: only 'pending' status allowed (backend enforces this)
+DROP POLICY IF EXISTS "reports_insert_pending_only" ON reports;
 CREATE POLICY "reports_insert_pending_only" ON reports
   FOR INSERT WITH CHECK (status = 'pending');
 
 -- Update policy: only 'pending' rows can be updated.
 -- Status boleh bertahan 'pending' (edit nama/deskripsi) ATAU pindah ke approved/rejected (keputusan).
+DROP POLICY IF EXISTS "reports_update_pending_only" ON reports;
 CREATE POLICY "reports_update_pending_only" ON reports
   FOR UPDATE USING (status = 'pending')
   WITH CHECK (status IN ('pending', 'approved', 'rejected'));
 
 -- Delete policy: only 'pending' rows can be deleted, and not the last remaining row
+DROP POLICY IF EXISTS "reports_delete_pending_not_last" ON reports;
 CREATE POLICY "reports_delete_pending_not_last" ON reports
   FOR DELETE USING (
     status = 'pending'