import { Inbox, SearchX, WifiOff } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:gap-0" aria-label="Memuat laporan" role="status">
      <div className="flex flex-col gap-3 md:p-3">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="hidden md:block">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat laporan...</span>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div
      aria-label="Memuat ringkasan"
      role="status"
      className=""
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/50 p-4 sm:rounded-3xl sm:p-5">
            <Skeleton className="bg-border/70 h-3 w-20" />
            <Skeleton className="bg-border/70 h-8 w-12" />
            <Skeleton className="bg-border/70 h-1 w-full rounded-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat ringkasan...</span>
    </div>
  );
}

interface StateCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function StateCard({ title, description, actionLabel, onAction, children }: StateCardProps & { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center sm:py-16 md:rounded-none md:border-0">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground ring-8 ring-muted/60">
        {children}
      </span>
      <h2 className="mt-2 text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button type="button" variant="outline" size="sm" onClick={onAction} className="mt-3">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateCard title="Gagal memuat laporan" description={message} actionLabel="Coba lagi" onAction={onRetry}>
      <WifiOff aria-hidden="true" className="size-5" />
    </StateCard>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <StateCard
      title="Belum ada laporan"
      description="Buat laporan pertama."
      actionLabel="Buat laporan"
      onAction={onAdd}
    >
      <Inbox aria-hidden="true" className="size-5" />
    </StateCard>
  );
}

export function EmptySearchState({
  onClear,
  title = "Tidak ada hasil",
  description = "Coba kata kunci lain atau ubah filter.",
}: {
  onClear: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <StateCard
      title={title}
      description={description}
      actionLabel="Hapus pencarian dan filter"
      onAction={onClear}
    >
      <SearchX aria-hidden="true" className="size-5" />
    </StateCard>
  );
}
