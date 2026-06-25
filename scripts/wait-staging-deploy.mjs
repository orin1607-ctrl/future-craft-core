const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const want = process.argv[2] || 'd2f6b3a';

async function once() {
  const t = await (await fetch(`${BASE}/ai-marketing-platform.html?nocache=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  const build = t.match(/name="build-commit"\s+content="([^"]+)"/)?.[1];
  const ui = t.match(/name="ui-version"\s+content="([^"]+)"/)?.[1];
  const ver = t.match(/var ver = '([^']+)'/)?.[1];
  const ok = build === want && ver && ver.startsWith('v3-unified-3j-') && !ver.includes('"');
  console.log(JSON.stringify({ build, ui, ver, ok, loadingHub: t.includes('טוען לקוח') }));
  return ok;
}

for (let i = 0; i < 10; i++) {
  if (await once()) {
    console.log('DEPLOY_OK');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 30000));
}
console.log('DEPLOY_TIMEOUT');
process.exit(1);
