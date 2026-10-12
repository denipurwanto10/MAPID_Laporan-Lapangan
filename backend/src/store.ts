import type { DbQuery } from './db';
import { AppError } from './errors';
import type { ListQuery, Report, ReportStatus, ReportSummary, StatusHistory } from './types';

const COLUMNS = 'id, nama, deskripsi, status, created_at, updated_at';

function whereClause(q: Pick<ListQuery, 'status' | 'q'>): { text: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q.status) {
    params.push(q.status);
    conds.push(`status = $${params.length}::report_status`);
  }
  if (q.q) {
    // Escape wildcard LIKE agar "%"/"_" dari user dicari harfiah, bukan cocok-semua.
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    conds.push(`(nama ILIKE $${params.length} ESCAPE '\\' OR deskripsi ILIKE $${params.length} ESCAPE '\\')`);
  }
  return { text: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

export async function listReports(
  db: DbQuery,
  q: ListQuery,
): Promise<{ items: Report[]; total: number }> {
  const { text: where, params } = whereClause(q);
  const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM reports ${where}`, [
    ...params,
  ]);
  const total = (countRes.rows[0] as { total: number } | undefined)?.total ?? 0;
  // Kolom & arah sort dari whitelist parseListQuery — aman dari injeksi SQL.
  const col = q.sort === 'updated_at' ? 'updated_at' : 'created_at';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (q.page - 1) * q.limit;
  const listRes = await db.query(
    `SELECT ${COLUMNS} FROM reports ${where} ORDER BY ${col} ${dir}, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, offset],
  );
  return { items: listRes.rows as Report[], total };
}

/** Ambil semua baris sesuai filter untuk ekspor (satu query, dibatasi maxRows). */
export async function listAllForExport(
  db: DbQuery,
  q: Pick<ListQuery, 'status' | 'q' | 'sort' | 'order'>,
  maxRows: number,
): Promise<{ rows: Report[]; truncated: boolean }> {
  const { text: where, params } = whereClause(q);
  const col = q.sort === 'updated_at' ? 'updated_at' : 'created_at';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const res = await db.query(
    `SELECT ${COLUMNS} FROM reports ${where} ORDER BY ${col} ${dir}, id DESC LIMIT $${params.length + 1}`,
    [...params, maxRows + 1],
  );
  const all = res.rows as Report[];
  return { rows: all.slice(0, maxRows), truncated: all.length > maxRows };
}

export async function getSummary(db: DbQuery): Promise<ReportSummary> {
  const res = await db.query(`SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status`);
  const summary: ReportSummary = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of res.rows as { status: ReportStatus; count: number }[]) {
    if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected') {
      summary[row.status] = row.count;
      summary.all += row.count;
    }
  }
  return summary;
}

export async function createReport(db: DbQuery, nama: string, deskripsi: string): Promise<Report> {
  // Status selalu 'pending' dari sisi server — nilai dari client diabaikan.
  const result = await db.query(
    `INSERT INTO reports (nama, deskripsi, status)
     VALUES ($1, $2, 'pending')
     RETURNING ${COLUMNS}`,
    [nama, deskripsi],
  );
  return result.rows[0] as Report;
}

async function findById(db: DbQuery, id: number): Promise<Report | undefined> {
  const res = await db.query(`SELECT ${COLUMNS} FROM reports WHERE id = $1`, [id]);
  return res.rows[0] as Report | undefined;
}

/** Ambil satu laporan berdasarkan id — 404 bila tidak ada. */
export async function getReportById(db: DbQuery, id: number): Promise<Report> {
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  return prev;
}

