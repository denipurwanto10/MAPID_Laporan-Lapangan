import { AppError } from './errors';
import { REPORT_STATUSES, UPDATABLE_STATUSES, USER_ROLES, type ListQuery, type ReportStatus, type UserRole } from './types';

export const NAMA_MAX = 200;
export const DESKRIPSI_MAX = 2000;
/** Batas SERIAL (int4) di PostgreSQL; id lebih besar membuat query error 500. */
export const ID_MAX = 2_147_483_647;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validasi body POST /api/reports. Status selalu pending (di-set di query, bukan dari client). */
export function validateCreateReport(body: unknown): { nama: string; deskripsi: string } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const nama = clean(body.nama);
  const deskripsi = clean(body.deskripsi);

  if (!nama) throw new AppError(400, 'Nama laporan wajib diisi');
  if (nama.length > NAMA_MAX) throw new AppError(400, `Nama laporan maksimal ${NAMA_MAX} karakter`);
  if (!deskripsi) throw new AppError(400, 'Deskripsi laporan wajib diisi');
  if (deskripsi.length > DESKRIPSI_MAX) {
    throw new AppError(400, `Deskripsi laporan maksimal ${DESKRIPSI_MAX} karakter`);
  }
  return { nama, deskripsi };
}

/** Validasi body PATCH /api/reports/:id/status. Hanya approved / rejected. */
export function validateStatusChange(body: unknown): ReportStatus {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const status = clean(body.status);
  if ((UPDATABLE_STATUSES as readonly string[]).includes(status)) {
    return status as ReportStatus;
  }
  throw new AppError(400, 'Status hanya boleh "approved" atau "rejected"');
}

/** Validasi param :id harus integer positif. */
export function parseReportId(param: unknown): number {
  const id = typeof param === 'string' ? Number(param) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > ID_MAX) {
    throw new AppError(400, 'ID laporan tidak valid');
  }
  return id;
}

/** Batas jumlah baris per halaman agar satu request tidak membebani database. */
export const LIST_LIMIT_MAX = 100;
const LIST_LIMIT_DEFAULT = 20;
const SEARCH_MAX = 200;

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Parsing query GET /api/reports. Defensif: nilai tak valid kembali ke default
 * (bukan 400) karena query URL sering diketik/diubah manual.
 */
export function parseListQuery(query: unknown): ListQuery {
  const q = (
    isRecord(query) && typeof query.q === 'string' ? query.q.trim() : ''
  ).slice(0, SEARCH_MAX);
  const rawStatus =
    isRecord(query) && typeof query.status === 'string' ? query.status.trim() : '';
  const status = (REPORT_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as ReportStatus)
    : undefined;
  const rawSort = isRecord(query) && typeof query.sort === 'string' ? query.sort : '';
  const sort: ListQuery['sort'] = rawSort === 'updated_at' ? 'updated_at' : 'created_at';
  const rawOrder = isRecord(query) && typeof query.order === 'string' ? query.order : '';
  const order: ListQuery['order'] = rawOrder === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(
    toPositiveInt(isRecord(query) ? query.limit : undefined, LIST_LIMIT_DEFAULT),
    LIST_LIMIT_MAX,
  );
  const page = toPositiveInt(isRecord(query) ? query.page : undefined, 1);
  return { page, limit, status, q, sort, order };
}

/** Validasi body PATCH /api/reports/:id (ubah nama/deskripsi, hanya saat pending). */
export function validateUpdateReport(body: unknown): { nama: string; deskripsi: string } {
  // Aturan isi sama ketatnya dengan pembuatan laporan.
  return validateCreateReport(body);
}

/** Batas jumlah id per request bulk agar satu query tidak membebani database. */
export const BULK_IDS_MAX = 100;

/** Validasi body PATCH /api/reports/bulk-status: { ids: number[], status }. */
export function validateBulkStatusChange(body: unknown): { ids: number[]; status: ReportStatus } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw new AppError(400, 'Daftar id laporan wajib diisi (minimal 1)');
  }
  if (body.ids.length > BULK_IDS_MAX) {
    throw new AppError(400, `Maksimal ${BULK_IDS_MAX} laporan per request bulk`);
  }
  const ids: number[] = [];
  for (const raw of body.ids) {
    const id = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isInteger(id) || id <= 0 || id > ID_MAX) {
      throw new AppError(400, 'Daftar id berisi ID laporan yang tidak valid');
    }
    ids.push(id);
  }
  const status = validateStatusChange({ status: isRecord(body) ? body.status : undefined });
  return { ids, status };
}

