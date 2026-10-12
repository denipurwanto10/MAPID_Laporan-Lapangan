import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';

interface Row {
  id: number;
  nama: string;
  deskripsi: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface HistRow {
  report_id: number;
  from_status: string;
  to_status: string;
  changed_at: string;
}

/**
 * Fake DB in-memory yang meniru perilaku query di store.ts (tanpa Postgres asli).
 * Mendukung filter status/pencarian, pagination, GROUP BY summary, history, dan DELETE.
 */
function createFakeDb() {
  const rows: Row[] = [];
  const history: HistRow[] = [];
  let seq = 1;

  function applyFilters(list: Row[], text: string, filterParams: unknown[]): Row[] {
    let out = [...list];
    let pi = 0;
    if (text.includes('status = $')) {
      const status = filterParams[pi++] as string;
      out = out.filter((r) => r.status === status);
    }
    if (text.includes('ILIKE $')) {
      // Kembalikan pola LIKE ke teks pencarian: buang % pembungkus, unescape \% \_ \\.
      let pattern = String(filterParams[pi++] as string);
      if (pattern.startsWith('%')) pattern = pattern.slice(1);
      if (pattern.endsWith('%') && !pattern.endsWith('\\%')) pattern = pattern.slice(0, -1);
      pattern = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
      out = out.filter(
        (r) => r.nama.toLowerCase().includes(pattern) || r.deskripsi.toLowerCase().includes(pattern),
      );
    }
    return out;
  }

  return {
    rows,
    async query(text: string, params: unknown[] = []): Promise<{ rows: any[] }> {
      if (text.startsWith('SELECT COUNT')) {
        const filtered = applyFilters(rows, text, params);
        return { rows: [{ total: filtered.length }] };
      }
      if (text.startsWith('SELECT status, COUNT')) {
        const map = new Map<string, number>();
        for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
        return { rows: [...map.entries()].map(([status, count]) => ({ status, count })) };
      }
      if (text.includes('FROM report_status_history')) {
        const list = history
          .filter((h) => h.report_id === (params[0] as number))
          .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
        return { rows: list.map((h) => ({ ...h })) };
      }
      if (text.startsWith('SELECT')) {
        // findById (tanpa LIMIT) vs listReports (dengan LIMIT/OFFSET di 2 param terakhir)
        if (text.includes('WHERE id = $1') && !text.includes('LIMIT')) {
          const row = rows.find((r) => r.id === (params[0] as number));
          return { rows: row ? [{ ...row }] : [] };
        }
        // Lookup IN untuk bulk-status (WHERE id = ANY($1)): kembalikan semua yang cocok.
        if (text.includes('WHERE id = ANY')) {
          const wanted = new Set((params[0] as unknown[]) as number[]);
          return { rows: rows.filter((r) => wanted.has(r.id)).map((r) => ({ ...r })) };
        }
        // listAllForExport: LIMIT saja tanpa OFFSET (param terakhir = limit, offset 0).
        const hasOffset = text.includes('OFFSET');
        const filterParams = hasOffset ? params.slice(0, -2) : params.slice(0, -1);
        const limit = params[hasOffset ? params.length - 2 : params.length - 1] as number;
        const offset = hasOffset ? (params[params.length - 1] as number) : 0;
        const filtered = applyFilters(rows, text, filterParams);
        const asc = text.includes(' ASC');
        filtered.sort((a, b) => {
          const key = text.includes('updated_at') ? 'updated_at' : 'created_at';
          const av = a[key as keyof Row] as string;
          const bv = b[key as keyof Row] as string;
          if (av !== bv) return asc ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
          return asc ? a.id - b.id : b.id - a.id;
        });
        return { rows: filtered.slice(offset, offset + limit).map((r) => ({ ...r })) };
      }
      if (text.startsWith('INSERT INTO reports')) {
        const now = new Date().toISOString();
        const row: Row = {
          id: seq++,
          nama: params[0] as string,
          deskripsi: params[1] as string,
          status: 'pending',
          created_at: now,
          updated_at: now,
        };
        rows.push(row);
        return { rows: [{ ...row }] };
      }
      if (text.startsWith('INSERT INTO report_status_history')) {
        history.push({
          report_id: params[0] as number,
          from_status: text.includes("'pending'") ? 'pending' : (params[1] as string),
          to_status: (text.includes("'pending'") ? params[1] : params[2]) as string,
          changed_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (text.startsWith('UPDATE reports SET status')) {
        // Bulk (WHERE id = ANY) vs tunggal (WHERE id = $2).
        if (text.includes('ANY(')) {
          const wanted = new Set((params[1] as unknown[]) as number[]);
          const changed: Row[] = [];
          for (const r of rows) {
            if (!wanted.has(r.id) || r.status !== 'pending') continue;
            const oldStatus = r.status;
            r.status = params[0] as string;
            r.updated_at = new Date().toISOString();
            changed.push({ ...r });
            history.push({
              report_id: r.id,
              from_status: oldStatus,
              to_status: r.status,
              changed_at: new Date().toISOString(),
            });
          }
          return { rows: changed };
        }
        const row = rows.find((r) => r.id === (params[1] as number));
        // WHERE status = 'pending': baris final tidak berubah (RETURNING kosong).
        if (!row || row.status !== 'pending') return { rows: [] };
        const oldStatus = row.status;
        row.status = params[0] as string;
        row.updated_at = new Date().toISOString();
        history.push({
          report_id: row.id,
          from_status: oldStatus,
          to_status: row.status,
          changed_at: new Date().toISOString(),
        });
        return { rows: [{ ...row }] };
      }
      if (text.startsWith('UPDATE reports SET nama')) {
        const row = rows.find((r) => r.id === (params[2] as number));
        if (!row || row.status !== 'pending') return { rows: [] };
        row.nama = params[0] as string;
        row.deskripsi = params[1] as string;
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }] };
      }
      if (text.startsWith('WITH total AS')) {
        // DELETE atomik: hanya pending + total > 1 yang terhapus (RETURNING 1 baris).
        const row = rows.find((r) => r.id === (params[0] as number));
        if (!row || row.status !== 'pending' || rows.length <= 1) return { rows: [] };
        rows.splice(rows.indexOf(row), 1);
        return { rows: [{ ...row }] };
      }
      if (text.startsWith('DELETE FROM reports')) {
        const idx = rows.findIndex((r) => r.id === (params[0] as number));
        if (idx >= 0) rows.splice(idx, 1);
        return { rows: [] };
      }
      throw new Error(`Query tak dikenal: ${text}`);
    },
  };
}

let baseUrl = '';
let server: Server;

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json()) as any };
}

