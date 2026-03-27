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
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

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
