import { Check, X } from "lucide-react";
import { Button } from "../ui/button";

interface BulkBarProps {
  count: number;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}

/**
 * Bilah aksi massal: muncul saat ada laporan pending yang dicentang.
 * Mobile: teks di atas, tombol berbagi lebar sama (target sentuh 44px); tanpa "Batal" karena
 * pembatalan dilakukan lewat checkbox "Pilih semua" di bawahnya.
 * Tablet/desktop: satu baris, aksi di kanan; "Batal" paling akhir sebagai aksi paling ringan.
 */
export function BulkBar({ count, busy, onApprove, onReject, onClear }: BulkBarProps) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Aksi untuk laporan terpilih"
      className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
    >
      <p className="flex items-center gap-2.5 text-sm font-medium" aria-live="polite">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
        laporan dipilih
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Button type="button" variant="approve" size="sm" className="h-11 sm:h-9" disabled={busy} onClick={onApprove}>
          <Check aria-hidden="true" />
          Setujui
        </Button>
        <Button type="button" variant="reject" size="sm" className="h-11 sm:h-9" disabled={busy} onClick={onReject}>
          <X aria-hidden="true" />
          Tolak
        </Button>
        <Button type="button" variant="ghost" size="sm" className="hidden px-4 sm:inline-flex sm:h-9" disabled={busy} onClick={onClear}>
          Batal
        </Button>
      </div>
    </div>
  );
}
