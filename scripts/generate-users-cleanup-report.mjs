/**
 * Users cleanup audit report — no deletions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'docs', 'audit-reports', 'security-access-audit', 'report.json');
const OUT = join(ROOT, 'docs', 'audit-reports', 'security-hardening');
mkdirSync(OUT, { recursive: true });

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const users = raw.users?.staging || [];

function classify(email, roles) {
  if (/@staging|@staging-|qa-|test-|e2e|probe|rls-|ephemeral|\.local$/i.test(email)) {
    if (roles.includes('super_admin')) return { group: 'Super Admin QA', action: 'למחוק' };
    return { group: 'QA / Test', action: 'למחוק' };
  }
  if (/hevra|menahel|nahag|demo|test@|test\d|gogo|rrrr|rtrr|yyy@yyyy|op@gmail|dosh@gmail|oyt@gmail/i.test(email)) {
    return { group: 'Demo / Test (uns flagged)', action: 'לבדוק / למחוק' };
  }
  if (roles.includes('super_admin')) return { group: 'Super Admin', action: 'להשאיר' };
  return { group: 'Production candidate', action: 'להשאיר — לוודא שיוך חברה' };
}

const rows = users.map((u) => {
  const roles = u.roles?.length ? u.roles : ['—'];
  const { group, action } = classify(u.email, u.roles || []);
  return {
    email: u.email,
    roles: roles.join(', '),
    company: u.company_name || '—',
    active: u.is_active === false ? 'inactive' : 'active',
    group,
    recommendation: action,
  };
});

rows.sort((a, b) => a.group.localeCompare(b.group) || a.email.localeCompare(b.email));

const summary = {
  total: rows.length,
  to_delete: rows.filter((r) => r.recommendation === 'למחוק').length,
  to_review: rows.filter((r) => r.recommendation.includes('לבדוק')).length,
  to_keep: rows.filter((r) => r.recommendation.startsWith('להשאיר')).length,
};

const report = { at: new Date().toISOString(), summary, users: rows };
writeFileSync(join(OUT, 'users-cleanup-audit.json'), JSON.stringify(report, null, 2));

const md = [
  '# Users Cleanup Audit (no deletions performed)',
  '',
  `Generated: ${report.at}`,
  '',
  '## Summary',
  '',
  `| Metric | Count |`,
  `|--------|-------|`,
  `| Total | ${summary.total} |`,
  `| להשאיר | ${summary.to_keep} |`,
  `| למחוק (QA) | ${summary.to_delete} |`,
  `| לבדוק | ${summary.to_review} |`,
  '',
  '## Full list',
  '',
  '| אימייל | תפקיד | קבוצה | המלצה |',
  '|--------|--------|--------|--------|',
  ...rows.map((r) => `| ${r.email} | ${r.roles} | ${r.group} | ${r.recommendation} |`),
].join('\n');

writeFileSync(join(OUT, 'users-cleanup-audit.md'), md);
console.log('Wrote users-cleanup-audit.json + .md', summary);
