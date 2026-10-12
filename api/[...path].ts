/** Single entry point untuk semua API routes (catch-all).
 *
 * Vercel menghitung setiap file di `api/*.ts` sebagai satu Serverless Function.
 * Hobby plan limit 12 functions — dengan 13 route file sebelumnya, deploy gagal.
 * Menggunakan satu file `[...path].ts` yang mere-export Express app dari
 * `api/_lib/app.ts` menjamin hanya 1 function, dan Express 404 handler berjalan.
 */
export { default } from "./_lib/app";