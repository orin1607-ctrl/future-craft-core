import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { anthropicKeyStatus, loadAnthropicKey } from './_lib/ai-env.mjs';
import { P001 } from './_lib/config.mjs';

async function main() {
  const status = anthropicKeyStatus();
  const key = loadAnthropicKey();
  const report = { timestamp: new Date().toISOString(), ok: false, provider: 'claude', envFile: status.file };

  console.log('\n=== Claude Probe ===\n');
  if (!key) {
    report.error = 'ANTHROPIC_API_KEY not set';
    report.ownerAction = 'https://console.anthropic.com/settings/keys → .env.openai ANTHROPIC_API_KEY';
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'claude-probe.json'), JSON.stringify(report, null, 2));
    console.log('Status: missing key');
    process.exit(10);
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 120)}`);
    }
    report.ok = true;
    console.log('Status: OK');
  } catch (e) {
    report.error = e.message;
    console.error('Probe failed:', e.message);
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(join(P001.auditOut, 'claude-probe.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'claude-probe.json'), JSON.stringify(report, null, 2));
}

main();
