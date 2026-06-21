import { loadOpenAIKey, openAIKeyStatus } from '../ai-marketing/_lib/openai-env.mjs';

async function main() {
  const status = openAIKeyStatus();
  const key = loadOpenAIKey();

  console.log('\n=== OpenAI Probe ===\n');
  console.log('Env file:', status.file);
  console.log('Model:', status.model);

  if (!key) {
    console.log('Status: OPENAI_API_KEY not set');
    console.log('→ הדבק מפתח בשורה: OPENAI_API_KEY=sk-...');
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
