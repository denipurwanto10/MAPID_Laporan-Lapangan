import { CheckCircle2, Clock3, Layers, XCircle, type LucideIcon } from "lucide-react";
import type { ReportSummary } from "../../types/report";
import { cn } from "../../lib/utils";

interface StatDef {
  key: keyof ReportSummary;
  label: string;
  Icon: LucideIcon;
  /** Warna ikon: memakai token status yang sama dengan lencana status agar konsisten di mode terang/gelap. */
  tile: string;
  bar: string;
  /** Pendar warna lembut di pojok kartu. */
  glow: string;
}

const STATS: StatDef[] = [
  { key: "all", label: "Total", Icon: Layers, tile: "border-border bg-secondary text-foreground", bar: "bg-foreground/60", glow: "bg-foreground/10" },
  { key: "pending", label: "Menunggu", Icon: Clock3, tile: "border-pending-border bg-pending text-pending-foreground", bar: "bg-pending-foreground", glow: "bg-pending-foreground/20" },
  { key: "approved", label: "Disetujui", Icon: CheckCircle2, tile: "border-approved-border bg-approved text-approved-foreground", bar: "bg-approved-foreground", glow: "bg-approved-foreground/20" },
  { key: "rejected", label: "Ditolak", Icon: XCircle, tile: "border-rejected-border bg-rejected text-rejected-foreground", bar: "bg-rejected-foreground", glow: "bg-rejected-foreground/20" },
];

interface StatsStripProps {
  summary: ReportSummary;
}

/**
 * Kartu ringkasan (bento): 2×2 di mobile, 4 kolom sejak tablet.
 * Padding dan ukuran angka menyesuaikan lebar agar tidak sesak di 768px.
 */
export function StatsStrip({ summary }: StatsStripProps) {
  const total = summary.all;
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div aria-label="Ringkasan laporan" role="group" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
      {STATS.map(({ key, label, Icon, tile, bar, glow }, index) => {
        const pct = key === "all" ? 100 : share(summary[key]);
        return (
          <div
            key={key}
            style={{ animationDelay: `${index * 60}ms` }}
            className="fade-up surface surface-lift flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-4 sm:gap-4 sm:rounded-3xl sm:p-5"
          >
            <span aria-hidden="true" className={cn("pointer-events-none absolute -top-10 -right-10 -z-10 size-28 rounded-full blur-2xl", glow)} />
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-muted-foreground sm:text-sm">{label}</span>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl border sm:size-9", tile)}>
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[clamp(2.25rem,1.6rem+1.6vw,3.25rem)] leading-none tabular-nums">
                {summary[key]}
              </span>
              {key !== "all" && total > 0 && (
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{pct}%</span>
              )}
            </div>
            <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <span
                className={cn("block h-full rounded-full transition-[width] duration-700", bar)}
                style={{ width: `${total > 0 ? pct : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
