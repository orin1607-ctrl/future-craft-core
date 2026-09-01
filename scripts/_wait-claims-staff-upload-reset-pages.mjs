/**
 * Wait until Public Staging JS has staff-upload reset markers.
 */
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const needles = ['＋ צרף קובץ מהמכשיר', 'mail-attach-device', 'doc-preview-name', 'doc-file-row'];
const started = Date.now();
let last = '';
while (Date.now() - started < 8 * 60 * 1000) {
  const html = await fetch(`${PUBLIC}/index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const jsName = (html.match(/assets\/index-[^"']+\.js/) || [])[0] || '';
  const js = jsName ? await fetch(`${PUBLIC}/${jsName}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()) : '';
  const hits = Object.fromEntries(needles.map((n) => [n, js.includes(n)]));
  last = JSON.stringify({ jsName, jsBytes: js.length, hits, elapsed: Date.now() - started });
  console.log(last);
  if (Object.values(hits).every(Boolean)) process.exit(0);
  await new Promise((r) => setTimeout(r, 15000));
}
console.error('TIMEOUT', last);
process.exit(1);
