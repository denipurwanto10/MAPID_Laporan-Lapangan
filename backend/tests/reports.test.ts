import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp, type AppOptions } from '../src/app';
import { hashPassword } from '../src/auth';

interface Row {
  id: number;
  nama: string;
  deskripsi: string;
  status: string;
  created_at: string;
  updated_at: string;
  reporter_id: number;
  decided_by: number | null;
  decided_at: string | null;
}

interface HistRow {
  report_id: number;
  from_status: string;
  to_status: string;
  decided_by: number | null;
  changed_at: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

interface SessionRow {
  token: string;
  user_id: number;
  expires_at: number;
}

/**
 * Fake DB in-memory yang meniru query di store.ts / auth.ts (tanpa Postgres asli).
 * Mendukung: users, sessions, filter status/pencarian, pagination, GROUP BY summary,
 * history dengan aktor, dan DELETE dengan proteksi baris terakhir.
 */
function createFakeDb() {
  const rows: Row[] = [];
  const history: HistRow[] = [];
  const users: UserRow[] = [];
  const sessions: SessionRow[] = [];
  let seq = 1;
  let userSeq = 1;

  const now = () => Date.now();
  const iso = () => new Date().toISOString();

  // Tiga akun demo: admin, pelapor, approver (password 'pw12345').
  for (const [username, role] of [
    ['admin', 'admin'],
    ['pelapor', 'pelapor'],
    ['approver', 'approver'],
  ] as const) {
    users.push({
      id: userSeq++,
      username,
      password_hash: hashPassword('pw12345'),
      role,
      created_at: iso(),
    });
  }

  function applyFilters(
    list: Row[],
    text: string,
    filterParams: unknown[],
  ): Row[] {
    let out = [...list];
    let pi = 0;
    if (text.includes('reporter_id = $')) {
      const id = filterParams[pi++] as number;
      out = out.filter((r) => r.reporter_id === id);
    }
    // Ringkasan (GROUP BY status) sengaja tanpa filter status, jadi angka per
    // status tetap bisa dibandingkan — samakan dengan perilaku store.ts.
    const wantsStatus = text.includes('status = $') && !text.includes('GROUP BY');
    if (wantsStatus) {
      const status = filterParams[pi++] as string;
      out = out.filter((r) => r.status === status);
    }
    if (text.includes('ILIKE $')) {
      let pattern = String(filterParams[pi++] as string);
      if (pattern.startsWith('%')) pattern = pattern.slice(1);
      if (pattern.endsWith('%') && !pattern.endsWith('\\%')) pattern = pattern.slice(0, -1);
      pattern = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
      out = out.filter(
        (r) =>
          r.nama.toLowerCase().includes(pattern) ||
          r.deskripsi.toLowerCase().includes(pattern),
      );
    }
    return out;
  }

  function insertHistory(reportId: number, from: string, to: string, decidedBy: number | null): void {
    history.push({
      report_id: reportId,
      from_status: from,
      to_status: to,
      decided_by: decidedBy,
      changed_at: iso(),
    });

  }

  return {
    rows,
    users,
    sessions,
    async query(text: string, params: unknown[] = []): Promise<{ rows: any[] }> {
      /* ---------- users & sessions ---------- */
      if (text.includes('FROM users WHERE username = $1')) {
        const u = users.find((x) => x.username === params[0]);
        return { rows: u ? [{ ...u }] : [] };
      }
      if (text.includes('FROM sessions s') && text.includes('u.id = s.user_id')) {
        const s = sessions.find((x) => x.token === params[0]);
        if (!s || s.expires_at <= now()) return { rows: [] };
        const u = users.find((x) => x.id === s.user_id);
        return { rows: u ? [{ id: u.id, username: u.username, role: u.role }] : [] };
      }
      if (text.startsWith('INSERT INTO sessions')) {
        const ttl = Number(params[2]);
        sessions.push({
          token: String(params[0]),
          user_id: Number(params[1]),
          expires_at: now() + ttl,
        });

        return { rows: [] };
      }
      if (text.startsWith('DELETE FROM sessions WHERE token')) {
        const i = sessions.findIndex((s) => s.token === params[0]);
        if (i >= 0) sessions.splice(i, 1);
        return { rows: [] };
      }
      if (text.startsWith('DELETE FROM sessions WHERE user_id')) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (sessions[i].user_id === params[0]) sessions.splice(i, 1);
        }
        return { rows: [] };
      }
      if (text.includes('FROM users u') && text.includes('report_count')) {
        return {
          rows: users.map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            created_at: u.created_at,
            report_count: rows.filter((r) => r.reporter_id === u.id).length,
          })),
        };
      }
      if (text.startsWith('INSERT INTO users')) {
        const username = String(params[0]);
        if (users.some((u) => u.username === username)) {
          const err = new Error('duplicate key value violates unique constraint') as Error & {
            code?: string;
          };
          err.code = '23505';
          throw err;
        }
        const u: UserRow = {
          id: userSeq++,
          username,
          password_hash: String(params[1]),
          role: String(params[2]),
          created_at: iso(),
        };
        users.push(u);
        return { rows: [{ id: u.id, username: u.username, role: u.role, created_at: u.created_at }] };
      }
      if (text.startsWith('SELECT id, username, role FROM users WHERE id')) {
        const u = users.find((x) => x.id === params[0]);
        return { rows: u ? [{ id: u.id, username: u.username, role: u.role }] : [] };
      }
      if (text.startsWith('SELECT id, role FROM users WHERE id')) {
        const u = users.find((x) => x.id === params[0]);
        return { rows: u ? [{ id: u.id, role: u.role }] : [] };
      }
      if (text.startsWith('SELECT password_hash FROM users WHERE id')) {
        const u = users.find((x) => x.id === params[0]);
        return { rows: u ? [{ password_hash: u.password_hash }] : [] };
      }
      if (text.startsWith("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'")) {
        return { rows: [{ c: users.filter((u) => u.role === 'admin').length }] };
      }
      if (text.startsWith('UPDATE users SET')) {
        const id = params[params.length - 1];
        const u = users.find((x) => x.id === id);
        if (!u) return { rows: [] };
        let pi = 0;
        if (text.includes('username = $')) u.username = String(params[pi++]);
        if (text.includes('password_hash = $')) u.password_hash = String(params[pi++]);
        if (text.includes('role = $')) u.role = String(params[pi++]);
        return {
          rows: [{ id: u.id, username: u.username, role: u.role, created_at: u.created_at }],
        };
      }
      if (text.startsWith('DELETE FROM users WHERE id')) {
        const i = users.findIndex((x) => x.id === params[0]);
        if (i < 0) return { rows: [] };
        users.splice(i, 1);
        for (let j = sessions.length - 1; j >= 0; j--) {
          if (sessions[j].user_id === params[0]) sessions.splice(j, 1);
        }
        return { rows: [{ id: params[0] }] };
      }

      /* ---------- laporan ---------- */
      if (text.startsWith('SELECT COUNT(*)::int AS total FROM reports r')) {
        return { rows: [{ total: applyFilters(rows, text, params).length }] };
      }
      if (text.startsWith('SELECT r.status, COUNT(*)::int AS count FROM reports r')) {
        const filtered = applyFilters(rows, text, params);
        const map = new Map<string, number>();
        for (const r of filtered) map.set(r.status, (map.get(r.status) ?? 0) + 1);
        return { rows: [...map.entries()].map(([status, count]) => ({ status, count })) };
      }
      if (text.includes('FROM report_status_history h')) {
        const list = history
          .filter((h) => h.report_id === (params[0] as number))
          .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
        return {
          rows: list.map((h) => ({
            from_status: h.from_status,
            to_status: h.to_status,
            decided_by: h.decided_by,
            decided_by_name: users.find((u) => u.id === h.decided_by)?.username ?? null,
            changed_at: h.changed_at,
          })),
        };
      }
      if (text.startsWith('SELECT id FROM reports WHERE id = ANY')) {
        const wanted = new Set((params[0] as unknown[]) as number[]);
        return { rows: rows.filter((r) => wanted.has(r.id)).map((r) => ({ id: r.id })) };
      }
      if (text.startsWith('SELECT')) {
        // findById: "WHERE id = $1" atau "WHERE r.id = $1", tanpa LIMIT.
        if (/\bWHERE (r\.)?id = \$1\b/.test(text) && !text.includes('LIMIT')) {
          const row = rows.find((r) => r.id === (params[0] as number));
          if (!row) return { rows: [] };
          const reporter = users.find((u) => u.id === row.reporter_id)?.username;
          const decider = users.find((u) => u.id === row.decided_by)?.username ?? null;
          return { rows: [{ ...row, reporter_name: reporter, decided_by_name: decider }] };
        }
        // Lista da summary acima já tratadas; aqui: listReports & listAllForExport.
        const hasOffset = text.includes('OFFSET');
        const filterParams = hasOffset ? params.slice(0, -2) : params.slice(0, -1);
        const limit = params[hasOffset ? params.length - 2 : params.length - 1] as number;
        const offset = hasOffset ? (params[params.length - 1] as number) : 0;
        const filtered = applyFilters(rows, text, filterParams);
        const asc = /ORDER BY r\.\w+ ASC/.test(text);
        filtered.sort((a, b) => {
          const key = text.includes('updated_at') ? 'updated_at' : 'created_at';
          const av = a[key as keyof Row] as string;
          const bv = b[key as keyof Row] as string;
          if (av !== bv) return asc ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
          return asc ? a.id - b.id : b.id - a.id;
        });
        return {
          rows: filtered.slice(offset, offset + limit).map((r) => ({
            ...r,
            reporter_name: users.find((u) => u.id === r.reporter_id)?.username,
          })),
        };
      }
      if (text.startsWith('WITH inserted AS')) {
        const r: Row = {
          id: seq++,
          nama: params[0] as string,
          deskripsi: params[1] as string,
          status: 'pending',
          created_at: iso(),
          updated_at: iso(),
          reporter_id: Number(params[2]),
          decided_by: null,
          decided_at: null,
        };
        rows.push(r);
        return {
          rows: [
            {
              ...r,
              reporter_name: users.find((u) => u.id === r.reporter_id)?.username,
            },
          ],
        };
      }
      // Bulk update: UPDATE reports SET status ... WHERE id = ANY(...) AND status = 'pending'
      if (text.startsWith('UPDATE reports') && text.includes('WHERE id = ANY')) {
        const newStatus = String(params[0]);
        const decidedBy = Number(params[1]);
        const wanted = new Set((params[2] as unknown[]) as number[]);
        const changed: Row[] = [];
        for (const r of rows) {
          if (!wanted.has(r.id) || r.status !== 'pending') continue;
          const old = r.status;
          r.status = newStatus;
          r.updated_at = iso();
          r.decided_by = decidedBy;
          r.decided_at = iso();
          insertHistory(r.id, old, newStatus, decidedBy);
          changed.push({ ...r });
        }
        return {
          rows: changed.map((r) => ({
            ...r,
            reporter_name: users.find((u) => u.id === r.reporter_id)?.username,
          })),
        };
      }
      // Single update status
      if (text.startsWith('UPDATE reports')) {
        if (text.includes('SET status')) {
          const newStatus = String(params[0]);
          const decidedBy = Number(params[1]);
          const id = params[2];
          const row = rows.find((r) => r.id === id);
          const allowed =
            row &&
            (row.status === 'pending' ||
              (row.status === 'approved' && newStatus === 'rejected') ||
              (row.status === 'rejected' && newStatus === 'approved'));
          if (!allowed) return { rows: [] };
          const old = row.status;
          row.status = newStatus;
          row.updated_at = iso();
          row.decided_by = decidedBy;
          row.decided_at = iso();
          insertHistory(row.id, old, newStatus, decidedBy);
          return {
            rows: [
              {
                ...row,
                reporter_name: users.find((u) => u.id === row.reporter_id)?.username,
              },
            ],
          };
        }
        if (text.startsWith('UPDATE reports SET nama')) {
          const row = rows.find((r) => r.id === (params[2] as number));
          if (!row || row.status !== 'pending') return { rows: [] };
          row.nama = params[0] as string;
          row.deskripsi = params[1] as string;
          row.updated_at = iso();
          return {
            rows: [
              {
                ...row,
                reporter_name: users.find((u) => u.id === row.reporter_id)?.username,
              },
            ],
          };
        }
      }
      if (text.startsWith('WITH total AS')) {
        // DELETE atomik: pending milik user + jumlah pending user > 1.
        const reporterId = params[0] as number;
        const row = rows.find((r) => r.id === (params[1] as number));
        if (!row || row.status !== 'pending') return { rows: [] };
        const pendingOfUser = rows.filter(
          (r) => r.reporter_id === reporterId && r.status === 'pending',
        ).length;
        if (pendingOfUser <= 1) return { rows: [] };
        rows.splice(rows.indexOf(row), 1);
        return { rows: [{ id: row.id }] };
      }
      if (text.startsWith('SELECT COUNT(*)::int AS c FROM reports WHERE reporter_id')) {
        const c = rows.filter(
          (r) => r.reporter_id === params[0] && r.status === 'pending',
        ).length;
        return { rows: [{ c }] };
      }
      throw new Error(`Query tak dikenal: ${text}`);
    },
  };
}

