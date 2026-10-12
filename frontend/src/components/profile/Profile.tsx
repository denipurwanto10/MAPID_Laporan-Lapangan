import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserCog,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { PASSWORD_MAX, PASSWORD_MIN, ROLE_DESC, ROLE_LABEL } from "../../types/report";

/**
 * Halaman profil — tersedia untuk semua peran (admin, approver, pelapor).
 *
 * Dua bagian: ringkasan akun (read-only, diisi server lewat /auth/me) dan
 * form ganti password. Tombol keluar sengaja tidak ada di sini — sudah ada di sidebar. Ini satu-satunya cara non-admin mengubah password
 * sendiri; admin juga masih bisa reset password orang lain lewat Kelola akun.
 *
 * Catatan alur: server mencabut seluruh sesi milik user setelah password
 * diganti, jadi form langsung mengeluarkan user ke halaman login dengan toast.
 */

const ROLE_STYLE: Record<string, { icon: LucideIcon; tile: string }> = {
  admin: { icon: ShieldCheck, tile: "border-primary/25 bg-primary/10 text-primary" },
  approver: { icon: UserCog, tile: "border-approved-border bg-approved text-approved-foreground" },
  pelapor: { icon: UserRound, tile: "border-border bg-info text-info-foreground" },
};

/** Satu baris aturan password — dipakai untuk daftar syarat & pesan error. */
function StrengthHint({ password }: { password: string }) {
  const rules = [
    { ok: password.length >= PASSWORD_MIN, text: `Minimal ${PASSWORD_MIN} karakter` },
    { ok: /[A-Za-z]/.test(password), text: "Ada huruf" },
    { ok: /\d/.test(password), text: "Ada angka" },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {rules.map((r) => (
        <li
          key={r.text}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            r.ok ? "text-approved-foreground" : "text-muted-foreground",
          )}
        >
          <Check aria-hidden="true" className={cn("size-3.5", !r.ok && "opacity-40")} />
          {r.text}
        </li>
      ))}
    </ul>
  );
}

/** Field password dengan tombol tampil/sembunyi, sama dipakai 3× di form ini. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  hint?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <KeyRound
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-12 pl-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>
      {hint}
    </div>
  );
}

export function Profile() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const { icon: RoleIcon, tile } = ROLE_STYLE[user.role] ?? ROLE_STYLE.pelapor;

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);

    if (next !== confirm) {
      setError("Konfirmasi password tidak sama dengan password baru.");
      return;
    }
    if (next.length < PASSWORD_MIN) {
      setError(`Password baru minimal ${PASSWORD_MIN} karakter.`);
      return;
    }
    if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      setError("Password baru harus memuat minimal satu huruf dan satu angka.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(current, next);
      // Sesi sudah dicabut server — tinggal keluarkan ke layar login.
      toast.success("Password diganti. Masuk lagi.");
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengganti password. Coba lagi.");
      setSaving(false);
    }
  }

  const cardClass =
    "flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-4 shadow-card sm:gap-6 sm:rounded-[2rem] sm:p-6 lg:p-8";

  return (
    <>
      <section aria-label="Ringkasan akun" className={cardClass}>
        <div className="fade-up min-w-0">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
            <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-brass" />
            Akun
          </p>
          <h1 className="font-display text-[clamp(2rem,1.4rem+2.4vw,3rem)] leading-none">Profil saya</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Info akun dan ganti password.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:gap-4">
          <div
            style={{ animationDelay: "0ms" }}
            className="fade-up flex min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-border bg-muted/40 p-4 sm:rounded-3xl sm:p-5"
          >
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground uppercase"
            >
              {user.username.trim().slice(0, 2) || "?"}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted-foreground sm:text-sm">Username</p>
              <p className="truncate text-lg font-semibold">{user.username}</p>
            </div>
          </div>

          <div
            style={{ animationDelay: "60ms" }}
            className="fade-up flex min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-border bg-muted/40 p-4 sm:rounded-3xl sm:p-5"
          >
            <span aria-hidden="true" className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl border", tile)}>
              <RoleIcon className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted-foreground sm:text-sm">Peran</p>
              <p className="truncate text-lg font-semibold">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>

          <div
            style={{ animationDelay: "120ms" }}
            className="fade-up flex min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-2xl border border-border bg-muted/40 p-4 sm:rounded-3xl sm:p-5"
          >
            <p className="text-[13px] font-medium text-muted-foreground sm:text-sm">Hak akses</p>
            <p className="text-sm leading-relaxed">{ROLE_DESC[user.role]}</p>
          </div>
        </div>
      </section>

      <section aria-label="Ganti password" className={cn(cardClass, "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start lg:gap-10")}>
        <div className="flex min-w-0 flex-col gap-4">
          <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl sm:text-2xl">Ganti password</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Semua sesi aktif akan keluar setelah password diganti.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              {user.role === "admin"
                ? "Password lama yang salah akan ditolak."
                : "Kalau lupa password lama, minta reset ke admin."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4" noValidate>
          <PasswordField
            id="profile-current-password"
            label="Password lama"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            placeholder="Masukkan password sekarang"
          />
          <PasswordField
            id="profile-new-password"
            label="Password baru"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            placeholder={`Minimal ${PASSWORD_MIN} karakter`}
            hint={<StrengthHint password={next} />}
          />
          <PasswordField
            id="profile-confirm-password"
            label="Ulangi password baru"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Ketik ulang password baru"
          />

          {error && (
            <p role="alert" className="rounded-xl border border-rejected-border bg-rejected px-3 py-2 text-xs text-rejected-foreground">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={reset} disabled={saving} className="h-11 rounded-full px-5">
              Batal
            </Button>
            <Button type="submit" disabled={saving || !current || !next || !confirm} className="h-11 rounded-full px-5">
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
              {saving ? "Menyimpan…" : "Simpan password baru"}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
