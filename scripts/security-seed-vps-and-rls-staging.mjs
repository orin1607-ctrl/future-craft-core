import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const ROOT = process.cwd();
const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-vps-seed');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { stdio: 'pipe' });

function q(file) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${join(ROOT, file)}"`, { encoding: 'utf8' });
}

let ingest = '';
try {
  ingest = q('scripts/security-ingest-vps-sample-staging.sql');
} catch (e) {
  ingest = String(e.message || e).slice(0, 400);
}
const probe = q('scripts/security-rls-probe-staging.sql');
const priv = q('scripts/security-priv-probe-staging.sql');
const out = { productionTouched: false, ingest: ingest.slice(0, 800), probe: probe.slice(0, 2500), privileges: priv.slice(0, 1500) };
writeFileSync(join(ROOT, 'docs/audit-reports/security-control-center-oren-car/rls-probe.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
