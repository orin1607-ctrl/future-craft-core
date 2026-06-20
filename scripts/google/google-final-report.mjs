/**
 * Generate FINAL-REPORT.md from audit + connection-check JSON.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PATHS, loadJson } from './_lib/paths.mjs';

const OUT = PATHS.auditOut;
mkdirSync(OUT, { recursive: true });

const audit = loadJson(join(OUT, 'report.json'), {});
const check = loadJson(join(OUT, 'connection-check.json'), null);
const bootstrap = loadJson(join(OUT, 'bootstrap-state.json'), {});

const probes = check?.probes || {};
const ok = check?.summary?.ok || [];
const failed = check?.summary?.failed || [];

const ready =
  bootstrap.complete === true ||
  (audit.connection?.connected && existsSync(PATHS.token) && failed.length === 0 && ok.length >= 6);

const md = `# Google Integration — Final Report

**Generated:** ${new Date().toISOString()}

## 1. מה בוצע

| שלב | סטטוס |
|-----|--------|
| תשתית integrations/google | ✅ |
| סקריפטים scripts/google | ✅ |
| npm google:audit / auth / check / bootstrap | ✅ |
| config.json | ${existsSync(PATHS.config) ? '✅' : '—'} |
| credentials.oauth.json | ${existsSync(PATHS.credentials) ? '✅' : '❌'} |
| token.json (OAuth) | ${existsSync(PATHS.token) ? '✅' : '❌'} |
| connection-check | ${check ? '✅' : '—'} |

Setup complete: ${bootstrap.complete ? '✅' : bootstrap.owner_gate === 0 ? '✅' : '—'}

## 2. מה חובר

${check
  ? ok.map((s) => `- **${s}** ✅`).join('\n') || '- (none)'
  : '- עדיין לא בוצע connection-check'}

${failed.length ? `\n### נכשל / דורש הפעלת API\n${failed.map((f) => `- **${f.service}**: ${f.error}`).join('\n')}` : ''}

${check?.probes?.userinfo?.email ? `\n**חשבון מחובר:** ${check.probes.userinfo.email}` : ''}

## 3. אילו הרשאות ניתנו

${audit.default_login_scopes?.map((s) => `- \`${s}\``).join('\n') || '- (see scopes.json)'}

> הרשאות בפועל תלויות באישור OAuth בדפדפן.

## 4. מה עדיין חסר

${!existsSync(PATHS.credentials) ? '- OAuth credentials JSON\n' : ''}${!existsSync(PATHS.token) ? '- OAuth token (npm run google:auth)\n' : ''}${failed.map((f) => `- תיקון/הפעלה: ${f.service}\n`).join('')}${!existsSync(join(PATHS.googleDir, 'apps-script', '.clasp.json')) ? '- Apps Script clasp deploy (אופציונלי)\n' : ''}${failed.length === 0 && existsSync(PATHS.token) ? '- אין חסר קריטי\n' : ''}

## 5. מוכן לעבודה מלאה מול Google?

**${ready ? 'כן — מותנה' : 'לא עדיין'}**

${ready
  ? 'חיבור OAuth פעיל ורוב ה-APIs עובדים. ניתן לבנות אוטומציות Sheets/Drive/Calendar.'
  : 'השלם Owner Gates: credentials → npm run google:continue'}

---

Artifacts:
- \`docs/audit-reports/google-integration/report.json\`
- \`docs/audit-reports/google-integration/connection-check.json\`
- \`docs/GOOGLE_INTEGRATION.md\`
`;

writeFileSync(join(OUT, 'FINAL-REPORT.md'), md);
console.log('Wrote', join(OUT, 'FINAL-REPORT.md'));
