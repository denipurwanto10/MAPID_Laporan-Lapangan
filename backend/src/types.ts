export const REPORT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Status yang boleh di-set lewat endpoint PATCH /:id/status. */
export const UPDATABLE_STATUSES: readonly ReportStatus[] = ['approved', 'rejected'];

/** Tiga peran pengguna. Akun dibuat admin — tidak ada registrasi mandiri. */
export const USER_ROLES = ['admin', 'pelapor', 'approver'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Peran yang boleh melakukan approve/reject, termasuk revisi antartatus. */
export const DECIDER_ROLES: readonly UserRole[] = ['admin', 'approver'];
/** Peran yang boleh membuat laporan. */
export const REPORTER_ROLES: readonly UserRole[] = ['admin', 'pelapor'];
/** Peran yang boleh mengelola akun pengguna. */
export const ADMIN_ROLES: readonly UserRole[] = ['admin'];

/**
 * Transisi status yang diizinkan.
 *
 * - pending -> approved / rejected : keputusan pertama oleh approver (atau admin).
 * - approved <-> rejected          : revisi keputusan oleh approver (atau admin).
 *
 * Pelapor tidak punya akses ke transisi mana pun — dia hanya boleh mengubah
 * isi laporan miliknya selama statusnya masih pending.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: ['rejected', 'approved'],
  rejected: ['approved', 'rejected'],
};

/** Akun pengguna tanpa data sensitif (dipakai di respons API). */
export interface User {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
}

/** Identitas hasil login yang menempel di req.user selama satu request. */
export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface Report {
  id: number;
  nama: string;
  deskripsi: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  /** Id pelapor yang membuat laporan ini. */
  reporter_id: number;
  /** Nama pelapor (hasil JOIN users) — ditampilkan di UI. */
  reporter_name?: string;
  /** Id approver/admin yang terakhir memutuskan; null bila belum diputuskan. */
  decided_by?: number | null;
  /** Nama decideur terakhir (hasil JOIN users). */
  decided_by_name?: string | null;
  /** Waktu keputusan terakhir. */
  decided_at?: string | null;
}

/** Parameter query GET /api/reports. Semua opsional, ada nilai default yang aman. */
export interface ListQuery {
  page: number;
  limit: number;
  status?: ReportStatus;
  q: string;
  sort: 'created_at' | 'updated_at';
  order: 'asc' | 'desc';
  /** Pelapor: batasi ke laporan miliknya. Diabaikan untuk admin/approver. */
  mine?: boolean;
}

/** Ringkasan jumlah laporan per status (menghormati cakupan "milik saya"). */
export interface ReportSummary {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
}

/** Satu baris jejak perubahan status laporan, termasuk siapa yang memutuskan. */
export interface StatusHistory {
  from_status: ReportStatus;
  to_status: ReportStatus;
  /** Id akun yang memutuskan; null untuk entri lama tanpa aktor. */
  decided_by?: number | null;
  /** Nama akun yang memutuskan (hasil JOIN users). */
  decided_by_name?: string | null;
  changed_at: string;
}
