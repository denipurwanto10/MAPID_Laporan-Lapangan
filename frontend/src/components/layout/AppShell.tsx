import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ClipboardList, FileText, LogOut, Menu, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "../ui/button";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABEL } from "../../types/report";
import type { Theme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";

export type ConnectionState = "checking" | "online" | "offline";

/** Halaman yang tersedia di navigasi samping. "akun" hanya untuk Admin, "profil" untuk semua peran. */
export type AppView = "laporan" | "akun" | "profil";

interface AppShellProps {
  children: React.ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
  connection: ConnectionState;
  /** Jumlah laporan Menunggu untuk lencana navigasi; null bila belum tersedia. */
  pending: number | null;
  /** Membuka form laporan baru (dipakai tombol melayang di mobile). */
  onAdd: () => void;
  /** Halaman aktif + pengganti halaman (menu di sidebar / drawer). */
  view: AppView;
  onNavigate: (view: AppView) => void;
}

const CONNECTION: Record<ConnectionState, { label: string; short: string; dot: string }> = {
  checking: { label: "Memeriksa koneksi…", short: "Memeriksa", dot: "bg-pending-foreground animate-pulse" },
  online: { label: "Terhubung ke server", short: "Online", dot: "bg-approved-foreground shadow-[0_0_0_3px] shadow-approved-foreground/20" },
  offline: { label: "Server tidak terjangkau", short: "Offline", dot: "bg-rejected-foreground" },
};

function Brand({ compact = false, hideIcon = false }: { compact?: boolean; hideIcon?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {!hideIcon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0f3b3a] text-[#e2bf7c]">
          <ClipboardList aria-hidden="true" className="size-[18px]" />
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("font-display truncate pb-[3px] leading-[1.25]", compact ? "text-lg" : "text-xl sm:text-[22px]")}>
          Laporan Lapangan
        </span>
        <span className={cn("truncate text-xs text-muted-foreground", compact && "max-[359px]:hidden")}>Panel</span>
      </span>
    </span>
  );
}

interface SidebarBodyProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  pending: number | null;
  theme: Theme;
  onToggleTheme: () => void;
  connection: ConnectionState;
  /** true di drawer mobile: header & padding lebih rapat karena panelnya sempit. */
  compact?: boolean;
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
      {children}
    </p>
  );
}

interface NavItemProps {
  id: AppView;
  label: string;
  hint: string;
  Icon: typeof FileText;
  active: boolean;
  onNavigate: (view: AppView) => void;
  badge?: number | null;
}

/** Satu menu. Komponen tingkat atas (bukan fungsi di dalam SidebarBody) agar tidak di-mount ulang tiap render. */
function NavItem({ id, label, hint, Icon, active, onNavigate, badge }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl p-1.5 pr-3 text-left transition-colors focus-visible:outline-offset-0",
        active ? "bg-primary text-primary-foreground shadow-card" : "text-foreground hover:bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
          active ? "bg-primary-foreground/15" : "bg-muted text-muted-foreground group-hover:bg-card",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className={cn("truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {hint}
        </span>
      </span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            active ? "bg-primary-foreground/15" : "bg-pending text-pending-foreground",
          )}
          title={`${badge} laporan menunggu`}
        >
          {badge > 99 ? "99+" : badge}
          <span className="sr-only"> laporan menunggu</span>
        </span>
      )}
    </button>
  );
}

