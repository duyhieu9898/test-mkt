// =============================================================================
// @1person/ai-tenant — Database Connection
// =============================================================================
// Creates a Drizzle ORM instance connected to the shared PostgreSQL database.
// Tables are prefixed with 'ai_' to coexist with the main platform schema.
// =============================================================================

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/** Cached connection instances keyed by database URL */
const connectionCache = new Map<string, ReturnType<typeof createConnection>>();

function createConnection(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  return { client, db };
}

/**
 * Get or create a Drizzle database instance for the given connection URL.
 * Connections are cached to avoid creating multiple pools for the same URL.
 */
export function getDatabase(databaseUrl: string) {
  let cached = connectionCache.get(databaseUrl);
  if (!cached) {
    cached = createConnection(databaseUrl);
    connectionCache.set(databaseUrl, cached);
  }
  return cached.db;
}

/**
 * Close all cached database connections. Call this during graceful shutdown.
 */
export async function closeAllConnections(): Promise<void> {
  for (const [url, { client }] of connectionCache.entries()) {
    await client.end();
    connectionCache.delete(url);
  }
}

export type Database = ReturnType<typeof getDatabase>;
