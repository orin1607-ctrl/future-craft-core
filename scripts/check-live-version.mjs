const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';

async function check(url, label) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const t = await r.text();
  const ui = t.match(/name="ui-version"\s+content="([^"]+)"/)?.[1];
  const build = t.match(/name="build-commit"\s+content="([^"]+)"/)?.[1];
  const ver = t.match(/var ver = '([^']+)'/)?.[1];
  const greentech = /גרין-טק/.test(t);
  const loading = t.includes('טוען לקוח');
  console.log(JSON.stringify({ label, status: r.status, ui, build, bootVer: ver, greentech, loadingHub: loading }, null, 2));
}

await check(`${BASE}/ai-marketing-platform.html`, 'platform');
await check(`${BASE}/ai-marketing/coco-claude-screens.html`, 'screens');
const index = await (await fetch(`${BASE}/index.html?nocache=${Date.now()}`)).text();
const js = index.match(/src="([^"]+assets\/index-[^"]+\.js)"/)?.[1];
if (js) {
  const bundle = await (await fetch(`${BASE}${js}?nocache=${Date.now()}`)).text();
  console.log(JSON.stringify({
    label: 'react-bundle',
    has3g: bundle.includes('v3-unified-3g'),
    hasMarketingPlatform: bundle.includes('ai-marketing-platform.html'),
  }, null, 2));
}
