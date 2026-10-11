export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/** Daftar nomor halaman dengan ellipsis. Maks 7 slot: 1 … jendela … akhir. */
export function pageItems(page: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", total];
  if (page >= total - 3) return [1, "ellipsis-start", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", total];
}
