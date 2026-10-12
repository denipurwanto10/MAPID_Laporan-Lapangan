import { Pool } from 'pg';

/** Abstraksi query minimal agar store bisa diuji tanpa database asli. Pool pg memenuhi interface ini. */
export interface DbQuery {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export function createPool(connectionString: string): Pool {
  // pg mem-merge hasil parse(connectionString) DI ATAS option ssl kita
  // (connection-parameters.js: `Object.assign({}, config, parse(...))`), jadi
  // `?sslmode=require` di DATABASE_URL akan menimpa ssl:{rejectUnauthorized:false}.
  // Supabase Session Pooler memakai sertifikat self-signed → verifikasi penuh
  // gagal dengan SELF_SIGNED_CERT_IN_CHAIN. Karena itu sslmode diambil dari URL
  // lalu diganti 'no-verify' (satu-satunya mode yang benar-benar melepas verifikasi).
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  // sslmode dari URL dipetakan ke 'no-verify'; localhost tidak perlu SSL.
  if (sslMode && sslMode !== 'disable' && sslMode !== 'no-verify') {
    url.searchParams.set('sslmode', 'no-verify');
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: isLocal ? false : { rejectUnauthorized: false },
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
