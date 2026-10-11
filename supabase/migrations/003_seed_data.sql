-- Seed data for development/demo
-- Idempotent: only inserts if nama doesn't exist
-- Demo ini sengaja memakai 5 laporan berstatus 'pending' saja supaya
-- alur uji (setujui / tolak) bisa langsung dicoba dari dashboard kosong.

INSERT INTO reports (nama, deskripsi, status)
SELECT v.nama, v.deskripsi, v.status::report_status
FROM (VALUES
  ('Jalan berlubang di Jl. Melati', 'Lubang cukup besar di tengah jalan, bahaya buat motor pas malam hari.', 'pending'),
  ('Lampu jalan mati di RT 03', 'Dua titik lampu jalan mati dari minggu lalu, gang jadi gelap gulita.', 'pending'),
  ('Sampah menumpuk di TPS Anggrek', 'Sampah belum diangkut 2 hari, bau dan lalat mulai ganggu warga sekitar.', 'pending'),
  ('Got mampet di Jl. Kenanga', 'Air meluap ke jalan tiap hujan deras, motor sering mogok lewat sana.', 'pending'),
  ('Pos kamling rusak di Blok C', 'Atap bocor dan lantai retak, perlu perbaikan sebelum musim hujan.', 'pending')
) AS v(nama, deskripsi, status)
WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.nama = v.nama);

-- Sync sequence
SELECT setval(pg_get_serial_sequence('reports', 'id'), COALESCE(MAX(id), 1)) FROM reports;

-- Backfill history for seeded final-status rows
INSERT INTO report_status_history (report_id, from_status, to_status, changed_at)
SELECT r.id, 'pending'::report_status, r.status::report_status, r.updated_at
FROM reports r
WHERE r.status <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id);