/* ---------------- Autentikasi & pengelolaan akun ---------------- */

export const USERNAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Aturan nama akun: huruf, angka, titik, garis bawah, strip; tanpa spasi. */
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Validasi body POST /api/auth/login. */
export function validateLogin(body: unknown): { username: string; password: string } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const username = clean(body.username).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    throw new AppError(400, 'Username dan password wajib diisi');
  }
  return { username, password };
}

/** Validasi body POST /api/users (buat akun baru — hanya admin). */
export function validateCreateUser(
  body: unknown,
): { username: string; password: string; role: UserRole } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const username = clean(body.username).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = clean(body.role);

  if (!username) throw new AppError(400, 'Username wajib diisi');
  if (username.length < 3) throw new AppError(400, 'Username minimal 3 karakter');
  if (username.length > USERNAME_MAX) {
    throw new AppError(400, `Username maksimal ${USERNAME_MAX} karakter`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(400, 'Username hanya boleh huruf, angka, titik, garis bawah, atau strip');
  }
  validatePasswordStrength(password);
  if (!(USER_ROLES as readonly string[]).includes(role)) {
    throw new AppError(400, 'Role harus salah satu dari: admin, pelapor, approver');
  }
  return { username, password, role: role as UserRole };
}

/** Validasi body PATCH /api/users/:id — semua field opsional. */
export function validateUpdateUser(
  body: unknown,
): { username?: string; password?: string; role?: UserRole } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const out: { username?: string; password?: string; role?: UserRole } = {};

  if (body.username !== undefined) {
    const username = clean(body.username).toLowerCase();
    if (!username) throw new AppError(400, 'Username tidak boleh kosong');
    if (username.length < 3) throw new AppError(400, 'Username minimal 3 karakter');
    if (username.length > USERNAME_MAX) {
      throw new AppError(400, `Username maksimal ${USERNAME_MAX} karakter`);
    }
    if (!USERNAME_PATTERN.test(username)) {
      throw new AppError(400, 'Username hanya boleh huruf, angka, titik, garis bawah, atau strip');
    }
    out.username = username;
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string') {
      throw new AppError(400, 'Password harus berupa teks');
    }
    validatePasswordStrength(body.password);
    out.password = body.password;
  }

  if (body.role !== undefined) {
    const role = clean(body.role);
    if (!(USER_ROLES as readonly string[]).includes(role)) {
      throw new AppError(400, 'Role harus salah satu dari: admin, pelapor, approver');
    }
    out.role = role as UserRole;
  }

  if (out.username === undefined && out.password === undefined && out.role === undefined) {
    throw new AppError(400, 'Tidak ada perubahan yang dikirim');
  }
  return out;
}

/** Validasi body PATCH /api/auth/password — ganti password sendiri. */
export function validateChangePassword(body: unknown): { currentPassword: string; newPassword: string } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Body request harus berupa JSON object');
  }
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword) throw new AppError(400, 'Password lama wajib diisi');
  if (!newPassword) throw new AppError(400, 'Password baru wajib diisi');
  validatePasswordStrength(newPassword);

  if (currentPassword === newPassword) {
    throw new AppError(400, 'Password baru harus berbeda dari password lama');
  }

  return { currentPassword, newPassword };
}

/**
 * Tolak password lemah. Panjang minimum 8 plus minimal satu huruf dan satu
 * angka — cukup untuk akun demo internal tanpa menyulitkan pengguna.
 */
function validatePasswordStrength(password: string): void {
  if (!password) throw new AppError(400, 'Password wajib diisi');
  if (password.length < PASSWORD_MIN) {
    throw new AppError(400, `Password minimal ${PASSWORD_MIN} karakter`);
  }
  if (password.length > PASSWORD_MAX) {
    throw new AppError(400, `Password maksimal ${PASSWORD_MAX} karakter`);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, 'Password harus memuat minimal satu huruf dan satu angka');
  }
}