/** Isi sidebar — dipakai bersama oleh sidebar desktop dan drawer mobile agar selalu sama. */
function SidebarBody({ view, onNavigate, pending, theme, onToggleTheme, connection, compact = false }: SidebarBodyProps) {
  const conn = CONNECTION[connection];
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const profileActive = view === "profil";

  return (
    <>
      <div className={cn("flex shrink-0 items-center border-b border-border/70", compact ? "h-16 px-4" : "h-20 px-5 xl:px-6")}>
        <Brand compact={compact} />
      </div>
      <nav aria-label="Navigasi utama" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-5 pb-3">
        <NavLabel>Menu utama</NavLabel>
        <NavItem
          id="laporan"
          label="Laporan"
          hint="Lihat dan putuskan"
          Icon={FileText}
          active={view === "laporan"}
          onNavigate={onNavigate}
          badge={pending}
        />
        {isAdmin && (
          <>
            <div className="pt-4">
              <NavLabel>Administrasi</NavLabel>
            </div>
            <NavItem
              id="akun"
              label="Kelola akun"
              hint="Pengguna & peran"
              Icon={Users}
              active={view === "akun"}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 p-3">
        <div
          className={cn(
            "flex items-center gap-1 rounded-2xl border p-1.5 transition-colors",
            profileActive ? "border-primary bg-primary text-primary-foreground shadow-card" : "border-border bg-muted/40",
          )}
        >
          <button
            type="button"
            onClick={() => onNavigate("profil")}
            aria-current={profileActive ? "page" : undefined}
            aria-label={`Profil saya (${user?.username ?? "—"})`}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-0.5 text-left transition-colors focus-visible:outline-offset-0",
              !profileActive && "hover:bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold uppercase",
                profileActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary text-primary-foreground",
              )}
            >
              {(user?.username ?? "?").slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{user?.username ?? "—"}</span>
              <span className={cn("block truncate text-xs", profileActive ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {user ? ROLE_LABEL[user.role] : ""} · Profil saya
              </span>
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Keluar dari akun"
            title="Keluar"
            onClick={() => {
              void logout().then(() => toast.success("Keluar."));
            }}
            className={cn(
              "size-10 shrink-0 rounded-xl",
              profileActive
                ? "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                : "text-muted-foreground hover:bg-rejected hover:text-rejected-foreground",
            )}
          >
            <LogOut aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card py-0.5 pr-0.5 pl-3">
            <span className="text-xs text-muted-foreground">{theme === "dark" ? "Gelap" : "Terang"}</span>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} className="rounded-xl" />
          </div>
          <p
            role="status"
            title={conn.label}
            className="flex items-center justify-center gap-2 rounded-2xl bg-muted/70 px-3 text-xs text-muted-foreground"
          >
            <span className={cn("size-2 shrink-0 rounded-full", conn.dot)} aria-hidden="true" />
            <span className="truncate">{conn.short}</span>
            <span className="sr-only"> — {conn.label}</span>
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * App shell. Desktop (lg+): sidebar tetap berisi menu Laporan dan (khusus Admin) Kelola akun.
 * Tablet/mobile: header ringan dengan tombol menu yang membuka sidebar yang sama sebagai drawer
 * (lebarnya sekitar tiga perempat layar; Tutup lewat ketuk area gelap atau Esc). Tombol melayang "Buat laporan" di pojok kanan bawah hanya tampil di halaman Laporan.
 */
export function AppShell({ children, theme, onToggleTheme, connection, pending, onAdd, view, onNavigate }: AppShellProps) {
  const conn = CONNECTION[connection];
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebarProps: SidebarBodyProps = { view, onNavigate, pending, theme, onToggleTheme, connection };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#konten-utama"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Lewati ke konten
      </a>
      <div className="flex min-h-dvh w-full items-stretch">
        <aside className="sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col self-start overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:flex xl:w-72">
          <SidebarBody {...sidebarProps} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-card pt-[env(safe-area-inset-top)] shadow-[0_6px_18px_-12px_rgb(13_31_32/0.35)] lg:hidden">
            <div className="page-gutter mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2.5 min-[400px]:gap-3 sm:h-16">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={pending ? `Buka menu (${pending} laporan menunggu)` : "Buka menu"}
                onClick={() => setDrawerOpen(true)}
                className="relative size-10 shrink-0 rounded-xl border-border bg-muted hover:bg-accent"
              >
                <Menu aria-hidden="true" className="size-5" />
                {pending !== null && pending > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pending-foreground px-1 text-[10px] leading-none font-bold text-background tabular-nums"
                  >
                    {pending > 99 ? "99+" : pending}
                  </span>
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <Brand compact hideIcon />
              </div>
              {connection !== "online" && (
                <p
                  role="status"
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card p-2 text-[11px] font-medium text-muted-foreground min-[480px]:px-2.5 min-[480px]:py-1"
                >
                  <span className={cn("size-2 rounded-full", conn.dot)} aria-hidden="true" />
                  <span className="hidden min-[480px]:inline">{conn.short}</span>
                  <span className="sr-only"> {conn.label}</span>
                </p>
              )}
              {user && (
                <p className="hidden shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3.5 pl-1 sm:flex">
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase"
                  >
                    {user.username.slice(0, 2)}
                  </span>
                  <span className="flex max-w-32 flex-col leading-tight">
                    <span className="truncate text-xs font-semibold">{user.username}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</span>
                  </span>
                </p>
              )}
              <ThemeToggle theme={theme} onToggle={onToggleTheme} className="size-10 shrink-0 rounded-xl border border-border bg-muted hover:bg-accent" />
            </div>
          </header>
          <div id="konten-utama" tabIndex={-1} className="outline-none">
            {children}
          </div>
        </div>
      </div>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-[78%] max-w-[19rem] min-w-[16rem] flex-col overflow-y-auto rounded-r-3xl border-r border-border bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-pop outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu navigasi</DialogPrimitive.Title>
            <SidebarBody
              {...sidebarProps}
              compact
              onNavigate={(next) => {
                onNavigate(next);
                setDrawerOpen(false);
              }}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {view === "laporan" && (
        <Button
          type="button"
          onClick={onAdd}
          aria-label="Buat laporan"
          className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-14 gap-2 rounded-full px-6 text-[15px] font-semibold shadow-lg sm:hidden"
        >
          <Plus aria-hidden="true" className="size-5" />
          Buat laporan
        </Button>
      )}
    </div>
  );
}
