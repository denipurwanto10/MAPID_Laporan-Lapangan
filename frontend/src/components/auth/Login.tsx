import { useState } from "react";
import {
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  User,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { ThemeToggle } from "../layout/ThemeToggle";
import type { Theme } from "../../hooks/useTheme";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { ROLE_DESC, ROLE_LABEL, USERNAME_MAX, type UserRole } from "../../types/report";

/** Akun demo yang bisa langsung dicoba — tercantum juga di README. */
const DEMO_ACCOUNTS: { username: string; password: string; role: UserRole }[] = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "approver", password: "approver123", role: "approver" },
  { username: "pelapor", password: "pelapor123", role: "pelapor" },
];

const ROLE_ICON: Record<UserRole, LucideIcon> = {
  admin: ShieldCheck,
  approver: UserCheck,
  pelapor: FileText,
};

const ROLE_TILE: Record<UserRole, string> = {
  admin: "border-primary/25 bg-primary/10 text-primary",
  approver: "border-approved-border bg-approved text-approved-foreground",
  pelapor: "border-border bg-info text-info-foreground",
};

/**
 * Halaman masuk.
 *
 * Tidak ada tautan pendaftaran — sesuai aturan, akun hanya dibuat oleh admin
 * lewat menu "Kelola akun". Backend juga menolak POST /api/auth/register.
 */
export function Login({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk. Coba lagi.");
      setBusy(false);
    }
  }

  function fill(account: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(account.username);
    setPassword(account.password);
    setError(null);
  }

  /** Daftar akun demo. "dark" = baris berpemisah di panel hijau (desktop); "light" = kartu di bawah form (mobile). */
  const renderDemo = (id: string, tone: "dark" | "light") => {
    const dark = tone === "dark";
    return (
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className={cn("text-sm font-semibold", dark && "text-white")}>
            Coba dengan akun demo
          </h2>
          <p className={cn("text-xs", dark ? "text-white/60" : "text-muted-foreground")}>
            Pilih salah satu untuk mengisi form, lalu Masuk.
          </p>
        </div>
        <ul
          className={cn(
            dark ? "flex flex-col divide-y divide-white/12 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04]" : "grid gap-2 min-[480px]:grid-cols-3",
          )}
        >
          {DEMO_ACCOUNTS.map((account) => {
            const Icon = ROLE_ICON[account.role];
            const active = username === account.username && password === account.password;
            return (
              <li key={account.username}>
                <button
                  type="button"
                  onClick={() => fill(account)}
                  aria-pressed={active}
                  className={cn(
                    "relative flex w-full cursor-pointer items-center gap-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    dark
                      ? "px-4 py-3 text-white hover:bg-white/[0.06] focus-visible:ring-[#e2bf7c] focus-visible:ring-inset"
                      : "rounded-2xl border p-2.5 text-card-foreground focus-visible:ring-primary min-[480px]:flex-col min-[480px]:items-start min-[480px]:gap-2",
                    !dark && (active ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border bg-card hover:bg-muted"),
                    dark && active && "bg-white/[0.08]",
                  )}
                >
                  {dark && active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[#e2bf7c]" />}
                  {dark ? (
                    <Icon aria-hidden="true" className="size-[18px] shrink-0 text-[#e2bf7c]" />
                  ) : (
                    <span aria-hidden="true" className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", ROLE_TILE[account.role])}>
                      <Icon className="size-4" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                    <span className="truncate text-sm font-semibold">{account.username}</span>
                    <span className={cn("text-xs", dark ? "line-clamp-1 text-white/60" : "text-muted-foreground")}>
                      {dark ? ROLE_DESC[account.role] : ROLE_LABEL[account.role]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const autofill =
    "autofill:shadow-[inset_0_0_0_1000px_var(--card)] autofill:[-webkit-text-fill-color:var(--foreground)]";

  return (
    <main className="relative grid min-h-dvh grid-rows-[auto_1fr] gap-0 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:p-5">
      {/* Tombol tema: di atas panel hijau pada mobile, di pojok kanan atas form pada desktop */}
      <ThemeToggle
        theme={theme}
        onToggle={onToggleTheme}
        className="absolute top-[34px] right-9 z-10 size-10 rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:top-[46px] sm:right-12 lg:top-10 lg:right-10 lg:border-border lg:bg-card lg:text-foreground lg:hover:bg-muted lg:hover:text-foreground"
      />

      {/* Panel hijau: identitas + akun demo (desktop). Polos, tanpa dekorasi. */}
      <aside className="flex flex-col justify-center gap-8 rounded-3xl bg-[#0f3b3a] p-6 pb-14 text-[#f3f8f6] sm:p-8 sm:pb-16 lg:min-h-[calc(100dvh-2.5rem)] lg:gap-10 lg:p-10 lg:pb-10 xl:p-12 xl:pb-12">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-[clamp(2.25rem,1.2rem+3.4vw,4rem)] leading-[1.05] text-white max-lg:pr-12">
            Laporan Lapangan
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-white/70 sm:text-base">
            Masuk untuk membuat, melihat, dan memutuskan laporan lapangan.
          </p>
        </div>

        <div className="hidden lg:block">{renderDemo("akun-demo-desktop", "dark")}</div>
      </aside>

      {/* Form */}
      <div className="relative z-[1] -mt-8 flex items-start justify-center lg:mt-0 lg:items-center lg:p-10 xl:p-14">
        <div className="flex w-full max-w-[28rem] flex-col gap-3 sm:gap-4">
          <form
            onSubmit={submit}
            className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-pop sm:p-8 lg:gap-6 lg:p-10"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-3xl">Masuk</h2>
              <p className="text-sm text-muted-foreground">Pakai akun yang diberikan admin.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-username">Username</Label>
              <div className="relative">
                <User aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  maxLength={USERNAME_MAX}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className={cn("h-12 rounded-2xl pl-11 sm:h-12", autofill)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <KeyRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn("h-12 rounded-2xl pr-12 pl-11 sm:h-12", autofill)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rejected-border bg-rejected px-3 py-2 text-sm text-rejected-foreground">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="h-12 w-full rounded-2xl text-[15px]">
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <LogIn aria-hidden="true" />}
              {busy ? "Memeriksa…" : "Masuk"}
            </Button>
          </form>

          {/* Mobile/tablet: akun demo di bawah form */}
          <div className="rounded-3xl border border-border bg-card/60 p-4 lg:hidden">
            {renderDemo("akun-demo-mobile", "light")}
          </div>
        </div>
      </div>
    </main>
  );
}
