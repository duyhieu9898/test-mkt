import { pgTable, uuid, varchar, timestamp, boolean, jsonb, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Types
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    dailyReport: boolean;
  };
}

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),

  // OAuth
  provider: varchar('provider', { length: 50 }),
  providerId: varchar('provider_id', { length: 255 }),

  // Settings
  preferences: jsonb('preferences').$type<UserPreferences>().default({
    theme: 'system',
    language: 'en',
    notifications: { email: true, push: true, dailyReport: true },
  }),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),

  // Status
  emailVerified: boolean('email_verified').default(false),
  isActive: boolean('is_active').default(true),
  onboardingCompleted: boolean('onboarding_completed').default(false),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  token: varchar('token', { length: 500 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 500 }),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
