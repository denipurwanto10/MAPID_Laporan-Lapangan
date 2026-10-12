import dotenv from 'dotenv';
import { createApp } from './app';
import { createPool } from './db';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    'DATABASE_URL belum diisi. Salin backend/.env.example menjadi backend/.env lalu isi dengan connection string PostgreSQL (Neon).',
  );
  process.exit(1);
}

const pool = createPool(connectionString);
const app = createApp(pool);
const port = Number(process.env.PORT) || 3001;

const server = app.listen(port, () => {
  console.log(`Backend laporan-lapangan berjalan di http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`Menerima ${signal}, menutup koneksi database...`);
  pool
    .end()
    .catch((err: unknown) => console.error('Gagal menutup pool:', err))
    .finally(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
