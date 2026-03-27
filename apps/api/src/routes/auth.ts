import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { users, sessions } from '@1person/core/db';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken } from '../lib/auth';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono();

// Schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  // Check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    throw new HTTPException(409, { message: 'Email already registered' });
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
    })
    .returning();

  // Generate tokens
  const accessToken = generateToken({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

  // Create session
  await db.insert(sessions).values({
    userId: user.id,
    token: accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: c.req.header('User-Agent'),
    ipAddress: c.req.header('X-Forwarded-For') || 'unknown',
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

// Login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  // Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Generate tokens
  const accessToken = generateToken({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

  // Create session
  await db.insert(sessions).values({
    userId: user.id,
    token: accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: c.req.header('User-Agent'),
    ipAddress: c.req.header('X-Forwarded-For') || 'unknown',
  });

  // Update last login
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      onboardingCompleted: user.onboardingCompleted,
    },
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  const { userId } = c.get('user');

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    preferences: user.preferences,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  });
});

// Logout
auth.post('/logout', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.substring(7);

  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  return c.json({ success: true });
});

export default auth;
