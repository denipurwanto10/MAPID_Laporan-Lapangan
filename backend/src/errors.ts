import type { NextFunction, Request, Response } from 'express';

/** Error operasional dengan status HTTP eksplisit. */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/** Bungkus handler async agar rejection diteruskan ke middleware error. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as unknown as Record<string, unknown>)) {
    res.status(400).json({ success: false, message: 'Body request bukan JSON yang valid' });
    return;
  }
  if (err instanceof Error && 'type' in err && (err as { type?: unknown }).type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Ukuran request terlalu besar' });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
}
