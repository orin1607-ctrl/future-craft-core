const base = 'https://orin1607-ctrl.github.io/future-craft-core/';
const html = await fetch(base).then((r) => r.text());
const jsMatch = html.match(/assets\/index-[^"']+\.js/);
console.log('index bundle:', jsMatch?.[0] || 'none');
if (jsMatch) {
  const js = await fetch(base + jsMatch[0]).then((r) => r.text());
  const m = js.match(/ai-marketing-platform\.html[^`"']{0,120}/g) || [];
  console.log('iframe patterns:', m);
  console.log('has 3b:', js.includes('v3-unified-3b'));
  console.log('has 3:', js.includes('v3-unified-3'));
}
