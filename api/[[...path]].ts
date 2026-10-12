/**
 * Entry point Vercel serverless — satu fungsi Express untuk seluruh /api/*.
 *
 * `api/index.ts` di root repo otomatis terdeteksi Vercel sebagai Serverless
 * Function. Express di-export (bukan app.listen()) karena Vercel tidak
 * menyediakan proses jangka panjang; routing internal tetap memakai path penuh
 * ('/api/reports') dan Vercel meneruskan request apa pun yang masuk ke sini.
 *
 * Env: DATABASE_URL (wajib — connection string Postgres Supabase),
 *      CORS_ORIGIN (opsional, default '*' untuk deployment publik).
 */
import { createApp } from "../backend/src/app";
import { createPool } from "../backend/src/db";

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