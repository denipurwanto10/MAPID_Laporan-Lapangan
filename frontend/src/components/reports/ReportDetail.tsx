import { useEffect, useState } from "react";
import { CalendarDays, Hash, Lock, Pencil, Check, Trash2, X, History, Gavel, UserRound } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet";
import { StatusBadge } from "./StatusBadge";
import { ApiError, api } from "../../lib/api";
import { formatTanggal } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { STATUS_LABEL, type Report, type ReportStatus, type StatusHistory } from "../../types/report";
import { cn } from "../../lib/utils";

interface ReportDetailProps {
  /** Laporan yang dibuka; null menutup panel. */
  report: Report | null;
  onClose: () => void;
  busy: boolean;
  canDelete: boolean;
  onApprove: (report: Report) => void;
  onReject: (report: Report) => void;
  onEdit: (report: Report) => void;
  onDelete: (report: Report) => void;
}

const DOT: Record<ReportStatus, string> = {
  pending: "bg-pending-foreground",
  approved: "bg-approved-foreground",
  rejected: "bg-rejected-foreground",
};

type HistoryState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: StatusHistory[] };

/** Linimasa perubahan status. Entri terbaru di atas, "Laporan dibuat" selalu di dasar. */
function StatusTimeline({ id, status, createdAt }: { id: number; status: ReportStatus; createdAt: string }) {
  const [state, setState] = useState<HistoryState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .history(id)
      .then((items) => {
        if (!cancelled) setState({ kind: "ready", items });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ kind: "error", message: e instanceof ApiError ? e.message : "Riwayat belum bisa dimuat." });
      });
    return () => {
      cancelled = true;
    };
    // status ikut dependensi agar riwayat dimuat ulang setelah laporan diputuskan.
  }, [id, status, attempt]);

  if (state.kind === "loading") {
    return (
      <div role="status" aria-label="Memuat riwayat" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="rounded-2xl border border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
        {state.message}{" "}
        <button
          type="button"
          onClick={() => {
            // Set loading di event handler (bukan di effect) agar tidak memicu render beruntun.
            setState({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
          className="cursor-pointer font-semibold text-primary underline-offset-4 hover:underline"
        >
          Coba lagi
        </button>
      </p>
    );
  }

  const items = [...state.items].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

  return (
    <ol className="flex flex-col">
      {items.map((h, i) => (
        <li key={`${h.changed_at}-${i}`} className="relative flex gap-3 pb-5">
          <span aria-hidden="true" className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />
          <span aria-hidden="true" className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", DOT[h.to_status])} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{STATUS_LABEL[h.to_status]}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              dari {STATUS_LABEL[h.from_status]}, <time dateTime={h.changed_at}>{formatTanggal(h.changed_at)}</time>
              {h.decided_by_name ? ` oleh ${h.decided_by_name}` : ""}
            </p>
          </div>
        </li>
      ))}
      <li className="relative flex gap-3">
        <span aria-hidden="true" className="relative mt-1.5 size-[11px] shrink-0 rounded-full bg-muted-foreground/50 ring-4 ring-card" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Laporan dibuat</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            <time dateTime={createdAt}>{formatTanggal(createdAt)}</time>
          </p>
        </div>
      </li>
    </ol>
  );
}

/** Panel detail: deskripsi lengkap, metadata, riwayat status, dan semua aksi untuk satu laporan. */
export function ReportDetail({ report, onClose, busy, canDelete, onApprove, onReject, onEdit, onDelete }: ReportDetailProps) {
  const { user } = useAuth();
  // Simpan laporan terakhir agar isi panel tidak kosong selama animasi tutup.
  // Penyesuaian state saat render (bukan di effect): pola resmi React untuk
  // menyimpan snapshot prop sebelumnya — tidak memicu render beruntun.
  const [last, setLast] = useState<Report | null>(report);
  if (report !== null && report !== last) {
    setLast(report);
  }
  const shown = report ?? last;
  const pending = shown?.status === "pending";
  const isDecider = user?.role === "admin" || user?.role === "approver";
  const isOwner = shown != null && user != null && shown.reporter_id === user.id;
  const isAdmin = user?.role === "admin";
  const canDecideThis = pending && !!isDecider;
  const canEditThis = pending && (isOwner || isAdmin);
  // Approver tidak boleh menghapus; pemilik boleh menghapus; admin boleh.
  const canDeleteThis = pending && (isOwner || isAdmin) && canDelete;
  const canUndo = !pending && isDecider && shown?.status === "rejected" ? "approved" : !pending && isDecider && shown?.status === "approved" ? "rejected" : null;

  return (
    <Sheet open={report !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {shown && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2.5">
                <StatusBadge status={shown.status} />
                <span className="text-sm font-medium text-muted-foreground tabular-nums sm:hidden">#{shown.id}</span>
              </div>
              <SheetTitle>{shown.nama}</SheetTitle>
              <SheetDescription className="sr-only">Detail laporan</SheetDescription>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-6">
              <section aria-labelledby="detail-deskripsi">
                <h3 id="detail-deskripsi" className="mb-2 text-sm font-semibold">Deskripsi</h3>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">
                  {shown.deskripsi}
                </p>
              </section>

              <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2.5">
                  <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Dibuat</dt>
                    <dd className="font-medium tabular-nums">{formatTanggal(shown.created_at)}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Pelapor</dt>
                    <dd className="font-medium">{shown.reporter_name}</dd>
                  </div>
                </div>
                <div className="hidden items-start gap-2.5 sm:flex">
                  <Hash aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Nomor laporan</dt>
                    <dd className="font-medium tabular-nums">#{shown.id}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Terakhir diperbarui</dt>
                    <dd className="font-medium tabular-nums">{formatTanggal(shown.updated_at)}</dd>
                  </div>
                </div>
                {shown.decided_by_name && (
                  <div className="flex items-start gap-2.5 sm:col-span-2">
                    <Gavel aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Keputusan akhir</dt>
                      <dd className="font-medium">
                        {STATUS_LABEL[shown.status]} oleh {shown.decided_by_name}
                        {shown.decided_at ? `, ${formatTanggal(shown.decided_at)}` : ""}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              <section aria-labelledby="detail-riwayat">
                <h3 id="detail-riwayat" className="mb-3 text-sm font-semibold">Riwayat status</h3>
                {/* Key agar riwayat mulai dari loading setiap ganti laporan/status. */}
                <StatusTimeline
                  key={`${shown.id}-${shown.status}`}
                  id={shown.id}
                  status={shown.status}
                  createdAt={shown.created_at}
                />
              </section>
            </SheetBody>

            <SheetFooter>
              {pending ? (
                <>
                  {canDecideThis && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="approve" className="h-11" disabled={busy} onClick={() => onApprove(shown)}>
                        <Check aria-hidden="true" />
                        Setujui
                      </Button>
                      <Button type="button" variant="reject" className="h-11" disabled={busy} onClick={() => onReject(shown)}>
                        <X aria-hidden="true" />
                        Tolak
                      </Button>
                    </div>
                  )}
                  {(canEditThis || canDeleteThis) && (
                    <div className="flex gap-2">
                      {canEditThis && (
                        <Button type="button" variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => onEdit(shown)}>
                          <Pencil aria-hidden="true" />
                          Ubah
                        </Button>
                      )}
                      {canDeleteThis && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 flex-1 text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() => onDelete(shown)}
                        >
                          <Trash2 aria-hidden="true" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  )}
                  {!canDecideThis && !canEditThis && !canDeleteThis && (
                    <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                      <Lock aria-hidden="true" className="size-4 shrink-0" />
                      Hanya Admin dan Approver yang bisa memutuskan.
                    </p>
                  )}
                </>
              ) : canUndo ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="approve" className="h-11" disabled={busy} onClick={() => onApprove(shown)}>
                    <Check aria-hidden="true" />
                    Setujui
                  </Button>
                  <Button type="button" variant="reject" className="h-11" disabled={busy} onClick={() => onReject(shown)}>
                    <X aria-hidden="true" />
                    Tolak
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                  <Lock aria-hidden="true" className="size-4 shrink-0" />
                  Keputusan sudah dikunci.
                </p>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
