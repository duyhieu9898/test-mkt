import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/oneperson',
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations_ai_tenant',
  },
  verbose: true,
  strict: true,
  tablesFilter: ['trustai_*'],
});