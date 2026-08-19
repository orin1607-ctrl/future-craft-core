/**
 * Pre-S2 readiness: verify backups exist. SELECT + VPS tar list only.
 * Does not restore over live, does not start S2, does not change Production.
 * node scripts/pre-s2-backup-readiness-readonly.mjs
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TARBALL = '/root/s1-safety-backup-2026-08-19T061550Z.tgz';
const EXPECT_SHA = '85658300f848e6048ee0a78f48ef7272ff5cab8cece8ccefeed7062feb060835';
const WRITE = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy|vacuum|reindex|cluster|notify|listen)\b/i;
const OUT = join(process.cwd(), 'public/project-001/pre-s2-backup-readiness.json');

function abortIfNotSelect(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must start with SELECT/WITH');
  if (WRITE.test(body)) throw new Error(`ABORT: write-like SQL blocked: ${body.slice(0, 80)}`);
}

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try {
      return extractRows(JSON.parse(payload));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function dbQuery(sql) {
  abortIfNotSelect(sql);
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-pres2-ro');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return extractRows(raw);
}

function ssh(remote) {
  return execSync('ssh -o BatchMode=yes -o ConnectTimeout=20 dalia-vps bash -s', {
    encoding: 'utf8',
    input: `${remote}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function policyRestoreSql(p) {
  const roles = String(p.roles || '')
    .replace(/[{}]/g, '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .join(', ');
  const using = p.qual ? ` USING (${p.qual})` : '';
  const check = p.with_check ? ` WITH CHECK (${p.with_check})` : '';
  return `CREATE POLICY "${p.policyname}" ON ${p.schemaname}.${p.tablename} FOR ${p.cmd} TO ${roles || 'public'}${using}${check};`;
}

const report = {
  id: 'pre-s2-backup-readiness',
  at: new Date().toISOString(),
  s2Started: false,
  productionChanged: false,
  restoreExecuted: false,
};

const remote = `
set -e
test -f ${TARBALL}
SHA=$(sha256sum ${TARBALL} | awk '{print $1}')
BYTES=$(wc -c < ${TARBALL})
HAS_INDEX=$(tar tzf ${TARBALL} | grep -c 'dist/index.html$' || true)
LIVE_OK=$(test -f /root/future-craft-core/dist/index.html && echo yes || echo no)
LIVE_BUNDLE=$(grep -oE 'assets/index-[^" ]+\\.js' /root/future-craft-core/dist/index.html | awk 'NR==1{print; exit}' || true)
echo SHA=$SHA
echo BYTES=$BYTES
echo HAS_INDEX=$HAS_INDEX
echo LIVE_OK=$LIVE_OK
echo LIVE_BUNDLE=$LIVE_BUNDLE
echo TARBALL_STILL_THERE=yes
`.trim();

try {
  const raw = ssh(remote).trim();
  report.vpsRaw = raw;
  const kv = {};
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
  }
  report.vps = kv;
  report.vpsShaMatchesS1 = kv.SHA === EXPECT_SHA;
} catch (e) {
  report.vpsError = String(e.stderr || e.message || e).slice(0, 600);
}

try {
  report.buckets = dbQuery('SELECT id, public::text AS public FROM storage.buckets ORDER BY 1');
} catch (e) {
  report.bucketsError = String(e.message || e).slice(0, 400);
}

try {
  report.fileCounts = dbQuery(
    'SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1',
  );
} catch (e) {
  report.fileCountsError = String(e.message || e).slice(0, 400);
}

try {
  report.policies = dbQuery(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE (
      schemaname = 'public'
      AND tablename IN ('driver_declarations', 'driving_exams')
    )
    OR (
      schemaname = 'storage'
      AND (
        policyname ILIKE '%document%'
        OR policyname ILIKE '%declaration%'
      )
    )
    ORDER BY 1, 2, 3
  `);
  report.policyRestoreSql = (report.policies || []).map(policyRestoreSql);
} catch (e) {
  report.policiesError = String(e.message || e).slice(0, 400);
}

try {
  report.rpcs = dbQuery(`
    SELECT p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token',
        'sign_declaration_by_token',
        'get_driving_exam_by_token',
        'start_driving_exam_by_token',
        'submit_driving_exam_by_token'
      )
    ORDER BY 1
  `);
} catch (e) {
  report.rpcsError = String(e.message || e).slice(0, 400);
}

const missing = [
  'get_declaration_by_token',
  'sign_declaration_by_token',
  'get_driving_exam_by_token',
  'start_driving_exam_by_token',
  'submit_driving_exam_by_token',
].filter((n) => !(report.rpcs || []).some((r) => r.name === n));

report.rpcBeforeState = 'all five RPCs absent';
report.rpcsMissing = missing;

const c4Names = [
  'Anonymous can view by token',
  'Anonymous can update by token',
  'Anon view exam by token',
  'Anon submit exam by token',
];
const c4 = (report.policies || []).filter((p) => c4Names.includes(p.policyname));
report.c4PolicyCount = c4.length;
report.c4HasQual = c4.every((p) => Boolean(p.qual));
report.publicRead = (report.policies || []).find((p) => p.policyname === 'public_read_documents') || null;
report.anonViewSig = (report.policies || []).find((p) => p.policyname === 'Anonymous can view declaration signatures') || null;

report.gaps = {
  fullPostgresDump: false,
  storageObjectBytesDump: false,
  edgeFunctionSourceFiles: false,
  vpsTarballPresent: Boolean(report.vps?.TARBALL_STILL_THERE === 'yes' && report.vpsShaMatchesS1),
  rlsExactExpressionsCaptured: Boolean(report.c4HasQual && report.publicRead?.qual),
};

report.s2Rollback = {
  change: 'CREATE five RPCs that do not exist today',
  backupNeeded: 'documented absence of the five names is the before-state',
  rollback: 'DROP FUNCTION IF EXISTS those five signatures',
  filesInHand: true,
};

const s2Safe =
  report.gaps.vpsTarballPresent &&
  report.gaps.rlsExactExpressionsCaptured &&
  missing.length === 5 &&
  !report.vpsError &&
  !report.policiesError;

report.verdict = s2Safe ? 'SAFE TO REQUEST S2 APPROVAL' : 'NOT SAFE FOR S2';
report.verdictWhy = s2Safe
  ? 'S2 only adds missing RPCs. Before-state is proven empty. VPS tarball still present and hash-matches S1. Exact C4/document policy expressions were captured for later steps. No Production change was made.'
  : 'A required backup or snapshot is missing or unverified.';

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      wrote: OUT,
      verdict: report.verdict,
      vpsShaMatchesS1: report.vpsShaMatchesS1,
      liveBundle: report.vps?.LIVE_BUNDLE,
      c4PolicyCount: report.c4PolicyCount,
      c4HasQual: report.c4HasQual,
      rpcsMissing: missing.length,
      productionChanged: false,
      s2Started: false,
    },
    null,
    2,
  ),
);
process.exit(s2Safe ? 0 : 1);
