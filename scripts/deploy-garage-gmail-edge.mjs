/**
 * Deploy garage-gmail Edge Function to Oren Car PUBLIC STAGING only.
 * Project: usfeoerkpcafxxlyuldl
 *
 * Tries already-injected token env vars. Never prints token values.
 * Never Production / qasomfndnjuixgjmjwcm / dalia-car.online.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';

function clean(v) {
  return String(v || '').replace(/[\r\n]/g, '').trim();
}

function jwtRef(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return String(JSON.parse(json).ref || '');
  } catch {
    return '';
  }
}

function tokenCandidates() {
  const names = ['STAGING_SUPABASE_ACCESS_TOKEN', 'SUPABASE_ACCESS_TOKEN'];
  return names
    .map((name) => ({ name, value: clean(process.env[name]) }))
    .filter((row) => row.value);
}

async function stagingHttp(token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await res.text().catch(() => '');
  return res.status;
}

async function main() {
  mkdirSync('test-results', { recursive: true });
  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_touched: false,
    candidates: [],
    used: null,
    deployed: false,
  };

  const dbUrl = clean(process.env.STAGING_DATABASE_URL) || clean(process.env.DATABASE_URL);
  if (dbUrl) {
    if (dbUrl.includes(PROD_REF) || /dalia-car\.online/i.test(dbUrl)) {
      console.error('ABORT: database URL looks like Production');
      process.exit(1);
    }
    report.has_staging_db_url = dbUrl.includes(STAGING_REF);
  } else {
    report.has_staging_db_url = false;
  }

  const service = clean(process.env.STAGING_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY);
  if (service) {
    const ref = jwtRef(service);
    report.service_role_ref = ref || 'unreadable';
    if (ref && ref !== STAGING_REF) {
      console.error('ABORT: service role is not Staging');
      process.exit(1);
    }
  }

  const list = tokenCandidates();
  if (!list.length) {
    report.error = 'no_management_token_candidates';
    writeFileSync('test-results/garage-gmail-deploy.json', JSON.stringify(report, null, 2));
    console.log('NO_WORKING_STAGING_MANAGEMENT_TOKEN');
    process.exit(2);
  }

  let working = null;
  for (const row of list) {
    const code = await stagingHttp(row.value);
    report.candidates.push({ name: row.name, len: row.value.length, staging_http: code });
    console.log('mgmt', row.name, 'len', row.value.length, 'staging_http', code);
    if (code === 200 && !working) {
      working = row;
    }
  }

  if (!working) {
    report.error = 'management_token_rejected';
    writeFileSync('test-results/garage-gmail-deploy.json', JSON.stringify(report, null, 2));
    console.log('NO_WORKING_STAGING_MANAGEMENT_TOKEN');
    process.exit(2);
  }

  report.used = working.name;
  console.log('using_token_source', working.name);
  const result = spawnSync(
    'npx',
    ['--yes', 'supabase', 'functions', 'deploy', 'garage-gmail', '--project-ref', STAGING_REF, '--use-api'],
    {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: working.value },
    },
  );
  report.deployed = result.status === 0;
  writeFileSync('test-results/garage-gmail-deploy.json', JSON.stringify(report, null, 2));
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('DEPLOYED garage-gmail on', STAGING_REF);
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e).slice(0, 240));
  process.exit(1);
});
