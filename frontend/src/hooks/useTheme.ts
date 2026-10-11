import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "laporan-lapangan-theme";
const THEME_COLOR: Record<Theme, string> = { light: "#f5f6f8", dark: "#0b0d12" };

function readSaved(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage tidak tersedia — pakai preferensi sistem */
  }
  return null;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme, animate: boolean): void {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Tema light/dark.
 * - Pilihan pengguna disimpan di localStorage HANYA saat tombol ditekan.
 * - Selama belum memilih, tema mengikuti preferensi OS (dan ikut berubah bila OS berubah).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readSaved() ?? systemTheme());

  useEffect(() => {
    apply(theme, false);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readSaved() === null) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next, true);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* abaikan — tema tetap berlaku untuk sesi ini */
    }
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
