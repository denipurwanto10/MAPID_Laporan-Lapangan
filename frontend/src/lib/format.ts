const formatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-10-11T09:40:48.680Z" -> "11 Okt 2026, 09.40". Fallback aman bila invalid. */
export function formatTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return formatter.format(d);
}

const dateOnly = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** "2026-10-11T09:40:48.680Z" -> "11 Okt 2026" (tanpa jam). */
export function formatTanggalPendek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return dateOnly.format(d);
}
