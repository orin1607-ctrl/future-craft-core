// National registry filters – browser acceptance test as a REGULAR signed-in user (role telemarketing_agent, STAGING).
// Drives the real controls (checkbox / select / text + Enter / sort / paging / clear), waits until the table finishes,
// and checks that the businesses in the table are exactly the ones the server returns for the same filters.
// Run:  NR_QA_CRED=<file outside the repo> node scripts/nr-filters-e2e/browser-filters.mjs [live|local] [outDir]
import http from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "./session.mjs";

const MODE = process.argv[2] || "live";
const OUT = path.resolve(process.argv[3] || "nr-filters-e2e-out");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8996;
let server = null, BASE = "https://orin1607-ctrl.github.io/future-craft-core/openprospector.html";
if (MODE === "local") {
  const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  server = http.createServer((req, res) => {
    const f = path.join(path.resolve("public"), decodeURIComponent(req.url.split("?")[0]));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "Content-Type": mime[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(PORT, r));
  BASE = `http://localhost:${PORT}/openprospector.html`;
}

const { session, anon, url, ref } = await getSession();
const api = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + session.access_token } }, auth: { persistSession: false } });

let browser; for (const o of [{ channel: "chrome" }, { channel: "msedge" }, {}]) { try { browser = await chromium.launch({ headless: true, ...o }); break; } catch { /* next */ } }
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "he-IL" });
await ctx.addInitScript(({ k, v }) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (!sessionStorage.getItem("nr-qa-init")) { sessionStorage.setItem("nr-qa-init", "1"); localStorage.setItem("dalia_nr_browse_v1", JSON.stringify({ sub: "browse", filters: { hide_archived: true }, sort: "sources", pageSize: 50 })); }
}, { k: `sb-${ref}-auth-token`, v: session });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push((e.stack || e.message).slice(0, 400)));
const lastBrowse = { body: null };
page.on("request", (r) => { if (r.url().includes("/rpc/nr_browse")) lastBrowse.body = r.postData(); });

const results = [];
const view = () => page.locator("#view");