let baseUrl = '';
let server: Server;

/** Login dan kembalikan token sesi. */
async function login(username: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'pw12345' }),
  });
  const body = (await res.json()) as any;
  assert.equal(res.status, 200, `login ${username} gagal: ${JSON.stringify(body)}`);
  return body.data.token as string;
}

async function api(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // Default: admin, supaya test lama tetap punya akses penuh.
      authorization: `Bearer ${adminToken}`,
      ...(init?.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json()) as any };
}

let adminToken = '';
let pelaporToken = '';
let approverToken = '';

before(async () => {
  // authLimitMax dinaikkan: suite ini login berkali-kali dari IP 127.0.0.1 dan
  // kini juga menguji PATCH /api/auth/password yang memakai authLimiter yang sama.
  const app = createApp(createFakeDb(), { createLimitMax: 500, authLimitMax: 500 });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  adminToken = await login('admin');
  pelaporToken = await login('pelapor');
  approverToken = await login('approver');
});

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
);

/** Jalankan app terpisah (untuk uji rate limit / DB fresh) + helper ber-token. */
async function withApp(
  opts: AppOptions,
  fn: (call: (path: string, init?: RequestInit) => Promise<{ status: number; body: any }>, url: string) => Promise<void>,
): Promise<void> {
  const app = createApp(createFakeDb(), opts);
  const srv: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = srv.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  const token = (await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pw12345' }),
  })).body.data.token as string;
  try {
    await fn((p, i) =>
      call(p, { ...i, headers: { authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }),
    url);
  } finally {
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe('autentikasi', () => {
  it('GET /api/health tetap publik', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });

  it('login dengan kredensial benar mengembalikan user + token', async () => {
    const { status, body } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'pelapor', password: 'pw12345' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.user.username, 'pelapor');
    assert.equal(body.data.user.role, 'pelapor');
    assert.ok(body.data.token);
    // Password tidak boleh bocor di respons.
    assert.equal(body.data.user.password, undefined);
    assert.equal(body.data.user.password_hash, undefined);
  });

  it('password salah ditolak 401', async () => {
    const { status, body } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'salah' }),
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  it('username tak dikenal ditolak 401 dengan pesan sama', async () => {
    const { status, body } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'entah', password: 'pw12345' }),
    });
    assert.equal(status, 401);
    assert.match(body.message, /username atau password salah/i);
  });

  it('tanpa token, daftar laporan ditolak 401', async () => {
    const res = await fetch(`${baseUrl}/api/reports`);
    assert.equal(res.status, 401);
  });

  it('token ngawur ditolak 401', async () => {
    const { status } = await api('/api/reports', {
      headers: { authorization: 'Bearer token-ngawur' },
    });
    assert.equal(status, 401);
  });

  it('GET /api/auth/me mengembalikan profil dari token', async () => {
    const { status, body } = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${approverToken}` },
    });
    assert.equal(status, 200);
    assert.equal(body.data.username, 'approver');
    assert.equal(body.data.role, 'approver');
  });

  it('logout membuat token tidak berlaku lagi', async () => {
    const token = await login('pelapor');
    const ok = await api('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(ok.status, 200);
    const out = await api('/api/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(out.status, 200);
    const after = await api('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(after.status, 401);
  });

  it('tidak ada halaman registrasi mandiri', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'baru', password: 'pw12345', role: 'admin' }),
    });
    assert.equal(res.status, 404);
  });
});

describe('manajemen akun (khusus admin)', () => {
  it('admin bisa membuat akun', async () => {
    const { status, body } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'petugas1', password: 'rahasia123', role: 'approver' }),
    });
    assert.equal(status, 201);
    assert.equal(body.data.username, 'petugas1');
    assert.equal(body.data.role, 'approver');
  });

  it('username ganda ditolak 409', async () => {
    const { status } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'petugas1', password: 'rahasia123', role: 'approver' }),
    });
    assert.equal(status, 409);
  });

  it('role tak dikenal ditolak 400', async () => {
    const { status } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'x2', password: 'rahasia123', role: 'super' }),
    });
    assert.equal(status, 400);
  });

  it('password lemah ditolak 400', async () => {
    const { status } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'x3', password: 'pendek', role: 'pelapor' }),
    });
    assert.equal(status, 400);
  });

  it('non-admin tidak boleh membuat akun (403)', async () => {
    const { status } = await api('/api/users', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ username: 'x4', password: 'rahasia123', role: 'pelapor' }),
    });
    assert.equal(status, 403);
  });

  it('non-admin tidak boleh melihat daftar akun (403)', async () => {
    const { status } = await api('/api/users', {
      headers: { authorization: `Bearer ${approverToken}` },
    });
    assert.equal(status, 403);
  });

  it('admin bisa mengubah peran', async () => {
    const list = await api('/api/users');
    const target = list.body.data.find((u: any) => u.username === 'petugas1');
    const { status, body } = await api(`/api/users/${target.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'pelapor' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.role, 'pelapor');
  });

  it('admin terakhir tidak bisa dihapus (409)', async () => {
    const me = await api('/api/auth/me');
    const { status } = await api(`/api/users/${me.body.data.id}`, { method: 'DELETE' });
    assert.equal(status, 409);
  });

  it('akun bisa dihapus', async () => {
    const list = await api('/api/users');
    const target = list.body.data.find((u: any) => u.username === 'petugas1');
    const { status } = await api(`/api/users/${target.id}`, { method: 'DELETE' });
    assert.equal(status, 200);
  });
});

