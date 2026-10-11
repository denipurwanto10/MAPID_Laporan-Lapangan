import { Workbook } from 'exceljs';
import type { Worksheet } from 'exceljs';
import type { ListQuery, Report, ReportStatus } from './types';

/** Batas baris per file ekspor agar satu request tidak membebani database/CPU. */
export const EXPORT_ROW_MAX = 5000;
export const EXPORT_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ExportContext {
  status: string;
  q: string;
  /** 'asc' = terlama dulu, selain itu terbaru dulu. */
  order: string;
  /** Offset zona waktu client dalam menit (Date.getTimezoneOffset), agar jam di Excel sama seperti unduhan lama dari frontend. */
  tzMinutes: number;
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

/* ---------------- Tata letak lembar ---------------- */

// Baris judul kolom; baris 1-8 dipakai judul + kartu ringkasan + pemisah.
const HEADER_ROW = 9;
const FONT_NAME = 'Calibri';
// Warna ARGB exceljs.
const INK = 'FF0A0A0A'; // teks utama
const MUTED = 'FF6B6B73'; // teks sekunder
const LINE = 'FFE4E4E7'; // garis tabel
const ZEBRA = 'FFF7F7F8'; // latar baris ganjil
const PLAIN = 'FFFFFFFF'; // latar baris genap

/** Isi solid satu warna untuk sel exceljs. */
function solidFill(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } };
}

/** Garis bawah tipis untuk sel tabel. */
function thinBottom(argb: string) {
  return { bottom: { style: 'thin' as const, color: { argb } } };
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function exportFilename(d = new Date()): string {
  return `laporan-lapangan-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
}

function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return `${stamp(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function filterLabel(ctx: ExportContext): string {
  const statusPart =
    ctx.status === 'pending' || ctx.status === 'approved' || ctx.status === 'rejected'
      ? `Status: ${STATUS_LABEL[ctx.status]}`
      : 'Semua status';
  const parts = [statusPart];
  if (ctx.q.trim()) parts.push(`Kata kunci: “${ctx.q.trim()}”`);
  parts.push(ctx.order === 'asc' ? 'Urutan: terlama' : 'Urutan: terbaru');
  return parts.join('  ·  ');
}

/** Cegah formula injection di Excel (=, +, -, @) pada teks dari pengguna. */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const STATUS_STYLE: Record<ReportStatus, { fill: string; font: string }> = {
  pending: { fill: 'FFFFF3D6', font: 'FF8A4B00' },
  approved: { fill: 'FFDDF5E8', font: 'FF0A6A40' },
  rejected: { fill: 'FFFDE2E2', font: 'FFA81D1D' },
};

/** Jumlah laporan berstatus tertentu dalam hasil ekspor. */
function countByStatus(rows: Report[], status: ReportStatus): number {
  return rows.filter((r) => r.status === status).length;
}

/** Perkiraan tinggi baris dari panjang teks (nama/deskripsi bisa wrap). */
function estimateRowHeight(r: Report): number {
  const lines = Math.max(1, Math.ceil(r.deskripsi.length / 70), Math.ceil(r.nama.length / 40));
  return Math.min(120, Math.max(24, lines * 15 + 8));
}

/* ---------------- Penulis tiap bagian lembar ---------------- */

/** Judul + subjudul filter (baris 1-2). */
function writeTitle(ws: Worksheet, ctx: ExportContext, exportedAt: Date): void {
  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value = 'Laporan Lapangan';
  title.font = { name: FONT_NAME, size: 20, bold: true, color: { argb: INK } };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value = `Diekspor ${fmtDateTime(exportedAt)}  ·  ${filterLabel(ctx)}`;
  sub.font = { name: FONT_NAME, size: 10, color: { argb: MUTED } };
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 8;
}

/** Kartu ringkasan total/menunggu/disetujui/ditolak (baris 4-5). */
function writeSummaryCards(ws: Worksheet, rows: Report[]): void {
  const stats: { label: string; value: number; fill: string; font: string }[] = [
    { label: 'TOTAL', value: rows.length, fill: INK, font: PLAIN },
    { label: 'MENUNGGU', value: countByStatus(rows, 'pending'), fill: STATUS_STYLE.pending.fill, font: STATUS_STYLE.pending.font },
    { label: 'DISETUJUI', value: countByStatus(rows, 'approved'), fill: STATUS_STYLE.approved.fill, font: STATUS_STYLE.approved.font },
    { label: 'DITOLAK', value: countByStatus(rows, 'rejected'), fill: STATUS_STYLE.rejected.fill, font: STATUS_STYLE.rejected.font },
  ];
  // Kolom tiap kartu: TOTAL(A-B), MENUNGGU(C), DISETUJUI(D-E), DITOLAK(F).
  const spans: [string, string][] = [['A', 'B'], ['C', 'C'], ['D', 'E'], ['F', 'F']];
  stats.forEach((s, i) => {
    const [c1, c2] = spans[i];
    for (const [row, val, size, bold] of [
      [4, s.label, 9, true],
      [5, s.value, 18, true],
    ] as const) {
      if (c1 !== c2) ws.mergeCells(`${c1}${row}:${c2}${row}`);
      const cell = ws.getCell(`${c1}${row}`);
      cell.value = val;
      cell.font = { name: FONT_NAME, size, bold, color: { argb: s.font } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      for (const col of [c1, c2]) ws.getCell(`${col}${row}`).fill = solidFill(s.fill);
    }
  });
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 30;
}

/** Judul kolom tabel. */
function writeTableHeader(ws: Worksheet): void {
  const header = ws.getRow(HEADER_ROW);
  header.values = ['No', 'Nama Laporan', 'Deskripsi', 'Status', 'Dibuat', 'Diperbarui'];
  header.height = 28;
  header.eachCell((cell, col) => {
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: PLAIN } };
    cell.fill = solidFill(INK);
    const centered = col === 1 || col === 4;
    cell.alignment = { vertical: 'middle', horizontal: centered ? 'center' : 'left', indent: centered ? 0 : 1 };
  });
}

/** Baris data: zebra + warna status + tanggal berformat. */
function writeDataRows(
  ws: Worksheet,
  rows: Report[],
  toCellDate: (iso: string) => Date | '',
): void {
  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      safeText(r.nama),
      safeText(r.deskripsi),
      STATUS_LABEL[r.status],
      toCellDate(r.created_at),
      toCellDate(r.updated_at),
    ]);
    const zebra = i % 2 === 1 ? ZEBRA : PLAIN;
    row.height = estimateRowHeight(r);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: FONT_NAME, size: 10.5, color: { argb: col === 1 ? MUTED : INK }, bold: col === 2 };
      cell.fill = solidFill(zebra);
      cell.border = thinBottom(LINE);
      const wrap = col === 2 || col === 3;
      const centered = col === 1 || col === 4 || col === 5 || col === 6;
      cell.alignment = {
        vertical: 'middle',
        wrapText: wrap,
        horizontal: centered ? 'center' : 'left',
        indent: wrap ? 1 : 0,
      };
    });
    row.getCell(5).numFmt = 'dd mmm yyyy, hh:mm';
    row.getCell(6).numFmt = 'dd mmm yyyy, hh:mm';
    const st = STATUS_STYLE[r.status];
    const sc = row.getCell(4);
    sc.fill = solidFill(st.fill);
    sc.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: st.font } };
  });
}

