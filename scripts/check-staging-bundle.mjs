const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const html = await (await fetch(`${BASE}/`)).text();
const m = html.match(/assets\/index-[^"]+\.js/);
if (!m) { console.log('no bundle'); process.exit(1); }
const js = await (await fetch(`${BASE}/${m[0]}`)).text();
for (const s of ['marketing_only', 'fleet_and_marketing', 'ניהול שיווק בלבד', 'provisionMarketingClient', 'דליה — מרכז שליטה']) {
  console.log(`${s}: ${js.includes(s)}`);
}