describe('membuat laporan', () => {
  it('POST valid mengembalikan 201 dengan status pending', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Banjir Cipinang', deskripsi: 'Genangan 30cm di Jl. Raya Cipinang' }),
    });
    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.nama, 'Banjir Cipinang');
    assert.equal(body.data.status, 'pending');
    assert.ok(body.data.id > 0);
  });

  it('status dari client diabaikan, tetap pending', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'X', deskripsi: 'Y', status: 'approved' }),
    });
    assert.equal(status, 201);
    assert.equal(body.data.status, 'pending');
  });

  it('nama kosong ditolak 400', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: '   ', deskripsi: 'Ada isi' }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('deskripsi hilang ditolak 400', async () => {
    const { status } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Ada nama' }),
    });
    assert.equal(status, 400);
  });

  it('nama lebih dari 200 karakter ditolak 400', async () => {
    const { status } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'a'.repeat(201), deskripsi: 'ok' }),
    });
    assert.equal(status, 400);
  });

  it('approver tidak boleh membuat laporan (403)', async () => {
    const { status } = await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${approverToken}` },
      body: JSON.stringify({ nama: 'Dari approver', deskripsi: 'd' }),
    });
    assert.equal(status, 403);
  });

  it('reporter_id diambil dari user login, bukan dari body', async () => {
    const { body } = await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Milik pelapor', deskripsi: 'd', reporter_id: 1 }),
    });
    const me = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${pelaporToken}` },
    });
    assert.equal(body.data.reporter_id, me.body.data.id);
    assert.equal(body.data.reporter_name, 'pelapor');
  });
});

