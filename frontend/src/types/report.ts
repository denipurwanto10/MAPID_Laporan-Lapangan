export type ReportStatus = "pending" | "approved" | "rejected";

/** Peran pengguna. Akun dibuat admin — tidak ada registrasi mandiri. */
export type UserRole = "admin" | "pelapor" | "approver";

export const USER_ROLES: readonly UserRole[] = ["admin", "pelapor", "approver"];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  pelapor: "Pelapor",
  approver: "Approver",
};

export const ROLE_DESC: Record<UserRole, string> = {
  admin: "Kelola akun pengguna dan bisa melihat semua laporan.",
  pelapor: "Buat laporan, edit selama masih menunggu, hapus laporan sendiri.",
  approver: "Setujui atau tolak laporan yang masuk.",
};

/** Profil user yang sedang login (tanpa data sensitif). */
export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

/** Akun pengguna yang dikelola admin. */
export interface ManagedUser extends AuthUser {
  created_at: string;
  report_count: number;
}

/** Sesi login: token disimpan server, frontend hanya memegang tokennya. */
export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface Report {
  id: number;
  nama: string;
  deskripsi: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  /** Pemilik laporan (dari session login saat dibuat). */
  reporter_id: number;
  reporter_name: string;
  /** Siapa yang memutuskan + kapan. Null selama masih pending. */
  decided_by: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
}

export type StatusFilter = "all" | ReportStatus;

/** Urutan daftar: terbaru dulu atau terlama dulu (created_at desc/asc). */
export type SortOrder = "newest" | "oldest";

export interface ReportSummary {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface StatusHistory {
  from_status: ReportStatus;
  to_status: ReportStatus;
  changed_at: string;
  decided_by: number | null;
  decided_by_name: string | null;
}

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/** Jumlah baris per halaman daftar laporan (default). */
export const PAGE_SIZE = 5;
/** Pilihan jumlah baris per halaman yang bisa dipilih pengguna. */
export const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const NAMA_MAX = 200;
export const DESKRIPSI_MAX = 2000;

/** Batas panjang username & password, sama dengan validasi backend. */
export const USERNAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
