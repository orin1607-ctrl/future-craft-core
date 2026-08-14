const TARGET = 'index-XzenxcjZ.js';
const LIVE = 'https://dalia-car.online';
for (let i = 1; i <= 24; i++) {
  try {
    const html = await (await fetch(LIVE)).text();
    const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || 'unknown';
    console.log(new Date().toISOString(), `attempt ${i}`, bundle);
    if (bundle === TARGET) {
      console.log('DEPLOYED');
      process.exit(0);
    }
  } catch (e) {
    console.log(`attempt ${i} error`, e.message);
  }
  await new Promise((r) => setTimeout(r, 30000));
}
console.log('TIMEOUT');
process.exit(1);
