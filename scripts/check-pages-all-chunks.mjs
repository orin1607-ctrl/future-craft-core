const base = 'https://orin1607-ctrl.github.io/future-craft-core/';
const html = await (await fetch(base)).text();
const assets = [...html.matchAll(/(?:src|href)="([^"]+\/assets\/[^"]+\.js)"/g)].map((m) => new URL(m[1], base).href);
const unique = [...new Set(assets)];
console.log('assets', unique.length);
const markers = ['VehicleHub', 'vehicleDashboard', 'VehicleDashboard', 'vehicle-new-dalia', 'usfeoerkpcafxxlyuldl', 'ניהול רכבים', 'מעקב'];
for (const url of unique) {
  const js = await (await fetch(url)).text();
  const hit = Object.fromEntries(markers.map((m) => [m, js.includes(m)]));
  console.log(JSON.stringify({ url: url.split('/').pop(), bytes: js.length, hit }));
}
