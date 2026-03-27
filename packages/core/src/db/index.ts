import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create postgres client
const createClient = (connectionString: string) => {
  return postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
};

// Create drizzle instance
export const createDb = (connectionString: string) => {
  const client = createClient(connectionString);
  return drizzle(client, { schema });
};

// Export schema and types
export * from './schema';
export type Database = ReturnType<typeof createDb>;
