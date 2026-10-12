#!/usr/bin/env node
/**
 * Reseed database: TRUNCATE users & reports, reset sequences, run seed.
 * Menghapus SEMUA data (termasuk akun demo) lalu buat ulang dari seed.sql.
 * Sequence users & reports kembali ke 1.
 */

import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();
const { Pool } = pg;

const cs = process.env.DATABASE_URL!;
const pool = new Pool({
  connectionString: cs.includes("sslmode=") ? cs : `${cs}&sslmode=require`,
});

const seedSQL = `
-- 1) Akun demo
INSERT INTO users (username, password_hash, role)
VALUES
  ('admin',    'scrypt$0b0b289725acc612f60c493fb49559cb$a0b6c4f5f2932e3c381538a09f360315c22e46354cdf497a93c1ab5dc686a6586aa1d549c1076e7984aaf95505b0d56fe5bc903ecbc76b8d3cc0f944d4085f39', 'admin'::user_role),
  ('approver', 'scrypt$63a7a728772028c5dbe12bd3a5c2cb3b$c7100d1bdaa6094a12cc3d9a44c7c2d8ffd130b0db60ff4576f7bccc7170f27354d6dbb112eef94537b36270e4ef18e94e7205336c819b06ac707566e34e396c', 'approver'::user_role),
  ('pelapor',  'scrypt$d43d8b280d37374a04ee39a65cf08a4e$d1263a46a3fc70e20999e4cc2e90b6fca6970414469992b3ffe4bf92cfc1dddc366b4c99e02e9cd95af12323f5dfcc0cfd9d191c8a575656075a242fd284f132', 'pelapor'::user_role);

-- 2) Laporan contoh
INSERT INTO reports (nama, deskripsi, status, reporter_id)
SELECT v.nama, v.deskripsi, v.status::report_status, u.id
FROM (VALUES
  ('Lampu jalan mati di Jl. Cendrawasih', 'Lampu padam sejak kemarin malam, warga minta segera diperbaiki.', 'pending'),
  ('Lampu jalan mati di RW 07', 'Lampu penerangan mati total seminggu, gang jadi gelap dan rawan.', 'pending'),
  ('Drainase mampet di Pasar Baru', 'Selokan penuh sampah, air meluap ke jalan tiap hujan deras.', 'pending'),
  ('Tiang listrik miring di Jl. Pahlawan', 'Tiang miring setelah ditabrak truk, kabel mulai melorot ke jalan.', 'pending'),
  ('Pos kamling rusak di Blok C', 'Atap bocor dan lantai retak, perlu perbaikan sebelum musim hujan.', 'pending')
) AS v(nama, deskripsi, status)
CROSS JOIN (SELECT id FROM users WHERE username = 'pelapor') u;

-- 3) Sinkronkan sequence
SELECT setval(pg_get_serial_sequence('reports', 'id'), COALESCE(MAX(id), 1)) FROM reports;
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Truncating reports, users...");
    await client.query("TRUNCATE reports, users RESTART IDENTITY CASCADE");
    console.log("Running seed...");
    await client.query(seedSQL);
    await client.query("COMMIT");
    console.log("Reseed selesai. Akun: admin/approver/pelapor (password: admin123/approver123/pelapor123). Laporan: 5 pending milik pelapor.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Reseed gagal:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();