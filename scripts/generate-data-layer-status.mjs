/**
 * דוח שכבת נתונים + חיבורים — dalia-c.com
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });

const dash = JSON.parse(readFileSync(join(process.cwd(), 'public/project-001/dashboard.json'), 'utf8'));
const gates = JSON.parse(readFileSync(join(OUT, 'owner-gates.json'), 'utf8'));

const report = {
  at: new Date().toISOString(),
  phase: 'A-data-layer',
  aiPhaseBlocked: true,
  aiNote: 'OpenAI/Claude/Gemini — תשתית מחוברת, API ממתין למפתח (לא מחובר)',
  site: 'https://dalia-c.com/',
  clientId: 'dalia-c-official',
  dashboardGeneratedAt: dash.generatedAt,
  lastSync: dash.lastSync?.timestamp,
  realKpis: dash.stats,
  modules: {
    searchConsole: { wired: true, active: !!dash.connections?.searchConsole?.ok, status: dash.connections?.searchConsole?.ok ? 'פעיל — נתונים אמיתיים' : 'ממתין להרשאה' },
    ga4: { wired: true, active: !!dash.connections?.analytics4?.ok, status: dash.connections?.analytics4?.ok ? 'פעיל — נתונים אמיתיים' : 'ממתין להרשאה' },
    googleBusiness: { wired: true, active: false, status: 'ממתין להרשאה — ' + (gates.gates?.gbp?.name || 'GBP API') },
    googleAds: { wired: true, active: false, status: 'ממתין להרשאה — Developer Token' },
    tagManager: { wired: true, active: false, status: 'ממתין להרשאה — OAuth' },
    siteData: { wired: true, active: true, pages: dash.lastSync?.counts?.gsc_pages, crawl: 'public/project-001/site-crawl.json' },
    customerOnboarding: { wired: true, active: true, edge: 'create-admin-user deployed', e2e: 'ידני נדרש' },
    rlsClientId: { wired: true, active: 'code-ready', e2e: 'ידני נדרש' },
    marketingFlow: { wired: true, screens: 10, clientIdSync: true },
    assistants: { wired: true, count: 12, aiApi: 'ממתין למפתח' },
    openai: { wired: true, active: false, missing: 'OPENAI_API_KEY + שלב אישור' },
    claude: { wired: true, active: false, missing: 'API key' },
    gemini: { wired: true, active: false, missing: 'Google AI Studio key' },
  },
  nextSteps: [
    'npm run project-001:auth (ממחשב בעלים + credentials.oauth.json)',
    'npm run project-001:sync-and-export',
    'git push dashboard.json → Staging',
    'בדיקה ידנית: יוני → לקוח חדש → שיווק → מצב נוכחי',
  ],
};

writeFileSync(join(OUT, 'data-layer-status.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, path: join(OUT, 'data-layer-status.json') }, null, 2));
