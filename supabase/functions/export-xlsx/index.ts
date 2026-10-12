// Penyusun workbook Excel untuk Laporan Lapangan — tampilan modern & profesional.
import ExcelJS from "npm:exceljs@4.4.0";

export interface ReportRow {
  id: number;
  nama: string;
  deskripsi: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface BuildOptions {
  rows: ReportRow[];
  /** Filter yang dipakai, untuk ditampilkan di subjudul. */
  statusFilter?: string; // "all" | pending | approved | rejected
  query?: string;
  order?: "asc" | "desc";
  /** Offset zona waktu klien (Date.getTimezoneOffset, menit). */
  tzOffset?: number;
  truncated?: boolean;
}

// ── Palet warna (ARGB) ──────────────────────────────────────────────
const C = {
  navy: "FF0F2A4A",
  navySoft: "FF1E3A5F",
  accent: "FF2563EB",
  ink: "FF1F2937",
  muted: "FF6B7280",
  line: "FFE5E7EB",
  zebra: "FFF8FAFC",
  white: "FFFFFFFF",
  pendingBg: "FFFEF3C7", pendingFg: "FF92400E",
  okBg: "FFD1FAE5", okFg: "FF065F46",
  noBg: "FFFEE2E2", noFg: "FF991B1B",
  cardBg: "FFF1F5F9",
};
const FONT = "Calibri";
const STATUS_LABEL = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" } as const;
const FILTER_LABEL: Record<string, string> = {
  all: "Semua status", pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak",
};

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });

/** Date yang bila ditampilkan Excel (tanpa zona waktu) sama dengan jam lokal klien. */
function localDate(iso: string, tz: number): Date | null {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(t - tz * 60_000);
}

