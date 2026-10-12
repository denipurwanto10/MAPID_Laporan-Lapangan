import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Di produksi frontend & API satu domain (Vercel), jadi /api relatif sudah benar.
  // Saat `npm run dev` frontend jalan di :5173 tapi Express ada di :3001 —
  // tanpa proxy di bawah, fetch("/api/...") akan mendarat di :5173 dan gagal.
  // Proxy meneruskan /api ke backend lokal tanpa mengubah kode frontend.
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