export async function updateReportStatus(
  db: DbQuery,
  id: number,
  status: ReportStatus,
): Promise<Report> {
  // Atomik anti-race: hanya baris yang masih pending yang bisa berubah, tepat satu kali.
  // Dua request bersamaan tidak bisa dua-duanya lolos — satu dapat baris, satu dapat 409.
  const result = await db.query(
    `UPDATE reports SET status = $1, updated_at = now()
     WHERE id = $2 AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [status, id],
  );
  const updated = result.rows[0] as Report | undefined;
  if (!updated) {
    // Baris tidak berubah: entah tidak ada (404) atau sudah final (409).
    const prev = await findById(db, id);
    if (!prev) {
      throw new AppError(404, 'Laporan tidak ditemukan');
    }
    throw new AppError(409, 'Laporan ini sudah Disetujui atau Ditolak, jadi tidak bisa diubah lagi');
  }
  // Jejak audit dicatat trigger DB trg_status_change (AFTER UPDATE), bukan
  // INSERT dari sini — dengan begitu semua jalur tulis (Express, PostgREST,
  // Edge Function, psql) menghasilkan tepat satu baris riwayat.
  return updated;
}

/**
 * Bulk approve/reject: ubah banyak laporan pending dalam satu query atomik.
 * Hanya baris pending yang berubah; baris final/tidak ada dikembalikan sebagai skipped.
 * Id duplikat diabaikan, urutan hasil mengikuti urutan ids unik.
 */
export async function bulkUpdateReportStatus(
  db: DbQuery,
  ids: number[],
  status: ReportStatus,
): Promise<{ updated: Report[]; skipped: { id: number; reason: string }[] }> {
  const uniqueIds = [...new Set(ids)];
  const result = await db.query(
    `UPDATE reports SET status = $1, updated_at = now()
     WHERE id = ANY($2) AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [status, uniqueIds],
  );
  const updated = result.rows as Report[];
  const updatedById = new Map(updated.map((r) => [r.id, r]));
  // Jejak audit tiap baris yang berubah dicatat trigger DB trg_status_history
  // (satu UPDATE = satu baris history, atomik di dalam statement yang sama).
  const skipped: { id: number; reason: string }[] = [];
  if (updatedById.size < uniqueIds.length) {
    // Baca ulang yang tidak berubah untuk bedakan 404 vs 409 tanpa N+1 query berlebihan
    // (satu query IN untuk semua id yang dilewati).
    const missing = uniqueIds.filter((id) => !updatedById.has(id));
    let existing = new Set<number>();
    if (missing.length > 0) {
      const res = await db.query(`SELECT ${COLUMNS} FROM reports WHERE id = ANY($1)`, [missing]);
      existing = new Set((res.rows as Report[]).map((r) => r.id));
    }
    for (const id of uniqueIds) {
      if (updatedById.has(id)) continue;
      skipped.push({
        id,
        reason: existing.has(id) ? 'sudah diputuskan' : 'tidak ditemukan',
      });
    }
  }
  // Kembalikan updated sesuai urutan ids agar frontend gampang sinkron.
  updated.sort((a, b) => uniqueIds.indexOf(a.id) - uniqueIds.indexOf(b.id));
  return { updated, skipped };
}

/** Ubah nama/deskripsi — hanya selama laporan masih berstatus pending. */
export async function updateReport(
  db: DbQuery,
  id: number,
  nama: string,
  deskripsi: string,
): Promise<Report> {
  // Atomik seperti updateReportStatus: cek + tulis dalam satu query.
  const result = await db.query(
    `UPDATE reports SET nama = $1, deskripsi = $2, updated_at = now()
     WHERE id = $3 AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [nama, deskripsi, id],
  );
  const updated = result.rows[0] as Report | undefined;
  if (!updated) {
    const prev = await findById(db, id);
    if (!prev) {
      throw new AppError(404, 'Laporan tidak ditemukan');
    }
    throw new AppError(409, 'Laporan ini sudah diproses, jadi tidak bisa diubah lagi');
  }
  return updated;
}

/** Hapus laporan — hanya selama masih pending dan bukan satu-satunya data tersisa. */
export async function deleteReport(db: DbQuery, id: number): Promise<void> {
  // Atomik seperti updateReportStatus: cek + hapus dalam satu query.
  // CTE `total` membaca jumlah baris dalam snapshot yang sama — dua request
  // bersamaan tidak bisa dua-duanya lolos (satu gagal, dan baris terakhir tetap terkunci).
  const result = await db.query(
    `WITH total AS (SELECT COUNT(*)::int AS c FROM reports)
     DELETE FROM reports USING total
     WHERE reports.id = $1 AND reports.status = 'pending' AND total.c > 1
     RETURNING ${COLUMNS}`,
    [id],
  );
  if (result.rows[0] as Report | undefined) return;
  // Baris tidak terhapus: bedakan 404 vs 409 lewat baca ulang.
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  if (prev.status !== 'pending') {
    throw new AppError(409, 'Laporan ini sudah diproses, jadi tidak bisa dihapus lagi');
  }
  throw new AppError(409, 'Ini laporan terakhir yang tersisa, jadi tidak bisa dihapus');
}

/** Jejak perubahan status satu laporan, terbaru dulu. */
export async function getHistory(db: DbQuery, id: number): Promise<StatusHistory[]> {
  const prev = await findById(db, id);
  if (!prev) {
    throw new AppError(404, 'Laporan tidak ditemukan');
  }
  let res;
  try {
    res = await db.query(
      `SELECT from_status, to_status, changed_at FROM report_status_history
       WHERE report_id = $1 ORDER BY changed_at DESC, id DESC`,
      [id],
    );
  } catch (err) {
    console.warn(`Gagal membaca riwayat status laporan ${id}:`, err);
    return [];
  }
  return res.rows as StatusHistory[];
}
