import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Single connection pool, exported as a singleton. Consumers import
// `db` and use it directly. Postgres-js handles connection management;
// max=10 keeps us under shared-DB connection limits without needing
// pgbouncer at POC scale.
const sql = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });
export { schema };
export type Database = typeof db;
