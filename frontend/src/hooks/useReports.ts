import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "../lib/api";
import {
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type ListMeta,
  type PageSize,
  type Report,
  type ReportSummary,
  type SortOrder,
  type StatusFilter,
} from "../types/report";

export interface PendingAction {
  id: number;
  kind: "approve" | "reject" | "edit" | "delete";
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Terjadi kesalahan yang tidak terduga. Coba lagi.";
}

function readParamsFromUrl(): { page: number; limit: PageSize; status: StatusFilter; q: string; order: SortOrder } {
  const search = new URLSearchParams(window.location.search);
  const page = Math.max(1, Number.parseInt(search.get("page") ?? "1", 10) || 1);
  const rawLimit = Number.parseInt(search.get("limit") ?? "", 10);
  const limit: PageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawLimit)
    ? (rawLimit as PageSize)
    : PAGE_SIZE;
  const rawStatus = search.get("status") ?? "all";
  const status: StatusFilter =
    rawStatus === "pending" || rawStatus === "approved" || rawStatus === "rejected"
      ? rawStatus
      : "all";
  const order: SortOrder = search.get("order") === "oldest" ? "oldest" : "newest";
  return { page, limit, status, q: (search.get("q") ?? "").slice(0, 200), order };
}

const EMPTY_SUMMARY: ReportSummary = { all: 0, pending: 0, approved: 0, rejected: 0 };

/** Ringkasan setelah `count` laporan pending diputuskan sekaligus. */
function summaryAfterDecision(
  s: ReportSummary,
  status: "approved" | "rejected",
  count: number,
): ReportSummary {
  return {
    ...s,
    pending: Math.max(0, s.pending - count),
    approved: s.approved + (status === "approved" ? count : 0),
    rejected: s.rejected + (status === "rejected" ? count : 0),
  };
}

/** Ringkasan setelah satu laporan pending dihapus. */
function summaryAfterDelete(s: ReportSummary): ReportSummary {
  return { ...s, all: Math.max(0, s.all - 1), pending: Math.max(0, s.pending - 1) };
}

/* ---------------- Hook utama ---------------- */

