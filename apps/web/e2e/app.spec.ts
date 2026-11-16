import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/live", "/analyze", "/record", "/studio", "/research", "/developers", "/about", "/account", "/legal/privacy", "/legal/terms", "/legal/licences"];

test("every page renders with one h1 and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of PAGES) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    await expect(page.locator("h1"), p).toHaveCount(1);
  }
  expect(errors.filter((e) => !/favicon|Failed to load resource.*(401|403)/.test(e))).toEqual([]);
});

test("the replay classifies a real recording and keeps score", async ({ page }) => {
  await page.goto("/");
  const said = page.locator("#replay [aria-live=polite]").first();
  await expect(said).not.toHaveText(/Listening/, { timeout: 20_000 });
  await expect(page.getByText(/Agreement so far/)).toBeVisible();
  await expect(page.locator("#replay").getByText(/\d+\.\d%/).first()).toBeVisible();
});

test("live mode explains itself on a device without motion sensors", async ({ page }) => {
  await page.goto("/live");
  await page.getByRole("button", { name: "Start live recognition" }).click();
  await expect(page.getByText("This device doesn't send motion data")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
});

/** Feeds synthetic phone readings: still and upright, then a 2 Hz walking rhythm. */
async function fakePhone(page: Page) {
  await page.addInitScript(() => {
    const start = performance.now();
    setInterval(() => {
      const t = (performance.now() - start) / 1000;
      const walking = t > 9;
      const bob = walking ? Math.sin(t * 2 * Math.PI * 2) : 0;
      const ev = new DeviceMotionEvent("devicemotion", {
        accelerationIncludingGravity: { x: walking ? 1.2 * bob : 0.05, y: 9.78 + (walking ? 3.5 * bob : 0), z: walking ? 1.5 * Math.cos(t * 2 * Math.PI * 2) : 0.4 },
        rotationRate: { alpha: walking ? 40 * bob : 0.3, beta: walking ? 60 * Math.cos(t * 4 * Math.PI) : -0.2, gamma: walking ? 25 * bob : 0.1 },
        interval: 16,
      });
      window.dispatchEvent(ev);
    }, 16);
  });
}

test("live mode calibrates and recognises activity from motion events", async ({ page }) => {
  await fakePhone(page);
  await page.goto("/live");
  await page.getByRole("button", { name: "Start live recognition" }).click();
  await expect(page.getByText("Stand still with the phone in place")).toBeVisible({ timeout: 10_000 });
  const verdict = page.locator("[aria-live=polite]").filter({ hasText: /./ }).first();
  await expect(verdict).not.toHaveText(/Listening/, { timeout: 20_000 });
  await page.getByRole("button", { name: "End session" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download raw sensor data (CSV)" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^tinymotion-session-.*\.csv$/);
});

test("analyze scores the sample recording against its labels", async ({ page }) => {
  await page.goto("/analyze");
  await page.getByRole("button", { name: "Try a sample recording" }).click();
  await page.getByRole("button", { name: "Analyse recording" }).click();
  const line = page.getByText(/Agreement with the file's labels/);
  await expect(line).toBeVisible({ timeout: 30_000 });
  const pct = Number((await line.textContent())!.match(/([\d.]+)%/)![1]);
  expect(pct).toBeGreaterThan(80);
});

test("studio downloads exist and the benchmark runs", async ({ page, request }) => {
  await page.goto("/studio");
  const links = await page.locator("a[download]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(links.length).toBe(18);
  for (const href of links) expect((await request.get(href)).status(), href).toBe(200);
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByRole("table").first().getByText(/ms$/).first()).toBeVisible({ timeout: 30_000 });
});

test("API: rejects bad keys and malformed requests; health runs the model", async ({ request }) => {
  const bad = await request.post("/api/v1/classify", { data: { window: [] }, headers: { Authorization: "Bearer tm_live_nope" } });
  expect(bad.status()).toBe(401);
  expect((await bad.json()).error.code).toBe("invalid_api_key");
  const none = await request.post("/api/v1/classify", { data: {} });
  expect(none.status()).toBe(401);
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe("ok");
  const pre = await request.fetch("/api/v1/classify", { method: "OPTIONS" });
  expect(pre.status()).toBe(204);
  expect(pre.headers()["access-control-allow-origin"]).toBe("*");
});

test("security headers are set", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("connect-src 'self'");
  expect(h["permissions-policy"]).toContain("accelerometer=(self)");
  expect(h["x-frame-options"]).toBe("DENY");
});

/** Newer Chrome exposes DeviceMotionEvent.requestPermission and answers "denied" on machines without sensors. */
async function chromeSaysDenied(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceMotionEvent, "requestPermission", { value: () => Promise.resolve("denied"), configurable: true });
  });
}

test("a 'denied' answer without sensors is treated as no sensors, not as a refusal", async ({ page }) => {
  await chromeSaysDenied(page);
  await page.goto("/live");
  await page.getByRole("button", { name: "Start live recognition" }).click();
  await expect(page.getByText("This device doesn't send motion data")).toBeVisible({ timeout: 10_000 });
});

test("a 'denied' answer is ignored when motion data arrives anyway", async ({ page }) => {
  await chromeSaysDenied(page);
  await fakePhone(page);
  await page.goto("/live");
  await page.getByRole("button", { name: "Start live recognition" }).click();
  await expect(page.getByText("Stand still with the phone in place")).toBeVisible({ timeout: 10_000 });
});

test("an iPhone refusal explains how to allow motion access again", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await chromeSaysDenied(page);
  await page.goto("/live");
  await page.getByRole("button", { name: "Start live recognition" }).click();
  await expect(page.getByText("Motion access was turned off")).toBeVisible({ timeout: 10_000 });
  await ctx.close();
});

test("the installed app opens Live offline, with the model ready", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "service workers in Chromium");
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // let the worker take control
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.endsWith("-static")) && !!navigator.serviceWorker.controller);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.goto("/live?source=pwa");
  await expect(page.getByRole("button", { name: "Start live recognition" })).toBeEnabled({ timeout: 15_000 });
  await context.setOffline(false);
});

test("the web app manifest is installable", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  for (const size of ["192x192", "512x512"]) expect(m.icons.some((i: { sizes: string }) => i.sizes === size)).toBe(true);
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const s of [...m.icons, ...m.screenshots]) expect((await request.get(s.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});
