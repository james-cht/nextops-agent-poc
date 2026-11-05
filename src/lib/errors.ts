/**
 * Standard error codes for NextOps API responses.
 */
export const ErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TIMEOUT: 'TIMEOUT',
  FACTORY_CODE_MISSING: 'FACTORY_CODE_MISSING',
  INVALID_INDEX: 'INVALID_INDEX',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Create a standardised error response object.
 * Every API endpoint should return { error, code } on failure.
 */
export function createErrorResponse(code: ErrorCode, message: string) {
  return { error: message, code };
}

/**
 * Maps HTTP status codes to our standard ErrorCode.
 */
export function statusToErrorCode(status: number): ErrorCode {
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 400) return ErrorCode.BAD_REQUEST;
  if (status === 422) return ErrorCode.FACTORY_CODE_MISSING;
  if (status === 401 || status === 403) return ErrorCode.UNAUTHORIZED;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  if (status === 502 || status === 503 || status === 504) return ErrorCode.UPSTREAM_ERROR;
  return ErrorCode.INTERNAL_ERROR;
}
