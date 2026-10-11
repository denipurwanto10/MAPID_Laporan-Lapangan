-- Data contoh untuk mencoba dashboard tanpa input manual.
-- Cara pakai (Neon SQL Editor atau psql): jalankan backend/schema.sql dulu, lalu file ini.
-- Idempotent: dijalankan ulang tidak menggandakan data (cek nama dulu per baris).
-- Aman dijalankan ulang.

INSERT INTO reports (nama, deskripsi, status)
SELECT v.nama, v.deskripsi, v.status::report_status
FROM (VALUES
  ('Jalan berlubang di Jl. Merdeka', 'Lubang besar diameter sekitar 1 meter di tengah jalan, membahayakan pengendara motor terutama malam hari.', 'pending'),
  ('Lampu jalan mati di Gang Mawar', 'Tiga titik lampu jalan mati sejak seminggu lalu, warga khawatir keluar malam hari.', 'pending'),
  ('Sampah menumpuk di TPS Cempaka', 'Sampah belum diangkut 3 hari, bau menyengat dan lalat mulai banyak di sekitar TPS.', 'pending'),
  ('Banjir di Jl. Cipinang Raya', 'Genangan setinggi 30cm setelah hujan deras, motor mogok dan arus lalu lintas tersendat.', 'pending'),
  ('Trotoar rusak di depan pasar', 'Paving trotoar amblas dan berlubang, pejalan kaki terpaksa turun ke jalan raya.', 'approved'),
  ('Pohon tumbang menutup jalan', 'Pohon trembesi tumbang akibat angin kencang, separuh badan jalan tertutup dan perlu alat berat.', 'approved'),
  ('Kabel listrik menjuntai rendah', 'Kabel listrik menjuntai hingga 2 meter dari tanah di dekat halte, berbahaya bagi pejalan kaki.', 'approved'),
  ('Saluran air mampet di RT 05', 'Got tersumbat sampah plastik, air meluap ke halaman warga setiap hujan turun.', 'rejected'),
  ('Pos ronda butuh perbaikan atap', 'Atap pos ronda bocor di tiga titik, air masuk saat hujan dan merusak perlengkapan jaga.', 'rejected'),
  ('Marka jalan pudar di perempatan', 'Marka zebra cross dan garis berhenti sudah pudar, pengendara sering menyerobot lampu merah.', 'pending')
) AS v(nama, deskripsi, status)
WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.nama = v.nama);

-- Sinkronkan sequence id agar insert manual berikutnya tidak tabrakan.
SELECT setval(pg_get_serial_sequence('reports', 'id'), COALESCE(MAX(id), 1)) FROM reports;

-- Data seed yang berstatus final (approved/rejected) ditulis langsung via SQL,
-- melewati fungsi updateReportStatus() yang menulis riwayat. Tanpa ini riwayatnya kosong.
INSERT INTO report_status_history (report_id, from_status, to_status, changed_at)
SELECT r.id, 'pending'::report_status, r.status::report_status, r.updated_at
FROM reports r
WHERE r.status <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM report_status_history h WHERE h.report_id = r.id);
