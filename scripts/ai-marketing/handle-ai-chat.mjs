/**
 * Shared OpenAI chat handler — used by api-server + Vite dev plugin
 */
import { loadOpenAIKey, loadOpenAIModel } from './_lib/openai-env.mjs';

export async function handleAiChat(body) {
  const key = loadOpenAIKey();
  const model = loadOpenAIModel();
  if (!key) {
    return { ok: false, error: 'missing_key', message: 'הגדר OPENAI_API_KEY ב-.env.openai' };
  }
  const prompt = body.prompt || body.message || '';
  const system = body.system || 'אתה עוזר AI של מערכת דליה. ענה בעברית, מקצועי וברור.';
  const module = body.module || 'general';
  if (!prompt.trim()) return { ok: false, error: 'empty_prompt', message: 'חסר prompt' };

  const messages = [{ role: 'system', content: system }];
  if (Array.isArray(body.history)) {
    for (const h of body.history.slice(-10)) {
      if (h?.role && h?.content) {
        messages.push({ role: h.role, content: String(h.content).slice(0, 4000) });
      }
    }
  }
  messages.push({ role: 'user', content: body.assistant ? prompt : `[${module}] ${prompt}` });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: body.max_tokens || 1100,
      temperature: body.assistant ? 0.65 : 0.7,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: 'openai_error', message: data.error?.message || `HTTP ${res.status}` };
  }
  return { ok: true, text: data.choices?.[0]?.message?.content || '', model: data.model || model };
}

export function openAiHealth() {
  const key = loadOpenAIKey();
  const model = loadOpenAIModel();
  return {
    ok: !!key,
    provider: 'OpenAI',
    model,
    message: key ? 'מחובר' : 'OPENAI_API_KEY חסר ב-.env.openai',
  };
}