describe('mengambil daftar laporan', () => {
  it('GET mengembalikan array terbaru dulu + meta + summary', async () => {
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Laporan Kedua', deskripsi: 'Deskripsi kedua' }),
    });
    const { status, body } = await api('/api/reports');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.meta.page, 1);
    assert.ok(typeof body.meta.total === 'number');
    assert.equal(
      body.summary.pending + body.summary.approved + body.summary.rejected,
      body.summary.all,
    );
  });

  it('pagination membatasi hasil dan melaporkan total', async () => {
    for (let i = 0; i < 3; i++) {
      await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: `Paginasi ${i}`, deskripsi: 'uji halaman' }),
      });
    }
    const { body } = await api('/api/reports?limit=2&page=2');
    assert.equal(body.data.length, 2);
    assert.equal(body.meta.page, 2);
    assert.equal(body.meta.limit, 2);
  });

  it('limit raksasa dijepit ke batas aman', async () => {
    const { body } = await api('/api/reports?limit=9999');
    assert.ok(body.meta.limit <= 100);
  });

  it('halaman di luar jangkauan diklem ke halaman terakhir', async () => {
    const { body } = await api('/api/reports?page=999&limit=1');
    const total = body.meta.total as number;
    assert.ok(total > 0, 'fixture harus punya minimal satu laporan');
    // OFFSET di luar jangkauan selalu kosong; server harus mengarahkan ke
    // halaman terakhir yang benar-benar ada, bukan mengembalikan daftar kosong.
    assert.equal(body.meta.page, body.meta.totalPages);
    assert.equal(body.data.length, Math.min(1, total));
  });

  it('ringkasan tidak dijernihkan filter status aktif', async () => {
    // Jamin ada laporan approved: buat lalu putuskan sebagai approver.
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk summary approve', deskripsi: 'd' }),
    });
    const createdId = created.body.data.id as number;
    await api(`/api/reports/${createdId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    // Saat tab "pending" aktif, angka status lain harus tetap terisi supaya
    // bisa dibandingkan.
    const pending = await api('/api/reports?status=pending');
    const all = await api('/api/reports');
    const allSummary = all.body.summary as { all: number; approved: number; pending: number };
    const pendingSummary = pending.body.summary as { all: number; approved: number; pending: number };
    assert.ok(allSummary.approved > 0);
    assert.equal(pendingSummary.all, allSummary.all);
    assert.equal(pendingSummary.approved, allSummary.approved);
    assert.equal(pending.body.meta.total, pendingSummary.pending);
  });

  it('filter status hanya mengembalikan status tersebut', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk filter approve', deskripsi: 'd' }),
    });
    await api(`/api/reports/${created.body.data.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { body } = await api('/api/reports?status=approved');
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((r: Row) => r.status === 'approved'));
  });

  it('pencarian q mencocokkan nama/deskripsi', async () => {
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Lampu Cipinang', deskripsi: 'd' }),
    });
    const { body } = await api('/api/reports?q=cipinang');
    assert.ok(body.data.length >= 1);
    assert.ok(
      body.data.every(
        (r: Row) =>
          r.nama.toLowerCase().includes('cipinang') ||
          r.deskripsi.toLowerCase().includes('cipinang'),
      ),
    );
  });

  it('karakter % dan _ dicari harfiah, bukan wildcard', async () => {
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Diskon 100% meriah', deskripsi: 'promo akhir tahun' }),
    });
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Laporan biasa', deskripsi: 'tanpa karakter khusus' }),
    });
    const percent = await api(`/api/reports?q=${encodeURIComponent('%')}`);
    assert.ok(percent.body.data.length >= 1);
    assert.ok(
      percent.body.data.every((r: Row) => r.nama.includes('%') || r.deskripsi.includes('%')),
    );
  });

  it('status tak dikenal diabaikan (bukan 400)', async () => {
    const { status, body } = await api('/api/reports?status=arsip&page=abc&limit=-5');
    assert.equal(status, 200);
    assert.equal(body.meta.page, 1);
  });

  it('approver melihat seluruh laporan', async () => {
    await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Rahasia pelapor', deskripsi: 'hanya milik pelapor' }),
    });
    const { body } = await api('/api/reports', {
      headers: { authorization: `Bearer ${approverToken}` },
    });
    assert.ok(body.data.some((r: Row) => r.nama === 'Rahasia pelapor'));
  });
});

