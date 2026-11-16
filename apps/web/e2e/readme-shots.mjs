// Regenerates the README screenshots from a running build: node e2e/readme-shots.mjs
import { chromium } from "playwright";
const B = process.env.BASE_URL || "http://localhost:3000";
const OUT = new URL("../../../docs/screenshots/", import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const d = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await d.newPage();
const shot = (pg, name, opts = {}) => pg.screenshot({ path: OUT + name, type: "jpeg", quality: 82, ...opts });
await p.goto(B + "/", { waitUntil: "load" }); await p.waitForTimeout(2600);
await shot(p, "home.jpg");
await p.goto(B + "/diagnose", { waitUntil: "load" });
await p.setInputFiles('input[type=file][accept^="image/jpeg"]', "public/samples/ridge_gourd__mosaic_virus.jpg");
await p.waitForSelector("article h2", { timeout: 60000 }); await p.waitForTimeout(5500); // let the "saved" toast leave
await shot(p, "result.jpg");
await p.goto(B + "/diseases/brinjal-phomopsis-blight", { waitUntil: "load" }); await p.waitForTimeout(800);
await shot(p, "field-guide.jpg");
await p.goto(B + "/about", { waitUntil: "load" }); await p.waitForTimeout(600);
const arch = p.locator("section", { hasText: "How it is built" }).first();
if (await arch.count()) { await arch.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await shot(p, "architecture.jpg"); }
await p.goto(B + "/batch", { waitUntil: "load" }); await p.waitForTimeout(600);
await shot(p, "batch.jpg");
const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const q = await m.newPage();
await q.goto(B + "/", { waitUntil: "load" }); await q.waitForTimeout(2600);
await shot(q, "mobile-home.jpg");
await q.goto(B + "/diagnose", { waitUntil: "load" });
await q.setInputFiles('input[type=file][accept^="image/jpeg"]', "public/samples/brinjal__little_leaf.jpg");
await q.waitForSelector("article h2", { timeout: 60000 }); await q.waitForTimeout(5500);
// Put the photo just under the sticky header so the page title doesn't show through it
await q.evaluate(() => { const el = document.querySelector("main img"); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76); });
await q.waitForTimeout(500);
await shot(q, "mobile-result.jpg");
await b.close();
