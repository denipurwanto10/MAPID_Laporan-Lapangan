import { Fragment, type ReactNode } from "react";

/** Potong teks panjang di batas kata agar highlight tidak merusak layout. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bungkus potongan teks yang cocok dengan query dalam <mark>.
 * Query multi-kata dicocokkan per kata (OR), case-insensitive.
 * Tanpa query -> kembalikan teks apa adanya (tanpa mark).
 */
export function highlightText(text: string, query: string): ReactNode {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
