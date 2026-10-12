import type { ListMeta, Report, ReportSummary, SortOrder, StatusFilter, StatusHistory } from "../types/report";

/**
 * Klien API REST laporan lapangan.
 *
 * CRUD (list / create / get / update / status / delete / history) memakai
 * Express — backend/src/ — yang di-deploy sebagai Vercel serverless function di
 * path /api. Business rules (hanya pending yang boleh diubah, proteksi baris
 * terakhir, rate limit) ditegakkan di Express; RLS di PostgreSQL tetap menjadi
 * lapisan kedua.
 *
 * Bulk approve/reject memakai Supabase Edge Function (runtime Deno) karena
 * eksplisit butuh processing batch atomik di sisi server.
 */

/** Base path API — relatif agar frontend & backend satu origin (Vercel). */
const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ListParams {
  page: number;
  limit: number;
  status: StatusFilter;
  q: string;
  order?: SortOrder;
}

/** Bentuk respons error dari Express: { success: false, message }. */
async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new ApiError(res.status, body?.message ?? fallback);
}

/** Kolom sort (whitelist) — nilai dari user tidak pernah masuk ke SQL mentah. */
function sortColumn(_order: SortOrder | undefined): "created_at" | "updated_at" {
  return "created_at";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res, `Permintaan gagal (${res.status})`);
  const body = (await res.json()) as { success: boolean; data: T };
  return body.data;
}

export const api = {
  /** Health check. */
  async health(): Promise<{ ok: boolean; time: string }> {
    return request<{ ok: boolean; time: string }>("/health");
  },

  /** Daftar laporan + pagination + filter + pencarian + summary per status. */
  async listReports(
    params: ListParams,
  ): Promise<{ items: Report[]; meta: ListMeta; summary: ReportSummary }> {
    const { page, limit, status, q, order } = params;
    const search = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      order: order === "oldest" ? "asc" : "desc",
      sort: sortColumn(order),
    });
    if (status !== "all") search.set("status", status);
    if (q.trim()) search.set("q", q.trim());

    const res = await fetch(`${API_BASE}/reports?${search.toString()}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw await toApiError(res, "Gagal memuat daftar laporan");
    const body = (await res.json()) as {
      success: boolean;
      data: Report[];
      meta: { total: number; page: number; limit: number; totalPages: number };
      summary: ReportSummary;
    };
    return {
      items: body.data,
      meta: {
        total: body.meta.total,
        page: body.meta.page,
        limit: body.meta.limit,
        totalPages: body.meta.totalPages,
      },
      summary: body.summary,
    };
  },

  /** Buat laporan baru. Status selalu 'pending' (di-set server, bukan client). */
  async createReport(nama: string, deskripsi: string): Promise<Report> {
    return request<Report>("/reports", {
      method: "POST",
      body: JSON.stringify({ nama, deskripsi }),
    });
  },

  /** Ambil satu laporan. */
  async getReport(id: number): Promise<Report> {
    return request<Report>(`/reports/${id}`);
  },

  /** Ubah status menjadi approved/rejected. Hanya laporan pending yang boleh. */
  async updateStatus(id: number, status: "approved" | "rejected"): Promise<Report> {
    return request<Report>(`/reports/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  /** Ubah nama/deskripsi. Hanya saat masih pending. */
  async updateReport(id: number, nama: string, deskripsi: string): Promise<Report> {
    return request<Report>(`/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nama, deskripsi }),
    });
  },

  /** Hapus laporan. Hanya saat pending dan bukan baris terakhir. */
  async removeReport(id: number): Promise<{ id: number }> {
    return request<{ id: number }>(`/reports/${id}`, { method: "DELETE" });
  },

  /** Riwayat perubahan status satu laporan, terbaru dulu. */
  async history(id: number): Promise<StatusHistory[]> {
    try {
      return await request<StatusHistory[]>(`/reports/${id}/history`);
    } catch (err) {
      // Riwayat bersifat pelengkap — kegagalan tidak boleh menggagalkan UI.
      console.warn("Gagal memuat riwayat status:", err);
      return [];
    }
  },

  /**
   * Bulk approve/reject — satu request, atomik di database.
   * Supabase Edge Function (Deno): butuh runtime Deno untuk batch atomik + RLS.
   */
  async bulkUpdateStatus(
    ids: number[],
    status: "approved" | "rejected",
  ): Promise<{ updated: Report[]; skipped: { id: number; reason: string }[] }> {
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-status`;
    const res = await fetch(fnUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, err?.error ?? "Bulk update gagal");
    }
    return (await res.json()) as { updated: Report[]; skipped: { id: number; reason: string }[] };
  },
};
