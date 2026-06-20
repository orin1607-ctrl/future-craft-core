/**
 * OpenAI Proxy — מפתח רק ב-.env.openai (לא בדפדפן)
 * Local: http://127.0.0.1:8787
 */
import http from 'http';
import { existsSync, readFileSync } from 'fs';

const PORT = Number(process.env.AI_PROXY_PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function loadKey() {
  if (!existsSync('.env.openai')) return null;
  const raw = readFileSync('.env.openai', 'utf8');
  const m = raw.match(/^OPENAI_API_KEY=(.*)$/m);
  const key = m?.[1]?.trim();
  if (!key || key.length < 10 || key.includes('YOUR')) return null;
  return key;
}

const API_KEY = loadKey();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, body) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/api/ai/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: !!API_KEY,
      provider: 'OpenAI',
      model: MODEL,
      message: API_KEY ? 'מחובר' : 'OPENAI_API_KEY חסר ב-.env.openai',
    });
  }

  if (req.url === '/api/ai/chat' && req.method === 'POST') {
    if (!API_KEY) {
      return json(res, 503, {
        error: 'missing_key',
        message: 'הגדר OPENAI_API_KEY בקובץ .env.openai (לא ב-GitHub)',
      });
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const prompt = body.prompt || body.message || '';
      const system = body.system || 'אתה עוזר שיווק AI של דליה. ענה בעברית, קצר ומקצועי.';
      const module = body.module || 'general';

      if (!prompt.trim()) {
        return json(res, 400, { error: 'empty_prompt', message: 'חסר prompt' });
      }

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `[${module}] ${prompt}` },
          ],
          max_tokens: body.max_tokens || 800,
          temperature: 0.7,
        }),
      });

      const data = await openaiRes.json();
      if (!openaiRes.ok) {
        return json(res, openaiRes.status, {
          error: 'openai_error',
          message: data.error?.message || `OpenAI HTTP ${openaiRes.status}`,
        });
      }

      const text = data.choices?.[0]?.message?.content || '';
      return json(res, 200, {
        ok: true,
        module,
        text,
        model: data.model || MODEL,
        usage: data.usage,
      });
    } catch (e) {
      return json(res, 500, { error: 'server_error', message: e.message });
    }
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n=== CO.CO OpenAI Proxy ===`);
  console.log(`URL: http://127.0.0.1:${PORT}`);
  console.log(`OpenAI key: ${API_KEY ? 'configured (.env.openai)' : 'NOT SET'}`);
  console.log(`Health: http://127.0.0.1:${PORT}/api/ai/health\n`);
});
