-- Data contoh untuk mencoba dashboard tanpa input manual.
-- Cara pakai (Supabase SQL Editor atau psql): jalankan backend/schema.sql dulu,
-- lalu backend/rls.sql, baru file ini.
-- Idempotent: dijalankan ulang tidak menggandakan data (cek nama dulu per baris).
--
-- Isi di sini sengaja sama persis dengan data demo di dashboard: 5 laporan
-- 'pending', supaya alur uji (setujui / tolak) langsung bisa dicoba.
-- Catatan: bila menjalankan ulang migration di database yang datanya sudah
-- dibersihkan (TRUNCATE), baris lama tidak ikut terhapus — hapus manual dulu.

INSERT INTO reports (nama, deskripsi, status)
SELECT v.nama, v.deskripsi, v.status::report_status
FROM (VALUES
  ('Lampu jalan mati di Jl. Cendrawasih', 'Lampu padam sejak kemarin malam, warga minta segera diperbaiki.', 'pending'),
  ('Lampu jalan mati di RW 07', 'Lampu penerangan mati total seminggu, gang jadi gelap dan rawan.', 'pending'),
  ('Drainase mampet di Pasar Baru', 'Selokan penuh sampah, air meluap ke jalan tiap hujan deras.', 'pending'),
  ('Tiang listrik miring di Jl. Pahlawan', 'Tiang miring setelah ditabrak truk, kabel mulai melorot ke jalan.', 'pending'),
  ('Pos kamling rusak di Blok C', 'Atap bocor dan lantai retak, perlu perbaikan sebelum musim hujan.', 'pending')
) AS v(nama, deskripsi, status)
WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.nama = v.nama);

-- Sinkronkan sequence id agar insert manual berikutnya tidak tabrakan.
SELECT setval(pg_get_serial_sequence('reports', 'id'), COALESCE(MAX(id), 1)) FROM reports;

-- Seed yang berstatus final (approved/rejected) ditulis langsung via SQL sehingga
-- trigger log_status_change tidak tersulut — riwayatnya perlu di-backfill di sini.
INSERT INTO report_status_history (report_id, from_status, to_status, changed_at)
SELECT r.id, 'pending'::report_status, r.status::report_status, r.updated_at
FROM reports r
WHERE r.status <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id);
