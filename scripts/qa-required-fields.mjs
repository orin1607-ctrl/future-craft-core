/**
 * QA — Required fields management module
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
  'src/lib/requiredFieldsApi.ts',
  'src/lib/requiredFieldsValidate.ts',
  'src/contexts/RequiredFieldsContext.tsx',
  'src/pages/RequiredFieldsSettings.tsx',
  'supabase/migrations/20260626120000_dalia_form_config.sql',
];

files.forEach((f) => (existsSync(join(process.cwd(), f)) ? pass('file:' + f) : fail('file-missing:' + f)));

const schema = readFileSync(join(process.cwd(), 'src/lib/requiredFieldsSchema.ts'), 'utf8');
schema.includes("comprehensive_insurance', 'ביטוח מקיף', false")
  ? pass('schema:comprehensive-optional-default')
  : fail('schema:comprehensive-optional-default');
schema.includes('third_party_insurance')
  ? pass('schema:third-party-fields')
  : fail('schema:third-party-fields');

const blocks = readFileSync(
  join(process.cwd(), 'src/components/vehicles/vehicleNewDalia/vehicleNewDaliaBlocks.tsx'),
  'utf8',
);
blocks.includes('useRequiredFieldsOptional') && blocks.includes('moduleKey')
  ? pass('blocks:fld-context')
  : fail('blocks:fld-context');

const routes = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
routes.includes('/required-fields') && routes.includes('RequiredFieldsSettings')
  ? pass('app:route')
  : fail('app:route');
routes.includes('RequiredFieldsProvider') ? pass('app:provider') : fail('app:provider');

const access = readFileSync(join(process.cwd(), 'src/lib/routeAccess.ts'), 'utf8');
access.includes("'/required-fields'") ? pass('route-access') : fail('route-access');

const admin = readFileSync(join(process.cwd(), 'src/pages/AdminHome.tsx'), 'utf8');
admin.includes('/required-fields') && admin.includes('ניהול שדות חובה')
  ? pass('admin-home')
  : fail('admin-home');

const persist = readFileSync(join(process.cwd(), 'src/lib/daliaVehiclePersist.ts'), 'utf8');
persist.includes('validateRequiredModuleFields')
  ? pass('persist:validation')
  : fail('persist:validation');

writeFileSync(join(OUT, 'required-fields-qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed.length ? 1 : 0);
