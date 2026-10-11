import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import type { ListMeta } from "../../types/report";
import { cn } from "../../lib/utils";
import { pageItems } from "../../lib/pagination";

interface PaginationProps {
  meta: ListMeta;
  onPage: (page: number) => void;
}

/**
 * Navigasi halaman server-side. Disembunyikan bila hanya 1 halaman.
 * Mobile: tombol ikon 44px + nomor halaman geser horizontal (hemat lebar).
 * Desktop (sm+): tombol berlabel + nomor halaman dengan ellipsis, rata tengah.
 */
export function Pagination({ meta, onPage }: PaginationProps) {
  if (meta.totalPages <= 1) return null;
  const go = (target: number) => {
    if (target >= 1 && target <= meta.totalPages && target !== meta.page) onPage(target);
  };
  return (
    <nav
      aria-label={`Navigasi halaman, halaman ${meta.page} dari ${meta.totalPages}`}
      className="flex w-full min-w-0 items-center gap-1.5"
    >
      <Button
        type="button"
        variant="outline"
        className="h-11 w-12 shrink-0 rounded-xl px-0 sm:h-9 sm:w-auto sm:px-3 md:rounded-full"
        disabled={meta.page <= 1}
        onClick={() => go(meta.page - 1)}
        aria-label="Halaman sebelumnya"
        title="Halaman sebelumnya"
      >
        <ChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">Sebelumnya</span>
      </Button>

      <p className="min-w-0 flex-1 text-center text-sm font-medium text-foreground tabular-nums sm:sr-only" aria-live="polite">
        Halaman {meta.page} <span className="text-muted-foreground">dari {meta.totalPages}</span>
      </p>

      <ol
        aria-label="Nomor halaman"
        className="hidden min-w-0 flex-1 items-center justify-center gap-1 sm:flex"
      >
        {pageItems(meta.page, meta.totalPages).map((item) =>
          item === "ellipsis-start" || item === "ellipsis-end" ? (
            <li
              key={item}
              aria-hidden="true"
              className="flex h-10 w-7 shrink-0 items-center justify-center text-sm text-muted-foreground select-none sm:h-9"
            >
              …
            </li>
          ) : (
            <li key={item} className="shrink-0">
              <Button
                type="button"
                variant={item === meta.page ? "default" : "outline"}
                aria-label={`Halaman ${item}`}
                aria-current={item === meta.page ? "page" : undefined}
                onClick={() => go(item)}
                className={cn(
                  "h-10 min-w-10 rounded-xl px-2 text-sm tabular-nums sm:h-9 sm:min-w-9 md:rounded-full",
                  item === meta.page && "pointer-events-none",
                )}
              >
                {item}
              </Button>
            </li>
          ),
        )}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-12 shrink-0 rounded-xl px-0 sm:h-9 sm:w-auto sm:px-3 md:rounded-full"
        disabled={meta.page >= meta.totalPages}
        onClick={() => go(meta.page + 1)}
        aria-label="Halaman berikutnya"
        title="Halaman berikutnya"
      >
        <span className="hidden sm:inline">Berikutnya</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
