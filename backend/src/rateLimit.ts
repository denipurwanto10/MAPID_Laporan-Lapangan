import type { NextFunction, Request, Response } from 'express';

/**
 * Rate limiter in-memory sederhana (sliding window per IP).
 * Cukup untuk deployment single-instance study case — tanpa dependency tambahan.
 * Hanya dipakai di endpoint tulis (POST), bukan endpoint baca.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const hits = new Map<string, number[]>();

  return (_req: Request, res: Response, next: NextFunction): void => {
    const req = _req as Request & { ip?: string };
    const key = typeof req.ip === 'string' && req.ip ? req.ip : 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ success: false, message: 'Kebanyakan percobaan. Tunggu sebentar, lalu coba lagi.' });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    // Bersihkan entri basi sesekali agar Map tidak tumbuh tanpa batas.
    if (hits.size > 1000) {
      for (const [k, v] of hits) {
        if (v.length === 0 || now - v[v.length - 1] > windowMs) hits.delete(k);
      }
    }
    next();
  };
}
