import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ConfirmDialog } from "../reports/ConfirmDialog";
import { Pagination } from "../reports/Pagination";
import { PageSizeSelect } from "../reports/PageSizeSelect";
import { ApiError, api } from "../../lib/api";
import { formatTanggalPendek } from "../../lib/format";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  ROLE_DESC,
  ROLE_LABEL,
  USER_ROLES,
  USERNAME_MAX,
  type ManagedUser,
  type PageSize,
  type UserListQuery,
  type UserRole,
} from "../../types/report";

interface Draft {
  id: number | null;
  username: string;
  password: string;
  role: UserRole;
}

const EMPTY_DRAFT: Draft = { id: null, username: "", password: "", role: "pelapor" };

type RoleFilter = "all" | UserRole;

/** Urutan kelompok tabel di desktop. */
const TABLE_ROLE_ORDER: readonly UserRole[] = ["admin", "approver", "pelapor"];

/** Ikon + warna per peran; memakai token tema yang sama dengan bagian lain agar konsisten terang/gelap. */
const ROLE_STYLE: Record<UserRole, { Icon: LucideIcon; badge: string; avatar: string }> = {
  admin: {
    Icon: ShieldCheck,
    badge: "border-primary/25 bg-primary/10 text-primary",
    avatar: "bg-primary text-primary-foreground",
  },
  approver: {
    Icon: UserCheck,
    badge: "border-approved-border bg-approved text-approved-foreground",
    avatar: "border border-approved-border bg-approved text-approved-foreground",
  },
  pelapor: {
    Icon: FileText,
    badge: "border-border bg-info text-info-foreground",
    avatar: "border border-border bg-secondary text-secondary-foreground",
  },
};

const STAT_TILE: Record<"all" | UserRole, string> = {
  all: "border-border bg-secondary text-foreground",
  admin: "border-primary/25 bg-primary/10 text-primary",
  approver: "border-approved-border bg-approved text-approved-foreground",
  pelapor: "border-border bg-info text-info-foreground",
};

const FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "admin", label: "Admin" },
  { value: "approver", label: "Approver" },
  { value: "pelapor", label: "Pelapor" },
];

function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const { Icon, badge } = ROLE_STYLE[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-2.5 text-xs leading-none font-medium whitespace-nowrap",
        badge,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {ROLE_LABEL[role]}
    </span>
  );
}

function Avatar({ name, role, className }: { name: string; role: UserRole; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold uppercase",
        ROLE_STYLE[role].avatar,
        className,
      )}
    >
      {name.trim().slice(0, 2) || "?"}
    </span>
  );
}

/**
 * Kelola akun pengguna — hanya untuk Admin. Menu ada di sidebar; form buat/ubah tampil sebagai modal.
 *
 * Endpoint di backend (/api/users) sudah dibatasi requireAdmin, jadi panel ini
 * hanya lapisan tampilan: membuka URL atau memalsukan request tetap ditolak 403
 * oleh server.
 */
