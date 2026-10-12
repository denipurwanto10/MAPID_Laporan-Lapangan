import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { StatusBadge } from "./StatusBadge";
import { RowActions } from "./RowActions";
import { formatTanggal, formatTanggalPendek } from "../../lib/format";
import { highlightText } from "../../lib/highlight";
import type { PendingAction } from "../../hooks/useReports";
import type { Report } from "../../types/report";

interface ReportTableProps {
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
  /** true bila pengguna berwenang menyetujui/menolak (admin atau approver). */
  canDecide: boolean;
  /** ID user yang sedang login — dipakai mengecek kepemilikan laporan. */
  currentUserId: number;
  /** true bila user adalah admin (boleh menyentuh semua laporan). */
  isAdmin: boolean;
  onToggleSelect: (id: number) => void;
  onToggleSelectPage: (ids: number[]) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: (report: Report) => void;
  onDelete: (report: Report) => void;
  onOpen: (report: Report) => void;
}

/** Tabel desktop/tablet. Berada di dalam panel yang sama dengan toolbar. */
export function ReportTable({ reports, total, page, limit, action, query, selectedIds, canDecide, currentUserId, isAdmin, onToggleSelect, onToggleSelectPage, onApprove, onReject, onEdit, onDelete, onOpen }: ReportTableProps) {
  const pendingIds = reports.filter((r) => r.status === "pending").map((r) => r.id);
  const allChecked = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id));
  const someChecked = !allChecked && pendingIds.some((id) => selectedIds.includes(id));
  return (
    <div className="hidden md:block">
      <Table className="table-fixed">
        <caption className="sr-only">Daftar laporan lapangan</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-12 text-center">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                disabled={!canDecide || pendingIds.length === 0}
                onChange={() => onToggleSelectPage(pendingIds)}
                aria-label="Pilih semua laporan pending di halaman ini"
                className="size-4 cursor-pointer accent-primary"
              />
            </TableHead>
            <TableHead scope="col" className="w-14 text-center tabular-nums">No</TableHead>
            <TableHead scope="col" className="xl:w-[24%]">Laporan</TableHead>
            <TableHead scope="col" className="hidden xl:table-cell">Deskripsi</TableHead>
            <TableHead scope="col" className="hidden w-28 xl:table-cell">Dibuat</TableHead>
            <TableHead scope="col" className="w-32">Status</TableHead>
            <TableHead scope="col" className="w-64 text-right xl:w-72">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report, index) => (
            <TableRow key={report.id} data-state={selectedIds.includes(report.id) ? "selected" : undefined} onClick={() => onOpen(report)} className="cursor-pointer">
              <TableCell className="text-center align-middle" onClick={(e) => e.stopPropagation()}>
                {report.status === "pending" && canDecide ? (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(report.id)}
                    onChange={() => onToggleSelect(report.id)}
                    aria-label={`Pilih laporan ${report.nama}`}
                    className="size-4 cursor-pointer accent-primary"
                  />
                ) : null}
              </TableCell>
              <TableCell className="text-center align-middle text-xs font-medium text-muted-foreground tabular-nums">
                {(page - 1) * limit + index + 1}
              </TableCell>
              <TableCell className="align-middle">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(report);
                  }}
                  aria-label={`Lihat detail laporan ${report.nama}`}
                  className="block w-full cursor-pointer text-left font-semibold text-foreground [overflow-wrap:anywhere]"
                >
                  {highlightText(report.nama, query)}
                </button>
                <p className="mt-1 line-clamp-2 text-muted-foreground [overflow-wrap:anywhere] xl:hidden">
                  {highlightText(report.deskripsi, query)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums xl:hidden">
                  {formatTanggalPendek(report.created_at)}
                </p>
              </TableCell>
              <TableCell className="hidden align-middle xl:table-cell">
                <p title={report.deskripsi} className="line-clamp-2 text-muted-foreground [overflow-wrap:anywhere]">
                  {highlightText(report.deskripsi, query)}
                </p>
              </TableCell>
              <TableCell className="hidden align-middle whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell">
                <time dateTime={report.created_at} title={formatTanggal(report.created_at)}>
                  {formatTanggalPendek(report.created_at)}
                </time>
              </TableCell>
              <TableCell className="align-middle">
                <StatusBadge status={report.status} />
              </TableCell>
              <TableCell className="align-middle" onClick={(e) => e.stopPropagation()}>
                <RowActions
                  id={report.id}
                  name={report.nama}
                  status={report.status}
                  action={action}
                  canDelete={total > 1}
                  canDecide={canDecide}
                  canEdit={isAdmin || report.reporter_id === currentUserId}
                  onApprove={onApprove}
                  onReject={onReject}
                  onEdit={() => onEdit(report)}
                  onDelete={() => onDelete(report)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
