import "server-only";
import { z } from "zod";

/** Validated server environment. Fails fast at boot on misconfiguration in production. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Resend's shared sender works without your own domain, for mail to your own inbox
  EMAIL_FROM: z.string().default("TinyMotion <onboarding@resend.dev>"),
  CONTACT_INBOX: z.string().email().optional(),
  API_KEY_PEPPER: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  ALLOW_DEV_LOGIN: z.enum(["0", "1"]).default("0"),
  TRUST_PROXY: z.enum(["0", "1"]).default("1"),
});

// A blank line in .env (e.g. "BETTER_AUTH_SECRET=") means "not set", not an empty value
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  throw new Error("Invalid environment: " + JSON.stringify(parsed.error.flatten().fieldErrors));
}
export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const authSecret = env.BETTER_AUTH_SECRET ?? (isProd ? undefined : "dev-only-secret-change-me-0123456789abcdef");
export const pepper = env.API_KEY_PEPPER ?? (isProd ? undefined : "dev-only-pepper-0123456789");
export const devLoginEnabled = !isProd && env.ALLOW_DEV_LOGIN === "1";