describe('cakupan laporan milik pelapor', () => {
  it('pelapor hanya melihat laporan sendiri', async () => {
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Laporan admin', deskripsi: 'milik admin' }),
    });
    const { body } = await api('/api/reports', {
      headers: { authorization: `Bearer ${pelaporToken}` },
    });
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((r: Row) => r.reporter_name === 'pelapor'));
    assert.ok(!body.data.some((r: Row) => r.nama === 'Laporan admin'));
  });

  it('summary pelapor ikut terhitung hanya atas laporannya sendiri', async () => {
    const { body } = await api('/api/reports', {
      headers: { authorization: `Bearer ${pelaporToken}` },
    });
    assert.ok(body.summary.all > 0);
    assert.ok(body.data.length <= body.summary.all);
  });

  it('pelapor tidak bisa membuka detail laporan orang lain (403)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Pribadi admin', deskripsi: 'd' }),
    });
    const { status } = await api(`/api/reports/${created.body.data.id}`, {
      headers: { authorization: `Bearer ${pelaporToken}` },
    });
    assert.equal(status, 403);
  });

  it('pelapor tidak bisa mengedit laporan orang lain (403)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Pribadi admin 2', deskripsi: 'd' }),
    });
    const { status } = await api(`/api/reports/${created.body.data.id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Dibajak', deskripsi: 'd' }),
    });
    assert.equal(status, 403);
  });

  it('pelapor tidak bisa menghapus laporan orang lain (403)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Pribadi admin 3', deskripsi: 'd' }),
    });
    const { status } = await api(`/api/reports/${created.body.data.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${pelaporToken}` },
    });
    assert.equal(status, 403);
  });

  it('pelapor tidak boleh menyetujui laporan (403)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Milik saya untuk ditolak', deskripsi: 'd' }),
    });
    const { status } = await api(`/api/reports/${created.body.data.id}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 403);
  });
});

