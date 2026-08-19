/**
 * Seed GitHub + VPS (read-only) events into Staging security tables.
 * Does not change Production DB, Hostinger files, SSH keys, or Dalia Car site.
 * node scripts/security-seed-external-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/security-control-center-oren-car');
mkdirSync(OUT, { recursive: true });

function sqlLiteral(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function runSql(workdir, sql) {
  const file = join(workdir, 'q.sql');
  writeFileSync(file, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${workdir}" -f "${file}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 60000,
  });
}

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-seed-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  github: null,
  vps: null,
  supabaseAuth: null,
};

try {
  const ghRes = await fetch('https://api.github.com/repos/orin1607-ctrl/future-craft-core/events?per_page=15', {
    headers: { 'User-Agent': 'dalia-security-center-staging' },
  });
  const events = ghRes.ok ? await ghRes.json() : [];
  let n = 0;
  for (const ev of events) {
    if (!['PushEvent', 'PullRequestEvent', 'CreateEvent', 'WorkflowRunEvent'].includes(ev.type)) continue;
    const actor = ev.actor?.login || null;
    const sql = `SELECT public.security_ingest_external(
      'github', ${sqlLiteral(ev.type)},
      ${sqlLiteral(ev.type === 'PushEvent' ? 'Push' : String(ev.type).replace('Event', ''))},
      'נקלט', 'success',
      ${sqlLiteral(actor ? 'identified' : 'identity_unavailable')},
      'info', ${sqlLiteral(String(ev.id))},
      NULL, NULL,
      ${sqlLiteral(actor ? `${actor}@users.noreply.github.com` : null)},
      'github_actor',
      ${sqlLiteral(ev.created_at)}::timestamptz,
      jsonb_build_object('repo','orin1607-ctrl/future-craft-core','actor', ${sqlLiteral(actor)})
    );`;
    try {
      runSql(tmpWork, sql);
      n += 1;
    } catch {
      /* duplicate or ingest error — continue */
    }
  }
  report.github = { ok: true, ingested: n, http: ghRes.status };
} catch (e) {
  report.github = { ok: false, error: String(e.message || e).slice(0, 500) };
}

try {
  const lines = execSync(
    'ssh -o BatchMode=yes -o ConnectTimeout=20 dalia-vps "grep -E \\"Accepted publickey|Failed password\\" /var/log/auth.log | tail -n 12"',
    { encoding: 'utf8', timeout: 25000 },
  ).trim().split('\n').filter(Boolean);
  let n = 0;
  for (const line of lines) {
    const ok = line.includes('Accepted publickey');
    const ipMatch = line.match(/from ([0-9.]+)/);
    const fpMatch = line.match(/SHA256:[A-Za-z0-9+/=]+/);
    const userMatch = line.match(/for (?:invalid user )?([a-zA-Z0-9_-]+) from/);
    const tsMatch = line.match(/^(\S+)/);
    const sql = `SELECT public.security_ingest_external(
      'hostinger_vps',
      ${sqlLiteral(ok ? 'ssh_login_success' : 'ssh_login_failed')},
      ${sqlLiteral(ok ? 'SSH login מוצלח' : 'SSH login שנכשל')},
      ${sqlLiteral(ok ? 'הצליח' : 'נכשל')},
      ${sqlLiteral(ok ? 'success' : 'failure')},
      'identity_unavailable',
      ${sqlLiteral(ok ? 'high' : 'warning')},
      ${sqlLiteral(fpMatch ? fpMatch[0] : line.slice(0, 80))},
      ${sqlLiteral(ipMatch ? ipMatch[1] : null)},
      ${sqlLiteral(ok ? 'publickey' : 'password')},
      NULL,
      ${sqlLiteral(userMatch ? `ssh:${userMatch[1]}` : 'ssh:unknown')},
      ${tsMatch ? sqlLiteral(tsMatch[1]) : 'now()'}::timestamptz,
      jsonb_build_object('note','SSH user+IP only — no app user guess')
    );`;
    try {
      runSql(tmpWork, sql);
      n += 1;
    } catch {
      /* continue */
    }
  }
  report.vps = { ok: true, ingested: n, readOnly: true, productionFilesChanged: false };
} catch (e) {
  report.vps = { ok: false, error: String(e.message || e).slice(0, 500) };
}

try {
  const out = runSql(
    tmpWork,
    `SELECT count(*)::int AS n FROM auth.audit_log_entries;`,
  );
  report.supabaseAuth = { available: true, hint: String(out).slice(0, 200) };
} catch (e) {
  report.supabaseAuth = {
    available: false,
    identity: 'זהות לא זמינה',
    error: String(e.message || e).slice(0, 300),
  };
}

writeFileSync(join(OUT, 'external-seed.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.github && report.github.ok === false && report.vps && report.vps.ok === false) process.exit(1);
