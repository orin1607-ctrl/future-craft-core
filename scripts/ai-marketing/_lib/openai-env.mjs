/**
 * OpenAI key loader — ONLY from .env.openai (never code / Git)
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV_FILE = join(ROOT, '.env.openai');

export function getOpenAIEnvPath() {
  return existsSync(ENV_FILE) ? ENV_FILE : join(ROOT, '.env.openai.example');
}

export function loadOpenAIKey() {
  if (!existsSync(ENV_FILE)) return null;
  const raw = readFileSync(ENV_FILE, 'utf8');
  const m = raw.match(/^OPENAI_API_KEY=(.*)$/m);
  const key = m?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!key || key.length < 10 || /^YOUR|^sk-placeholder|^xxx/i.test(key)) return null;
  return key;
}

export function loadOpenAIModel() {
  if (!existsSync(ENV_FILE)) return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const raw = readFileSync(ENV_FILE, 'utf8');
  const m = raw.match(/^OPENAI_MODEL=(.*)$/m);
  const model = m?.[1]?.trim();
  return model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

export function openAIKeyStatus() {
  const path = getOpenAIEnvPath();
  const key = loadOpenAIKey();
  return {
    file: path,
    configured: !!key,
    model: loadOpenAIModel(),
  };
}
