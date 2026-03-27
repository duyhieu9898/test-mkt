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

  // FTUX (First Time User Experience) AI Config
  FTUX_AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  FTUX_AI_MODEL: z.string().default('gpt-4o-mini'),

  // URLs
  WEB_URL: z.string().default('http://localhost:3004'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
