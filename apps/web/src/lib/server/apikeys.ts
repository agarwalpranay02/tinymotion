import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { pepper } from "./env";

/** The API is free. Fair-use limits keep it available for everyone. */
export const MONTHLY_QUOTA = 5000;
export const PER_MINUTE = 30;

const hash = (key: string) => createHash("sha256").update(`${pepper}:${key}`).digest("hex");

export async function createKey(userId: string, name: string) {
  const db = await getDb();
  const secret = randomBytes(24).toString("base64url");
  const key = `tm_live_${secret}`;
  const id = randomBytes(9).toString("base64url");
  await db.insert(schema.apiKey).values({ id, userId, name: name.slice(0, 60), prefix: key.slice(0, 13), hash: hash(key) });
  return { id, key };
}

export async function listKeys(userId: string) {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7);
  const keys = await db
    .select({ id: schema.apiKey.id, name: schema.apiKey.name, prefix: schema.apiKey.prefix, createdAt: schema.apiKey.createdAt, lastUsedAt: schema.apiKey.lastUsedAt, calls: schema.apiUsage.calls })
    .from(schema.apiKey)
    .leftJoin(schema.apiUsage, and(eq(schema.apiUsage.keyId, schema.apiKey.id), eq(schema.apiUsage.month, month)))
    .where(and(eq(schema.apiKey.userId, userId), isNull(schema.apiKey.revokedAt)));
  return keys.map((k) => ({ ...k, calls: k.calls ?? 0 }));
}

export async function revokeKey(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.apiKey).set({ revokedAt: new Date() }).where(and(eq(schema.apiKey.id, id), eq(schema.apiKey.userId, userId)));
}

/** Resolves a presented key to its owner and plan; constant-time compare on the hash. */
export async function verifyKey(presented: string) {
  if (!/^tm_live_[A-Za-z0-9_-]{32}$/.test(presented)) return null;
  const db = await getDb();
  const h = hash(presented);
  const rows = await db
    .select({ id: schema.apiKey.id, hash: schema.apiKey.hash, userId: schema.apiKey.userId })
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.hash, h), isNull(schema.apiKey.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row || !timingSafeEqual(Buffer.from(row.hash), Buffer.from(h))) return null;
  return row;
}

/** Atomically counts a call; returns the new monthly total. */
export async function countCall(keyId: string) {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7);
  const [r] = await db
    .insert(schema.apiUsage)
    .values({ keyId, month, calls: 1 })
    .onConflictDoUpdate({ target: [schema.apiUsage.keyId, schema.apiUsage.month], set: { calls: sql`${schema.apiUsage.calls} + 1` } })
    .returning({ calls: schema.apiUsage.calls });
  await db.update(schema.apiKey).set({ lastUsedAt: new Date() }).where(eq(schema.apiKey.id, keyId));
  return r.calls;
}
