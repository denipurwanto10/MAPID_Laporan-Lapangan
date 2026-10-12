import type { DbQuery } from './db';
import { AppError } from './errors';
import type {
  AuthUser,
  ListQuery,
  Report,
  ReportStatus,
  ReportSummary,
  StatusHistory,
  User,
  UserRole,
  UserListQuery,
  UserRoleCounts,
} from './types';

const COLUMNS =
  'id, nama, deskripsi, status, created_at, updated_at, reporter_id, decided_by, decided_at';

/** Kolom laporan dengan prefix alias `r` — untuk query SELECT yang JOIN users. */
const COLS_R = COLUMNS.split(', ').map((c) => `r.${c}`).join(', ');

/**
 * Kolom laporan + nama pelapor, untuk RETURNING di query UPDATE.
 * Pakai Kolom polos (tanpa prefix) karena di UPDATE tidak ada alias tabel,
 * dan nama pelapor diambil lewat subquery.
 */
const RETURNING_REPORT = `${COLUMNS}, (SELECT username FROM users WHERE id = reports.reporter_id) AS reporter_name`;

/** Daftar akun pengguna — hanya dipakai admin. */
export async function listUsers(db: DbQuery, q: UserListQuery): Promise<(User & { report_count: number })[]> {
  const { text: where, params } = userScopeClause(q);
  const offset = (q.page - 1) * q.limit;
  const res = await db.query(
    `SELECT u.id, u.username, u.role, u.created_at,
            (SELECT COUNT(*)::int FROM reports r WHERE r.reporter_id = u.id) AS report_count
       FROM users u
       ${where}
      ORDER BY u.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, offset],
  );
  return res.rows as (User & { report_count: number })[];
}

/** Jumlah akun per peran — mengikuti filter yang sama dengan daftar. */
export async function countUsersByRole(db: DbQuery, q: UserListQuery): Promise<UserRoleCounts> {
  const { text: where, params } = userScopeClause(q, { ignoreRole: true });
  const res = await db.query(
    `SELECT role, COUNT(*)::int AS count FROM users ${where} GROUP BY role`,
    [...params],
  );
  const counts: UserRoleCounts = { all: 0, admin: 0, approver: 0, pelapor: 0 };
  for (const row of res.rows as { role: UserRole; count: number }[]) {
    if (row.role === 'admin' || row.role === 'approver' || row.role === 'pelapor') {
      counts[row.role] = row.count;
      counts.all += row.count;
    }
  }
  return counts;
}

/** Jumlah akun yang cocok filter (untuk menentukan nomor halaman terakhir). */
export async function countUsers(db: DbQuery, q: UserListQuery): Promise<number> {
  const { text: where, params } = userScopeClause(q);
  const res = await db.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, [...params]);
  return (res.rows[0] as { total: number } | undefined)?.total ?? 0;
}

/**
 * Filter WHERE untuk daftar akun. Sama polanya dengan scopeClause laporan:
 * nilai user masuk lewat parameter, wildcard LIKE di-escape supaya "%"/"_"
 * dicari harfiah.
 */
function userScopeClause(
  q: UserListQuery,
  opts: { ignoreRole?: boolean } = {},
): { text: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];

  if (q.role && !opts.ignoreRole) {
    params.push(q.role);
    conds.push(`role = $${params.length}::user_role`);
  }
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    conds.push(`username ILIKE $${params.length} ESCAPE '\\'`);
  }
  return { text: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

async function findById(db: DbQuery, id: number): Promise<Report | undefined> {
  const res = await db.query(`SELECT ${COLUMNS} FROM reports WHERE id = $1`, [id]);
  return res.rows[0] as Report | undefined;
}

/**
 * Cakupan akses. Pelapor SELALU dibatasi ke laporan miliknya — nilai query
 * `mine` tidak bisa membuka scope ini. Admin dan approver melihat seluruh laporan.
 *
 * `ignoreStatus` dipakai ringkasan: jumlah per status harus tetap bisa
 * dibandingkan satu sama lain, jadi tab status yang sedang aktif tidak boleh
 * membuat angka status lain jadi nol.
 */
function scopeClause(
  q: ListQuery,
  user: AuthUser,
  opts: { ignoreStatus?: boolean } = {},
): { text: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'pelapor') {
    params.push(user.id);
    conds.push(`r.reporter_id = $${params.length}`);
  }
  if (q.status && !opts.ignoreStatus) {
    params.push(q.status);
    conds.push(`r.status = $${params.length}::report_status`);
  }
  if (q.q) {
    // Escape wildcard LIKE agar "%"/"_" dari user dicari harfiah, bukan cocok-semua.
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    conds.push(
      `(r.nama ILIKE $${params.length} ESCAPE '\\' OR r.deskripsi ILIKE $${params.length} ESCAPE '\\')`,
    );
  }
  return { text: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

/**
 * Jumlah baris yang cocok dengan filter + cakupan akses user.
 * Dipisah dari listReports supaya route bisa meng-klem nomor halaman ke jangkauan
 * nyata sebelum menghitung OFFSET.
 */
export async function countReports(db: DbQuery, q: ListQuery, user: AuthUser): Promise<number> {
  const { text: where, params } = scopeClause(q, user);
  const res = await db.query(`SELECT COUNT(*)::int AS total FROM reports r ${where}`, [...params]);
  return (res.rows[0] as { total: number } | undefined)?.total ?? 0;
}

export async function listReports(
  db: DbQuery,
  q: ListQuery,
  user: AuthUser,
): Promise<Report[]> {
  const { text: where, params } = scopeClause(q, user);
  // Kolom & arah sort dari whitelist parseListQuery — aman dari injeksi SQL.
  // `r.id` memakai arah yang sama dengan kolom utama supaya baris dengan
  // created_at identik tidak bergeser antar halaman (pagination stabil).
  const col = q.sort === 'updated_at' ? 'updated_at' : 'created_at';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (q.page - 1) * q.limit;
  const listRes = await db.query(
    `SELECT ${COLS_R}, u.username AS reporter_name
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       ${where}
       ORDER BY r.${col} ${dir}, r.id ${dir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, offset],
  );
  return listRes.rows as Report[];
}

