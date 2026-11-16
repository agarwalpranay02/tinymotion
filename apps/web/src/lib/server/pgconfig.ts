/**
 * Postgres connection settings with full TLS verification. Hosted Postgres URLs (Neon, Supabase)
 * carry sslmode=require, which node-postgres treats as verify-full but warns about; we drop the
 * parameter and ask for verified TLS explicitly. sslmode=disable (local Postgres) is respected.
 */
export function pgConfig(raw: string): { connectionString: string; ssl: boolean } {
  const url = new URL(raw);
  if (url.searchParams.get("sslmode") === "disable") return { connectionString: raw, ssl: false };
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: true };
}
