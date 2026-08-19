/**
 * Read-only identity verification against Staging. Refuses Production.
 * node scripts/qa-security-identity-verify.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/security-identity-mobile-oren-car');
mkdirSync(OUT, { recursive: true });

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-security-identity-verify');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

function q(sql) {
  const f = join(tmpWork, 'q.sql');
  writeFileSync(f, sql);
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${f}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 60000,
  });
}

const samples = q(`SELECT source, actor_username, actor_email, access_kind, tool_name, identity_status, event_type, action_label, outcome
FROM public.security_audit_events
WHERE source_ref IN (
  'identity-seed-push-orin','identity-seed-gha',
  'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
  'SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8',
  'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
  'scan-identity-seed','identity-seed-supabase'
)
ORDER BY occurred_at DESC;`);

const leftover = q(`SELECT count(*)::int AS leftover_fake_github_emails
FROM public.security_audit_events
WHERE actor_email LIKE '%@users.noreply.github.com';`);

const githubUsers = q(`SELECT actor_username, count(*)::int AS n
FROM public.security_audit_events
WHERE source='github' AND actor_username IS NOT NULL
GROUP BY 1 ORDER BY n DESC LIMIT 15;`);

const priv = q(readFileSync(join(ROOT, 'scripts/security-priv-probe-staging.sql'), 'utf8'));
const rls = q(readFileSync(join(ROOT, 'scripts/security-rls-probe-staging.sql'), 'utf8'));
const cols = q(`SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='security_audit_events'
AND column_name IN ('actor_username','access_kind','tool_name','object_type','ssh_fingerprint','auth_method')
ORDER BY 1;`);

const out = {
  at: new Date().toISOString(),
  linked,
  productionTouched: false,
  productionRef: PROD_REF,
  samples,
  leftover,
  githubUsers,
  privileges: priv,
  rls,
  columns: cols,
};
writeFileSync(join(OUT, 'identity-verify.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ linked, productionTouched: false, leftover, samples: samples.slice(0, 2500) }, null, 2));
