import { Pool } from 'pg';

/** Abstraksi query minimal agar store bisa diuji tanpa database asli. Pool pg memenuhi interface ini. */
export interface DbQuery {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    // max: 1 untuk Vercel serverless (tiap instance satu koneksi; default 10
    // akan menghabiskan kuota Postgres Supabase). Lokal/dev juga cukup satu.
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // Tanpa handler ini, koneksi idle yang diputus server (umum di Neon serverless)
  // memicu event 'error' tak tertangani dan menjatuhkan seluruh proses.
  pool.on('error', (err) => {
    console.error('Koneksi database idle terputus:', err.message);
  });
  return pool;
}
