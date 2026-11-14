// Visual smoke check: renders every page, records console errors and saves screenshots (not part of CI).
import { chromium } from "@playwright/test";

const BASE = process.env.AEGIS_URL || "http://127.0.0.1:5173";
const pages = ["/", "/portfolio", "/xray", "/copilot", "/debate", "/scenarios", "/hype", "/guardian", "/reports", "/sources", "/settings"];
const out = process.env.OUT || "/tmp/aegis-shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} :: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message}`));
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const name = p === "/" ? "dashboard" : p.slice(1);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log("ok", p);
}
console.log("errors:", JSON.stringify(errors, null, 1));
await browser.close();