describe('mengubah status laporan', () => {
  it('PATCH approved berhasil dan updated_at terisi', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk approve', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, 'approved');
    assert.ok(body.data.updated_at >= body.data.created_at);
  });

  it('PATCH rejected berhasil', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk reject', deskripsi: 'd' }),
    });
    const { status, body } = await api(`/api/reports/${created.body.data.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, 'rejected');
  });

  it('approved bisa direvisi jadi rejected (revisi oleh approver)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Revisi approve', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status, body } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, 'rejected');
  });

  it('rejected bisa direvisi jadi approved', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Revisi reject', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    const { status, body } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, 'approved');
  });

  it('status yang sama ditolak 409 (approved -> approved)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Sama saja', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 409);
  });

  it('decided_by terisi sesuai akor yang memutuskan', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Siapa yang putuskan', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    const { body } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${approverToken}` },
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(body.data.status, 'approved');
    const me = await api('/api/auth/me', {
      headers: { authorization: `Bearer ${approverToken}` },
    });
    assert.equal(body.data.decided_by, me.body.data.id);
    assert.ok(body.data.decided_at);
  });

  it('status pending ditolak 400', async () => {
    const { status } = await api('/api/reports/1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    });
    assert.equal(status, 400);
  });

  it('status sembarang ditolak 400', async () => {
    const { status } = await api('/api/reports/1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    assert.equal(status, 400);
  });

  it('ID non-angka ditolak 400', async () => {
    const { status } = await api('/api/reports/abc/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 400);
  });

  it('ID di luar range int4 ditolak 400', async () => {
    const { status } = await api('/api/reports/99999999999/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 400);
  });

  it('ID yang tidak ada mengembalikan 404', async () => {
    const { status, body } = await api('/api/reports/999999/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(status, 404);
    assert.equal(body.success, false);
  });
});

describe('mengubah isi laporan', () => {
  it('pelapor boleh mengedit laporannya selama masih pending', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Nama lama', deskripsi: 'deskripsi lama' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Nama baru', deskripsi: 'deskripsi baru' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.nama, 'Nama baru');
    assert.equal(body.data.status, 'pending');
  });

  it('edit setelah diputuskan ditolak 409', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Terkunci', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status, body } = await api(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ nama: 'Coba ubah', deskripsi: 'd' }),
    });
    assert.equal(status, 409);
    assert.equal(body.success, false);
  });

  it('PATCH isi dengan body tak valid ditolak 400', async () => {
    const { status } = await api('/api/reports/1', {
      method: 'PATCH',
      body: JSON.stringify({ nama: '', deskripsi: 'd' }),
    });
    assert.equal(status, 400);
  });
});

describe('menghapus laporan', () => {
  it('DELETE saat pending berhasil', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Hapus saya', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}`, { method: 'DELETE' });
    assert.equal(status, 200);
    assert.equal(body.data.id, id);
    const check = await api(`/api/reports/${id}`);
    assert.equal(check.status, 404);
  });

  it('DELETE saat sudah diputuskan ditolak 409', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Jangan hapus', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    const { status } = await api(`/api/reports/${id}`, { method: 'DELETE' });
    assert.equal(status, 409);
  });

  it('laporan pending terakhir milik user tidak bisa dihapus (409)', async () => {
    await withApp({}, async (call) => {
      const login = await call('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'pelapor', password: 'pw12345' }),
      });
      const token = login.body.data.token as string;
      const asUser = (p: string, i?: RequestInit) =>
        call(p, { ...i, headers: { authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } });

      const only = await asUser('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Satu-satunya', deskripsi: 'd' }),
      });
      assert.equal(only.status, 201);
      const blocked = await asUser(`/api/reports/${only.body.data.id}`, { method: 'DELETE' });
      assert.equal(blocked.status, 409);
      assert.match(blocked.body.message, /terakhir/i);

      // Dengan 2 baris pending, hapus satu boleh; sisa 1 tetap terkunci.
      const second = await asUser('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Kedua', deskripsi: 'd' }),
      });
      const delOk = await asUser(`/api/reports/${second.body.data.id}`, { method: 'DELETE' });
      assert.equal(delOk.status, 200);
      const lastTry = await asUser(`/api/reports/${only.body.data.id}`, { method: 'DELETE' });
      assert.equal(lastTry.status, 409);
    });
  });

  it('DELETE id tak ada mengembalikan 404', async () => {
    const { status } = await api('/api/reports/999999', { method: 'DELETE' });
    assert.equal(status, 404);
  });
});

