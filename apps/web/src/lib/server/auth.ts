import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "./db";
import { authSecret, env, isProd } from "./env";
import { escapeHtml, sendMail } from "./mail";
import { SITE } from "@/lib/site";

type Auth = ReturnType<typeof makeAuth>;
const g = globalThis as unknown as { __tinymotionAuth?: Promise<Auth> };

function makeAuth(db: Awaited<ReturnType<typeof getDb>>) {
  return betterAuth({
    appName: SITE.name,
    baseURL: env.BETTER_AUTH_URL ?? (isProd ? SITE.url : "http://localhost:3000"),
    secret: authSecret!,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    trustedOrigins: [...new Set([SITE.url, env.BETTER_AUTH_URL, ...(isProd ? [] : ["http://localhost:3000"])].filter(Boolean) as string[])],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    advanced: {
      useSecureCookies: isProd,
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure: isProd },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/magic-link": { window: 300, max: 5 } } },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" } }
        : {},
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        sendMagicLink: async ({ email, url }) => {
          const text = `Sign in to TinyMotion:\n\n${url}\n\nThis link expires in 10 minutes. If you didn't ask for it, ignore this email.`;
          const html = `<p>Sign in to TinyMotion:</p><p><a href="${escapeHtml(url)}">Sign in</a></p><p style="color:#555">This link expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`;
          await sendMail(email, "Your TinyMotion sign-in link", html, text);
        },
      }),
      nextCookies(),
    ],
  });
}

export function getAuth(): Promise<Auth> {
  if (!authSecret) throw new Error("BETTER_AUTH_SECRET is required in production");
  g.__tinymotionAuth ??= getDb().then(makeAuth);
  return g.__tinymotionAuth;
}

export const authProviders = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  // Resend's shared test sender (@resend.dev) only delivers to the account owner, so
  // email sign-in stays off until EMAIL_FROM uses a verified domain. Contact mail to
  // CONTACT_INBOX still works with the test sender.
  email: (Boolean(env.RESEND_API_KEY) && !/@resend\.dev>?$/i.test(env.EMAIL_FROM)) || !isProd,
};
