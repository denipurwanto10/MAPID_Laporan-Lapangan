import type { ListMeta, Report, ReportSummary, SortOrder, StatusFilter, StatusHistory } from "../types/report";

/** Base URL backend, mis. http://localhost:3001. Ada fallback lokal yang aman. */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:3001";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface FailEnvelope {
  success: false;
  message?: string;
}

/** Fetch ke backend; gagal koneksi diterjemahkan ke pesan yang ramah. */
async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
  }
}

/** Pesan error dari envelope gagal; fallback ke status HTTP bila body tak terbaca. */
function failMessage(body: FailEnvelope | null, status: number): string {
  const message = body?.success === false ? body.message : undefined;
  return typeof message === "string" && message.trim()
    ? message
    : `Server mengembalikan status ${status}. Coba lagi.`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchApi(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  let body: SuccessEnvelope<T> | FailEnvelope | null = null;
  try {
    body = (await res.json()) as SuccessEnvelope<T> | FailEnvelope;
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.success !== true) {
    throw new ApiError(res.status, failMessage(body && body.success === false ? body : null, res.status));
  }
  return (body as SuccessEnvelope<T>).data;
}

interface ListEnvelope {
  success: true;
  data: Report[];
  meta: ListMeta;
  summary: ReportSummary;
}

export interface ListParams {
  page: number;
  limit: number;
  status: StatusFilter;
  q: string;
  /** Urutan daftar; default "newest" (created_at desc). */
  order?: SortOrder;
}

export const api = {
  health(): Promise<{ ok: boolean; time: string }> {
    return request("/api/health");
  },
  async listReports(params: ListParams): Promise<{ items: Report[]; meta: ListMeta; summary: ReportSummary }> {
    const search = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.status !== "all") search.set("status", params.status);
    if (params.q.trim()) search.set("q", params.q.trim());
    if (params.order === "oldest") search.set("order", "asc");
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/reports?${search.toString()}`);
    } catch {
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
    }
    let body: ListEnvelope | FailEnvelope | null = null;
    try {
      body = (await res.json()) as ListEnvelope | FailEnvelope;
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.success !== true) {
      const message =
        body && body.success === false && typeof body.message === "string" && body.message.trim()
          ? body.message
          : `Server mengembalikan status ${res.status}. Coba lagi.`;
      throw new ApiError(res.status, message);
    }
    const list = body as ListEnvelope;
    return { items: list.data, meta: list.meta, summary: list.summary };
  },
  createReport(nama: string, deskripsi: string): Promise<Report> {
    return request<Report>("/api/reports", {
      method: "POST",
      body: JSON.stringify({ nama, deskripsi }),
    });
  },
  getReport(id: number): Promise<Report> {
    return request<Report>(`/api/reports/${id}`);
  },
  bulkUpdateStatus(
    ids: number[],
    status: "approved" | "rejected",
  ): Promise<{ updated: Report[]; skipped: { id: number; reason: string }[] }> {
    return request<{ updated: Report[]; skipped: { id: number; reason: string }[] }>(
      "/api/reports/bulk-status",
      {
        method: "PATCH",
        body: JSON.stringify({ ids, status }),
      },
    );
  },
  updateReport(id: number, nama: string, deskripsi: string): Promise<Report> {
    return request<Report>(`/api/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nama, deskripsi }),
    });
  },
  removeReport(id: number): Promise<{ id: number }> {
    return request<{ id: number }>(`/api/reports/${id}`, { method: "DELETE" });
  },
  updateStatus(id: number, status: "approved" | "rejected"): Promise<Report> {
    return request<Report>(`/api/reports/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  history(id: number): Promise<StatusHistory[]> {
    return request<StatusHistory[]>(`/api/reports/${id}/history`);
  },
};
