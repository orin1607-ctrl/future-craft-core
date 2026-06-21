/** Hebrew labels + hints for Dalia routes (AI context) */
export const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'דשבורד ראשי — סיכום פעילות',
  '/vehicles': 'רשימת רכבים — ניהול צי',
  '/drivers': 'רשימת נהגים',
  '/faults': 'תקלות ותקלות רכב',
  '/accidents': 'דיווח תאונות',
  '/reports': 'דוחות וניתוח',
  '/alerts': 'התראות',
  '/customers': 'לקוחות והסכמים',
  '/routes': 'מסלולים',
  '/work-orders': 'סידור עבודה',
  '/service-orders': 'הוראות שירות',
  '/vehicle-tracking': 'מעקב רכבים',
  '/fleetos-ai': 'מיקום צי חכם (FleetOS AI)',
  '/transport': 'חברות הסעות',
  '/attach-car': 'הצמדת רכב',
  '/expenses': 'הוצאות',
  '/emergency': 'חירום',
  '/internal-chat': 'צ\'אט פנימי',
  '/settings': 'הגדרות',
  '/user-management': 'ניהול משתמשים',
  '/admin-home': 'מרכז ניהול (Super Admin)',
  '/ai-marketing': 'ניהול שיווק CO.CO — SEO, תוכן AI',
  '/dalia-settings': 'Dalia Settings',
  '/voice': 'סוכן קולי Flow Maker',
  '/vehicle-inspections': 'ביקורות רכב',
  '/vehicle-import': 'יבוא רכבים',
  '/vehicle-lookup': 'בדיקת רכב ממשלתי',
  '/promotions': 'מבצעים',
  '/suppliers': 'ספקים',
  '/permissions': 'הרשאות',
  '/system-logs': 'לוג מערכת',
  '/health-declaration': 'הצהרת בריאות',
  '/driver-notifications': 'התראות נהג',
  '/history': 'היסטוריה',
  '/fleet-managers': 'מנהלי צי',
};

const NAV_INTENTS: { pattern: RegExp; path: string }[] = [
  { pattern: /פתח.*(?:תקל|תקלות)|עבור.*תקל/, path: '/faults' },
  { pattern: /פתח.*(?:רכב|רכבים)|עבור.*רכב/, path: '/vehicles' },
  { pattern: /פתח.*(?:נהג|נהגים)/, path: '/drivers' },
  { pattern: /פתח.*(?:דוח|דוחות)/, path: '/reports' },
  { pattern: /פתח.*(?:התרא|התראות)/, path: '/alerts' },
  { pattern: /פתח.*(?:לקוח|לקוחות)/, path: '/customers' },
  { pattern: /פתח.*(?:שיווק|marketing|seo)/i, path: '/ai-marketing' },
  { pattern: /פתח.*(?:מרכז ניהול|admin)/i, path: '/admin-home' },
  { pattern: /פתח.*(?:דשבורד|בית|ראשי)/, path: '/dashboard' },
  { pattern: /פתח.*(?:חירום)/, path: '/emergency' },
  { pattern: /פתח.*(?:הזמנ|שירות)/, path: '/service-orders' },
  { pattern: /פתח.*(?:מסלול)/, path: '/routes' },
];

export function getRouteLabel(pathname: string): string {
  const base = pathname.split('?')[0].replace(/\/$/, '') || '/dashboard';
  if (ROUTE_LABELS[base]) return ROUTE_LABELS[base];
  const partial = Object.entries(ROUTE_LABELS).find(([k]) => base.startsWith(k + '/'));
  return partial ? partial[1] : `מסך: ${base}`;
}

export function detectNavIntent(text: string): string | null {
  for (const { pattern, path } of NAV_INTENTS) {
    if (pattern.test(text)) return path;
  }
  return null;
}

export function scrapeVisiblePageContext(): string {
  const main = document.querySelector('main');
  if (!main) return 'אין אזור תוכן גלוי.';
  const headings = Array.from(main.querySelectorAll('h1, h2, h3'))
    .slice(0, 6)
    .map((el) => el.textContent?.trim())
    .filter(Boolean);
  const buttons = Array.from(main.querySelectorAll('button, a[href]'))
    .slice(0, 20)
    .map((el) => el.textContent?.trim())
    .filter((t) => t && t.length > 1 && t.length < 48);
  const inputs = main.querySelectorAll('input, select, textarea').length;
  const tables = main.querySelectorAll('table').length;
  const cards = main.querySelectorAll('[class*="card"], .stat-card').length;
  return [
    headings.length ? `כותרות במסך: ${headings.join(' | ')}` : '',
    buttons.length ? `כפתורים/קישורים: ${[...new Set(buttons)].slice(0, 12).join(', ')}` : '',
    `רכיבים: ${tables} טבלאות, ${inputs} שדות, ~${cards} כרטיסים`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPageContext(opts: {
  pathname: string;
  role: string;
  userName?: string;
  companyName?: string | null;
}): string {
  const { pathname, role, userName, companyName } = opts;
  const inMarketing = pathname === '/ai-marketing';
  return [
    `משתמש: ${userName || 'לא ידוע'} | תפקיד: ${role}`,
    companyName ? `חברה: ${companyName}` : '',
    `מסך נוכחי: ${getRouteLabel(pathname)} (${pathname})`,
    inMarketing ? 'המשתמש במודול ניהול שיווק — ניתן לעזור גם ב-SEO, תוכן, Google Ads, Analytics.' : '',
    '',
    'מה המשתמש רואה עכשיו:',
    inMarketing ? '(תוכן CO.CO בתוך iframe — עזור גם בשיווק)' : scrapeVisiblePageContext(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAssistantSystem(opts: {
  pathname: string;
  role: string;
  userName?: string;
  companyName?: string | null;
}): string {
  const routes = Object.entries(ROUTE_LABELS)
    .slice(0, 20)
    .map(([p, l]) => `${p} = ${l}`)
    .join('\n');

  return [
    'אתה **עוזר דליה AI** — העוזר הראשי של כל מערכת דליה (לא רק שיווק).',
    'מערכת דליה: ניהול צי רכב, נהגים, תקלות, תאונות, לקוחות, מסלולים, דוחות, התראות, שיווק CO.CO, סוכן קולי.',
    'תפקידך: להדריך את המשתמש שלב-שלב, להסביר מה הוא רואה, מה דחוף, ומה לעשות — בלי שהוא יחפש בתפריטים.',
    'ענה תמיד בעברית, ברור, ידידותי, בנקודות כשמתאים.',
    '',
    buildPageContext(opts),
    '',
    'מסכים עיקריים:',
    routes,
    '',
    'כללים:',
    '- לשאלות "מה דחוף / מצב החברה / מה לעשות" — תן סיכום + 3 פעולות מומלצות.',
    '- לבקשת "פתח מסך" — הוסף [[nav:/path]] (למשל [[nav:/faults]]).',
    '- ליצירת תוכן שיווקי — הפנה ל-/ai-marketing או הסבר מה לעשות שם.',
    '- אל תמציא מספרים — אם אין נתונים, הסבר איפה לראות אותם במערכת.',
    '- פרסום/אישור סופי תמיד דורש אישור המשתמש.',
  ].join('\n');
}

export function parseNavActions(text: string): { label: string; path: string }[] {
  const seen = new Set<string>();
  const actions: { label: string; path: string }[] = [];
  const re = /\[\[nav:(\/[^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    actions.push({ path, label: `↗ ${getRouteLabel(path)}` });
  }
  return actions;
}

export function stripNavMarkers(text: string): string {
  return text.replace(/\[\[nav:(\/[^\]]+)\]\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
