import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { P001 } from './config.mjs';
import { resolveProjectId } from './gcp.mjs';
import { consoleLink, TARGET_PROJECT_ID } from './legacy-guard.mjs';
import { getAdsCredentials } from './ads-env.mjs';

const GBP_PROJECT_NUMBER = '484351148380';

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Seven-field owner gate schema used in docs and probe JSON. */
export function buildGbpOwnerGate(projectId = TARGET_PROJECT_ID) {
  return {
    id: 'gbp_basic_api_access',
    name: 'Google Business Profile — Basic API Access',
    blocked: true,
    directLink: 'https://support.google.com/business/contact/api_default',
    alternateLinks: {
      workflow: 'https://support.google.com/business/workflow/16726127',
      prerequisites: 'https://developers.google.com/my-business/content/prereqs',
      gcp_dashboard: consoleLink('home/dashboard', projectId),
      gcp_project_number: consoleLink('home/dashboard', projectId),
      enable_account_mgmt_api: consoleLink(
        'apis/library/mybusinessaccountmanagement.googleapis.com',
        projectId,
      ),
      enable_business_info_api: consoleLink(
        'apis/library/mybusinessbusinessinformation.googleapis.com',
        projectId,
      ),
      enable_performance_api: consoleLink(
        'apis/library/businessprofileperformance.googleapis.com',
        projectId,
      ),
      business_profile: 'https://business.google.com/',
      quota_docs: 'https://developers.google.com/my-business/content/limits',
    },
    whatToDo: [
      'היכנס ל-support.google.com/business/contact/api_default עם orin1607@gmail.com (בעלים/מנהל על הפרופיל).',
      'ב-dropdown "What can we help with?" בחר Application for Basic API Access.',
      'לחץ Apply for Google Business Profile API access והמשך במסך האשף.',
      'בחר את העסק: "דליה פתרונות מימון ותחזוקה לרכב" (חייב להיות מאומת 60+ יום).',
      `הזן Project Number: ${GBP_PROJECT_NUMBER} (לא project ID — מספר בלבד).`,
      'Company website: https://dalia-c.com/',
      'Primary reason (דוגמה): "Project 001 — read-only sync of reviews, posts, and performance metrics for our own verified business into internal dashboard and Google Sheets. No third-party SaaS."',
      'אשר את תנאי ה-API ושלח.',
      'ודא ש-orin1607@gmail.com הוא Owner/Manager ב-business.google.com על המיקום.',
    ],
    whatToApprove:
      'אישור Google ל-Basic API Access עבור GCP project 484351148380 (Project001AIMarketing). עד האישור quota=0 QPM וכל קריאה מחזירה 429.',
    expectedDuration: '7–14 ימי עסקים (לעיתים 3–5 ימים). אימייל follow-up מ-Google Business Profile API team.',
    afterApproval: [
      'Quota יעלה ל-~300 QPM ב-Cloud Console → APIs → My Business Account Management → Quotas.',
      'npm run project-001:gbp-connect יריץ probe + sync + export אוטומטית.',
      'נתוני GBP (ביקורים, ביקורות, פוסטים, Q&A) יופיעו ב-dashboard.json ובמסך GBP ב-CO.CO.',
      'שורה חדשה תיכתב ל-gbp_audit ב-Google Sheets.',
    ],
    verifySuccess: [
      'npm run project-001:gbp-probe → ok: true, locations ≥ 1',
      'npm run project-001:gbp-sync → ✓ GBP sync OK',
      'docs/audit-reports/project-001/gbp-sync.json → ok: true, summary.profileViews מספר',
      'public/project-001/dashboard.json → connections.businessProfile.status = connected',
    ],
    commandsAfterApproval: [
      'npm run project-001:gbp-connect',
      'npm run project-001:complete',
    ],
    gcpProjectNumber: GBP_PROJECT_NUMBER,
    gcpProjectId: projectId,
    account: 'orin1607@gmail.com',
    businessHint: 'דליה פתרונות מימון ותחזוקה לרכב',
    officialSite: 'https://dalia-c.com/',
  };
}

