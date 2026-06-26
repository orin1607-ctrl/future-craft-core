import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { geminiKeyStatus, loadGeminiKey } from './_lib/ai-env.mjs';
import { P001 } from './_lib/config.mjs';

async function main() {
  const status = geminiKeyStatus();
  const key = loadGeminiKey();
  const report = { timestamp: new Date().toISOString(), ok: false, provider: 'gemini', envFile: status.file };

  console.log('\n=== Gemini Probe ===\n');
  if (!key) {
    report.error = 'GEMINI_API_KEY not set';
    report.ownerAction = 'https://aistudio.google.com/apikey → .env.openai GEMINI_API_KEY';
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'gemini-probe.json'), JSON.stringify(report, null, 2));
    console.log('Status: missing key');
    process.exit(10);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    report.ok = true;
    report.modelCount = data.models?.length ?? 0;
    console.log('Status: OK');
    console.log('Models:', report.modelCount);
  } catch (e) {
    report.error = e.message;
    console.error('Probe failed:', e.message);
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'gemini-probe.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'gemini-probe.json'), JSON.stringify(report, null, 2));
}

main();
