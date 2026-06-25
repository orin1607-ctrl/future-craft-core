/**
 * QA — Required fields management module (admin hierarchy)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), passed: [], failed: [] };
const pass = (m) => report.passed.push(m);
const fail = (m) => report.failed.push(m);

const files = [
  'src/lib/requiredFieldsSchema.ts',
  'src/pages/admin/AdminModulesHub.tsx',
  'src/pages/admin/VehicleModuleAdmin.tsx',
  'src/pages/RequiredFieldsSettings.tsx',
  'supabase/migrations/20260626120000_dalia_form_config.sql',
];

files.forEach((f) => (existsSync(join(process.cwd(), f)) ? pass('file:' + f) : fail('file-missing:' + f)));

const schema = readFileSync(join(process.cwd(), 'src/lib/requiredFieldsSchema.ts'), 'utf8');
schema.includes("comprehensive_insurance', 'ביטוח מקיף', false")
  ? pass('schema:comprehensive-optional-default')
  : fail('schema:comprehensive-optional-default');
schema.includes("'רישיון רכב'")
  ? pass('schema:license-category')
  : fail('schema:license-category');

const adminHub = readFileSync(join(process.cwd(), 'src/pages/admin/AdminModulesHub.tsx'), 'utf8');
adminHub.includes('כפתורים ומודולים') && adminHub.includes('/admin/modules/vehicles')
  ? pass('hub:modules-vehicles')
  : fail('hub:modules-vehicles');

const vehicleHub = readFileSync(join(process.cwd(), 'src/pages/admin/VehicleModuleAdmin.tsx'), 'utf8');
vehicleHub.includes('ניהול רכבים') && vehicleHub.includes('/admin/modules/vehicles/required-fields')
  ? pass('hub:vehicle-required-fields-link')
  : fail('hub:vehicle-required-fields-link');

const panel = readFileSync(join(process.cwd(), 'src/pages/RequiredFieldsSettings.tsx'), 'utf8');
panel.includes('RequiredFieldsPanel') && panel.includes('מרכז ניהול')
  ? pass('panel:breadcrumb')
  : fail('panel:breadcrumb');

const routes = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
routes.includes('/admin/modules/vehicles/required-fields') && routes.includes('VehicleRequiredFieldsPage')
  ? pass('app:vehicle-required-route')
  : fail('app:vehicle-required-route');
routes.includes('Navigate to="/admin/modules/vehicles/required-fields"')
  ? pass('app:legacy-redirect')
  : fail('app:legacy-redirect');

const admin = readFileSync(join(process.cwd(), 'src/pages/AdminHome.tsx'), 'utf8');
admin.includes('/admin/modules') && admin.includes('כפתורים ומודולים')
  ? pass('admin-home:modules-link')
  : fail('admin-home:modules-link');
!admin.includes("to: '/required-fields'") ? pass('admin-home:no-scattered-link') : fail('admin-home:no-scattered-link');

writeFileSync(join(OUT, 'required-fields-qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed.length ? 1 : 0);
