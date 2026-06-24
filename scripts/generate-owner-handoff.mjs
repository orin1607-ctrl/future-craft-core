/**
 * Generate owner handoff report (JSON + Markdown)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });

const now = new Date().toISOString();
let dataLayer = {};
let qa = {};
try { dataLayer = JSON.parse(readFileSync(join(OUT, 'data-layer-status.json'), 'utf8')); } catch (_) {}
try { qa = JSON.parse(readFileSync(join(OUT, 'v4-orincar-qa.json'), 'utf8')); } catch (_) {}

const handoff = {
  generatedAt: now,
  phase: 'A-data-layer',
  stagingUrl: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform',
  daliaAppUrl: 'https://orin1607-ctrl.github.io/future-craft-core/',
  production: 'CLOSED — no deploy without explicit owner approval',
  lastCommitNote: 'See git log on main branch',

  completedAutonomously: [
    'Integration Hub — 12 עוזרים, סרגל סטטוס, מודל חיבורים',
    'dalia-site-config — SSOT dalia-c.com, dashboard.json + site-crawl.json',
    'Hub KPIs — GSC/GA4 אמיתיים (לא 14,320 / 8,420)',
    'מסך נכסים — coco-live-assets-grid עם סטטוס חיבור',
    'עוזרים — GSC/GA4/CMS/Manager מ-dashboard.json',
    'AI gate — OpenAI/Claude/Gemini: תשתית מחוברת, API חסום',
    'scrub Demo UI — greentech/FleetOS מוסתרים ב-live mode',
    'prd-entities.json — רק dalia-c-official, ללא demo-client',
    'create-admin-user Edge + RLS migrations + marketingProvision.ts',
    'QA: qa-v4-orincar + qa-staging-live-close לפני כל push',
  ],

  blockedOnOwner: [
    {
      id: 'oauth-sync',
      priority: 1,
      status: 'ממתין לבעלים',
      title: 'OAuth + סנכרון Google',
      steps: [
        'שים integrations/google/credentials.oauth.json',
        'npm run project-001:auth',
        'npm run project-001:sync-and-export',
        'git add public/project-001/dashboard.json && git push',
      ],
      reason: 'credentials.oauth.json חסר במחשב הפיתוח',
    },
    {
      id: 'manual-e2e',
      priority: 2,
      status: 'ממתין לבעלים',
      title: 'בדיקה ידנית — יוני אטיאס',
      steps: [
        'התחברות ל-Staging',
        'לקוח עסקי חדש — marketing_only',
        'לקוח עסקי חדש — fleet_and_marketing',
        'כרטיס שיווק → מצב נוכחי → GSC/GA4 אמיתיים',
        'חזרה לדליה (exit)',
      ],
    },
    {
      id: 'gbp-api',
      priority: 3,
      status: 'ממתין לבעלים',
      title: 'Google Business — Basic API Access',
      link: 'https://support.google.com/business/contact/api_default',
      doc: 'docs/audit-reports/project-001/owner-gates.json',
    },
    {
      id: 'ads-token',
      priority: 4,
      status: 'ממתין לבעלים',
      title: 'Google Ads — Developer Token',
      link: 'https://ads.google.com/aw/apicenter',
      doc: '.env.ads.example',
    },
  ],

  intentionallyBlocked: [
    { item: 'OpenAI / Claude / Gemini API', reason: 'שלב AI — רק אחרי אישור שלב א׳' },
    { item: 'Production deploy', reason: 'אין deploy ללא אישור מפורש' },
  ],

  liveData: dataLayer.realKpis || {},
  lastDashboardSync: dataLayer.lastSync || null,
  qaLastRun: {
    v4: qa.passedCount != null ? `${qa.passedCount}/${(qa.passedCount || 0) + (qa.failedCount || 0)}` : 'unknown',
    ok: qa.ok,
    at: qa.at,
  },

  remainingAutomated: [
    'Wire marketing-api Supabase bundle ללקוחות חדשים (post E2E)',
    'GTM sync after OAuth',
    'Historical trend charts (post sync)',
  ],

  docs: {
    handoffJson: 'docs/audit-reports/project-001/owner-handoff.json',
    dataLayer: 'docs/audit-reports/project-001/data-layer-status.json',
    ownerGates: 'docs/audit-reports/project-001/owner-gates.json',
    stagingClose: 'docs/audit-reports/project-001/staging-live-close.json',
  },
};

writeFileSync(join(OUT, 'owner-handoff.json'), JSON.stringify(handoff, null, 2));

const md = `# Owner Handoff — Project 001 / dalia-c.com

**עודכן:** ${now}  
**שלב:** A — שכבת נתונים (ללא AI API)  
**Staging:** ${handoff.stagingUrl}

---

## מה בוצע (אוטונומי)

${handoff.completedAutonomously.map((x) => `- ${x}`).join('\n')}

---

## נתונים חיים (dashboard.json)

| מדד | ערך |
|-----|-----|
| GSC קליקים | ${handoff.liveData.totalClicks ?? '—'} |
| GSC חשיפות | ${handoff.liveData.totalImpressions ?? '—'} |
| GA4 סשנים | ${handoff.liveData.ga4Sessions ?? '—'} |
| GA4 צפיות | ${handoff.liveData.ga4PageViews ?? '—'} |
| Sync אחרון | ${handoff.lastDashboardSync ?? '—'} |

---

## ממתין לבעלים

${handoff.blockedOnOwner.map((b) => `### ${b.priority}. ${b.title}\n${b.steps.map((s) => `- ${s}`).join('\n')}`).join('\n\n')}

---

## חסום בכוונה

${handoff.intentionallyBlocked.map((x) => `- **${x.item}** — ${x.reason}`).join('\n')}

---

## QA אחרון

- v4-orincar: ${handoff.qaLastRun.v4} (${handoff.qaLastRun.ok ? 'OK' : 'FAILED'})
- staging-live-close: ראה \`staging-live-close.json\`

---

## Production

**סגור.** אין deploy ל-Production ללא אישור מפורש.
`;

writeFileSync(join(OUT, 'OWNER-HANDOFF.md'), md);
console.log(JSON.stringify({ ok: true, json: join(OUT, 'owner-handoff.json'), md: join(OUT, 'OWNER-HANDOFF.md') }, null, 2));
