/**
 * Verify normal Dalia route: /ai-marketing (no fullscreen preview URLs in app bundle)
 */
const BASE = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';

async function checkRedirects() {
  const urls = [
    ['dalia-crm.html', 'tab=crm'],
    ['dalia-crm-platform.html', 'tab=crm'],
    ['coco-marketing-platform.html', ''],
  ];
  for (const [file, expectQ] of urls) {
    const r = await fetch(`${BASE}/${file}?nocache=${Date.now()}`, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    const body = loc ? '' : await r.text();
    const target = loc || (body.match(/location\.replace\(['"]([^'"]+)/)?.[1] || '');
    const ok = target.includes('/ai-marketing') && !target.includes('fullscreen');
    console.log(JSON.stringify({ file, ok, target: target.slice(0, 120) }));
    if (!ok) process.exitCode = 1;
  }
}

async function checkBundle() {
  const index = await (await fetch(`${BASE}/index.html?nocache=${Date.now()}`)).text();
  const jsPath = index.match(/src="([^"]+assets\/index-[^"]+\.js)"/)?.[1];
  if (!jsPath) {
    console.log(JSON.stringify({ bundle: 'missing' }));
    process.exitCode = 1;
    return;
  }
  const js = await (await fetch(`${BASE}${jsPath}?nocache=${Date.now()}`)).text();
  const hasFullscreen = js.includes('fullscreen=1');
  const hasMarketing = js.includes('ai-marketing-platform.html');
  const hasRoute = js.includes('/ai-marketing') || js.includes('ai-marketing');
  console.log(JSON.stringify({ bundle: jsPath, hasFullscreen, hasMarketing, hasRoute, ok: !hasFullscreen && hasMarketing }));
  if (hasFullscreen) process.exitCode = 1;
}

await checkRedirects();
await checkBundle();
