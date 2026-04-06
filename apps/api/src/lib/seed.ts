import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from '@1person/core/db';
import { hashPassword } from './auth';
import { env } from './env';

/**
 * Auto-seed admin account on server startup.
 * Idempotent — skips if admin already exists.
 */
export async function seedAdmin() {
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;

  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });

    if (existing) {
      console.log(`✅ Admin account exists: ${adminEmail}`);
      return;
    }

    const passwordHash = await hashPassword(adminPassword);
    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      approvalStatus: 'approved' as any,
      isActive: true,
    });

    console.log(`✅ Admin account created: ${adminEmail}`);
  } catch (err: any) {
    // Don't crash server if seed fails (e.g. DB not ready)
    console.warn('⚠️  Admin seed failed:', err.message);
  }
}