before(async () => {
  const app = createApp(createFakeDb());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
);

describe('health check', () => {
  it('GET /api/health mengembalikan ok', async () => {
    const { status, body } = await api('/api/health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.ok, true);
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
    assert.ok(body.data.created_at);
    assert.ok(body.data.updated_at);
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
    assert.ok(typeof body.message === 'string');
  });

  it('deskripsi hilang ditolak 400', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Ada nama' }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('nama lebih dari 200 karakter ditolak 400', async () => {
    const { status } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'a'.repeat(201), deskripsi: 'ok' }),
    });
    assert.equal(status, 400);
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
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2);
    assert.equal(body.data[0].nama, 'Laporan Kedua');
    assert.ok(typeof body.meta.total === 'number');
    assert.equal(body.meta.page, 1);
    assert.ok(body.summary.all >= body.data.length);
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
    const { status, body } = await api('/api/reports?limit=2&page=2');
    assert.equal(status, 200);
    assert.equal(body.data.length, 2);
    assert.equal(body.meta.page, 2);
    assert.equal(body.meta.limit, 2);
    assert.ok(body.meta.total >= 5);
    assert.ok(body.meta.totalPages >= 3);
  });

  it('limit raksasa dijepit ke batas aman', async () => {
    const { body } = await api('/api/reports?limit=9999');
    assert.ok(body.meta.limit <= 100);
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
    const underscore = await api(`/api/reports?q=${encodeURIComponent('_')}`);
    assert.ok(
      underscore.body.data.every((r: Row) => r.nama.includes('_') || r.deskripsi.includes('_')),
    );
  });

  it('status tak dikenal diabaikan (bukan 400)', async () => {
    const { status, body } = await api('/api/reports?status=arsip&page=abc&limit=-5');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.meta.page, 1);
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
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, 'rejected');
  });

  it('status final tidak bisa diubah lagi (approved -> rejected ditolak 409)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Final approve', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const second = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.success, false);
    const repeat = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(repeat.status, 409);
  });

  it('status final tidak bisa diubah lagi (rejected -> approved ditolak 409)', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Final reject', deskripsi: 'd' }),
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
    assert.equal(status, 409);
    assert.equal(body.success, false);
  });

  it('status pending ditolak 400', async () => {
    const { status, body } = await api('/api/reports/1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
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

  it('ID di luar range int4 ditolak 400 (bukan 500 dari Postgres)', async () => {
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

describe('mengubah isi laporan (pending saja)', () => {
  it('PATCH isi saat pending berhasil', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Nama lama', deskripsi: 'deskripsi lama' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nama: 'Nama baru', deskripsi: 'deskripsi baru' }),
    });
    assert.equal(status, 200);
    assert.equal(body.data.nama, 'Nama baru');
    assert.equal(body.data.deskripsi, 'deskripsi baru');
    assert.equal(body.data.status, 'pending');
  });

  it('PATCH isi saat sudah approved ditolak 409', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Terkunci', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status, body } = await api(`/api/reports/${id}`, {
      method: 'PATCH',
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

describe('menghapus laporan (pending saja)', () => {
  it('DELETE saat pending berhasil', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Hapus saya', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    const { status, body } = await api(`/api/reports/${id}`, { method: 'DELETE' });
    assert.equal(status, 200);
    assert.equal(body.data.id, id);
    const check = await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(check.status, 404);
  });

  it('DELETE saat sudah rejected ditolak 409', async () => {
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

  it('DELETE data terakhir yang tersisa ditolak 409', async () => {
    // Pakai DB fresh agar benar-benar hanya ada 1 baris (DB bersama antar-tes sudah berisi banyak baris).
    const fresh = createApp(createFakeDb());
    const srv: Server = await new Promise((resolve) => {
      const s = fresh.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = srv.address() as AddressInfo;
    const solo = async (path: string, init?: RequestInit) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      return { status: res.status, body: (await res.json()) as any };
    };
    try {
      const only = await solo('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Satu-satunya', deskripsi: 'd' }),
      });
      assert.equal(only.status, 201);
      const blocked = await solo(`/api/reports/${only.body.data.id}`, { method: 'DELETE' });
      assert.equal(blocked.status, 409);
      assert.equal(blocked.body.success, false);
      assert.match(blocked.body.message, /terakhir/i);
      // Dengan 2 baris, hapus satu boleh; sisa 1 baris tetap terkunci.
      const second = await solo('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Kedua', deskripsi: 'd' }),
      });
      const delOk = await solo(`/api/reports/${second.body.data.id}`, { method: 'DELETE' });
      assert.equal(delOk.status, 200);
      const lastTry = await solo(`/api/reports/${only.body.data.id}`, { method: 'DELETE' });
      assert.equal(lastTry.status, 409);
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it('DELETE id tak ada mengembalikan 404', async () => {
    const { status } = await api('/api/reports/999999', { method: 'DELETE' });
    assert.equal(status, 404);
  });
});

describe('riwayat status', () => {
  it('GET history mencatat perpindahan pending -> approved', async () => {
    const created = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'Beriwayat', deskripsi: 'd' }),
    });
    const id = created.body.data.id as number;
    await api(`/api/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    const { status, body } = await api(`/api/reports/${id}/history`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(body.data[0].from_status, 'pending');
    assert.equal(body.data[0].to_status, 'approved');
    assert.ok(body.data[0].changed_at);
  });

  it('GET history id tak ada mengembalikan 404', async () => {
    const { status } = await api('/api/reports/999999/history');
    assert.equal(status, 404);
  });
});

describe('rate limit pembuatan laporan', () => {
  it('POST melebihi batas dikembalikan 429', async () => {
    const limited = createApp(createFakeDb(), { createLimitMax: 2 });
    const srv: Server = await new Promise((resolve) => {
      const s = limited.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = srv.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/reports`;
    try {
      const post = (nama: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nama, deskripsi: 'd' }),
        });
      assert.equal((await post('a')).status, 201);
      assert.equal((await post('b')).status, 201);
      const blocked = await post('c');
      assert.equal(blocked.status, 429);
      assert.equal(((await blocked.json()) as any).success, false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

describe('ekspor Excel server-side', () => {
  async function exportXlsx(
    path: string,
  ): Promise<{ status: number; headers: Headers; bytes: Buffer }> {
    const res = await fetch(`${baseUrl}${path}`);
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
    assert.ok(
      (headers.get('content-type') ?? '').includes(
        'spreadsheetml.sheet',
      ),
    );
    assert.match(headers.get('content-disposition') ?? '', /attachment; filename="laporan-lapangan-.*\.xlsx"/);
    // .xlsx = ZIP: magic bytes PK\x03\x04.
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
    // Tanpa filter cocok, tetap 200 dengan tabel kosong (bukan 404).
    const empty = await exportXlsx('/api/reports/export.xlsx?q=zz-tidak-ada-zz');
    assert.equal(empty.status, 200);
    assert.ok(empty.bytes.length > 500);
  });

  it('ekspor melebihi batas dikembalikan 429', async () => {
    const limited = createApp(createFakeDb(), { exportLimitMax: 1 });
    const srv: Server = await new Promise((resolve) => {
      const s = limited.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = srv.address() as AddressInfo;
    try {
      const url = `http://127.0.0.1:${port}/api/reports/export.xlsx`;
      assert.equal((await fetch(url)).status, 200);
      assert.equal((await fetch(url)).status, 429);
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

describe('rate limit tulis (PATCH/DELETE)', () => {
  it('PATCH/DELETE melebihi batas dikembalikan 429', async () => {
    const limited = createApp(createFakeDb(), { writeLimitMax: 3 });
    const srv: Server = await new Promise((resolve) => {
      const s = limited.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = srv.address() as AddressInfo;
    const call = async (path: string, init?: RequestInit) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      return { status: res.status, body: (await res.json()) as any };
    };
    try {
      const created = await call('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ nama: 'Kena limit tulis', deskripsi: 'd' }),
      });
      assert.equal(created.status, 201);
      const id = created.body.data.id as number;
      const patch = (status: string) =>
        call(`/api/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      assert.equal((await patch('approved')).status, 200);
      assert.equal((await patch('rejected')).status, 409);
      assert.equal((await call(`/api/reports/${id}`, { method: 'DELETE' })).status, 409);
      // Batas 3 sudah habis: request tulis ke-4 ditolak walau valid.
      const blocked = await patch('approved');
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.success, false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
    }
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
    assert.equal(body.success, true);
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
    assert.equal(body.success, true);
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

  it('body lebih dari 100kb mengembalikan 413 (bukan 500)', async () => {
    const { status, body } = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ nama: 'x', deskripsi: 'a'.repeat(150_000) }),
    });
    assert.equal(status, 413);
    assert.equal(body.success, false);
  });
});
