import { ArrowDownWideNarrow, Check, Download, Loader2, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import type { ReportSummary, SortOrder, StatusFilter } from "../../types/report";
import { cn } from "../../lib/utils";

interface ToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  filter: StatusFilter;
  onFilter: (value: StatusFilter) => void;
  order: SortOrder;
  onOrder: (value: SortOrder) => void;
  onExport: () => void;
  exporting: boolean;
  summary: ReportSummary;
}

const FILTERS: { value: StatusFilter; label: string; count: keyof ReportSummary }[] = [
  { value: "all", label: "Semua", count: "all" },
  { value: "pending", label: "Menunggu", count: "pending" },
  { value: "approved", label: "Disetujui", count: "approved" },
  { value: "rejected", label: "Ditolak", count: "rejected" },
];

const ORDERS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
];

/**
 * Bilah cari + filter.
 * Mobile: satu kartu — baris cari (cari, urutan, unduh) lalu filter status 4 kolom (label di atas, jumlah di bawah)
 * sehingga semua status terlihat sekaligus tanpa digeser.
 * Tablet/desktop: menyatu dengan panel daftar; filter berupa kontrol segmen satu baris.
 */
export function Toolbar({ query, onQuery, filter, onFilter, order, onOrder, onExport, exporting, summary }: ToolbarProps) {
  const orderLabel = ORDERS.find((o) => o.value === order)?.label ?? "Terbaru";
  return (
    <div className="flex flex-col gap-3 max-md:rounded-3xl max-md:border max-md:border-border max-md:bg-card max-md:p-3 max-md:shadow-card md:border-b md:border-border md:px-5 md:py-4 xl:flex-row xl:items-center xl:gap-3">
      <div className="flex items-center gap-2 xl:contents">
        <div className="relative min-w-0 flex-1 xl:order-1 xl:max-w-sm xl:flex-none xl:basis-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground md:left-3.5 md:size-4"
          />
          <Input
            id="report-search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Cari laporan…"
            aria-label="Cari laporan"
            aria-keyshortcuts="/"
            className="h-12 rounded-2xl border-transparent bg-muted/60 pr-11 pl-11 shadow-none focus-visible:bg-card md:h-10 md:border-input md:bg-muted/50 md:pr-10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground lg:inline-flex"
            >
              /
            </kbd>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={`Urutan daftar: ${orderLabel}`}
              title="Urutan daftar"
              className="size-12 shrink-0 rounded-2xl border-transparent bg-muted/60 px-0 shadow-none hover:bg-muted md:h-10 md:w-auto md:border-border md:bg-card md:px-3.5 md:shadow-xs xl:order-3"
            >
              <ArrowDownWideNarrow aria-hidden="true" />
              <span className="hidden md:inline">{orderLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ORDERS.map((o) => (
              <DropdownMenuItem key={o.value} onSelect={() => onOrder(o.value)}>
                <Check aria-hidden="true" className={cn(order !== o.value && "invisible")} />
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={onExport}
          aria-label="Unduh Excel"
          title="Unduh data tersaring (.xlsx)"
          className="size-12 shrink-0 rounded-2xl border-transparent bg-muted/60 px-0 shadow-none hover:bg-muted md:h-10 md:w-auto md:border-border md:bg-card md:px-3.5 md:shadow-xs xl:order-4 xl:ml-auto"
        >
          {exporting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
          <span className="hidden md:inline">Unduh Excel</span>
        </Button>
      </div>

      <div
        role="group"
        aria-label="Filter status"
        className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1 xl:order-2 xl:grid-cols-[repeat(4,auto)] xl:gap-1.5"
      >
        {FILTERS.map(({ value, label, count }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onFilter(value)}
              aria-pressed={active}
              className={cn(
                "flex min-h-12 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 text-[13px] leading-none font-medium whitespace-nowrap transition-colors duration-150 md:h-8 md:min-h-0 md:flex-row md:gap-2 md:px-3 md:text-sm xl:px-4",
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span
                className={cn(
                  "text-[11px] leading-none font-semibold tabular-nums md:min-w-5 md:rounded-full md:px-1.5 md:py-0.5 md:text-center",
                  active ? "text-foreground/70 md:bg-muted" : "text-muted-foreground md:bg-background/60",
                )}
              >
                {summary[count]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
