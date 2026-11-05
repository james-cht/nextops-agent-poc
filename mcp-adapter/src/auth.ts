import type { Request, Response, NextFunction } from 'express';

/** Require Authorization: Bearer <NEXTOPS_DIFY_TOKEN> (same token forwarded to NextOps). */
export function bearerAuth(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.header('authorization') ?? req.header('Authorization');
    if (auth === `Bearer ${expectedToken}`) {
      next();
      return;
    }
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });
  };
}