/** Ambil semua baris sesuai filter untuk ekspor (satu query, dibatasi maxRows). */
export async function listAllForExport(
  db: DbQuery,
  q: Pick<ListQuery, 'status' | 'q' | 'sort' | 'order'>,
  user: AuthUser,
  maxRows: number,
): Promise<{ rows: Report[]; truncated: boolean }> {
  const { text: where, params } = scopeClause(q as ListQuery, user);
  const col = q.sort === 'updated_at' ? 'updated_at' : 'created_at';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const res = await db.query(
    `SELECT ${COLS_R}, u.username AS reporter_name
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       ${where}
       ORDER BY r.${col} ${dir}, r.id ${dir}
       LIMIT $${params.length + 1}`,
    [...params, maxRows + 1],
  );
  const all = res.rows as Report[];
  return { rows: all.slice(0, maxRows), truncated: all.length > maxRows };
}

/** Ringkasan jumlah per status — mengikuti cakupan akses yang sama dengan daftar.
 * ignoreStatus=true agar angka per status dihitung tanpa memfilter status aktif. */
export async function getSummary(
  db: DbQuery,
  q: Pick<ListQuery, 'status' | 'q'>,
  user: AuthUser,
): Promise<ReportSummary> {
  const { text: where, params } = scopeClause(q as ListQuery, user, { ignoreStatus: true });
  const res = await db.query(
    `SELECT r.status, COUNT(*)::int AS count FROM reports r ${where} GROUP BY r.status`,
    [...params],
  );
  const summary: ReportSummary = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of res.rows as { status: ReportStatus; count: number }[]) {
    if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected') {
      summary[row.status] = row.count;
      summary.all += row.count;
    }
  }
  return summary;
}

/**
 * Buat laporan baru. `reporter_id` selalu user yang sedang login — nilai dari
 * client tidak pernah dipercaya, jadi tak ada yang bisa membuat laporan atas nama orang lain.
 */
