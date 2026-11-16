import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/** The site-wide share card, rendered by app/opengraph-image.tsx. */
const CARD = { url: "/opengraph-image", width: 1200, height: 630, alt: "TinyMotion: AI that knows how you move, small enough for a microcontroller" };

/**
 * Gives a page its own share preview (WhatsApp, LinkedIn, X) from its title and
 * description. Next.js replaces rather than merges a parent's openGraph, so every
 * page that sets metadata goes through here to keep the image and site name.
 */
export function share(m: Metadata): Metadata {
  const title = typeof m.title === "string" ? (m.title.includes(SITE.name) ? m.title : `${m.title} · ${SITE.name}`) : undefined;
  const description = typeof m.description === "string" ? m.description : undefined;
  const og = m.openGraph ?? {};
  const images = og.images ?? [CARD];
  return {
    ...m,
    openGraph: { type: "website", siteName: SITE.name, locale: "en_IN", ...(title && { title }), ...(description && { description }), ...og, images },
    twitter: { card: "summary_large_image", ...(title && { title }), ...(description && { description }), images },
  };
}

export const SHARE_CARD = CARD;
