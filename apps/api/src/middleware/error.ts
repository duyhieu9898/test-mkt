import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { nanoid } from 'nanoid';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

function fallbackHttpErrorCode(err: HTTPException) {
  const code = err.message
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return code || `HTTP_${err.status}`;
}

export const errorHandler: ErrorHandler = (err: Error, c: Context): Response => {
  const requestId = nanoid();
  console.error(`[${requestId}] Error:`, err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return c.json<ErrorResponse>(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: { errors: err.errors },
          requestId,
        },
      },
      400
    );
  }

  // Handle HTTP exceptions
  if (err instanceof HTTPException) {
    const stableCode = (err as HTTPException & { code?: unknown }).code;
    return c.json<ErrorResponse>(
      {
        error: {
          code: typeof stableCode === 'string' && stableCode.length > 0
            ? stableCode
            : fallbackHttpErrorCode(err),
          message: err.message,
          requestId,
        },
      },
      err.status
    );
  }

  // Handle unknown errors
  return c.json<ErrorResponse>(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    },
    500
  );
};
