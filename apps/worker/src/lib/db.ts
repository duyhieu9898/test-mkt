import { createDb, type Database } from '@1person/core/db';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';

export const db: Database = createDb(DATABASE_URL);
