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

  // Create user with pending approval
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      approvalStatus: 'pending',
    })
    .returning();

  // Don't create session — user must wait for admin approval
  return c.json({
    success: true,
    pendingApproval: true,
    message: 'Registration successful! Your account is pending admin approval. You will be notified when approved.',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
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

  // Check approval status
  if ((user as any).approvalStatus === 'pending') {
    throw new HTTPException(403, { message: 'Your account is pending approval. Please wait for admin confirmation.' });
  }
  if ((user as any).approvalStatus === 'rejected') {
    throw new HTTPException(403, { message: 'Your account has been declined. Please contact support.' });
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

// ============================================
// ADMIN: User Approval (Alpha)
// ============================================

// List pending users
auth.get('/admin/pending-users', authMiddleware, async (c) => {
  const pendingUsers = await db.query.users.findMany({
    where: eq(users.approvalStatus as any, 'pending'),
  });
  return c.json({
    users: pendingUsers.map((u) => ({
      id: u.id, email: u.email, name: u.name, createdAt: u.createdAt,
    })),
  });
});

// Approve user
auth.post('/admin/approve-user/:userId', authMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const [updated] = await db.update(users)
    .set({ approvalStatus: 'approved' as any, isActive: true })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) return c.json({ error: 'User not found' }, 404);
  return c.json({ success: true, message: `${updated.name} approved` });
});

// Reject user
auth.post('/admin/reject-user/:userId', authMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const [updated] = await db.update(users)
    .set({ approvalStatus: 'rejected' as any, isActive: false })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) return c.json({ error: 'User not found' }, 404);
  return c.json({ success: true, message: `${updated.name} rejected` });
});

export default auth;