/* ---------------- Fungsi utama ---------------- */

/**
 * Susun workbook .xlsx identik dengan unduhan lama dari frontend:
 * judul + kartu ringkasan + tabel zebra + warna status + auto-filter.
 */
export async function buildExportXlsx(rows: Report[], ctx: ExportContext): Promise<Buffer> {
  const toLocal = (ms: number): Date => new Date(ms - ctx.tzMinutes * 60000);
  /** Sel tanggal: kosong bila ISO tak valid (jangan lempar Invalid Date ke exceljs). */
  const toCellDate = (iso: string): Date | '' => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? '' : toLocal(t);
  };

  const wb = new Workbook();
  wb.creator = 'Laporan Lapangan';
  wb.created = new Date();

  const ws = wb.addWorksheet('Laporan', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = [
    { key: 'no', width: 6 },
    { key: 'nama', width: 38 },
    { key: 'desk', width: 64 },
    { key: 'status', width: 15 },
    { key: 'dibuat', width: 19 },
    { key: 'diperbarui', width: 19 },
  ];

  writeTitle(ws, ctx, toLocal(Date.now()));
  writeSummaryCards(ws, rows);
  // Baris pemisah 6-8.
  ws.getRow(6).height = 8;
  ws.getRow(7).height = 6;
  ws.getRow(8).height = 4;
  writeTableHeader(ws);
  writeDataRows(ws, rows, toCellDate);

  ws.autoFilter = { from: `A${HEADER_ROW}`, to: `F${HEADER_ROW + Math.max(rows.length, 1)}` };

  // writeBuffer exceljs bertipe Buffer versi lama (extends ArrayBuffer) —
  // bungkus ke Node Buffer asli agar cocok dengan res.send + signature fungsi.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Bangun konteks label ekspor dari query list yang sudah diparsing. */
export function exportContextFromQuery(q: Pick<ListQuery, 'status' | 'q' | 'order'>, tzMinutes: number): ExportContext {
  return { status: q.status ?? 'all', q: q.q, order: q.order, tzMinutes };
}
