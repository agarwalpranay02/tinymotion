import "server-only";
import { env, isProd } from "./env";

/** Sends transactional email through Resend's HTTP API. Logs instead in development. */
export async function sendMail(to: string, subject: string, html: string, text: string, replyTo?: string) {
  if (!env.RESEND_API_KEY) {
    if (isProd) throw new Error("Email is not configured (RESEND_API_KEY)");
    console.info(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    devOutbox.unshift({ to, subject, text, at: Date.now() });
    devOutbox.length = Math.min(devOutbox.length, 20);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** In-memory outbox so local end-to-end tests can complete magic-link sign-in. */
export const devOutbox: { to: string; subject: string; text: string; at: number }[] = [];

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
