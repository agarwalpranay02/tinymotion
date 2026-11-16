// Renders the TinyMotion mark into every icon the site and the PWA need: node scripts/icons.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const P = {
  body: "M11 8.5h18a2.5 2.5 0 0 1 2.5 2.5v18a2.5 2.5 0 0 1-2.5 2.5H11A2.5 2.5 0 0 1 8.5 29V11A2.5 2.5 0 0 1 11 8.5Z",
  pins: "M14.5 3.5v5M20 3.5v5M25.5 3.5v5M14.5 31.5v5M20 31.5v5M25.5 31.5v5",
  trace: "M2.5 20.5h8.5l2.6-6.5 3.6 13 3.4-10.5 2.6 7 2.4-4.5h11.9",
};
const mark = (scale = 1) => `<g transform="translate(${20 - 20 * scale} ${20 - 20 * scale}) scale(${scale})">
  <path d="${P.pins}" stroke="#8a8fb2" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="${P.body}" fill="#191c3d" stroke="#eceef9" stroke-width="2.2"/>
  <path d="${P.trace}" fill="none" stroke="#9a8cf2" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
// standalone SVG favicon (transparent) and a filled app icon (night background)
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${mark()}</svg>`;
const app = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#10122a"/>${mark(scale)}</svg>`;
writeFileSync("public/icons/icon.svg", svgIcon + "\n");
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const render = async (svg, size, path) => {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(path, await p.screenshot({ omitBackground: true, type: "png" }));
};
await render(app(0.82), 192, "public/icons/icon-192.png");
await render(app(0.82), 512, "public/icons/icon-512.png");
await render(app(0.62), 512, "public/icons/icon-maskable-512.png"); // inside the 80% safe zone
await render(app(0.8), 180, "public/icons/apple-touch-icon.png");
await render(svgIcon, 32, "/tmp/fav32.png");
await b.close();
// favicon.ico holding one 32x32 PNG
const png = (await import("node:fs")).readFileSync("/tmp/fav32.png");
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
writeFileSync("public/favicon.ico", Buffer.concat([head, png]));
console.log("icons written");
