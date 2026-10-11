import { createClient } from "@supabase/supabase-js";
import type { ListMeta, Report, ReportSummary, SortOrder, StatusFilter, StatusHistory } from "../types/report";

/** Supabase client (browser). Hanya anon key — RLS di server yang menjaga keamanan. */
export const supabase = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string) ?? "",
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "",
);

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Baris summary dari PostgREST hanya berisi kolom status. */
interface StatusCountRow {
  status: string;
}

interface ListParams {
  page: number;
  limit: number;
  status: StatusFilter;
  q: string;
  order?: SortOrder;
}

export const api = {
  /** Health check via a lightweight query. */
  async health(): Promise<{ ok: boolean; time: string }> {
    const { error } = await supabase.from("reports").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw new ApiError(500, error.message);
    return { ok: true, time: new Date().toISOString() };
  },

  /** List reports with pagination, filter, search, sort. */
  async listReports(params: ListParams): Promise<{ items: Report[]; meta: ListMeta; summary: ReportSummary }> {
    const { page, limit, status, q, order } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("reports")
      .select("id,nama,deskripsi,status,created_at,updated_at", { count: "exact" })
      .order(order === "oldest" ? "created_at" : "created_at", { ascending: order === "oldest" })
      .range(from, to);

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (q.trim()) {
      const escaped = q.trim().replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(`nama.ilike.*${escaped}*,deskripsi.ilike.*${escaped}*`);
    }

    const { data, error, count } = await query;
    if (error) throw new ApiError(500, error.message);

    // Get summary counts (all statuses)
    const { data: summaryData, error: summaryError } = await supabase
      .from("reports")
      .select("status", { count: "exact" });
    if (summaryError) throw new ApiError(500, summaryError.message);

    const summary: ReportSummary = { all: 0, pending: 0, approved: 0, rejected: 0 };
    for (const row of (summaryData ?? []) as StatusCountRow[]) {
      if (row.status === "pending" || row.status === "approved" || row.status === "rejected") {
        summary[row.status]++;
        summary.all++;
      }
    }

    return {
      items: data as Report[],
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
      },
      summary,
    };
  },

  /** Create a new report (status always 'pending' via RLS). */
  async createReport(nama: string, deskripsi: string): Promise<Report> {
    const { data, error } = await supabase
      .from("reports")
      .insert({ nama, deskripsi, status: "pending" })
      .select("id,nama,deskripsi,status,created_at,updated_at")
      .single();
    if (error) throw new ApiError(400, error.message);
    return data as Report;
  },

  /** Get single report by id. */
  async getReport(id: number): Promise<Report> {
    const { data, error } = await supabase
      .from("reports")
      .select("id,nama,deskripsi,status,created_at,updated_at")
      .eq("id", id)
      .single();
    if (error) throw new ApiError(error.code === "PGRST116" ? 404 : 500, error.message);
    return data as Report;
  },

  /** Update status of a single report (only pending -> approved/rejected via RLS). */
  async updateStatus(id: number, status: "approved" | "rejected"): Promise<Report> {
    const { data, error } = await supabase
      .from("reports")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,nama,deskripsi,status,created_at,updated_at")
      .single();
    if (error) {
      if (error.code === "PGRST116") throw new ApiError(404, "Laporan tidak ditemukan");
      if (error.message.includes("row-level security")) throw new ApiError(409, "Laporan ini sudah Disetujui atau Ditolak, jadi tidak bisa diubah lagi");
      throw new ApiError(500, error.message);
    }
    return data as Report;
  },

  /** Bulk update status via Edge Function (atomic, returns updated + skipped). */
  async bulkUpdateStatus(ids: number[], status: "approved" | "rejected"): Promise<{ updated: Report[]; skipped: { id: number; reason: string }[] }> {
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-status`;
    const res = await fetch(fnUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new ApiError(res.status, err.error || "Bulk update failed");
    }
    return res.json();
  },

  /** Update nama/deskripsi (only pending via RLS). */
  async updateReport(id: number, nama: string, deskripsi: string): Promise<Report> {
    const { data, error } = await supabase
      .from("reports")
      .update({ nama, deskripsi, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,nama,deskripsi,status,created_at,updated_at")
      .single();
    if (error) {
      if (error.code === "PGRST116") throw new ApiError(404, "Laporan tidak ditemukan");
      if (error.message.includes("row-level security")) throw new ApiError(409, "Laporan ini sudah diproses, jadi tidak bisa diubah lagi");
      throw new ApiError(500, error.message);
    }
    return data as Report;
  },

  /** Delete report (only pending and not last via RLS). */
  async removeReport(id: number): Promise<{ id: number }> {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      if (error.code === "PGRST116") throw new ApiError(404, "Laporan tidak ditemukan");
      if (error.message.includes("row-level security")) {
        // Could be "already decided" or "last row" - check first
        const { data: existing } = await supabase.from("reports").select("status").eq("id", id).single();
        if (!existing) throw new ApiError(404, "Laporan tidak ditemukan");
        if (existing.status !== "pending") throw new ApiError(409, "Laporan ini sudah diproses, jadi tidak bisa dihapus lagi");
        throw new ApiError(409, "Ini laporan terakhir yang tersisa, jadi tidak bisa dihapus");
      }
      throw new ApiError(500, error.message);
    }
    return { id };
  },

  /** Get status history for a report. */
  async history(id: number): Promise<StatusHistory[]> {
    const { data, error } = await supabase
      .from("report_status_history")
      .select("from_status,to_status,changed_at")
      .eq("report_id", id)
      .order("changed_at", { ascending: false });
    if (error) {
      console.warn("Failed to load history:", error);
      return [];
    }
    return data as StatusHistory[];
  },
};
