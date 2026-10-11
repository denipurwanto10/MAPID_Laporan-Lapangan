export const REPORT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Status yang boleh di-set lewat endpoint PATCH /:id/status. */
export const UPDATABLE_STATUSES: readonly ReportStatus[] = ['approved', 'rejected'];

export interface Report {
  id: number;
  nama: string;
  deskripsi: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

/** Parameter query GET /api/reports. Semua opsional, ada nilai default yang aman. */
export interface ListQuery {
  page: number;
  limit: number;
  status?: ReportStatus;
  q: string;
  sort: 'created_at' | 'updated_at';
  order: 'asc' | 'desc';
}

/** Ringkasan jumlah laporan per status (tanpa filter). */
export interface ReportSummary {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
}

/** Satu baris jejak perubahan status laporan. */
export interface StatusHistory {
  from_status: ReportStatus;
  to_status: ReportStatus;
  changed_at: string;
}