// wait until the search is over: no "searching…" anywhere, and either rows, "no businesses found", or an error
async function waitDone(t0, timeout = 45000) {
  await page.waitForFunction(() => {
    const v = document.querySelector("#view"); if (!v) return false;
    const t = v.innerText;
    if (/מחפש…/.test(t) || /⏳/.test((v.querySelector(".num") || {}).innerText || "")) return false;
    return v.querySelectorAll('tr[data-nr="biz"]').length > 0 || /לא נמצאו עסקים/.test(t) || /⚠️/.test(t);
  }, null, { timeout, polling: 100 });
  return Date.now() - t0;
}
async function tableState() {
  return page.evaluate(() => {
    const v = document.querySelector("#view");
    const kpi = [...v.querySelectorAll("b.num")].map((b) => b.innerText).find((x) => /\d|יותר/.test(x)) || "";
    const err = [...v.querySelectorAll(".badge.b-bad")].map((b) => b.innerText).find((x) => x.includes("⚠️")) || "";
    return { ids: [...v.querySelectorAll('tr[data-nr="biz"]')].map((tr) => Number(tr.dataset.v)), total: kpi, empty: /לא נמצאו עסקים/.test(v.innerText), error: err };
  });
}
async function openGroupOf(selector) {
  await page.evaluate((s) => { const el = document.querySelector(s); let d = el && el.closest("details"); while (d) { if (!d.open) d.querySelector("summary").click(); d = d.parentElement && d.parentElement.closest("details"); } }, selector);
}
// compare with the server for the same filters (as the same regular user)
async function serverIds() {
  const b = JSON.parse(lastBrowse.body || "{}");
  const r = await api.rpc("nr_browse", b);
  return { ids: (r.data && r.data.rows || []).map((x) => x.id), total: r.data && r.data.total, filters: b.p_filters, sort: b.p_sort, page: b.p_page, err: r.error && r.error.message };
}
async function step(name, action, { expectEmpty = false } = {}) {
  const t0 = Date.now();
  let ms = null, st = null, srv = null, ok = false, note = "";
  try {
    await action();
    ms = await waitDone(t0);
    st = await tableState();
    srv = await serverIds();
    const same = st.ids.length === srv.ids.length && st.ids.every((id, i) => id === srv.ids[i]);
    ok = !st.error && same && (expectEmpty ? st.empty && !st.ids.length : st.ids.length > 0);
    if (!same) note = `table ${st.ids.length} rows ≠ server ${srv.ids.length}`;
    if (st.error) note = st.error;
  } catch (e) { note = "never finished: " + e.message.split("\n")[0]; st = await tableState().catch(() => null); }
  const shot = `${String(results.length + 1).padStart(2, "0")}-${name.replace(/[^\w֐-׿]+/g, "_").slice(0, 40)}.png`;
  // show the result count and the first rows of the table
  await page.evaluate(() => { const sel = document.querySelector('#view select[data-nr="sort"]'); const card = sel && sel.closest(".card"); if (card) card.scrollIntoView({ block: "start" }); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, shot) });
  const row = { step: name, ok, ms, rows: st && st.ids.length, total: st && st.total, filters: srv && srv.filters, sort: srv && srv.sort, page: srv && srv.page, note, shot };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(ms ?? "-").padStart(6)} ms  ${name.padEnd(46)} rows=${row.rows} total=${row.total} ${note}`);
}
const check = async (key, v) => { const s = `[data-nr-fm="${key}"][data-v="${v}"]`; await openGroupOf(s); await page.locator(s).check(); };
const select = async (key, v) => { const s = `select[data-nr-f="${key}"]`; await openGroupOf(s); await page.locator(s).selectOption(v); };
const type = async (key, v) => { const s = `input[data-nr-f="${key}"]`; await openGroupOf(s); await page.locator(s).fill(v); await page.locator(s).press("Enter"); };
const clear = async () => { await page.locator('button[data-nr="clear"]').click(); };

await page.goto(BASE + "?tab=national", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const tabBtn = page.locator('[data-tab="national"]').first();
await step("פתיחת המאגר – ללא סינון", async () => { if (await tabBtn.count()) await tabBtn.click(); });
await page.waitForFunction(() => document.querySelectorAll('[data-nr-fm="ind"]').length > 0, null, { timeout: 30000 }).catch(() => {});

await step("מקצוע: עורכי דין ומשפט", () => check("ind", "legal"));
await step("מקצוע + אזור: עורכי דין + מרכז", () => select("district", "מרכז"));
await step("מקצוע + אזור + טלפון", () => select("phone", "yes"));
await step("איפוס הסינון", clear);
await step("עיר: חיפה (הקלדה + Enter)", () => type("city", "חיפה"));
await step("עיר + אימייל", () => select("email", "yes"));
await step("איפוס", clear);
await step("טלפון: יש", () => select("phone", "yes"));
await step("טלפון + אימייל", () => select("email", "yes"));
await step("איפוס", clear);
await step("פייסבוק: יש", () => select("fb", "yes"));
await step("פייסבוק + אינסטגרם + לינקדאין", async () => { await select("ig", "yes"); await page.waitForTimeout(150); await select("li", "yes"); });
await step("איפוס", clear);
await step("פוטנציאל צי: סימנים חזקים / 5+", () => select("fleet_level", "strong"));
await step("רכבים ידועים – לפחות 5", async () => { await select("fleet_level", ""); await page.waitForTimeout(150); await type("fleet_min", "5"); });
await step("איפוס", clear);
await step("שילוב: הובלה + צי כלשהו + חיפה", async () => { await check("ind", "transport"); await page.waitForTimeout(150); await select("fleet_level", "any"); await page.waitForTimeout(150); await type("city", "חיפה"); });
await step("מיון לפי שם", () => page.locator('select[data-nr="sort"]').selectOption("name"));
await step("דפדוף – עמוד הבא", () => page.locator('button[data-nr="page"]', { hasText: "הבא" }).click());
await step("דפדוף – עמוד ראשון", () => page.locator('button[data-nr="page"]', { hasText: "ראשון" }).click());
await step("איפוס", clear);
await step("אזור: צפון + אינסטגרם", async () => { await select("district", "צפון"); await page.waitForTimeout(150); await select("ig", "yes"); });
await step("ללא תוצאות (שם שלא קיים)", async () => { await clear(); await page.waitForTimeout(150); await type("q", "zzqq-אין-כזה-עסק-77"); }, { expectEmpty: true });
await step("איפוס אחרון", clear);

// rapid clicking: several filters in a row – only the last search may decide the table
await step("לחיצות מהירות ברצף (5 שינויים)", async () => { await check("ind", "legal"); await select("district", "מרכז"); await select("phone", "yes"); await select("phone", ""); await select("district", ""); });

fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ mode: MODE, base: BASE, at: new Date().toISOString(), pageErrors, results }, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} steps passed · page errors: ${pageErrors.length}${pageErrors.length ? "\n" + pageErrors.join("\n") : ""}`);
await browser.close();
if (server) server.close();
process.exit(pass === results.length && !pageErrors.length ? 0 : 1);