export function useReports() {
  /* ----- State daftar + filter (selalu tercermin di URL) ----- */
  const initial = useRef(readParamsFromUrl()).current;
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<ReportSummary>(EMPTY_SUMMARY);
  const [meta, setMeta] = useState<ListMeta>({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [page, setPage] = useState(initial.page);
  const [limit, setLimitState] = useState<PageSize>(initial.limit);
  const [filter, setFilter] = useState<StatusFilter>(initial.status);
  const [query, setQuery] = useState(initial.q);
  const [order, setOrder] = useState<SortOrder>(initial.order);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // Snapshot daftar untuk optimistic update + rollback (ref selalu sinkron dengan state).
  const reportsRef = useRef<Report[]>([]);
  reportsRef.current = reports;

  /* ----- Fetch daftar: baca dari URL (sumber utama) agar bookmark/refresh konsisten ----- */
  const load = useCallback(
    async (mode: "initial" | "silent" | "poll" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
        setError(null);
      }
      try {
        const current = readParamsFromUrl();
        const result = await api.listReports({
          page: current.page,
          limit: current.limit,
          status: current.status,
          q: current.q,
          order: current.order,
        });
        setReports(result.items);
        setMeta(result.meta);
        setSummary(result.summary);
        setPage(result.meta.page);
        setLimitState(current.limit);
        setFilter(current.status);
        setQuery(current.q);
        setOrder(current.order);
        setError(null);
      } catch (e) {
        const message = messageOf(e);
        // Poll otomatis tidak boleh berisik: gagal diam-diam, coba lagi interval berikut.
        if (mode === "silent") toast.error(message);
        else if (mode === "initial") setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* ----- Sinkronkan filter + pencarian + halaman + limit ke URL agar bisa dibagikan/bookmark ----- */
  useEffect(() => {
    const search = new URLSearchParams();
    if (page > 1) search.set("page", String(page));
    if (limit !== PAGE_SIZE) search.set("limit", String(limit));
    if (filter !== "all") search.set("status", filter);
    if (query.trim()) search.set("q", query.trim());
    if (order === "oldest") search.set("order", "oldest");
    const qs = search.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [page, limit, filter, query, order]);

  /* ----- Ambil ulang dari server saat filter/q/halaman/limit berubah (debounce 350ms untuk q) ----- */
  // Satu-satunya ref di sini: penanda "efek pertama dilewati" karena data awal
  // sudah dimuat load("initial"). Nilai filter dibaca langsung dari closure
  // (sesuai dependensi effect) — tanpa ref per-nilai.
  const skippedInitialRef = useRef(false);
  useEffect(() => {
    // Lewati pemicu saat mount: data awal sudah dimuat oleh load("initial").
    if (!skippedInitialRef.current) {
      skippedInitialRef.current = true;
      return;
    }
    if (loading) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await api.listReports({ page, limit, status: filter, q: query, order });
          setReports(result.items);
          setMeta(result.meta);
          setSummary(result.summary);
        } catch (e) {
          toast.error(messageOf(e));
        }
      })();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, filter, query, order]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  /* ----- Refresh otomatis tiap 15 detik + saat tab kembali terlihat ----- */
  // Poll diam-diam ("poll"): tidak ada spinner, tidak ada toast bila gagal.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void load("poll");
    }, 15_000);
    const onVisible = () => {
      if (!document.hidden) void load("poll");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /* ----- Ubah filter/pencarian/urutan/limit: selalu kembali ke halaman 1 ----- */
  const changeFilter = useCallback((value: StatusFilter) => {
    setPage(1);
    setFilter(value);
    setSelectedIds([]);
  }, []);

  const changeQuery = useCallback((value: string) => {
    setPage(1);
    setQuery(value);
    setSelectedIds([]);
  }, []);

  /** Ganti urutan daftar; kembali ke halaman 1. */
  const changeOrder = useCallback((value: SortOrder) => {
    setPage(1);
    setOrder(value);
  }, []);

  /** Ganti jumlah baris per halaman; kembali ke halaman 1. */
  const changeLimit = useCallback((value: PageSize) => {
    setPage(1);
    setLimitState(value);
  }, []);

  /* ----- Mutasi: buat, setujui/tolak, ubah, hapus ----- */
  const create = useCallback(
    async (nama: string, deskripsi: string): Promise<Report> => {
      const created = await api.createReport(nama, deskripsi);
      // Muat ulang daftar agar pagination + ringkasan tetap konsisten dengan server.
      await load("silent");
      return created;
    },
    [load],
  );

  const setStatus = useCallback(
    async (id: number, status: "approved" | "rejected"): Promise<void> => {
      if (action) return;
      setAction({ id, kind: status === "approved" ? "approve" : "reject" });
      // Optimistic update: badge langsung berubah, rollback bila server menolak.
      const prev = reportsRef.current.find((r) => r.id === id);
      setReports((list) =>
        list.map((r) =>
          r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r,
        ),
      );
      try {
        const updated = await api.updateStatus(id, status);
        setReports((list) => list.map((r) => (r.id === id ? updated : r)));
        setSummary((s) => summaryAfterDecision(s, status, 1));
        toast.success(status === "approved" ? "Laporan disetujui." : "Laporan ditolak.");
      } catch (e) {
        // Rollback tampilan ke status sebelum aksi (mis. 409 karena sudah diputuskan di tab lain).
        if (prev) setReports((list) => list.map((r) => (r.id === id ? prev : r)));
        toast.error(messageOf(e));
      } finally {
        setAction(null);
      }
    },
    [action],
  );

  const setStatusBulk = useCallback(
    async (ids: number[], status: "approved" | "rejected"): Promise<void> => {
      if (action || ids.length === 0) return;
      setAction({ id: ids[0], kind: status === "approved" ? "approve" : "reject" });
      const prevList = reportsRef.current;
      setReports((list) =>
        list.map((r) =>
          ids.includes(r.id) && r.status === "pending"
            ? { ...r, status, updated_at: new Date().toISOString() }
            : r,
        ),
      );
      try {
        const { updated, skipped } = await api.bulkUpdateStatus(ids, status);
        const byId = new Map(updated.map((r) => [r.id, r]));
        setReports((list) => list.map((r) => byId.get(r.id) ?? r));
        setSummary((s) => summaryAfterDecision(s, status, updated.length));
        if (updated.length > 0) {
          toast.success(
            status === "approved"
              ? `${updated.length} laporan disetujui.`
              : `${updated.length} laporan ditolak.`,
          );
        }
        if (skipped.length > 0) {
          toast.warning(`${skipped.length} laporan dilewati (sudah diputuskan/tidak ada).`);
        }
        setSelectedIds([]);
      } catch (e) {
        setReports(prevList);
        toast.error(messageOf(e));
        throw e;
      } finally {
        setAction(null);
      }
    },
    [action],
  );

  const edit = useCallback(
    async (id: number, nama: string, deskripsi: string): Promise<void> => {
      if (action) return;
      setAction({ id, kind: "edit" });
      try {
        const updated = await api.updateReport(id, nama, deskripsi);
        setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
        toast.success("Perubahan disimpan.");
      } catch (e) {
        toast.error(messageOf(e));
        throw e;
      } finally {
        setAction(null);
      }
    },
    [action],
  );

  /* ----- Seleksi bulk ----- */
  /** Centang/hapus satu laporan pending dari seleksi bulk. */
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  /** Centang semua pending di halaman ini, atau kosongkan bila sudah semua tercentang. */
  const toggleSelectPage = useCallback((ids: number[]) => {
    setSelectedIds((prev) => {
      const allChecked = ids.length > 0 && ids.every((id) => prev.includes(id));
      if (allChecked) return prev.filter((id) => !ids.includes(id));
      return [...new Set([...prev, ...ids])];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const remove = useCallback(
    async (id: number): Promise<void> => {
      if (action) return;
      setAction({ id, kind: "delete" });
      try {
        await api.removeReport(id);
        setReports((prev) => prev.filter((r) => r.id !== id));
        setSummary(summaryAfterDelete);
        setMeta((m) => {
          const total = Math.max(0, m.total - 1);
          return {
            ...m,
            total,
            totalPages: Math.max(1, Math.ceil(total / m.limit)),
          };
        });
        toast.success("Laporan dihapus.");
      } catch (e) {
        toast.error(messageOf(e));
        throw e;
      } finally {
        setAction(null);
      }
    },
    [action],
  );

  return {
    reports,
    summary,
    meta,
    page,
    limit,
    setPage,
    filter,
    changeFilter,
    query,
    changeQuery,
    order,
    changeOrder,
    changeLimit,
    loading,
    error,
    action,
    reload: load,
    create,
    setStatus,
    setStatusBulk,
    selectedIds,
    toggleSelect,
    toggleSelectPage,
    clearSelection,
    edit,
    remove,
  };
}
