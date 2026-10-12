-- Data contoh untuk mencoba dashboard tanpa input manual.
-- Cara pakai (Supabase SQL Editor atau psql): jalankan backend/schema.sql dulu,
-- lalu backend/rls.sql, baru file ini.
-- Idempotent: dijalankan ulang tidak menggandakan data (cek nama dulu per baris).
--
-- AKUN DEMO (password ada di README):
--   admin    / admin123     (Admin — kelola akun & lihat semua laporan)
--   approver / approver123  (Approver — setujui/tolak laporan)
--   pelapor  / pelapor123   (Pelapor — buat & kelola laporannya sendiri)
-- Password disimpan sebagai hash scrypt (scrypt$salt$hash), TIDAK plaintext.

-- 1) Akun demo (upsert per username — aman dijalankan ulang).
INSERT INTO users (username, password_hash, role)
VALUES
  ('admin',    'scrypt$0b0b289725acc612f60c493fb49559cb$a0b6c4f5f2932e3c381538a09f360315c22e46354cdf497a93c1ab5dc686a6586aa1d549c1076e7984aaf95505b0d56fe5bc903ecbc76b8d3cc0f944d4085f39', 'admin'::user_role),
  ('approver', 'scrypt$63a7a728772028c5dbe12bd3a5c2cb3b$c7100d1bdaa6094a12cc3d9a44c7c2d8ffd130b0db60ff4576f7bccc7170f27354d6dbb112eef94537b36270e4ef18e94e7205336c819b06ac707566e34e396c', 'approver'::user_role),
  ('pelapor',  'scrypt$d43d8b280d37374a04ee39a65cf08a4e$d1263a46a3fc70e20999e4cc2e90b6fca6970414469992b3ffe4bf92cfc1dddc366b4c99e02e9cd95af12323f5dfcc0cfd9d191c8a575656075a242fd284f132', 'pelapor'::user_role)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;

-- 2) Laporan contoh — dilampirkan ke akun pelapor (miliknya).
--    Status pending supaya alur uji (setujui/tolak) langsung bisa dicoba.
INSERT INTO reports (nama, deskripsi, status, reporter_id)
SELECT v.nama, v.deskripsi, v.status::report_status, u.id
FROM (VALUES
  ('Lampu jalan mati di Jl. Cendrawasih', 'Lampu padam sejak kemarin malam, warga minta segera diperbaiki.', 'pending'),
  ('Lampu jalan mati di RW 07', 'Lampu penerangan mati total seminggu, gang jadi gelap dan rawan.', 'pending'),
  ('Drainase mampet di Pasar Baru', 'Selokan penuh sampah, air meluap ke jalan tiap hujan deras.', 'pending'),
  ('Tiang listrik miring di Jl. Pahlawan', 'Tiang miring setelah ditabrak truk, kabel mulai melorot ke jalan.', 'pending'),
  ('Pos kamling rusak di Blok C', 'Atap bocor dan lantai retak, perlu perbaikan sebelum musim hujan.', 'pending')
) AS v(nama, deskripsi, status)
CROSS JOIN (SELECT id FROM users WHERE username = 'pelapor') u
WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.nama = v.nama);

-- 3) Sinkronkan sequence.
SELECT setval(pg_get_serial_sequence('reports', 'id'), COALESCE(MAX(id), 1)) FROM reports;
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;
