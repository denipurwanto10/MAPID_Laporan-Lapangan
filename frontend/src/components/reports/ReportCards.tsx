import { CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { StatusBadge } from "./StatusBadge";
import { RowActions } from "./RowActions";
import { formatTanggal } from "../../lib/format";
import { highlightText } from "../../lib/highlight";
import type { PendingAction } from "../../hooks/useReports";
import type { Report } from "../../types/report";

interface ReportCardsProps {
  reports: Report[];
  /** Total seluruh data (tanpa filter). Total 1 -> tombol Hapus disembunyikan. */
  total: number;
  /** Halaman aktif + ukuran halaman untuk nomor urut tampilan. */
  page: number;
  limit: number;
  action: PendingAction | null;
  /** Kata kunci pencarian aktif — untuk highlight hasil yang cocok. */
  query: string;
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onToggleSelectPage: (ids: number[]) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: (report: Report) => void;
  onDelete: (report: Report) => void;
  onOpen: (report: Report) => void;
}

/** Daftar kartu untuk layar kecil: area ketuk besar membuka detail, aksi cepat di bawahnya. */
export function ReportCards({ reports, total, page, limit, action, query, selectedIds, onToggleSelect, onToggleSelectPage, onApprove, onReject, onEdit, onDelete, onOpen }: ReportCardsProps) {
  const pendingIds = reports.filter((r) => r.status === "pending").map((r) => r.id);
  const selectedOnPage = pendingIds.filter((id) => selectedIds.includes(id)).length;
  const allChecked = pendingIds.length > 0 && selectedOnPage === pendingIds.length;
  const someChecked = selectedOnPage > 0 && !allChecked;
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {pendingIds.length > 0 && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-card active:bg-muted/60">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked;
            }}
            onChange={() => onToggleSelectPage(pendingIds)}
            aria-label="Pilih semua laporan menunggu di halaman ini"
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="flex-1">Pilih semua</span>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {selectedOnPage > 0 ? `${selectedOnPage} dari ${pendingIds.length} dipilih` : `${pendingIds.length} menunggu`}
          </span>
        </label>
      )}
    <ul className="flex flex-col gap-3" aria-label="Daftar laporan">
      {reports.map((report, index) => (
        <li key={report.id} className={cn("flex flex-col overflow-hidden rounded-3xl border bg-card shadow-card transition-colors", selectedIds.includes(report.id) ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/30" : "border-border")}>
          <button
            type="button"
            onClick={() => onOpen(report)}
            aria-label={`Lihat detail laporan ${report.nama}`}
            className="flex w-full cursor-pointer flex-col gap-3 p-4 text-left transition-colors active:bg-muted/60"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground tabular-nums">
                {report.status === "pending" ? (
                  <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(report.id)}
                      onChange={() => onToggleSelect(report.id)}
                      aria-label={`Pilih laporan ${report.nama}`}
                      className="size-5 cursor-pointer accent-primary"
                    />
                  </span>
                ) : null}
                <span aria-hidden="true" className="flex h-6 min-w-6 items-center justify-center rounded-lg bg-muted px-1.5 text-[11px] font-semibold">
                  {(page - 1) * limit + index + 1}
                </span>
                <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                <time dateTime={report.created_at}>{formatTanggal(report.created_at)}</time>
              </span>
              <StatusBadge status={report.status} className="shrink-0" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-display text-2xl leading-tight [overflow-wrap:anywhere]">{highlightText(report.nama, query)}</span>
              <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{highlightText(report.deskripsi, query)}</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Lihat detail
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </span>
          </button>
          <div className="border-t border-border bg-muted/30 p-3">
            <RowActions
              id={report.id}
              name={report.nama}
              status={report.status}
              action={action}
              canDelete={total > 1}
              onApprove={onApprove}
              onReject={onReject}
              onEdit={() => onEdit(report)}
              onDelete={() => onDelete(report)}
              layout="full"
            />
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}