export function UserManager() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ all: 0, admin: 0, approver: 0, pelapor: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q: Partial<UserListQuery> = {
        page,
        limit,
        role: roleFilter === "all" ? undefined : roleFilter,
        q: query.trim() || undefined,
      };
      const res = await api.listUsers(q);
      setUsers(res.users);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
      setCounts(res.counts);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Gagal memuat daftar akun.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, roleFilter, query]);

  // Muat hanya bila memang admin: endpoint /api/users membalas 403 untuk peran lain
  // dan akan memunculkan toast error yang membingungkan.
  const isAdmin = me?.role === "admin";
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // Reset ke halaman 1 saat filter/query berubah
  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [query, roleFilter, limit]);

  const visible = users;

  function openCreate(): void {
    setFormError(null);
    setShowPassword(false);
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(u: ManagedUser): void {
    setFormError(null);
    setShowPassword(false);
    setDraft({ id: u.id, username: u.username, password: "", role: u.role });
  }

  function closeForm(): void {
    if (saving) return;
    setDraft(null);
    setFormError(null);
  }

  async function save(): Promise<void> {
    if (!draft || saving) return;
    const isNew = draft.id === null;
    if (isNew && draft.username.trim().length === 0) {
      setFormError("Username wajib diisi.");
      return;
    }
    if ((isNew || draft.password) && draft.password.length < PASSWORD_MIN) {
      setFormError(`Password minimal ${PASSWORD_MIN} karakter.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (isNew) {
        await api.createUser(draft.username.trim(), draft.password, draft.role);
      } else {
        const patch: { role?: UserRole; password?: string } = { role: draft.role };
        if (draft.password) patch.password = draft.password;
        await api.updateUser(draft.id as number, patch);
      }
      setDraft(null);
      toast.success(isNew ? "Akun dibuat." : "Perubahan akun disimpan.");
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Gagal menyimpan akun.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: ManagedUser): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteUser(target.id);
      setPendingDelete(null);
      toast.success("Akun dihapus.");
      await load();
    } catch (e) {
      setPendingDelete(null);
      toast.error(e instanceof ApiError ? e.message : "Gagal menghapus akun.");
    } finally {
      setDeleting(false);
    }
  }

  if (me?.role !== "admin") return null;

  const editing = draft !== null && draft.id !== null;

  return (
    <>
      <section
        aria-label="Ringkasan akun"
        className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-4 shadow-card sm:gap-6 sm:rounded-[2rem] sm:p-6 lg:p-8"
      >
        <div className="fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
              <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-brass" />
              Administrasi
            </p>
            <h1 className="font-display text-[clamp(2rem,1.4rem+2.4vw,3rem)] leading-none">Kelola akun</h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Akun dibuat di sini, tidak ada pendaftaran sendiri. Peran bisa diubah kapan saja.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-11 w-full shrink-0 rounded-full px-5 sm:w-auto sm:self-end"
          >
            <UserPlus aria-hidden="true" />
            Buat akun
          </Button>
        </div>
      </section>

      <section
        aria-label="Daftar akun"
        className="@container flex scroll-mt-20 flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-card"
      >
        {loading && users.length === 0 ? (
          <div role="status" aria-label="Memuat akun" className="flex flex-col gap-3 md:gap-0">
            <div className="hidden md:block">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
                  <Skeleton className="size-10 shrink-0 rounded-2xl" />
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="ml-auto h-8 w-20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 md:hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
                  <Skeleton className="size-11 shrink-0 rounded-2xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
            <span className="sr-only">Memuat akun...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center sm:py-16 md:rounded-none md:border-0">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground ring-8 ring-muted/60">
              <WifiOff aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-2 text-base font-semibold">Gagal memuat akun</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="mt-3">
              Coba lagi
            </Button>
          </div>
        ) : (
          <>
            {/* Cari + filter peran */}
            <div className="flex flex-col gap-3 max-md:rounded-3xl max-md:border max-md:border-border max-md:bg-card max-md:p-3 max-md:shadow-card md:flex-row md:items-center md:gap-4 md:border-b md:border-border md:px-5 md:py-4">
              <div className="relative min-w-0 flex-1 md:max-w-md">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground md:left-3.5 md:size-4"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari username..."
                  aria-label="Cari akun"
                  className="h-12 rounded-2xl border-transparent bg-muted/60 pr-11 pl-11 shadow-none focus-visible:bg-card md:h-10 md:border-input md:bg-muted/50 md:pr-10 [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Hapus pencarian"
                    className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </div>
              <div
                role="group"
                aria-label="Filter peran"
                className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1 md:ml-auto md:inline-grid md:shrink-0 md:grid-cols-[repeat(4,auto)]"
              >
                {FILTERS.map(({ value, label }) => {
                  const active = roleFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRoleFilter(value)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-12 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 text-[13px] leading-none font-medium whitespace-nowrap transition-colors duration-150 md:h-8 md:min-h-0 md:flex-row md:gap-2 md:px-3.5 md:text-sm",
                        active
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                      <span
                        className={cn(
                          "text-[11px] leading-none font-semibold tabular-nums md:min-w-5 md:rounded-full md:px-1.5 md:py-0.5 md:text-center",
                          active ? "text-foreground/70 md:bg-muted" : "text-muted-foreground md:bg-background/70",
                        )}
                      >
                        {counts[value] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center sm:py-16 md:rounded-none md:border-0">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground ring-8 ring-muted/60">
                  <Users aria-hidden="true" className="size-5" />
                </span>
                <h2 className="mt-2 text-base font-semibold">
                  {users.length === 0 ? "Belum ada akun" : "Tidak ada akun yang cocok"}
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {users.length === 0
                    ? "Buat akun pertama untuk pelapor atau approver."
                    : "Coba kata kunci lain atau ubah filter peran."}
                </p>
                {users.length === 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={openCreate} className="mt-3">
                    <Plus aria-hidden="true" />
                    Buat akun
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setRoleFilter("all");
                    }}
                    className="mt-3"
                  >
                    Hapus pencarian dan filter
                  </Button>
                )}
              </div>
            ) : (
              <ul
                aria-label="Daftar akun"
                className="grid grid-cols-1 gap-3 md:gap-4 md:p-5 @2xl:grid-cols-2 lg:hidden"
              >
                {visible.map((u, index) => {
                  const self = u.id === me.id;
                  // Hanya Pelapor yang relevan dengan jumlah laporan; Admin/Approver cukup tampil bila memang punya.
                  const showReports = u.role === "pelapor" || u.report_count > 0;
                  return (
                    <li
                      key={u.id}
                      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                      className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card"
                    >
                      <div className="flex items-start gap-3 p-4 sm:p-5">
                        <Avatar name={u.username} role={u.role} className="size-12 rounded-2xl text-base" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xl leading-tight">
                            <span className="[overflow-wrap:anywhere]">{u.username}</span>
                            {self && (
                              <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-[11px] font-semibold text-muted-foreground">
                                Anda
                              </span>
                            )}
                          </p>
                          <RoleBadge role={u.role} className="mt-2" />
                        </div>
                      </div>
                      <dl
                        className={cn(
                          "mx-4 grid divide-x divide-border rounded-2xl bg-muted/50 py-3 sm:mx-5",
                          showReports ? "grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        {showReports && (
                          <div className="flex flex-col gap-1 px-4">
                            <dt className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Laporan</dt>
                            <dd className="font-display text-2xl leading-none tabular-nums">{u.report_count}</dd>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 px-4">
                          <dt className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Dibuat</dt>
                          <dd className="text-sm font-medium leading-none tabular-nums">
                            <time dateTime={u.created_at}>{formatTanggalPendek(u.created_at)}</time>
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center gap-2 border-t border-border p-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openEdit(u)}
                          aria-label={`Ubah akun ${u.username}`}
                          className="h-11 flex-1 md:h-10"
                        >
                          <Pencil aria-hidden="true" />
                          Ubah
                        </Button>
                        <Button
                          type="button"
                          variant="reject"
                          disabled={self}
                          onClick={() => setPendingDelete(u)}
                          aria-label={`Hapus akun ${u.username}`}
                          title={self ? "Akun yang sedang dipakai tidak bisa dihapus" : undefined}
                          className="h-11 flex-1 md:h-10"
                        >
                          <Trash2 aria-hidden="true" />
                          Hapus
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Desktop (lg+): satu tabel per peran, supaya tiap peran terpisah dan jelas */}
            {visible.length > 0 && (
              <div className="hidden flex-col gap-6 p-5 lg:flex">
                {TABLE_ROLE_ORDER.map((role) => {
                  const group = visible.filter((u) => u.role === role);
                  if (group.length === 0) return null;
                  const { Icon } = ROLE_STYLE[role];
                  const showReports = role === "pelapor" || group.some((u) => u.report_count > 0);
                  return (
                    <section
                      key={role}
                      aria-label={`Akun ${ROLE_LABEL[role]}`}
                      className="overflow-hidden rounded-2xl border border-border bg-card"
                    >
                      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3.5">
                        <span
                          aria-hidden="true"
                          className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", STAT_TILE[role])}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <h2 className="text-sm font-semibold">{ROLE_LABEL[role]}</h2>
                          <p className="truncate text-xs text-muted-foreground">{ROLE_DESC[role]}</p>
                        </div>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
                          {group.length} akun
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead scope="col" className="w-14 bg-transparent text-center">No</TableHead>
                            <TableHead scope="col" className="bg-transparent">Pengguna</TableHead>
                            {showReports && (
                              <TableHead scope="col" className="w-28 bg-transparent text-right">Laporan</TableHead>
                            )}
                            <TableHead scope="col" className="w-40 bg-transparent">Dibuat</TableHead>
                            <TableHead scope="col" className="w-[1%] bg-transparent text-center whitespace-nowrap">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.map((u, index) => {
                            const self = u.id === me.id;
                            return (
                              <TableRow key={u.id}>
                                <TableCell className="text-center text-xs font-medium text-muted-foreground tabular-nums">
                                  {index + 1}
                                </TableCell>
                                <TableCell>
                                  <div className="flex min-w-0 items-center gap-3">
                                    <Avatar name={u.username} role={u.role} />
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className="truncate text-sm font-semibold">{u.username}</span>
                                      {self && (
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                          Anda
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </TableCell>
                                {showReports && (
                                  <TableCell className="text-right tabular-nums">{u.report_count}</TableCell>
                                )}
                                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                                  <time dateTime={u.created_at}>{formatTanggalPendek(u.created_at)}</time>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openEdit(u)}
                                      aria-label={`Ubah akun ${u.username}`}
                                    >
                                      <Pencil aria-hidden="true" />
                                      Ubah
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="reject"
                                      size="sm"
                                      disabled={self}
                                      onClick={() => setPendingDelete(u)}
                                      aria-label={`Hapus akun ${u.username}`}
                                      title={self ? "Akun yang sedang dipakai tidak bisa dihapus" : undefined}
                                    >
                                      <Trash2 aria-hidden="true" />
                                      Hapus
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </section>
                  );
                })}
              </div>
            )}

            {users.length > 0 && (
              <div className="flex flex-col items-center gap-3 max-md:rounded-3xl max-md:border max-md:border-border max-md:bg-card max-md:px-4 max-md:py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:border-t md:border-border md:bg-muted/20 md:px-5 md:py-3.5">
                <div className="flex items-center gap-3">
                  <p className="tabular-nums text-xs text-muted-foreground" aria-live="polite">
                    Menampilkan {users.length} dari {total} akun
                  </p>
                  <PageSizeSelect
                    value={limit}
                    onChange={(v) => { setLimit(v); setPage(1); }}
                    aria-label="Baris per halaman"
                  />
                </div>
                <Pagination
                  meta={{ total, page, limit, totalPages }}
                  onPage={setPage}
                  aria-label="Halaman akun"
                />
                {loading && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
              </div>
            )}
          </>
        )}
      </section>

      {/* Modal buat / ubah akun */}
      <Dialog open={draft !== null} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent>
          {draft && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 pr-8">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"
                  >
                    {editing ? <Pencil className="size-5" /> : <UserPlus className="size-5" />}
                  </span>
                  <DialogTitle className="pr-0 font-display text-xl sm:text-2xl">
                    {editing ? "Ubah akun" : "Buat akun baru"}
                  </DialogTitle>
                </div>
                <DialogDescription>
                  {editing
                    ? `Ubah peran ${draft.username}. Password cukup diisi kalau mau diganti.`
                    : "Berikan username dan password ini ke penggunanya."}
                </DialogDescription>
              </DialogHeader>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="flex flex-col gap-4"
                noValidate
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-username">Username</Label>
                  <Input
                    id="user-username"
                    maxLength={USERNAME_MAX}
                    disabled={editing}
                    autoComplete="off"
                    autoCapitalize="none"
                    value={draft.username}
                    onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                    placeholder="nama.baru"
                  />
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1.5 text-sm leading-none font-semibold">Peran</legend>
                  {USER_ROLES.map((role) => {
                    const { Icon } = ROLE_STYLE[role];
                    return (
                      <label
                        key={role}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-muted/50 has-[input:checked]:border-primary has-[input:checked]:bg-primary/[0.06] has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30"
                      >
                        <input
                          type="radio"
                          name="user-role"
                          value={role}
                          checked={draft.role === role}
                          onChange={() => setDraft({ ...draft, role })}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                            STAT_TILE[role],
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-semibold">{ROLE_LABEL[role]}</span>
                          <span className="text-xs leading-relaxed text-muted-foreground">{ROLE_DESC[role]}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-password">
                    Password
                    {editing && <span className="font-normal text-muted-foreground">(opsional)</span>}
                  </Label>
                  <div className="relative">
                    <KeyRound
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="user-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={PASSWORD_MAX}
                      value={draft.password}
                      onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                      placeholder={editing ? "Kosongkan kalau tidak diganti" : `Minimal ${PASSWORD_MIN} karakter`}
                      className="pr-12 pl-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                    </button>
                  </div>
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rejected-border bg-rejected px-3 py-2 text-xs text-rejected-foreground"
                  >
                    {formError}
                  </p>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 aria-hidden="true" className="animate-spin" />}
                    {saving ? "Menyimpan..." : editing ? "Simpan perubahan" : "Buat akun"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Hapus akun ini?"
          description={`Akun ${pendingDelete.username} akan dihapus permanen. Laporan buatannya tetap ada.`}
          confirmLabel="Hapus akun"
          tone="reject"
          busy={deleting}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </>
  );
}
