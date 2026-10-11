import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  /** Warna tombol konfirmasi: "approve" hijau, "reject" merah (default). */
  tone?: "approve" | "reject";
  onConfirm: () => void;
}

/** Dialog konfirmasi generik (Setujui / Tolak / Hapus). Tidak menutup sendiri saat sibuk. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "reject",
  onConfirm,
}: ConfirmDialogProps) {
  function handleOpenChange(next: boolean): void {
    if (busy && !next) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              tone === "approve"
                ? "border-approved-border bg-approved text-approved-foreground"
                : "border-rejected-border bg-rejected text-rejected-foreground",
            )}
          >
            {tone === "approve" ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
          </span>
          <DialogTitle className="pr-0">{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button type="button" variant={tone === "approve" ? "default" : "destructive"} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
            {busy ? "Memproses…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
