import { useState } from "react";
import { ClipboardList, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABEL, USERNAME_MAX, type UserRole } from "../../types/report";

/** Akun demo yang bisa langsung dicoba — tercantum juga di README. */
const DEMO_ACCOUNTS: { username: string; password: string; role: UserRole }[] = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "approver", password: "approver123", role: "approver" },
  { username: "pelapor", password: "pelapor123", role: "pelapor" },
];

/**
 * Halaman masuk.
 *
 * Tidak ada tautan pendaftaran — sesuai aturan, akun hanya dibuat oleh admin
 * lewat menu "Kelola akun". Backend juga menolak POST /api/auth/register.
 */
export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <div className="page-gutter mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#0f3b3a] text-[#e2bf7c]">
          <ClipboardList aria-hidden="true" className="size-6" />
        </span>
        <h1 className="font-display text-2xl">Laporan Lapangan</h1>
        <p className="text-sm text-muted-foreground">
          Masuk untuk membuka dashboard. Akun dibuat admin, tidak bisa mendaftar sendiri.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-username">Username</Label>
          <Input
            id="login-username"
            name="username"
            autoComplete="username"
            maxLength={USERNAME_MAX}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="h-11 w-full">
          <LogIn aria-hidden="true" />
          {busy ? "Memeriksa…" : "Masuk"}
        </Button>
      </form>

      <section aria-labelledby="akun-demo" className="flex flex-col gap-2 rounded-3xl border border-border bg-muted/40 p-4">
        <h2 id="akun-demo" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
          Akun demo
        </h2>
        <p className="text-xs text-muted-foreground">Klik salah satu untuk mengisi form, lalu tekan Masuk.</p>
        <ul className="flex flex-col gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.username}>
              <button
                type="button"
                onClick={() => fill(account)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <span className="font-medium">{account.username}</span>
                <span className="text-xs text-muted-foreground">{account.password}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[account.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}