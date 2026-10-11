import { ApiError } from "./api";
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
 * Unduh Excel (.xlsx) dari Supabase Edge Function — satu request, satu file.
 * Workbook disusun di server (supabase/functions/export-xlsx), frontend hanya mengunduh.
 */
export async function exportReports(params: ExportParams): Promise<ExportResult> {
  const search = new URLSearchParams();
  if (params.status !== "all") search.set("status", params.status);
  if (params.q.trim()) search.set("q", params.q.trim());
  if (params.order === "oldest") search.set("order", "asc");
  // Offset zona waktu agar jam di Excel sama seperti sebelumnya (dibuat di client).
  search.set("tz", String(new Date().getTimezoneOffset()));

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-xlsx?${search.toString()}`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
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
