import { ArrowRight, Plus } from "lucide-react";
import { Button } from "../ui/button";

interface PageHeaderProps {
  onAdd: () => void;
  /** Jumlah laporan berstatus Menunggu; null selama data belum tersedia. */
  pending: number | null;
  /** true bila data gagal dimuat. */
  failed?: boolean;
  /** Pintasan: tampilkan hanya laporan Menunggu. */
  onReviewPending: () => void;
}

const TODAY = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

export function PageHeader({ onAdd, pending, failed = false, onReviewPending }: PageHeaderProps) {
  const description = failed
    ? "Laporan gagal dimuat."
    : pending === null
      ? "Memuat laporan..."
      : pending > 0
        ? `${pending} laporan menunggu.`
        : "Tidak ada laporan yang menunggu.";
  const hasPending = !failed && pending !== null && pending > 0;
  return (
    <div className="fade-up flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
          <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-brass" />
          {TODAY}
        </p>
        <h1 className="font-display text-[clamp(2rem,1.4rem+2.4vw,3rem)] leading-none">Laporan</h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground" aria-live="polite">
          {description}
          {hasPending && (
            <button
              type="button"
              onClick={onReviewPending}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85"
            >
              Lihat semua
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </p>
      </div>
      <Button type="button" onClick={onAdd} className="hidden h-11 shrink-0 rounded-full px-5 sm:inline-flex sm:self-end" title="Pintasan: tekan N">
        <Plus aria-hidden="true" />
        Buat laporan
      </Button>
    </div>
  );
}
