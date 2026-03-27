import { createDb, type Database } from '@1person/core/db';
import { env } from './env';

export const db: Database = createDb(env.DATABASE_URL);
