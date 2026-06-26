import { existsSync, readFileSync } from 'fs';

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const env = { ...parseEnv('.env.local'), ...parseEnv('.env.openai') };

export function loadGeminiKey() {
  return env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || null;
}

export function loadAnthropicKey() {
  return env.ANTHROPIC_API_KEY || env.MARKETING_ANTHROPIC_API_KEY || null;
}

export function geminiKeyStatus() {
  const key = loadGeminiKey();
  return { hasKey: !!(key && key.length > 4), file: existsSync('.env.openai') ? '.env.openai' : '.env.local' };
}

export function anthropicKeyStatus() {
  const key = loadAnthropicKey();
  return { hasKey: !!(key && key.length > 4), file: existsSync('.env.openai') ? '.env.openai' : '.env.local' };
}