export async function buildWorkbook(opts: BuildOptions): Promise<ArrayBuffer> {
  const { rows, tzOffset = 0 } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Laporan Lapangan";
  wb.created = new Date();
  wb.title = "Laporan Lapangan";

  const ws = wb.addWorksheet("Laporan", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 9, xSplit: 0 }],
    properties: { tabColor: { argb: C.accent }, defaultRowHeight: 20 },
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
    headerFooter: {
      oddFooter: "&L&8Laporan Lapangan&C&8Halaman &P dari &N&R&8Dicetak &D",
    },
  });

  // A=gutter, B..H = tabel, I=gutter
  ws.columns = [
    { width: 2 },   // A
    { width: 6 },   // B No
    { width: 8 },   // C ID
    { width: 30 },  // D Nama
    { width: 58 },  // E Deskripsi
    { width: 14 },  // F Status
    { width: 20 },  // G Dibuat
    { width: 20 },  // H Diperbarui
    { width: 2 },   // I
  ];
  const FIRST = 2, LAST = 8; // B..H

  // ── Banner judul (baris 1–3) ─────────────────────────────────────
  ws.getRow(1).height = 8;
  ws.mergeCells("B2:H2");
  ws.mergeCells("B3:H3");
  ws.getRow(2).height = 36;
  ws.getRow(3).height = 22;
  const title = ws.getCell("B2");
  title.value = "LAPORAN LAPANGAN";
  title.font = { name: FONT, size: 22, bold: true, color: { argb: C.white } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const filterTxt = FILTER_LABEL[opts.statusFilter ?? "all"] ?? "Semua status";
  const parts = [
    `Filter: ${filterTxt}`,
    opts.query?.trim() ? `Pencarian: “${opts.query.trim()}”` : null,
    `Urutan: ${opts.order === "asc" ? "Terlama dulu" : "Terbaru dulu"}`,
  ].filter(Boolean);
  const sub = ws.getCell("B3");
  sub.value = parts.join("   •   ");
  sub.font = { name: FONT, size: 10, color: { argb: "FFBFD3EE" } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let r = 2; r <= 3; r++) {
    for (let c = FIRST; c <= LAST; c++) ws.getCell(r, c).fill = solid(C.navy);
  }
  // aksen biru tipis di bawah banner
  ws.getRow(4).height = 4;
  for (let c = FIRST; c <= LAST; c++) ws.getCell(4, c).fill = solid(C.accent);

  // ── Dimensi data tabel (butuh untuk rumus ringkasan) ─────────────
  const HEADER_ROW = 9;
  const DATA_START = HEADER_ROW + 1;
  const DATA_END = DATA_START + Math.max(rows.length, 1) - 1;
  const statusRange = `$F$${DATA_START}:$F$${DATA_END}`;

  // ── Kartu ringkasan (baris 6–7) ──────────────────────────────────
  ws.getRow(5).height = 10;
  ws.getRow(6).height = 18;
  ws.getRow(7).height = 34;
  ws.getRow(8).height = 12;
  // 4 kartu: B:C, D, E, F:H  (dirapikan agar lebar kurang lebih seimbang)
  const cards: { range: string; label: string; formula: string; fg: string; bg: string }[] = [
    { range: "B", label: "TOTAL LAPORAN", formula: `=COUNTA($D$${DATA_START}:$D$${DATA_END})`, fg: C.navySoft, bg: C.cardBg },
    { range: "D", label: "MENUNGGU", formula: `=COUNTIF(${statusRange},"Menunggu")`, fg: C.pendingFg, bg: C.pendingBg },
    { range: "E", label: "DISETUJUI", formula: `=COUNTIF(${statusRange},"Disetujui")`, fg: C.okFg, bg: C.okBg },
    { range: "F", label: "DITOLAK", formula: `=COUNTIF(${statusRange},"Ditolak")`, fg: C.noFg, bg: C.noBg },
  ];
  ws.mergeCells("B6:C6"); ws.mergeCells("B7:C7");
  ws.mergeCells("F6:H6"); ws.mergeCells("F7:H7");
  for (const card of cards) {
    const lab = ws.getCell(`${card.range}6`);
    const val = ws.getCell(`${card.range}7`);
    lab.value = card.label;
    lab.font = { name: FONT, size: 9, bold: true, color: { argb: card.fg } };
    lab.alignment = { vertical: "bottom", horizontal: "left", indent: 1 };
    val.value = { formula: card.formula };
    val.numFmt = "#,##0";
    val.font = { name: FONT, size: 22, bold: true, color: { argb: card.fg } };
    val.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  }
  // isi warna kartu + celah putih antar kartu (kolom tidak dipisah, jadi pakai border putih)
  const cardCols: [number, number, string][] = [[2, 3, C.cardBg], [4, 4, C.pendingBg], [5, 5, C.okBg], [6, 8, C.noBg]];
  for (const [a, b, bg] of cardCols) {
    for (let c = a; c <= b; c++) {
      for (const r of [6, 7]) {
        const cell = ws.getCell(r, c);
        cell.fill = solid(bg);
        cell.border = {
          left: c === a ? { style: "thick", color: { argb: C.white } } : undefined,
          right: c === b ? { style: "thick", color: { argb: C.white } } : undefined,
          top: r === 6 ? { style: "medium", color: { argb: bg === C.cardBg ? C.navySoft : bg === C.pendingBg ? "FFF59E0B" : bg === C.okBg ? "FF10B981" : "FFEF4444" } } : undefined,
        };
      }
    }
  }

  // ── Header tabel ─────────────────────────────────────────────────
  const headers = ["No", "ID", "Nama", "Deskripsi", "Status", "Dibuat", "Diperbarui"];
  const hr = ws.getRow(HEADER_ROW);
  hr.height = 28;
  headers.forEach((h, i) => {
    const cell = hr.getCell(FIRST + i);
    cell.value = h.toUpperCase();
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = solid(C.navySoft);
    cell.alignment = {
      vertical: "middle",
      horizontal: i <= 1 || i >= 4 ? "center" : "left",
      indent: i === 2 || i === 3 ? 1 : 0,
    };
    cell.border = { bottom: { style: "medium", color: { argb: C.accent } } };
  });

  // ── Baris data ───────────────────────────────────────────────────
  rows.forEach((r, i) => {
    const rowNo = DATA_START + i;
    const row = ws.getRow(rowNo);
    const desc = r.deskripsi ?? "";
    // perkiraan tinggi baris untuk teks yang membungkus (kolom ±58 karakter)
    const lines = Math.min(
      12,
      Math.max(
        1,
        desc.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 62)), 0),
        Math.ceil((r.nama ?? "").length / 32),
      ),
    );
    row.height = Math.max(24, lines * 15 + 8);

    const vals: (string | number | Date | null)[] = [
      { formula: `ROW()-${HEADER_ROW}` } as unknown as number,
      r.id,
      r.nama,
      desc,
      STATUS_LABEL[r.status] ?? r.status,
      localDate(r.created_at, tzOffset),
      localDate(r.updated_at, tzOffset),
    ];
    vals.forEach((v, k) => {
      const cell = row.getCell(FIRST + k);
      cell.value = v as ExcelJS.CellValue;
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.fill = solid(i % 2 === 1 ? C.zebra : C.white);
      cell.border = { bottom: thin(C.line) };
      const center = k <= 1 || k >= 4;
      cell.alignment = {
        vertical: "middle",
        horizontal: center ? "center" : "left",
        wrapText: k === 2 || k === 3,
        indent: k === 2 || k === 3 ? 1 : 0,
      };
    });
    row.getCell(2).font = { name: FONT, size: 10, color: { argb: C.muted } };
    row.getCell(3).font = { name: FONT, size: 10, color: { argb: C.muted } };
    row.getCell(4).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    row.getCell(7).numFmt = "dd mmm yyyy, hh:mm";
    row.getCell(8).numFmt = "dd mmm yyyy, hh:mm";
    row.getCell(6).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
  });

  if (rows.length === 0) {
    ws.mergeCells(DATA_START, FIRST, DATA_START, LAST);
    const c = ws.getCell(DATA_START, FIRST);
    c.value = "Tidak ada data untuk filter ini.";
    c.font = { name: FONT, size: 11, italic: true, color: { argb: C.muted } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(DATA_START).height = 40;
  } else {
    // Warna status otomatis (tetap benar bila status diubah manual di Excel)
    const rng = `F${DATA_START}:F${DATA_END}`;
    const rule = (text: string, fg: string, bg: string): ExcelJS.ConditionalFormattingRule => ({
      type: "cellIs", operator: "equal", formulae: [`"${text}"`], priority: 1,
      style: { font: { bold: true, color: { argb: fg } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: bg }, fgColor: { argb: bg } } },
    });
    ws.addConditionalFormatting({
      ref: rng,
      rules: [
        { ...rule("Menunggu", C.pendingFg, C.pendingBg), priority: 1 },
        { ...rule("Disetujui", C.okFg, C.okBg), priority: 2 },
        { ...rule("Ditolak", C.noFg, C.noBg), priority: 3 },
      ],
    });
    ws.autoFilter = { from: { row: HEADER_ROW, column: FIRST }, to: { row: DATA_END, column: LAST } };
  }

  // ── Footer ───────────────────────────────────────────────────────
  const foot = DATA_END + 2;
  ws.mergeCells(foot, FIRST, foot, LAST);
  const fc = ws.getCell(foot, FIRST);
  const stamp = localDate(new Date().toISOString(), tzOffset)!;
  const pad = (n: number) => String(n).padStart(2, "0");
  fc.value =
    `Diekspor pada ${pad(stamp.getUTCDate())}/${pad(stamp.getUTCMonth() + 1)}/${stamp.getUTCFullYear()} ` +
    `${pad(stamp.getUTCHours())}:${pad(stamp.getUTCMinutes())}` +
    (opts.truncated ? "   •   Data dipotong karena melebihi batas baris." : "");
  fc.font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
  fc.alignment = { horizontal: "left", indent: 1 };

  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
  ws.pageSetup.printArea = `A1:I${foot}`;

  return await wb.xlsx.writeBuffer();
}