describe('riwayat persetujuan', () => {
  it('riwayat mencatat dari_status, ke_status, siapa, dan kapan', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Beriwayat', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${approverToken}` },
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status, body } = await api(`/api/reports/${id}/history`);
    assert.equal(status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].from_status, 'pending');
    assert.equal(body.data[0].to_status, 'approved');
    assert.equal(body.data[0].decided_by_name, 'approver');
    assert.ok(body.data[0].changed_at);
  });

  it('revisi menambah satu baris riwayat baru', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Riwayat revisi', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { body } = await api(`/api/reports/${id}/history`);
    assert.equal(body.data.length, 2);
    // Terbaru dulu.
    assert.equal(body.data[0].to_status, 'approved');
    assert.equal(body.data[0].from_status, 'rejected');
    assert.equal(body.data[1].from_status, 'pending');
  });

  it('GET history id tak ada mengembalikan 404', async () => {
    const { status } = await api('/api/reports/999999/history');
    assert.equal(status, 404);
  });
});

describe('rate limit pembuatan laporan', () => {
  it('POST melebihi batas dikembalikan 429', async () => {
    await withApp({ createLimitMax: 2 }, async (call) => {
      assert.equal((await call('/api/reports', { method: 'POST', body: JSON.stringify({ nama: 'a', deskripsi: 'd' }) })).status, 201);
      assert.equal((await call('/api/reports', { method: 'POST', body: JSON.stringify({ nama: 'b', deskripsi: 'd' }) })).status, 201);
      const blocked = await call('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'c', deskripsi: 'd' }),
      });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.success, false);
    });
  });
});

describe('ekspor Excel server-side', () => {
  async function exportXlsx(path: string): Promise<{ status: number; headers: Headers; bytes: Buffer }> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, bytes };
  }

  it('GET /api/reports/export.xlsx mengembalikan file .xlsx valid', async () => {
    await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk diekspor', deskripsi: 'isi ekspor' }),
    });
    const { status, headers, bytes } = await exportXlsx('/api/reports/export.xlsx');
    assert.equal(status, 200);
    assert.ok((headers.get('content-type') ?? '').includes('spreadsheetml.sheet'));
    assert.match(
      headers.get('content-disposition') ?? '',
      /attachment; filename="laporan-lapangan-.*\.xlsx"/,
    );
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.ok(bytes.length > 1000);
  });

  it('ekspor mengikuti filter status + q', async () => {
    const { status, headers, bytes } = await exportXlsx(
      '/api/reports/export.xlsx?status=pending&q=diekspor',
    );
    assert.equal(status, 200);
    assert.ok((headers.get('content-type') ?? '').includes('spreadsheetml'));
    assert.ok(bytes.length > 1000);
    const empty = await exportXlsx('/api/reports/export.xlsx?q=zz-tidak-ada-zz');
    assert.equal(empty.status, 200);
    assert.ok(empty.bytes.length > 500);
  });

  it('ekspor tanpa login ditolak 401', async () => {
    const res = await fetch(`${baseUrl}/api/reports/export.xlsx`);
    assert.equal(res.status, 401);
  });

  it('ekspor melebihi batas dikembalikan 429', async () => {
    await withApp({ exportLimitMax: 1 }, async (call, url) => {
      const token = (
        await call('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'admin', password: 'pw12345' }),
        })
      ).body.data.token as string;
      const get = () =>
        fetch(`${url}/api/reports/export.xlsx`, { headers: { authorization: `Bearer ${token}` } });
      assert.equal((await get()).status, 200);
      assert.equal((await get()).status, 429);
    });
  });
});

describe('rate limit tulis (PATCH/DELETE)', () => {
  it('PATCH/DELETE melebihi batas dikembalikan 429', async () => {
    await withApp({ writeLimitMax: 3 }, async (call) => {
      const created = await call('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Kena limit tulis', deskripsi: 'd' }),
      });
      assert.equal(created.status, 201);
      const id = created.body.data.id as number;
      const patch = (status: string) =>
        call(`/api/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      assert.equal((await patch('approved')).status, 200);
      assert.equal((await patch('rejected')).status, 200);
      assert.equal((await call(`/api/reports/${id}`, { method: 'DELETE' })).status, 409);
      const blocked = await patch('approved');
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.success, false);
    });
  });
});

describe('detail satu laporan', () => {
  it('GET /api/reports/:id mengembalikan laporan yang ada', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Untuk detail', deskripsi: 'isi detail' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}`);
    assert.equal(status, 200);
    assert.equal(body.data.id, id);
    assert.equal(body.data.nama, 'Untuk detail');
  });

  it('GET id tak ada mengembalikan 404', async () => {
    const { status, body } = await api('/api/reports/999999');
    assert.equal(status, 404);
    assert.equal(body.success, false);
  });

  it('GET id non-angka ditolak 400', async () => {
    const { status } = await api('/api/reports/abc');
    assert.equal(status, 400);
  });
});

