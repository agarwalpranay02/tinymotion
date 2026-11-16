import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { env } from "./env";
import { pgConfig } from "./pgconfig";

/**
 * Postgres in production (DATABASE_URL), embedded PGlite (Postgres compiled to WASM)
 * for local development and tests: zero setup, same SQL, same migrations.
 */
type DB = import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __tinymotionDb?: Promise<DB> };

async function create(): Promise<DB> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ ...pgConfig(env.DATABASE_URL), max: 5 });
    const db = drizzle(pool, { schema });
    if (process.env.AUTO_MIGRATE === "1") {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db, { migrationsFolder });
    }
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.resolve(env.PGLITE_DIR);
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  g.__tinymotionDb ??= create();
  return g.__tinymotionDb;
}

export { schema };
