/**
 * דוח מצב אינטגרציות — Project 001 / דליה
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });

const dataPath = join(process.cwd(), 'public/ai-marketing/data.json');
const raw = JSON.parse(readFileSync(dataPath, 'utf8'));
const conn = raw.connections || {};

const SERVICES = [
  { id: 'search_console', name: 'Google Search Console', key: 'searchConsole' },
  { id: 'analytics', name: 'Google Analytics', key: 'analytics4' },
  { id: 'gbp', name: 'Google Business Profile', key: 'businessProfile' },
  { id: 'google_ads', name: 'Google Ads', key: 'googleAds' },
  { id: 'tag_manager', name: 'Google Tag Manager', key: null, marketing: 'google_tag_manager' },
  { id: 'drive', name: 'Google Drive', key: 'drive' },
  { id: 'docs', name: 'Google Docs', key: 'docs' },
  { id: 'sheets', name: 'Google Sheets', key: 'sheets' },
  { id: 'gmail', name: 'Gmail', key: 'gmail' },
  { id: 'openai', name: 'OpenAI', key: 'openai' },
  { id: 'claude', name: 'Claude', key: null },
  { id: 'gemini', name: 'Gemini', key: null },
];

function mapStatus(s) {
  if (!s) return { connected: false, active: false, mode: 'לא מוגדר' };
  if (s === 'connected') return { connected: true, active: true, mode: 'נתונים אמיתיים (מקומי/סנכרון)' };
  if (s === 'pending_google_api_approval') return { connected: false, active: false, mode: 'Demo — ממתין לאישור Google' };
  if (s === 'planned') return { connected: false, active: false, mode: 'Demo — מתוכנן' };
  if (s === 'ready_for_secure_config') return { connected: false, active: false, mode: 'מוכן להגדרה — דורש .env.openai' };
  return { connected: false, active: false, mode: 'Demo / תשתית' };
}

function gaps(id, st) {
  const g = [];
  if (id === 'gbp') g.push('אישור Google Business Profile API', 'חיבור OAuth ללקוח');
  if (id === 'google_ads') g.push('הפעלת Google Ads API', 'חשבון MCC / Developer Token');
  if (id === 'tag_manager') g.push('רישום ב-marketing_connections', 'חיבור OAuth בשלב ב׳');
  if (id === 'claude') g.push('אין מפתח API בפרויקט', 'הוספת Claude API + Edge Function');
  if (id === 'gemini') g.push('אין מפתח Gemini', 'הוספת Google AI Studio key');
  if (id === 'openai' && st === 'ready_for_secure_config') g.push('OPENAI_API_KEY בשרת', 'marketing-ai-chat Edge Function');
  if (st === 'connected') g.push('אימות token refresh בפרודקשן');
  if (!g.length) g.push('בדיקת E2E על Staging עם משתמש Super Admin');
  return g;
}

const report = {
  at: new Date().toISOString(),
  source: raw.meta?.source || 'unknown',
  staging: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform',
  services: SERVICES.map((svc) => {
    const entry = svc.key ? conn[svc.key] : null;
    const st = entry?.status || (svc.id === 'tag_manager' ? 'infrastructure' : svc.id === 'claude' || svc.id === 'gemini' ? 'not_configured' : null);
    const mapped = mapStatus(st === 'infrastructure' ? 'planned' : st === 'not_configured' ? 'planned' : st);
    return {
      service: svc.name,
      connected: mapped.connected,
      active: mapped.active,
      dataMode: mapped.mode,
      configStatus: st || 'לא מוגדר',
      gapsFor100Percent: gaps(svc.id, st),
    };
  }),
};

const outPath = join(OUT, 'integrations-status.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, path: outPath, count: report.services.length }, null, 2));
