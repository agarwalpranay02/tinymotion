import { defineRouting } from "next-intl/routing";

// English-only site. next-intl still provides typed messages and formatting;
// URLs carry no locale prefix (/diagnose, not /en/diagnose).
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "never",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
