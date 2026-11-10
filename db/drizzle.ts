import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalDb = globalThis as unknown as { hnbPool?: Pool };
export const pool = globalDb.hnbPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://localhost/hanngubien",
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
if (process.env.NODE_ENV !== "production") globalDb.hnbPool = pool;

const db = drizzle(pool, { schema });
export default db;
