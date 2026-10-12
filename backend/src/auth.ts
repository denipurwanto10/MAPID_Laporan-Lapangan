import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DbQuery } from './db';
import { AppError } from './errors';
import type { AuthUser, User, UserRole } from './types';
import { USER_ROLES } from './types';

/**
 * Autentikasi berbasis sesi token, bukan JWT.
 *
 * Alasan: sesi disimpan di tabel `sessions` sehingga bisa dicabut admin dan
 * tetap berlaku lintas instance serverless Vercel (JWT di localStorage tidak
 * bisa dicabut tanpa daftar hitam).
 *
 * Password disimpan sebagai hash scrypt berformat `scrypt$<salt hex>$<hash hex>`
 * — tidak pernah plaintext, dan tanpa dependensi native seperti bcrypt.
 */

/** Masa berlaku sesi: 12 jam. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Panjang token sesi dalam byte (hex 32 byte = 64 karakter). */
const TOKEN_BYTES = 32;
const SCRYPT_KEYLEN = 64;

/** Hash password dengan scrypt + salt acak per pengguna. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Bandingkan password dengan hash tersimpan secara constant-time. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expected, 'hex');
  // Panjang beda → timingSafeEqual melempar; tolak lebih dulu agar tetap aman.
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Verifikasi kredensial. Lempar 401 bila username tidak ada atau password salah.
 * Pesan error sengaja sama untuk kedua kasus agar tidak membocorkan username
 * yang terdaftar.
 */
export async function authenticate(
  db: DbQuery,
  username: string,
  password: string,
): Promise<AuthUser> {
  const res = await db.query(
    `SELECT id, username, role, created_at, password_hash FROM users WHERE username = $1`,
    [username],
  );
  const row = res.rows[0] as (User & { password_hash: string }) | undefined;
  // Akun hasil migrasi lama punya hash '!disabled' sampai seed.sql mengisinya.
  const ok = row && row.password_hash !== '!disabled' ? verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    throw new AppError(401, 'Username atau password salah');
  }
  return { id: row.id, username: row.username, role: row.role };
}

/** Buat sesi baru untuk user dan kembalikan tokennya (hex). */
export async function createSession(db: DbQuery, userId: number): Promise<string> {
  const token = newSessionToken();
  await db.query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
    [token, userId, String(SESSION_TTL_MS)],
  );
  return token;
}

/** Cari user dari token sesi; null bila token tak dikenal atau sudah kedaluwarsa. */
export async function resolveSession(db: DbQuery, token: string): Promise<AuthUser | null> {
  const res = await db.query(
    `SELECT u.id, u.username, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return (res.rows[0] as AuthUser | undefined) ?? null;
}

/** Cabut satu sesi (logout). */
export async function revokeSession(db: DbQuery, token: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

/** Cabut seluruh sesi milik seorang user (mis. saat admin mengganti password). */
export async function revokeUserSessions(db: DbQuery, userId: number): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

/** Validasi role kiriman client (CRUD akun oleh admin). */
export function parseRole(value: unknown): UserRole {
  if (typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)) {
    return value as UserRole;
  }
  throw new AppError(400, 'Role harus salah satu dari: admin, pelapor, approver');
}