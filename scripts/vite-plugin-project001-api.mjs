import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function runSyncExport() {
  execSync('node scripts/project-001/project-001-sync.mjs && node scripts/project-001/project-001-export-dashboard.mjs', {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

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
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export function project001ApiPlugin() {
  return {
    name: 'project001-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        if (url === '/api/project-001/sync' && req.method === 'POST') {
          try {
            runSyncExport();
            json(res, 200, { ok: true, message: 'Sync and export completed' });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e.stderr || e.message || e) });
          }
          return;
        }

        if (url === '/api/project-001/draft' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { draftId, status, note } = body;
            if (!draftId || !['approved', 'rejected', 'pending_approval'].includes(status)) {
              json(res, 400, { ok: false, error: 'Invalid draftId or status' });
              return;
            }
            const noteArg = note ? ` --note ${JSON.stringify(note)}` : '';
            const out = execSync(
              `node scripts/project-001/project-001-draft-update.mjs --id ${JSON.stringify(draftId)} --status ${JSON.stringify(status)}${noteArg}`,
              { cwd: ROOT, encoding: 'utf8' },
            );
            execSync('node scripts/project-001/project-001-export-dashboard.mjs', { cwd: ROOT, stdio: 'ignore' });
            const result = JSON.parse(out.trim().split('\n').pop() || '{}');
            json(res, 200, { ...result, published: false });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e.stderr || e.message || e) });
          }
          return;
        }

        if (url === '/api/project-001/status' && req.method === 'GET') {
          const dash = join(ROOT, 'public/project-001/dashboard.json');
          if (existsSync(dash)) {
            json(res, 200, JSON.parse(readFileSync(dash, 'utf8')));
          } else {
            json(res, 404, { ok: false, error: 'dashboard.json not found' });
          }
          return;
        }

        next();
      });
    },
  };
}
