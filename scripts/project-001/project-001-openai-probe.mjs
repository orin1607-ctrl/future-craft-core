import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadOpenAIKey, openAIKeyStatus } from '../ai-marketing/_lib/openai-env.mjs';
import { P001 } from './_lib/config.mjs';

async function main() {
  const status = openAIKeyStatus();
  const key = loadOpenAIKey();
  const report = { timestamp: new Date().toISOString(), ok: false, model: status.model, file: status.file };

  console.log('\n=== OpenAI Probe ===\n');
  console.log('Env file:', status.file);
  console.log('Model:', status.model);

  if (!key) {
    console.log('Status: OPENAI_API_KEY not set');
    report.error = 'OPENAI_API_KEY not set';
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'openai-probe.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    report.ok = true;
    report.modelCount = data.data?.length ?? 0;
    console.log('Status: OK');
    console.log('Models:', report.modelCount);
  } catch (e) {
    report.error = e.message;
    console.error('Probe failed:', e.message);
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'openai-probe.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'openai-probe.json'), JSON.stringify(report, null, 2));
}

main();
