/**
 * Vite dev — OpenAI /api/ai/* without separate api-server process
 */
import { handleAiChat, openAiHealth } from './ai-marketing/handle-ai-chat.mjs';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

export function viteAiOpenAIPlugin() {
  return {
    name: 'vite-ai-openai',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/api/ai/health' && req.method === 'GET') {
          return json(res, 200, openAiHealth());
        }
        if (url === '/api/ai/chat' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const result = await handleAiChat(body);
            return json(res, result.ok ? 200 : 503, result);
          } catch (e) {
            return json(res, 500, { ok: false, message: e.message });
          }
        }
        next();
      });
    },
  };
}