export function buildAdsOwnerGate(projectId = TARGET_PROJECT_ID) {
  const { developerToken } = getAdsCredentials();
  const tokenSet = Boolean(developerToken);
  return {
    id: 'google_ads_developer_token',
    name: 'Google Ads — Developer Token',
    blocked: !tokenSet,
    directLink: 'https://ads.google.com/aw/apicenter',
    alternateLinks: {
      ads_api_docs: 'https://developers.google.com/google-ads/api/docs/first-call/overview',
      enable_ads_api: consoleLink('apis/library/googleads.googleapis.com', projectId),
      oauth_consent: consoleLink('apis/credentials/consent', projectId),
      env_template: '.env.ads.example',
    },
    whatToDo: tokenSet
      ? [
          'Developer Token כבר ב-.env.ads — הרץ npm run project-001:ads-connect.',
          'אם ה-token Test Account בלבד — ודא שחשבון Google Ads הוא test account או המתן לאישור Production.',
        ]
      : [
          'היכנס ל-https://ads.google.com/aw/apicenter עם orin1607@gmail.com (חשבון עם גישה ל-Google Ads).',
          'אם אין API Center — פתח חשבון Google Ads או בקש גישת Admin מ-MCC.',
          'בחלק Developer token לחץ על Apply for token (אם עדיין אין) או Copy token (אם כבר קיים).',
          'רמת Token: Test Account — מיידי; Basic/Standard — דורש בקשה ל-Google (1–5 ימי עסקים).',
          'העתק את ה-token (מחרוזת alphanumerical).',
          'בשורש הפרויקט: cp .env.ads.example .env.ads',
          'מלא: GOOGLE_ADS_DEVELOPER_TOKEN=<ה-token>',
          'אופציונלי: GOOGLE_ADS_CUSTOMER_ID=XXX-XXX-XXXX (מספר חשבון ללא מקפים גם OK)',
          'אופציונלי: GOOGLE_ADS_LOGIN_CUSTOMER_ID=XXX-XXX-XXXX (אם MCC manager)',
          'שמור את הקובץ — אל תעלה ל-git (.env.ads ב-gitignore).',
        ],
    whatToApprove: tokenSet
      ? 'אם token ברמת Test — אישור Production access ב-API Center (Apply for Basic/Standard access) כדי לקרוא חשבון אמיתי.'
      : 'הפקת Developer Token ב-Google Ads API Center + (לפרודקשן) אישור Basic/Standard access מ-Google Ads API team.',
    expectedDuration: tokenSet
      ? 'Test token: מיידי. Production approval: 1–5 ימי עסקים.'
      : 'העתקת token: 2–5 דקות. Test access: מיידי. Production: 1–5 ימי עסקים.',
    afterApproval: [
      'npm run project-001:ads-connect יריץ probe → sync → export.',
      'קמפיינים, מילות מפתח, עלויות והמרות יישמרו ב-ads-sync.json ו-dashboard.json.',
      'נתונים ייכתבו ל-Google Sheets (טאב ads_daily אם קיים).',
      'מסך Google Ads ב-CO.CO יציג KPIs חיים במקום placeholder.',
    ],
    verifySuccess: [
      'npm run project-001:ads-probe → ok: true, accessible_customers ≥ 1',
      'npm run project-001:ads-sync → ✓ Ads sync OK',
      'docs/audit-reports/project-001/ads-sync.json → ok: true',
      'public/project-001/dashboard.json → googleAds.ok = true',
    ],
    commandsAfterApproval: [
      'npm run project-001:ads-connect',
      'npm run project-001:complete',
    ],
    requiredEnv: {
      GOOGLE_ADS_DEVELOPER_TOKEN: 'חובה',
      GOOGLE_ADS_CUSTOMER_ID: 'אופציונלי — נבחר אוטומטית מה-customer הראשון',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: 'נדרש רק אם גישה דרך MCC',
    },
    account: 'orin1607@gmail.com',
    oauthScope: 'https://www.googleapis.com/auth/adwords',
    gcpProjectId: projectId,
  };
}

export function detectGbpGateStatus(gbpProbe, connProbe) {
  const err =
    gbpProbe?.errors?.[0]?.error ||
    connProbe?.connections?.gbp_accounts?.error ||
    '';
  const quotaBlocked =
    gbpProbe?.ok !== true &&
    (err.includes('Quota exceeded') ||
      err.includes('quota_limit_value') ||
      err.includes('484351148380') ||
      gbpProbe?.errors?.some((e) => e.code === 429));
  if (gbpProbe?.ok) return { blocked: false, reason: 'connected' };
  if (quotaBlocked) return { blocked: true, reason: 'pending_google_api_approval', gate: 'gbp_basic_api_access' };
  if (!gbpProbe?.oauth?.hasBusinessManage) return { blocked: true, reason: 'missing_oauth_scope', gate: 'project-001:auth' };
  return { blocked: true, reason: 'unknown', gate: 'gbp_basic_api_access' };
}