describe('bulk approve/reject', () => {
  async function makePending(nama: string): Promise<number> {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama, deskripsi: 'd' }),
    });
    return created.body.data.id as number;
  }

  it('PATCH bulk mengubah semua pending sekaligus', async () => {
    const ids = [await makePending('Bulk A'), await makePending('Bulk B'), await makePending('Bulk C')];
    const { status, body } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status: 'approved' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.updated.length, 3);
    assert.deepEqual(body.data.skipped, []);
    assert.ok(body.data.updated.every((r: Row) => r.status === 'approved'));
  });

  it('baris final dilewati sebagai skipped, bukan error', async () => {
    const pending = await makePending('Bulk pending');
    const final = await makePending('Bulk final');
    await api(`/api/reports/${final}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    const { status, body } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [pending, final, 999999], status: 'approved' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.updated.length, 1);
    assert.equal(body.data.updated[0].id, pending);
    assert.equal(body.data.skipped.length, 2);
  });

  it('bulk mencatat satu baris riwayat per laporan yang berubah', async () => {
    const ids = [await makePending('Bulk riwayat 1'), await makePending('Bulk riwayat 2')];
    await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status: 'approved' }),
    });
    for (const id of ids) {
      const { body } = await api(`/api/reports/${id}/history`);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].to_status, 'approved');
    }
  });

  it('pelapor tidak boleh bulk approve (403)', async () => {
    const id = await makePending('Bulk ditolak');
    const { status } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${pelaporToken}` },
      body: JSON.stringify({ ids: [id], status: 'approved' }),
    });
    assert.equal(status, 403);
  });

  it('ids kosong ditolak 400', async () => {
    const { status } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [], status: 'approved' }),
    });
    assert.equal(status, 400);
  });

  it('lebih dari 100 ids ditolak 400', async () => {
    const { status } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids: Array.from({ length: 101 }, (_, i) => i + 1), status: 'approved' }),
    });
    assert.equal(status, 400);
  });

  it('status tak valid pada bulk ditolak 400', async () => {
    const id = await makePending('Bulk status salah');
    const { status } = await api('/api/reports/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [id], status: 'pending' }),
    });
    assert.equal(status, 400);
  });
});

describe('ganti password sendiri', () => {
  // Akun khusus agar tidak mengubah password akun demo yang dipakai test lain.
  const USER = 'gantipw';
  const OLD = 'lama12345';
  const NEW = 'baru67890';

  async function loginAs(username: string, password: string): Promise<{ status: number; token?: string }> {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return { status: r.status, token: r.body.data?.token };
  }

  it('setup: admin membuat akun uji', async () => {
    const { status } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: OLD, role: 'approver' }),
    });
    assert.equal(status, 201);
  });

  it('tanpa login ditolak 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: OLD, newPassword: NEW }),
    });
    assert.equal(res.status, 401);
  });

  it('password lama salah ditolak 401 dan password tidak berubah', async () => {
    const token = (await loginAs(USER, OLD)).token!;
    const { status } = await api('/api/auth/password', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: 'salah99', newPassword: NEW }),
    });
    assert.equal(status, 401);
    // Sesi tetap hidup — salah input password lama tidak boleh menendang user.
    const me = await api('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
  });

  it('password baru lemah ditolak 400', async () => {
    const token = (await loginAs(USER, OLD)).token!;
    const { status } = await api('/api/auth/password', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: OLD, newPassword: 'pendek' }),
    });
    assert.equal(status, 400);
  });

  it('password baru sama dengan lama ditolak 400', async () => {
    const token = (await loginAs(USER, OLD)).token!;
    const { status } = await api('/api/auth/password', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: OLD, newPassword: OLD }),
    });
    assert.equal(status, 400);
  });

  it('berhasil: 200, semua sesi dicabut, password lama mati, password baru hidup', async () => {
    const tokenA = (await loginAs(USER, OLD)).token!;
    const tokenB = (await loginAs(USER, OLD)).token!;
    const { status, body } = await api('/api/auth/password', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ currentPassword: OLD, newPassword: NEW }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);

    // Kedua sesi (termasuk yang dipakai untuk request) harus tidak berlaku.
    for (const t of [tokenA, tokenB]) {
      const me = await api('/api/auth/me', { headers: { authorization: `Bearer ${t}` } });
      assert.equal(me.status, 401);
    }
    assert.equal((await loginAs(USER, OLD)).status, 401);
    assert.equal((await loginAs(USER, NEW)).status, 200);
  });
});

describe('penanganan error', () => {
  it('endpoint tak dikenal mengembalikan 404 JSON', async () => {
    const { status, body } = await api('/api/tidak-ada');
    assert.equal(status, 404);
    assert.equal(body.success, false);
  });

  it('body JSON rusak mengembalikan 400', async () => {
    const { status, body } = await api('/api/reports', { method: 'POST', body: '{rusak' });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('body lebih dari 100kb mengembalikan 413', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'x', deskripsi: 'a'.repeat(150_000) }),
    });
    assert.equal(status, 413);
    assert.equal(body.success, false);
  });
});