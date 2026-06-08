const base = 'https://orin1607-ctrl.github.io/future-craft-core/';
const html = await (await fetch(base)).text();
const m = html.match(/src="([^"]+assets\/index-[^"]+\.js)"/);
if (!m) {
  console.log(JSON.stringify({ error: 'no js asset', htmlLen: html.length }));
  process.exit(0);
}
const jsUrl = new URL(m[1], base).href;
const js = await (await fetch(jsUrl)).text();
const checks = [
  'VehicleHub',
  'VehicleDashboard',
  'vehicleDashboardData',
  'VehicleDetailsPanel',
  'loadVehicleHubData',
  'VehicleNewFormDalia',
  'DevVehicleHubPreview',
  'vehicle-new-dalia',
  'usfeoerkpcafxxlyuldl',
];
const found = Object.fromEntries(checks.map((c) => [c, js.includes(c)]));
console.log(JSON.stringify({ jsUrl, jsBytes: js.length, found }, null, 2));
