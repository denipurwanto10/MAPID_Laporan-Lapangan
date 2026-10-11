import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// Gunakan npm: specifier (Deno native) untuk SheetJS xlsx.
// Catatan: registry npm publik SheetJS berhenti di 0.18.5; versi di atas itu
// hanya tersedia via CDN (yang diblokir Edge Runtime), jadi pin 0.18.5.
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const STATUS_STYLE: Record<string, { fill: string; font: string }> = {
  pending: { fill: "FFF3D6", font: "8A4B00" },
  approved: { fill: "DDF5E8", font: "0A6A40" },
  rejected: { fill: "FDE2E2", font: "A81D1D" },
};

const EXPORT_ROW_MAX = 5000;

function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function formatDateForExcel(iso: string, tzMinutes: number): Date | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t - tzMinutes * 60000);
}

function filterLabel(ctx: ExportContext): string {
  const statusPart =
    ctx.status === "pending" || ctx.status === "approved" || ctx.status === "rejected"
      ? `Status: ${STATUS_LABEL[ctx.status]}`
      : "Semua status";
  const parts = [statusPart];
  if (ctx.q.trim()) parts.push(`Kata kunci: "${ctx.q.trim()}"`);
  parts.push(ctx.order === "asc" ? "Urutan: terlama" : "Urutan: terbaru");
  return parts.join("  ·  ");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  return `${stamp(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ExportContext {
  status: string;
  q: string;
  order: string;
  tzMinutes: number;
}

interface ReportRow {
  id: number;
  nama: string;
  deskripsi: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";
  const q = url.searchParams.get("q") || "";
  const order = url.searchParams.get("order") || "desc";
  const tzMinutes = Number(url.searchParams.get("tz")) || 0;

  // Teruskan token kiriman frontend. Edge Function sengaja TIDAK memakai
  // service_role: seluruh aturan akses ditegakkan RLS, dan query di bawah
  // hanya butuh hak baca (policy SELECT mengizinkan publik).
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const apikey = req.headers.get("apikey") ?? "";

  // Build query
  let query = `${Deno.env.get("SUPABASE_URL")}/rest/v1/reports?select=id,nama,deskripsi,status,created_at,updated_at`;
  
  if (status !== "all") {
    query += `&status=eq.${status}`;
  }
  
  if (q) {
    // Use ILIKE with escaping (PostgREST uses * for wildcard)
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    query += `&or=(nama.ilike.*${escaped}*,deskripsi.ilike.*${escaped}*)`;
  }
  
  const sortCol = "created_at";
  const sortDir = order === "asc" ? "asc" : "desc";
  query += `&order=${sortCol}.${sortDir}&limit=${EXPORT_ROW_MAX + 1}`;

  const res = await fetch(query, {
    headers: {
      apikey,
      "Authorization": auth,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: "Database query failed", detail: err }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const allRows: ReportRow[] = await res.json();
  const truncated = allRows.length > EXPORT_ROW_MAX;
  const rows = truncated ? allRows.slice(0, EXPORT_ROW_MAX) : allRows;

  // Build workbook with SheetJS
  const wb = XLSX.utils.book_new();
  const ws_data: any[][] = [];

  // Row 1: Title
  ws_data.push(["Laporan Lapangan"]);
  // Row 2: Subtitle
  const ctx: ExportContext = { status, q, order, tzMinutes };
  ws_data.push([`Diekspor ${fmtDateTime(new Date())}  ·  ${filterLabel(ctx)}`]);
  // Rows 3-8: spacing
  for (let i = 0; i < 6; i++) ws_data.push([]);

  // Row 9: Summary cards (TOTAL, MENUNGGU, DISETUJUI, DITOLAK)
  const stats = [
    { label: "TOTAL", value: rows.length, fill: "0A0A0A", font: "FFFFFF" },
    { label: "MENUNGGU", value: rows.filter((r) => r.status === "pending").length, fill: "FFF3D6", font: "8A4B00" },
    { label: "DISETUJUI", value: rows.filter((r) => r.status === "approved").length, fill: "DDF5E8", font: "0A6A40" },
    { label: "DITOLAK", value: rows.filter((r) => r.status === "rejected").length, fill: "FDE2E2", font: "A81D1D" },
  ];
  
  const summaryRow = [];
  for (let i = 0; i < stats.length; i++) {
    summaryRow.push(stats[i].label);
    summaryRow.push(""); // merged cell placeholder
  }
  ws_data.push(summaryRow);
  
  const summaryValRow = [];
  for (let i = 0; i < stats.length; i++) {
    summaryValRow.push(stats[i].value);
    summaryValRow.push("");
  }
  ws_data.push(summaryValRow);
  
  // Row 11: spacer
  ws_data.push([]);
  // Row 12: spacer
  ws_data.push([]);

  // Header row
  const headerRow = ["No", "Nama Laporan", "Deskripsi", "Status", "Dibuat", "Diperbarui"];
  ws_data.push(headerRow);

  // Data rows
  rows.forEach((r, i) => {
    const created = formatDateForExcel(r.created_at, tzMinutes);
    const updated = formatDateForExcel(r.updated_at, tzMinutes);
    ws_data.push([
      i + 1,
      safeText(r.nama),
      safeText(r.deskripsi),
      STATUS_LABEL[r.status],
      created ? fmtDateTime(created) : "",
      updated ? fmtDateTime(updated) : "",
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Set column widths
  ws["!cols"] = [
    { wch: 6 },
    { wch: 38 },
    { wch: 64 },
    { wch: 15 },
    { wch: 19 },
    { wch: 19 },
  ];

  // Apply styles using SheetJS cell styling
  const HEADER_ROW = 9; // 0-indexed = row 10 in Excel (1-indexed)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Style header row
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: HEADER_ROW, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { name: "Calibri", bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0A0A0A" } },
      alignment: { vertical: "center", horizontal: C === 0 || C === 3 ? "center" : "left", indent: C === 0 || C === 3 ? 0 : 1 },
      border: { bottom: { style: "thin", color: { rgb: "E4E4E7" } } },
    };
  }

  // Style data rows
  for (let R = HEADER_ROW + 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddr]) continue;
      
      const rowData = ws_data[R];
      const statusVal = rowData[3] as string; // Status column
      const style = STATUS_STYLE[statusVal] || { fill: "FFFFFF", font: "0A0A0A" };
      const zebra = (R - HEADER_ROW) % 2 === 0 ? "F7F7F8" : "FFFFFF";
      
      ws[cellAddr].s = {
        font: { name: "Calibri", size: 10.5, color: { rgb: C === 0 ? "6B6B73" : "0A0A0A" }, bold: C === 1 },
        fill: { fgColor: { rgb: C === 3 ? style.fill : zebra } },
        alignment: { 
          vertical: "center", 
          horizontal: C === 0 || C === 3 || C === 4 || C === 5 ? "center" : "left",
          wrapText: C === 1 || C === 2,
          indent: C === 1 || C === 2 ? 1 : 0,
        },
        border: { bottom: { style: "thin", color: { rgb: "E4E4E7" } } },
      };
      
      // Date format for columns 4 and 5 (0-indexed)
      if (C === 4 || C === 5) {
        ws[cellAddr].z = "dd mmm yyyy, hh:mm";
      }
    }
  }

  // Auto filter
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: HEADER_ROW, c: 0 }, e: { r: Math.max(range.e.r, HEADER_ROW), c: 5 } }) };

  // Freeze pane
  ws["!freeze"] = { ySplit: HEADER_ROW + 1 };

  XLSX.utils.book_append_sheet(wb, ws, "Laporan");

  // Write to buffer
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const filename = `laporan-lapangan-${stamp(new Date())}.xlsx`;

  return new Response(buf, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Truncated": truncated ? `true; limit=${EXPORT_ROW_MAX}` : "false",
    },
  });
});