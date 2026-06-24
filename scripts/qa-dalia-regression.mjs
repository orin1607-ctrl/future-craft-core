/**
 * Regression smoke — מודולי דליה + שיווק (קבצים, נתיבים, QA מפתח)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), passed: [], failed: [], warnings: [] };
const pass = (m) => report.passed.push(m);
const fail = (m) => report.failed.push(m);
const warn = (m) => report.warnings.push(m);

const modules = [
  { name: 'vehicles', path: 'src/pages/Vehicles.tsx' },
  { name: 'drivers', path: 'src/pages/Drivers.tsx' },
  { name: 'customers', path: 'src/pages/Customers.tsx' },
  { name: 'documents', path: 'src/pages/Documents.tsx' },
  { name: 'permissions', path: 'src/pages/Permissions.tsx' },
  { name: 'reports', path: 'src/pages/Reports.tsx' },
  { name: 'tasks', path: 'src/pages/VehicleTasks.tsx' },
  { name: 'fleet', path: 'src/pages/FleetOSAIPage.tsx' },
  { name: 'marketing', path: 'src/pages/AiMarketingPage.tsx' },
  { name: 'settings', path: 'src/pages/DaliaSettings.tsx' },
  { name: 'whatsapp', path: 'src/pages/WhatsAppSettingsPage.tsx' },
  { name: 'user-management', path: 'src/pages/UserManagement.tsx' },
];

for (const m of modules) {
  existsSync(join(process.cwd(), m.path)) ? pass(`module:${m.name}`) : fail(`module-missing:${m.name}`);
}

const customersSrc = readFileSync(join(process.cwd(), 'src/pages/Customers.tsx'), 'utf8');
customersSrc.includes('SERVICE_TYPE_OPTIONS') ? pass('customers:service_type') : fail('customers:service_type');
customersSrc.includes('provisionMarketingClient') ? pass('customers:provision') : fail('customers:provision');
customersSrc.includes('פתח כרטיס ניהול שיווק') ? pass('customers:marketing-link') : fail('customers:marketing-link');

const wizardSrc = readFileSync(join(process.cwd(), 'src/components/user-management/CreateUserWizardDialog.tsx'), 'utf8');
wizardSrc.includes('BUSINESS_CUSTOMER_SERVICE_TYPES') ? pass('wizard:service_type-options') : fail('wizard:service_type-options');

const edgeSrc = readFileSync(join(process.cwd(), 'supabase/functions/create-admin-user/index.ts'), 'utf8');
edgeSrc.includes('provisionMarketingClient') ? pass('edge:marketing-provision') : fail('edge:marketing-provision');

const navSrc = readFileSync(join(process.cwd(), 'public/ai-marketing/prd-dalia-nav.js'), 'utf8');
navSrc.includes('exitToDalia') ? pass('marketing:dalia-nav') : fail('marketing:dalia-nav');

const mktClient = readFileSync(join(process.cwd(), 'public/ai-marketing/marketing-client.js'), 'utf8');
mktClient.includes('לקוח שיווק חדש') ? pass('marketing:new-client-wizard') : fail('marketing:new-client-wizard');
mktClient.includes('AI_ASSISTANTS') ? pass('marketing:ai-assistants') : fail('marketing:ai-assistants');

const qa = spawnSync('node', ['scripts/qa-v4-orincar.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, QA_BASE_URL: process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core' },
});
if (qa.status === 0) pass('qa:v4-orincar-live');
else {
  fail('qa:v4-orincar-live');
  warn(qa.stdout?.slice(0, 500) || qa.stderr?.slice(0, 500));
}

report.ok = report.failed.length === 0;
const outPath = join(OUT, 'dalia-regression-smoke.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: report.passed.length, failed: report.failed.length }, null, 2));
process.exit(report.ok ? 0 : 1);
