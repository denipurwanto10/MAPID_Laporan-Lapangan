import { ClipboardList, FileText, Plus } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "../ui/button";
import type { Theme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";

export type ConnectionState = "checking" | "online" | "offline";

interface AppShellProps {
  children: React.ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
  connection: ConnectionState;
  /** Jumlah laporan Menunggu untuk lencana navigasi; null bila belum tersedia. */
  pending: number | null;
  /** Membuka form laporan baru (dipakai tombol melayang di mobile). */
  onAdd: () => void;
}

const CONNECTION: Record<ConnectionState, { label: string; dot: string }> = {
  checking: { label: "Memeriksa koneksi…", dot: "bg-pending-foreground animate-pulse" },
  online: { label: "Terhubung ke server", dot: "bg-approved-foreground shadow-[0_0_0_3px] shadow-approved-foreground/20" },
  offline: { label: "Server tidak terjangkau", dot: "bg-rejected-foreground" },
};

function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0f3b3a] text-[#e2bf7c]">
        <ClipboardList aria-hidden="true" className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-display truncate pb-[3px] text-xl leading-[1.25] sm:text-[22px]">Laporan Lapangan</span>
        <span className="truncate text-xs text-muted-foreground">Panel peninjau</span>
      </span>
    </span>
  );
}

/**
 * App shell. Desktop (lg+): sidebar tetap. Tablet/mobile: header ringan + tombol melayang
 * "Buat laporan" di pojok kanan bawah agar mudah dijangkau ibu jari.
 * Aplikasi hanya punya satu halaman, jadi navigasi hanya menandai halaman aktif.
 */
export function AppShell({ children, theme, onToggleTheme, connection, pending, onAdd }: AppShellProps) {
  const conn = CONNECTION[connection];
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#daftar-laporan"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Lewati ke daftar laporan
      </a>
      <div className="flex min-h-dvh w-full items-stretch">
        <aside className="sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col self-start overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:flex xl:w-72">
          <div className="flex h-20 items-center px-5 xl:px-6">
            <Brand />
          </div>
          <nav aria-label="Navigasi utama" className="flex flex-col gap-1 px-4 pt-4">
            
            <a
              href="#daftar-laporan"
              aria-current="page"
              className="flex h-11 items-center gap-3 rounded-2xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              Laporan
              {pending !== null && pending > 0 && (
                <span
                  className="ml-auto rounded-full bg-primary-foreground/15 px-2 py-px text-xs font-semibold tabular-nums"
                  title={`${pending} laporan menunggu`}
                >
                  {pending}
                  <span className="sr-only"> laporan menunggu</span>
                </span>
              )}
            </a>
          </nav>
          <div className="mt-auto flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card py-1 pr-1 pl-3">
              <span className="text-xs text-muted-foreground">
                {theme === "dark" ? "Mode gelap" : "Mode terang"}
              </span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-muted/70 px-3 py-2.5 text-xs text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", conn.dot)} aria-hidden="true" />
              {conn.label}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 border-b border-border/70 pt-[env(safe-area-inset-top)] lg:hidden">
            <div className="page-gutter mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2 sm:h-16 sm:gap-3">
              <Brand />
              <p role="status" className="ml-auto flex items-center" title={conn.label}>
                <span className={cn("size-2 rounded-full", conn.dot)} aria-hidden="true" />
                <span className="sr-only">{conn.label}</span>
              </p>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} className="size-11 rounded-full" />
            </div>
          </header>
          {children}
        </div>
      </div>

      <Button
        type="button"
        onClick={onAdd}
        aria-label="Buat laporan"
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-14 gap-2 rounded-full px-6 text-[15px] font-semibold shadow-lg sm:hidden"
      >
        <Plus aria-hidden="true" className="size-5" />
        Buat laporan
      </Button>
    </div>
  );
}
