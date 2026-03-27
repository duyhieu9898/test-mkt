import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file from project root
config({ path: '../../../.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/oneperson'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // AI API Keys
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Agent Runtime AI Config
  AGENT_AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  AGENT_AI_MODEL: z.string().default('gpt-4o-mini'),

  // Vector DB
  QDRANT_URL: z.string().default('http://localhost:6333'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
