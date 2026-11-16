import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { clientIp, hashIp, problem, sameOrigin } from "@/lib/server/http";
import { escapeHtml, sendMail } from "@/lib/server/mail";
import { limitHeaders, rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  org: z.string().trim().max(150).optional().default(""),
  message: z.string().trim().min(5).max(4000),
  locale: z.enum(["en"]).optional(),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return problem(403, "forbidden", "Cross-site request blocked.");
  const ip = clientIp(req);
  const l = await rateLimit(`contact:${ip}`, 5, 3600);
  if (!l.ok) return problem(429, "rate_limited", "Too many messages. Try again later.", limitHeaders(l));
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return problem(400, "invalid", "Check the form fields and try again.");
  const b = parsed.data;
  const db = await getDb();
  await db.insert(schema.contactMessage).values({ id: randomUUID(), name: b.name, email: b.email, org: b.org || null, message: b.message, locale: b.locale, ipHash: hashIp(ip) });
  if (env.CONTACT_INBOX) {
    const text = `From: ${b.name} <${b.email}>\nOrg: ${b.org}\n\n${b.message}`;
    await sendMail(env.CONTACT_INBOX, `TinyMotion enquiry: ${b.name}${b.org ? ` (${b.org})` : ""}`, `<pre>${escapeHtml(text)}</pre>`, text, b.email).catch((e) => console.error("contact mail", e));
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
