import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ConfirmDialog } from "../reports/ConfirmDialog";
import { ApiError, api } from "../../lib/api";
import { formatTanggal } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  ROLE_DESC,
  ROLE_LABEL,
  USER_ROLES,
  USERNAME_MAX,
  type ManagedUser,
  type UserRole,
} from "../../types/report";

interface Draft {
  id: number | null;
  username: string;
  password: string;
  role: UserRole;
}

const EMPTY_DRAFT: Draft = { id: null, username: "", password: "", role: "pelapor" };

/**
 * Kelola akun pengguna — hanya untuk Admin.
 *
 * Endpoint di backend (/api/users) sudah dibatasi requireAdmin, jadi panel ini
 * hanya lapisan tampilan: membuka URL atau memalsukan request tetap ditolak 403
 * oleh server.
 */
export function UserManager() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat daftar akun.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Muat hanya bila memang admin: endpoint /api/users membalas 403 untuk peran lain
  // dan akan memunculkan toast error yang membingungkan.
  const isAdmin = me?.role === "admin";
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function save(): Promise<void> {
    if (!draft || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      if (draft.id === null) {
        await api.createUser(draft.username.trim(), draft.password, draft.role);
      } else {
        const patch: { role?: UserRole; password?: string } = { role: draft.role };
        if (draft.password) patch.password = draft.password;
        await api.updateUser(draft.id, patch);
      }
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Gagal menyimpan akun.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: ManagedUser): Promise<void> {
    try {
      await api.deleteUser(target.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus akun.");
      setPendingDelete(null);
    }
  }

  if (me?.role !== "admin") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users aria-hidden="true" className="size-5" />
          Kelola Akun
        </CardTitle>
        <CardDescription>
          Akun dibuat di sini oleh admin — tidak ada pendaftaran mandiri. Ubah peran kapan saja; ganti
          password hanya bila dikosongkan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat akun…</p>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">Username</th>
                  <th scope="col" className="pb-2 font-medium">Peran</th>
                  <th scope="col" className="pb-2 font-medium">Laporan</th>
                  <th scope="col" className="pb-2 font-medium">Dibuat</th>
                  <th scope="col" className="pb-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium">
                      {u.username}
                      {u.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(anda)</span>}
                    </td>
                    <td className="py-2 text-muted-foreground">{ROLE_LABEL[u.role]}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{u.report_count}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{formatTanggal(u.created_at)}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Ubah akun ${u.username}`}
                          onClick={() =>
                            setDraft({ id: u.id, username: u.username, password: "", role: u.role })
                          }
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Hapus akun ${u.username}`}
                          disabled={u.id === me.id}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete(u)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {draft === null ? (
          <Button type="button" variant="outline" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus aria-hidden="true" />
            Buat akun baru
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold">
              {draft.id === null ? "Akun baru" : `Ubah akun ${draft.username}`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-username">Username</Label>
                <Input
                  id="user-username"
                  maxLength={USERNAME_MAX}
                  disabled={draft.id !== null}
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  placeholder="nama.baru"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role">Peran</Label>
                <select
                  id="user-role"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="user-password">
                  Password{draft.id !== null ? " (kosongkan bila tidak diubah)" : ""}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN}
                  maxLength={PASSWORD_MAX}
                  required={draft.id === null}
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  placeholder={`minimal ${PASSWORD_MIN} karakter`}
                />
                <p className="text-xs text-muted-foreground">{ROLE_DESC[draft.role]}</p>
              </div>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Menyimpan…" : "Simpan"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setFormError(null);
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Hapus akun ini?"
          description={`Akun “${pendingDelete.username}” akan dihapus permanen. Laporan yang pernah dibuatnya tetap tersimpan.`}
          confirmLabel="Hapus akun"
          tone="reject"
          busy={false}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </Card>
  );
}