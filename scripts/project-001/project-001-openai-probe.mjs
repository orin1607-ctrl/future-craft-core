import { existsSync, readFileSync } from 'fs';

async function main() {
  const path = existsSync('.env.openai') ? '.env.openai' : '.env.openai.example';
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^OPENAI_API_KEY=(.*)$/m);
  const key = m?.[1]?.trim();
  const ok = key && key.length > 10 && !key.includes('YOUR');

  console.log('\n=== OpenAI Probe ===\n');
  console.log('Env file:', path);
  if (!ok) {
    console.log('Status: OPENAI_API_KEY not set');
    console.log('→ Copy .env.openai.example to .env.openai and paste key');
    console.log('→ https://platform.openai.com/api-keys → Create new secret key');
    process.exit(1);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log('Status: OK');
    console.log('Models:', data.data?.length ?? 0);
  } catch (e) {
    console.error('Probe failed:', e.message);
    process.exit(1);
  }
}

main();
