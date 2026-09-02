const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const WANT = process.argv[2] || '63ada24';
const NEEDLE = 'claims-card-snapshot';

async function once() {
  const t = Date.now();
  const html = await (await fetch(`${BASE}/?nocache=${t}`, { cache: 'no-store' })).text();
  const deployRes = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${t}`, { cache: 'no-store' });
  const deploy = deployRes.ok ? await deployRes.text() : '';
  const bundle = (html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || '';
  let js = '';
  let needle = false;
  if (bundle) {
    const res = await fetch(`${BASE}/${bundle}?t=${t}`, { cache: 'no-store' });
    js = await res.text();
    needle = js.includes(NEEDLE);
  }
  const ok = deploy.includes(WANT.slice(0, 7)) || needle;
  console.log(JSON.stringify({
    deploy: deploy.trim(),
    bundle,
    jsBytes: js.length,
    needle,
    ok,
  }));
  return ok;
}

for (let i = 0; i < 36; i++) {
  if (await once()) {
    console.log('STAGING_DEPLOY_OK');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 15000));
}
console.log('STAGING_DEPLOY_TIMEOUT');
process.exit(1);