export async function createReport(
  db: DbQuery,
  nama: string,
  deskripsi: string,
  user: AuthUser,
): Promise<Report> {
  const result = await db.query(
    `WITH inserted AS (
       INSERT INTO reports (nama, deskripsi, status, reporter_id)
       VALUES ($1, $2, 'pending', $3)
       RETURNING ${COLUMNS}
     )
     SELECT ${COLUMNS.split(', ').map((c) => `inserted.${c}`).join(', ')},
            u.username AS reporter_name
       FROM inserted
       JOIN users u ON u.id = inserted.reporter_id`,
    [nama, deskripsi, user.id],
  );
  return result.rows[0] as Report;
}

/** Ambil satu laporan + nama pelapor & nama pemutus keputusan. */
export async function getReportById(db: DbQuery, id: number): Promise<Report> {
  const res = await db.query(
    `SELECT ${COLS_R}, u.username AS reporter_name, d.username AS decided_by_name
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       LEFT JOIN users d ON d.id = r.decided_by
      WHERE r.id = $1`,
    [id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  return res.rows[0] as Report;
}

/** Pelapor tidak boleh menyentuh laporan milik orang lain; admin boleh. */
function assertMayTouch(report: Report, user: AuthUser, action: string): void {
  if (report.reporter_id !== user.id && user.role !== 'admin') {
    throw new AppError(403, `Anda hanya bisa ${action} laporan milik sendiri`);
  }
}

/**
 * Ubah status laporan — keputusan approver/admin.
 *
 * Transisi yang diizinkan:
 *   pending  -> approved | rejected   (keputusan pertama)
 *   approved <-> rejected             (revisi keputusan)
 *
 * `decided_by`/`decided_at` diisi di sini agar trigger audit menyimpan siapa
 * yang memutuskan beserta waktunya. Syarat transisi ditulis atomik di WHERE,
 * sehingga dua request bersamaan tidak bisa dua-duanya lolos.
 */
export async function updateReportStatus(
  db: DbQuery,
  id: number,
  status: ReportStatus,
  user: AuthUser,
): Promise<Report> {
  const result = await db.query(
    `UPDATE reports
        SET status = $1::report_status,
            decided_by = $2,
            decided_at = now()
      WHERE id = $3
        AND (
          status = 'pending'
          OR (status = 'approved' AND $1::report_status = 'rejected')
          OR (status = 'rejected' AND $1::report_status = 'approved')
        )
      RETURNING ${RETURNING_REPORT}`,
    [status, user.id, id],
  );
  const updated = result.rows[0] as Report | undefined;
  if (updated) return updated;

  // Tidak berubah: bedakan 404 vs transisi tak sah lewat baca ulang.
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  if (prev.status === status) {
    throw new AppError(409, `Laporan ini sudah berstatus ${prev.status}`);
  }
  throw new AppError(409, 'Keputusan laporan ini baru saja berubah. Muat ulang lalu coba lagi.');
}

/**
 * Bulk approve/reject dalam satu query atomik.
 * Hanya keputusan pertama (pending -> approved/rejected); revisi antartatus
 * dilakukan satu per satu lewat PATCH /:id/status. Baris yang tak berubah
 * dikembalikan sebagai `skipped`.
 */
export async function bulkUpdateReportStatus(
  db: DbQuery,
  ids: number[],
  status: ReportStatus,
  user: AuthUser,
): Promise<{ updated: Report[]; skipped: { id: number; reason: string }[] }> {
  const uniqueIds = [...new Set(ids)];
  const result = await db.query(
    `UPDATE reports
        SET status = $1::report_status,
            decided_by = $2,
            decided_at = now()
      WHERE id = ANY($3) AND status = 'pending'
      RETURNING ${RETURNING_REPORT}`,
    [status, user.id, uniqueIds],
  );
  const updated = result.rows as Report[];
  const updatedById = new Map(updated.map((r) => [r.id, r]));
  const skipped: { id: number; reason: string }[] = [];
  if (updatedById.size < uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !updatedById.has(id));
    let existing = new Set<number>();
    if (missing.length > 0) {
      const res = await db.query(`SELECT id FROM reports WHERE id = ANY($1)`, [missing]);
      existing = new Set((res.rows as { id: number }[]).map((r) => r.id));
    }
    for (const id of uniqueIds) {
      if (updatedById.has(id)) continue;
      skipped.push({ id, reason: existing.has(id) ? 'sudah diputuskan' : 'tidak ditemukan' });
    }
  }
  updated.sort((a, b) => uniqueIds.indexOf(a.id) - uniqueIds.indexOf(b.id));
  return { updated, skipped };
}

/**
 * Ubah nama/deskripsi — hanya pemilik (atau admin), dan hanya selama pending.
 * Pelapor masih boleh memperbaiki laporannya selama belum diputuskan.
 */
export async function updateReport(
  db: DbQuery,
  id: number,
  nama: string,
  deskripsi: string,
  user: AuthUser,
): Promise<Report> {
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  assertMayTouch(prev, user, 'mengubah');
  if (prev.status !== 'pending') {
    throw new AppError(409, 'Isi laporan terkunci setelah ada keputusan. Keputusan masih bisa direvisi.');
  }
  // Atomik seperti updateReportStatus: cek + tulis dalam satu query.
  const result = await db.query(
    `UPDATE reports SET nama = $1, deskripsi = $2
      WHERE id = $3 AND status = 'pending'
      RETURNING ${RETURNING_REPORT}`,
    [nama, deskripsi, id],
  );
  const updated = result.rows[0] as Report | undefined;
  if (!updated) {
    throw new AppError(409, 'Isi laporan terkunci setelah ada keputusan. Keputusan masih bisa direvisi.');
  }
  return updated;
}

/**
 * Hapus laporan — hanya pemilik (atau admin), selama pending, dan bukan laporan
 * pending terakhir milik user tersebut.
 *
 * CTE `total` membaca jumlah dalam snapshot yang sama, jadi dua request
 * bersamaan tidak bisa dua-duanya lolos dan baris terakhir tetap terkunci.
 */
export async function deleteReport(db: DbQuery, id: number, user: AuthUser): Promise<void> {
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  assertMayTouch(prev, user, 'menghapus');
  if (prev.status !== 'pending') {
    throw new AppError(409, 'Laporan hanya bisa dihapus selama menunggu keputusan.');
  }

  const result = await db.query(
    `WITH total AS (
       SELECT COUNT(*)::int AS c FROM reports WHERE reporter_id = $1 AND status = 'pending'
     )
     DELETE FROM reports USING total
      WHERE reports.id = $2 AND reports.status = 'pending' AND total.c > 1
      RETURNING reports.id`,
    [user.id, id],
  );
  if (result.rows[0]) return;

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM reports WHERE reporter_id = $1 AND status = 'pending'`,
    [user.id],
  );
  const left = (countRes.rows[0] as { c: number } | undefined)?.c ?? 0;
  if (left <= 1) {
    throw new AppError(409, 'Ini satu-satunya laporan menunggu Anda, jadi tidak bisa dihapus.');
  }
  throw new AppError(409, 'Laporan hanya bisa dihapus selama menunggu keputusan.');
}

/** Jejak perubahan status satu laporan, terbaru dulu, lengkap dengan aktor. */
export async function getHistory(db: DbQuery, id: number): Promise<StatusHistory[]> {
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  let res;
  try {
    res = await db.query(
      `SELECT h.from_status, h.to_status, h.decided_by, u.username AS decided_by_name, h.changed_at
         FROM report_status_history h
         LEFT JOIN users u ON u.id = h.decided_by
        WHERE h.report_id = $1
        ORDER BY h.changed_at DESC, h.id DESC`,
      [id],
    );
  } catch (err) {
    console.warn(`Gagal membaca riwayat status laporan ${id}:`, err);
    return [];
  }
  return res.rows as StatusHistory[];
}