/**
 * CO.CO Dalia — Unified API Server
 * OpenAI (via .env.openai) + Google Sheets + dashboard.json
 * NO Supabase. NO API keys in frontend.
 */
import http from 'http';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendUiAction, readUiActions } from './sheets-ui.mjs';
import { loadDrafts, updateDraftStatus } from '../project-001/_lib/history.mjs';
import { loadOpenAIKey } from './_lib/openai-env.mjs';
import { handleAiChat, openAiHealth } from './handle-ai-chat.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PORT = Number(process.env.COCO_API_PORT || 8787);

const PATHS = {
  dashboard: join(ROOT, 'public', 'project-001', 'dashboard.json'),
  cocoData: join(ROOT, 'public', 'ai-marketing', 'data.json'),
  drafts: join(ROOT, 'public', 'project-001', 'drafts.json'),
};

function json(res, code, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 2e6) reject(new Error('too large')); });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function dashboardToCoco(dashboard, base) {
  const b = base || loadJson(PATHS.cocoData) || {};
  const stats = dashboard?.stats || {};
  const kwRaw = dashboard?.searchConsole?.keywords || [];
  const keywords = kwRaw.length
    ? kwRaw.slice(0, 50).map((k, i) => ({
        keyword: k.query || k.keyword || `kw-${i}`,
        rank: Math.round(k.position || 0),
        prev: Math.round((k.position || 0) + 2),
        change: 0,
        clicks: k.clicks || 0,
        volume: k.impressions || 0,
        ctr: k.ctr != null ? `${(Number(k.ctr) * (k.ctr < 1 ? 100 : 1)).toFixed(1)}%` : '—',
        url: k.page || '—',
        score: Math.min(99, Math.max(20, 100 - Math.round(k.position || 50))),
      }))
    : (b.keywords || []);

  const drafts = loadDrafts();
  const pending = drafts.filter((d) => d.status === 'pending_approval');
  const approvals = pending.length
    ? pending.map((d) => ({
        id: d.id,
        type: d.type || 'article',
        title: d.title,
        status: 'pending',
        aiScore: 88,
        seoScore: 85,
        roi: '—',
      }))
    : (b.approvals || []);

  return {
    meta: {
      version: '2.1.0',
      source: dashboard?.dataSource === 'sheets' ? 'Google Sheets + dashboard.json' : (b.meta?.source || 'demo'),
      generatedAt: dashboard?.generatedAt || new Date().toISOString(),
      lastSync: dashboard?.lastSync || null,
      spreadsheetUrl: dashboard?.lastSync?.spreadsheet_url || dashboard?.spreadsheetUrl || null,
    },
    project: dashboard?.project || b.project,
    connections: dashboard?.connections || b.connections,
    kpis: {
      avgPosition: { value: String(stats.avgPosition ?? b.kpis?.avgPosition?.value ?? '—'), change: b.kpis?.avgPosition?.change || '—', trend: 'neutral' },
      weeklyClicks: { value: String(stats.totalClicks ?? b.kpis?.weeklyClicks?.value ?? '0'), change: b.kpis?.weeklyClicks?.change || '—', trend: 'up' },
      weeklyImpressions: { value: String(stats.totalImpressions ?? b.kpis?.weeklyImpressions?.value ?? '0'), change: b.kpis?.weeklyImpressions?.change || '—', trend: 'up' },
      avgCtr: { value: stats.avgCtr != null ? `${stats.avgCtr}%` : (b.kpis?.avgCtr?.value || '—'), change: b.kpis?.avgCtr?.change || '—', trend: 'neutral' },
      activeKeywords: { value: String(stats.activeKeywords ?? keywords.length), change: b.kpis?.activeKeywords?.change || '—', trend: 'neutral' },
      aiOpportunities: { value: String(stats.opportunities ?? b.kpis?.aiOpportunities?.value ?? '0'), change: 'ממתינות לאישור', trend: 'neutral' },
      weakPages: { value: String(stats.weakPages ?? b.kpis?.weakPages?.value ?? '0'), change: b.kpis?.weakPages?.change || '—', trend: 'down' },
      pendingDrafts: { value: String(stats.pendingDrafts ?? pending.length ?? b.kpis?.pendingDrafts?.value ?? '0'), change: 'לאישורך', trend: 'neutral' },
    },
    keywords,
    approvals,
    scheduler: b.scheduler || [],
    badges: {
      pendingApproval: pending.length || b.badges?.pendingApproval || 0,
      notifications: b.badges?.notifications || 12,
      aiDirector: b.badges?.aiDirector || 5,
    },
    drafts,
    suggestions: dashboard?.suggestions || [],
    ga4: dashboard?.analytics4?.summary || null,
  };
}

function runSyncExport() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'project-001:sync-and-export'], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', (c) => { out += c; });
    child.stderr?.on('data', (c) => { out += c; });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: out.slice(-2000) });
      else reject(new Error(out.slice(-500) || `sync exit ${code}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.url === '/api/health' && req.method === 'GET') {
      const dash = loadJson(PATHS.dashboard);
      const key = loadOpenAIKey();
      return json(res, 200, {
        ok: true,
        openai: !!key,
        dashboard: !!dash,
        dataSource: dash?.dataSource || 'demo',
        spreadsheet: dash?.lastSync?.spreadsheet_url || null,
      });
    }

    if (req.url === '/api/ai/health' && req.method === 'GET') {
      return json(res, 200, openAiHealth());
    }

    if (req.url === '/api/ai/chat' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const result = await handleAiChat(body);
      return json(res, result.ok ? 200 : 503, result);
    }

    if (req.url === '/api/data' && req.method === 'GET') {
      const dashboard = loadJson(PATHS.dashboard);
      const base = loadJson(PATHS.cocoData);
      const coco = dashboardToCoco(dashboard, base);
      const uiLog = await readUiActions(30);
      return json(res, 200, { ok: true, data: coco, uiLog });
    }

    if (req.url === '/api/sync' && req.method === 'POST') {
      try {
        await runSyncExport();
        const dashboard = loadJson(PATHS.dashboard);
        const coco = dashboardToCoco(dashboard, loadJson(PATHS.cocoData));
        return json(res, 200, { ok: true, message: 'סנכרון הושלם', data: coco });
      } catch (e) {
        return json(res, 500, { ok: false, message: e.message });
      }
    }

    if (req.url === '/api/save' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const { action, draftId, title, status, note } = body;
      let draft = null;
      if (draftId) draft = updateDraftStatus(draftId, status || action, note);
      const sheetResult = await appendUiAction({
        action: action || status,
        entityType: body.entityType || 'draft',
        entityId: draftId || body.entityId || '',
        title: title || draft?.title || '',
        status: status || action,
        note: note || '',
      });
      const dashboard = loadJson(PATHS.dashboard);
      const coco = dashboardToCoco(dashboard, loadJson(PATHS.cocoData));
      return json(res, 200, { ok: true, draft, sheets: sheetResult, data: coco });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (e) {
    return json(res, 500, { error: 'server_error', message: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const key = loadOpenAIKey();
  console.log('\n=== CO.CO Dalia API ===');
  console.log(`http://127.0.0.1:${PORT}`);
  console.log(`OpenAI: ${key ? 'configured (.env.openai)' : 'NOT SET — הדבק OPENAI_API_KEY ב-.env.openai'}`);
  console.log(`Dashboard: ${existsSync(PATHS.dashboard) ? 'yes' : 'missing'}\n`);
});
