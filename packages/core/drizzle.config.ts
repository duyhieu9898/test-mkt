import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/oneperson',
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations_core',
  },
  verbose: true,
  strict: true,
});