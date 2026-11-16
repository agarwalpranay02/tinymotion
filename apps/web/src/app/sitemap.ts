import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

const PATHS = ["", "/live", "/analyze", "/record", "/studio", "/research", "/developers", "/about", "/legal/privacy", "/legal/terms", "/legal/licences"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PATHS.map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : ["/live", "/studio", "/research"].includes(p) ? 0.8 : 0.5,
  }));
}
