const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const NEEDLE = 'tele-nav-back';

async function once() {
  const html = await (await fetch(`${BASE}/?nocache=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  const bundle = (html.match(/assets\/index-[^"'\\\s>]+\.js/) || [])[0] || null;
  let hasNeedle = false;
  if (bundle) {
    const js = await (await fetch(`${BASE}/${bundle}`)).text();
    hasNeedle = js.includes(NEEDLE) && js.includes('חזרה למסך הקודם');
  }
  console.log(JSON.stringify({ bundle, hasNeedle }));
  return Boolean(bundle && hasNeedle);
}

for (let i = 0; i < 24; i++) {
  if (await once()) {
    console.log('STAGING_DEPLOY_OK');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 20000));
}
console.log('STAGING_DEPLOY_TIMEOUT');
process.exit(1);
