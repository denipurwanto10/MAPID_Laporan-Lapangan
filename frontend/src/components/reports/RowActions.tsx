import { Check, Loader2, Lock, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { PendingAction } from "../../hooks/useReports";
import type { ReportStatus } from "../../types/report";
import { cn } from "../../lib/utils";

interface RowActionsProps {
  id: number;
  /** Nama laporan — dipakai untuk label aksesibilitas. */
  name: string;
  status: ReportStatus;
  action: PendingAction | null;
  /** false bila laporan ini satu-satunya data tersisa — Hapus disembunyikan. */
  canDelete: boolean;
  /** true bila pengguna berwenang menyetujui/menolak (admin atau approver). */
  canDecide: boolean;
  /** true bila pengguna boleh mengubah isi laporan (pemilik atau admin). */
  canEdit: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** "row": ringkas untuk tabel. "full": target sentuh besar untuk kartu mobile. */
  layout?: "row" | "full";
}

export function RowActions({
  id,
  name,
  status,
  action,
  canDelete,
  canDecide,
  canEdit,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  layout = "row",
}: RowActionsProps) {
  const full = layout === "full";
  const busy = action?.id === id;
  const approving = busy && action?.kind === "approve";
  const rejecting = busy && action?.kind === "reject";
  const pending = status === "pending";
  const btnSize = full ? "h-11 flex-1" : "h-8 @max-3xl:w-8 @max-3xl:px-0";
  // Pelapor tidak punya tombol keputusan; barisnya hanya berisi Ubah/Hapus.
  const showDecider = pending && canDecide;
  const hasMenu = pending && (canEdit || canDelete);

  return (
    <div className={cn("flex items-center gap-2", !full && "justify-end")}>
      {showDecider ? (
        <>
          <Button
            type="button"
            variant="approve"
            size="sm"
            disabled={busy}
            onClick={() => onApprove(id)}
            aria-label={`Setujui laporan ${name}`}
            className={btnSize}
          >
            {approving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
            <span className={cn(!full && "sr-only @3xl:not-sr-only")}>Setujui</span>
          </Button>
          <Button
            type="button"
            variant="reject"
            size="sm"
            disabled={busy}
            onClick={() => onReject(id)}
            aria-label={`Tolak laporan ${name}`}
            className={btnSize}
          >
            {rejecting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <X aria-hidden="true" />}
            <span className={cn(!full && "sr-only @3xl:not-sr-only")}>Tolak</span>
          </Button>
        </>
      ) : (
        !pending && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
              full && "mr-auto",
            )}
            title="Laporan yang sudah diputuskan tidak bisa diubah"
          >
            <Lock aria-hidden="true" className="size-3.5" />
            <span className={cn(!full && "sr-only @3xl:not-sr-only")}>Sudah diputuskan</span>
          </span>
        )
      )}

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Aksi lainnya untuk laporan ${name}`}
              className={cn("shrink-0 md:rounded-xl", full ? "size-11" : "size-8")}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {canEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden="true" />
                Ubah
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 aria-hidden="true" />
                  Hapus
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
