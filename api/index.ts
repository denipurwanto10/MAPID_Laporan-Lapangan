/** Single entry point untuk seluruh endpoint API.
 *
 * Dua alasan file ini ada (bukan satu route file per endpoint):
 *
 * 1. Vercel menghitung tiap file `api/*.ts` sebagai satu Serverless Function.
 *    Hobby plan dibatasi 12 functions — versi lama punya 13 file route sehingga
 *    deploy gagal dengan "No more than 12 Serverless Functions".
 * 2. Catch-all `api/[...path].ts` ternyata hanya dicocokkan Vercel untuk path
 *    satu segmen (`/api/users`), sehingga path bersarang (`/api/auth/login`,
 *    `/api/reports/1/history`) tetap 404 di sisi Vercel. Karena itu routing
 *    dipindah ke `rewrites` di vercel.json: semua `/api/*` → `/api/index`,
 *    lalu Express yang menentukan rute sebenarnya.
 *
 * Berkas di `api/` berawalan garis bawah tidak di-router Vercel, jadi aman
 * dipakai sebagai modul bersama. Express tetap melihat pathname lengkap.
 */
export { default } from "./_lib/app";