/**
 * S1 ONLY — Production backup + read-only snapshot.
 * Does not replace live dist, does not migrate, does not drop policies.
 * node scripts/s1-production-backup-readonly.mjs
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const VPS = 'dalia-vps';
const WRITE = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy|vacuum|reindex|cluster|security|notify|listen)\b/i;
const OUT = join(process.cwd(), 'public/project-001/production-s1-backup-report.json');

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
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-s1-ro');
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

const report = {
  id: 'production-s1-backup',
  at: new Date().toISOString(),
  step: 'S1',
  productionChanged: false,
  liveSiteReplaced: false,
  deployDone: false,
  s2Started: false,
};

try {
  report.sshProbe = ssh('echo S1_SSH_OK; test -f /root/future-craft-core/dist/index.html && echo LIVE_INDEX_OK').trim();
} catch (e) {
  report.sshProbeError = String(e.stderr || e.message || e).slice(0, 500);
}

const remoteBackup = `
set -e
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
BACKUP=/root/s1-safety-backup-$STAMP.tgz
LIVE=/root/future-craft-core/dist/index.html
test -f "$LIVE"
if [ -d /root/future-craft-core/site-static ]; then
  tar czf "$BACKUP" -C /root/future-craft-core dist site-static
else
  tar czf "$BACKUP" -C /root/future-craft-core dist
fi
test -f "$BACKUP"
BYTES=$(wc -c < "$BACKUP")
FILES=$(tar tzf "$BACKUP" | wc -l)
HAS_INDEX=$(tar tzf "$BACKUP" | grep -c 'dist/index.html$' || true)
BUNDLE=$(grep -oE 'assets/index-[^" ]+\\.js' "$LIVE" | awk 'NR==1{print; exit}' || true)
SHA=$(sha256sum "$BACKUP" | awk '{print $1}')
rm -rf /tmp/s1-restore-verify
mkdir -p /tmp/s1-restore-verify
tar xzf "$BACKUP" -C /tmp/s1-restore-verify
test -f /tmp/s1-restore-verify/dist/index.html
RESTORE_OK=yes
rm -rf /tmp/s1-restore-verify
test -f "$LIVE"
echo BACKUP_PATH=$BACKUP
echo BACKUP_STAMP=$STAMP
echo BACKUP_BYTES=$BYTES
echo BACKUP_FILES=$FILES
echo BACKUP_HAS_INDEX=$HAS_INDEX
echo BACKUP_SHA256=$SHA
echo LIVE_BUNDLE=$BUNDLE
echo RESTORE_TEST=$RESTORE_OK
echo LIVE_STILL_PRESENT=yes
`.trim();

try {
  if (!report.sshProbeError) {
    report.vpsBackupRaw = ssh(remoteBackup).trim();
    const kv = {};
    for (const line of String(report.vpsBackupRaw).split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
    }
    report.vpsBackup = kv;
  }
} catch (e) {
  report.vpsBackupError = String(e.stderr || e.message || e).slice(0, 800);
}

try {
  report.buckets = dbQuery('SELECT id, public FROM storage.buckets ORDER BY 1');
} catch (e) {
  report.bucketsError = String(e.message || e).slice(0, 400);
}

try {
  report.fileCountsByBucket = dbQuery(
    'SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1',
  );
} catch (e) {
  report.fileCountsError = String(e.message || e).slice(0, 400);
}

try {
  report.c4AndDocumentPolicies = dbQuery(`
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE (
      schemaname = 'public'
      AND tablename IN ('driver_declarations', 'driving_exams')
    )
    OR (
      schemaname = 'storage'
      AND (
        policyname IN (
          'Anonymous can view by token',
          'Anonymous can update by token',
          'Anon view exam by token',
          'Anon submit exam by token',
          'Anonymous can view declaration signatures',
          'Anonymous can upload declaration signatures',
          'documents_read_public',
          'public_read_documents',
          'Authenticated users can view documents',
          'Authenticated users can upload documents'
        )
        OR policyname ILIKE '%document%'
        OR policyname ILIKE '%declaration%'
      )
    )
    ORDER BY 1, 2, 3
  `);
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

report.requiredRpcs = [
  'get_declaration_by_token',
  'sign_declaration_by_token',
  'get_driving_exam_by_token',
  'start_driving_exam_by_token',
  'submit_driving_exam_by_token',
];
report.rpcsPresent = (report.rpcs || []).map((r) => r.name);
report.rpcsMissing = report.requiredRpcs.filter((n) => !report.rpcsPresent.includes(n));
report.productionUnchanged = {
  code: true,
  database: true,
  rls: true,
  storagePolicies: true,
  bucketPublicFlagNotChanged: true,
  documentsNotOpened: true,
  customersNotChanged: true,
  liveDistNotReplaced: true,
};
report.ok = Boolean(report.vpsBackup?.BACKUP_PATH) && report.vpsBackup?.BACKUP_HAS_INDEX !== '0' && !report.vpsBackupError;

mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT,
  ok: report.ok,
  backup: report.vpsBackup || null,
  sshError: report.sshProbeError || null,
  vpsError: report.vpsBackupError || null,
  fileCountsByBucket: report.fileCountsByBucket || null,
  rpcsMissing: report.rpcsMissing,
  productionChanged: false,
}, null, 2));
process.exit(report.ok ? 0 : 1);
