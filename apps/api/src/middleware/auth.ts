import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyToken } from '../lib/auth';
import type { JwtPayload } from '../lib/auth';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';

// Extend Hono context
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  // Prefer Authorization header. Fall back to ?token= query param so
  // that EventSource SSE connections work (the browser EventSource API
  // does not support custom headers). Only used for authenticated
  // read-only streams like /campaigns/.../stream (W1B.4).
  const authHeader = c.req.header('Authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const queryToken = c.req.query('token');
    if (queryToken && queryToken.length > 0) {
      token = queryToken;
    }
  }

  if (!token) {
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  try {
    const payload = verifyToken(token);
    c.set('user', payload);
    await next();
  } catch (error) {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
};

// Get companies that a user has access to
export async function getUserCompanies(userId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
  // Get companies owned by user
  const ownedCompanies = await db.query.companies.findMany({
    where: eq(companies.ownerId, userId),
    columns: { id: true, name: true, slug: true },
  });

  return ownedCompanies;
}

// Optional auth - doesn't throw if no token
export const optionalAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = verifyToken(token);
      c.set('user', payload);
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }

  await next();
};
