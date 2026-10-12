import { ApiError, authHeaders } from "./api";
import type { SortOrder, StatusFilter } from "../types/report";

interface ExportParams {
  status: StatusFilter;
  q: string;
  order: SortOrder;
}

function fallbackFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `laporan-lapangan-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
}

/** Nama file dari header Content-Disposition backend, fallback ke nama lokal. */
function filenameFrom(res: Response): string {
  const header = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+\.xlsx)"/.exec(header);
  return match ? match[1] : fallbackFilename();
}

export interface ExportResult {
  filename: string;
  /** True bila server memotong isi karena melebihi batas baris. */
  truncated: boolean;
}

/**
 * Unduh Excel (.xlsx) langsung dari Express — GET /api/reports/export.xlsx.
 * Workbook disusun di server dengan exceljs (backend/src/exportXlsx.ts),
 * frontend hanya mengunduh (satu request, satu file).
 */
export async function exportReports(params: ExportParams): Promise<ExportResult> {
  const search = new URLSearchParams();
  if (params.status !== "all") search.set("status", params.status);
  if (params.q.trim()) search.set("q", params.q.trim());
  if (params.order === "oldest") search.set("order", "asc");
  // Offset zona waktu agar jam di Excel sama seperti di layar pengguna.
  search.set("tz", String(new Date().getTimezoneOffset()));

  let res: Response;
  try {
    res = await fetch(`/api/reports/export.xlsx?${search.toString()}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
  }
  if (!res.ok) {
    let message = `Server mengembalikan status ${res.status}. Coba lagi.`;
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim()) message = body.message;
    } catch {
      /* abaikan — pakai pesan default */
    }
    throw new ApiError(res.status, message);
  }

  const blob = await res.blob();
  const filename = filenameFrom(res);
  const truncated = (res.headers.get("x-export-truncated") ?? "").startsWith("true");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, truncated };
}
