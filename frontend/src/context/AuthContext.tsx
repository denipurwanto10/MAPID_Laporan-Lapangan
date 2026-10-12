import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import type { AuthUser } from "../types/report";

/**
 * Status autentikasi sisi klien.
 *
 * Token sesi disimpan di sessionStorage (lihat lib/api.ts) dan diverifikasi ke
 * /api/auth/me saat aplikasi dimuat. Bila token sudah expired atau dicabut,
 * server membalas 401 dan state kembali ke "belum login".
 *
 * Catatan: ini hanya lapisan tampilan. Penegakan peran yang sebenarnya ada di
 * backend (requireAuth / requireRole) dan di Postgres — frontend tidak pernah
 * menjadi satu-satunya penjaga akses.
 */
interface AuthContextValue {
  user: AuthUser | null;
  /** true selama verifikasi token awal — dipakai agar layar tidak berkedip. */
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Belum login / token tidak berlaku — biarkan null (belum ada UI).
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, checking, login, logout }),
    [user, checking, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}

/** True bila user punya salah satu peran yang diminta. */
export function useHasRole(...roles: AuthUser["role"][]): boolean {
  const { user } = useAuth();
  return !!user && roles.includes(user.role);
}