// Edge Function: GET /functions/v1/export-xlsx?status=&q=&order=asc&tz=
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_ROWS = 5000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Expose-Headers": "content-disposition, x-export-truncated",
};
const json = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json(405, "Metode tidak didukung.");

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const asc = url.searchParams.get("order") === "asc";
  const tz = Number(url.searchParams.get("tz") ?? 0);
  if (status !== "all" && !["pending", "approved", "rejected"].includes(status)) {
    return json(400, "Status tidak valid.");
  }

  // Teruskan token kiriman frontend (anon key). Edge Function sengaja TIDAK
  // memakai service_role: seluruh aturan akses ditegakkan RLS di Postgres,
  // dan query di bawah hanya butuh hak baca.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json(401, "Token tidak ditemukan.");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  let query = supabase
    .from("reports")
    .select("id,nama,deskripsi,status,created_at,updated_at")
    .order("created_at", { ascending: asc })
    .limit(MAX_ROWS + 1);
  if (status !== "all") query = query.eq("status", status);
  if (q) {
    const esc = q.replace(/[%_,()]/g, (c) => `\\${c}`);
    query = query.or(`nama.ilike.*${esc}*,deskripsi.ilike.*${esc}*`);
  }

  const { data, error } = await query;
  if (error) return json(500, "Gagal mengambil data laporan.");

  const truncated = (data?.length ?? 0) > MAX_ROWS;
  const rows = (data ?? []).slice(0, MAX_ROWS) as ReportRow[];
  const buf = await buildWorkbook({
    rows, statusFilter: status, query: q, order: asc ? "asc" : "desc",
    tzOffset: Number.isFinite(tz) ? tz : 0, truncated,
  });

  const d = new Date(Date.now() - (Number.isFinite(tz) ? tz : 0) * 60_000);
  const stamp = d.toISOString().slice(0, 10);
  return new Response(buf, {
    headers: {
      ...CORS,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-lapangan-${stamp}.xlsx"`,
      "X-Export-Truncated": String(truncated),
    },
  });
});
