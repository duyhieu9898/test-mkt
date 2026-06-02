import { defineConfig } from 'drizzle-kit';

// Independent drizzle config for @1person/ai-tenant (future @trustai/core).
// This package owns its own migrations so it can be extracted as a
// standalone SaaS service without depending on @1person/core's migration
// pipeline. See docs/architecture/06-transparent-data-system.md §5.
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson',
  },
  verbose: true,
  strict: true,
  tablesFilter: ['trustai_*'],
});
