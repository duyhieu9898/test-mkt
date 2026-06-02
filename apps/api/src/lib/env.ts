import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file from project root
config({ path: '../../.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.string().transform(Number).default('8004'),

  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/oneperson'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  JWT_SECRET: z.string().default('super-secret-jwt-key-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // AI API Keys
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Langfuse (W0.3 / ADR-01) — LLM observability
  LANGFUSE_PUBLIC_KEY: z.string().default('pk-lf-dev-1person'),
  LANGFUSE_SECRET_KEY: z.string().default('sk-lf-dev-1person'),
  LANGFUSE_BASE_URL: z.string().default('http://localhost:5050'),

  // FTUX (First Time User Experience) AI Config
  FTUX_AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  FTUX_AI_MODEL: z.string().default('gpt-4o-mini'),

  // URLs
  WEB_URL: z.string().default('http://localhost:3004'),

  // Admin seed
  ADMIN_EMAIL: z.string().default('admin@1person.ai'),
  ADMIN_PASSWORD: z.string().default('Admin@1Person2025'),

  // Sentry (P0-D3) — error tracking
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_TRACES_SAMPLE_RATE: z.string().default('0.1').transform(Number),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
