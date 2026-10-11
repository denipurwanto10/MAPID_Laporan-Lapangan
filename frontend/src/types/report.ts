export type ReportStatus = "pending" | "approved" | "rejected";

export interface Report {
  id: number;
  nama: string;
  deskripsi: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
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
export const PAGE_SIZE = 10;
/** Pilihan jumlah baris per halaman yang bisa dipilih pengguna. */
export const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const NAMA_MAX = 200;
export const DESKRIPSI_MAX = 2000;
