/**
 * Aplikasi Express bersama untuk seluruh Serverless Function Vercel.
 *
 * Berkas di api/ yang diawali garis bawah tidak di-router Vercel, jadi aman
 * dipakai sebagai modul bersama. Tiap file route hanya re-export `default`
 * di sini; Express tetap melihat pathname lengkap sehingga routing internal
 * ('/api/reports/:id/status' dst) bekerja apa adanya.
 *
 * Env: DATABASE_URL (wajib — connection string Postgres Supabase),
 *      CORS_ORIGIN (opsional, default '*' untuk deployment publik).
 */
import { createApp } from "../../backend/src/app";
import { createPool } from "../../backend/src/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL belum diisi. Set di Vercel → Settings → Environment Variables.",
  );
}

// max: 1 — tiap instance serverless hanya butuh satu koneksi; 10 per instance
// akan menghabiskan kuota koneksi Postgres Supabase pada beban naik.
const pool = createPool(connectionString);
const app = createApp(pool, { corsOrigin: process.env.CORS_ORIGIN ?? "*" });

export default app;
