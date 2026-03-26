import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { and, asc, desc, eq, gte, gt, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
