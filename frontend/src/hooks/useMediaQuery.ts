import { useSyncExternalStore } from "react";

/**
 * Mengikuti media query CSS. Dipakai agar hanya satu tata letak daftar (tabel ATAU kartu)
 * yang dirender, bukan keduanya dengan salah satunya disembunyikan lewat CSS.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