export function buildOwnerGatesReport() {
  const { id: projectId } = resolveProjectId();
  const gbpProbe = loadJson(join(P001.auditOut, 'gbp-probe.json'));
  const adsProbe = loadJson(join(P001.auditOut, 'ads-probe.json'));
  const connProbe = loadJson(join(P001.auditOut, 'connections-probe.json'));
  const gbpStatus = detectGbpGateStatus(gbpProbe, connProbe);
  const adsGate = buildAdsOwnerGate(projectId);
  const gbpGate = buildGbpOwnerGate(projectId);

  return {
    generatedAt: new Date().toISOString(),
    account: connProbe?.account || 'orin1607@gmail.com',
    gcpProjectId: projectId || TARGET_PROJECT_ID,
    gates: {
      gbp: {
        ...gbpGate,
        blocked: gbpStatus.blocked,
        currentStatus: gbpStatus,
        probeOk: gbpProbe?.ok === true,
        lastProbe: gbpProbe?.timestamp || null,
      },
      ads: {
        ...adsGate,
        blocked: !adsProbe?.ok || !getAdsCredentials().developerToken,
        probeOk: adsProbe?.ok === true,
        developerTokenSet: adsProbe?.developer_token_set ?? Boolean(getAdsCredentials().developerToken),
        lastProbe: adsProbe?.timestamp || null,
      },
    },
    readyCommands: {
      afterGbpApproval: gbpGate.commandsAfterApproval,
      afterAdsToken: adsGate.commandsAfterApproval,
      fullPipeline: 'npm run project-001:complete',
    },
  };
}

function gateSection(g) {
  return [
    `## ${g.name}`,
    '',
    g.blocked ? '**סטטוס:** 🔴 חסום — נדרש אישור שלך' : '**סטטוס:** 🟢 פתוח / מוכן',
    '',
    '### 1. קישור ישיר',
    `- **עיקרי:** ${g.directLink}`,
    ...(g.alternateLinks
      ? Object.entries(g.alternateLinks).map(([k, url]) => `- ${k}: ${url}`)
      : []),
    '',
    '### 2. מה לעשות (צעד-אחר-צעד)',
    ...g.whatToDo.map((s, i) => `${i + 1}. ${s}`),
    '',
    '### 3. מה לאשר / לספק',
    g.whatToApprove,
    '',
    '### 4. זמן צפוי',
    g.expectedDuration,
    '',
    '### 5. מה יקרה אחרי האישור',
    ...g.afterApproval.map((s) => `- ${s}`),
    '',
    '### 6. איך לוודא שהחיבור הצליח',
    ...g.verifySuccess.map((s) => `- \`${s}\``),
    '',
    '### 7. פקודות מיד לאחר האישור',
    ...g.commandsAfterApproval.map((s) => `- \`${s}\``),
    '',
  ].join('\n');
}

export function renderOwnerGatesMarkdown(report = buildOwnerGatesReport()) {
  const lines = [
    '# Project 001 — Owner Gates (GBP + Google Ads)',
    '',
    `**Generated:** ${report.generatedAt}`,
    `**Account:** ${report.account}`,
    `**GCP Project:** ${report.gcpProjectId}`,
    '',
    'כל ההכנות מצד הפיתוח הושלמו. נשארו רק שני אישורים חיצוניים:',
    '',
    '---',
    '',
    gateSection(report.gates.gbp),
    '---',
    '',
    gateSection(report.gates.ads),
    '---',
    '',
    '## Dev prep completed (no action needed)',
    '',
    '- OAuth scopes: `business.manage` + `adwords` ב-scopes.json',
    '- GCP APIs: My Business + Business Profile Performance + Google Ads API ב-enable-apis',
    '- Scripts: `gbp-probe`, `gbp-sync`, `gbp-connect`, `ads-probe`, `ads-sync`, `ads-connect`',
    '- Dashboard + CO.CO UI: GBP live slice + Ads live slice (מופעלים אוטומטית לאחר sync)',
    '- Sheets: `gbp_audit` tab; `ads_daily` + `ads_campaigns` on first sync',
    '',
    '## One-shot after BOTH gates clear',
    '',
    '```bash',
    'npm run project-001:complete',
    '```',
    '',
  ];
  return lines.join('\n');
}
