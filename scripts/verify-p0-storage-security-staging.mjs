/**
 * P0-A storage security tests — Staging only.
 * Uses disposable QA users (@example.invalid). Does not read customer documents.
 *
 * node scripts/verify-p0-storage-security-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'public/project-001/security-remediation-staging.json');

function abortIfProduction(haystack, label) {
  const text = String(haystack || '');
  if (text.includes(PROD_REF) || text.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

function rec(tests, id, name, ok, detail = {}) {
  tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function getKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  abortIfProduction(raw, 'api-keys');
  const keys = JSON.parse(raw);
  return {
    service:
      keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'service_role')?.api_key,
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tests = [];
  const stamp = Date.now();
  const password = `QaP0_${randomBytes(12).toString('hex')}!`;
  const emailA = `qa-p0-a-${stamp}@example.invalid`;
  const emailB = `qa-p0-b-${stamp}@example.invalid`;
  let userA = null;
  let userB = null;
  const probePathA = [];

  try {
    const { data: bucket, error: bErr } = await admin.storage.getBucket('documents');
    rec(tests, 'S1', 'documents bucket is private', !bErr && bucket?.public === false, {
      public: bucket?.public,
      error: bErr?.message,
    });

    const { data: listed, error: listErr } = await anon.storage.from('documents').list('', { limit: 10 });
    rec(tests, 'S2', 'anonymous cannot list documents bucket', Boolean(listErr) || !listed?.length, {
      error: listErr?.message || null,
      count: listed?.length ?? null,
      note: listErr ? 'list rejected' : `list returned ${listed?.length || 0} items`,
    });

    const createdA = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA P0 A', company_name: 'QA-P0-A' },
    });
    const createdB = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA P0 B', company_name: 'QA-P0-B' },
    });
    userA = createdA.data?.user;
    userB = createdB.data?.user;
    rec(tests, 'S3', 'created disposable QA users', Boolean(userA?.id && userB?.id), {
      error: createdA.error?.message || createdB.error?.message,
    });

    if (userA?.id && userB?.id) {
      await admin.from('profiles').upsert({
        id: userA.id,
        email: emailA,
        full_name: 'QA P0 A',
        company_name: 'QA-P0-A',
        is_active: true,
      });
      await admin.from('profiles').upsert({
        id: userB.id,
        email: emailB,
        full_name: 'QA P0 B',
        company_name: 'QA-P0-B',
        is_active: true,
      });
      await admin.from('user_roles').insert({ user_id: userA.id, role: 'fleet_manager' });
      await admin.from('user_roles').insert({ user_id: userB.id, role: 'fleet_manager' });

      const pathA = `${userA.id}/misc/p0-probe-${stamp}.png`;
      probePathA.push(pathA);
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const { error: upErr } = await admin.storage.from('documents').upload(pathA, png, {
        contentType: 'image/png',
        upsert: false,
      });
      rec(tests, 'S4', 'uploaded disposable probe under user A uid folder', !upErr, {
        error: upErr?.message,
      });

      const { data: anonListUid, error: anonListUidErr } = await anon.storage
        .from('documents')
        .list(userA.id, { limit: 20 });
      rec(
        tests,
        'S4b',
        'anonymous cannot list user A folder',
        Boolean(anonListUidErr) || !anonListUid?.length,
        { error: anonListUidErr?.message, count: anonListUid?.length ?? null },
      );

      const publicUrl = `${STAGING_URL}/storage/v1/object/public/documents/${pathA}`;
      const publicRes = await fetch(publicUrl);
      rec(tests, 'S5', 'old public URL cannot download probe', publicRes.status >= 400, {
        status: publicRes.status,
      });

      const { data: anonDl, error: anonDlErr } = await anon.storage.from('documents').download(pathA);
      rec(tests, 'S6', 'anonymous cannot download probe', Boolean(anonDlErr) || !anonDl, {
        error: anonDlErr?.message,
      });

      const clientA = createClient(STAGING_URL, keys.anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const clientB = createClient(STAGING_URL, keys.anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signA = await clientA.auth.signInWithPassword({ email: emailA, password });
      const signB = await clientB.auth.signInWithPassword({ email: emailB, password });
      rec(tests, 'S7', 'QA users can sign in', Boolean(signA.data?.session && signB.data?.session), {
        error: signA.error?.message || signB.error?.message,
      });

      const signedA = await clientA.storage.from('documents').createSignedUrl(pathA, 900);
      rec(tests, 'S8', 'company A user can create signed URL for own file', Boolean(signedA.data?.signedUrl), {
        error: signedA.error?.message,
      });
      if (signedA.data?.signedUrl) {
        const okRes = await fetch(signedA.data.signedUrl);
        rec(tests, 'S9', 'company A signed URL downloads own file', okRes.ok, { status: okRes.status });
      } else {
        rec(tests, 'S9', 'company A signed URL downloads own file', false, { error: 'no signed url' });
      }

      const signedB = await clientB.storage.from('documents').createSignedUrl(pathA, 900);
      let bFetched = false;
      if (signedB.data?.signedUrl) {
        const bRes = await fetch(signedB.data.signedUrl);
        bFetched = bRes.ok;
      }
      rec(
        tests,
        'S10',
        'company B cannot download company A probe',
        Boolean(signedB.error) || !bFetched,
        { error: signedB.error?.message, leaked: bFetched },
      );

      const short = await admin.storage.from('documents').createSignedUrl(pathA, 1);
      if (short.data?.signedUrl) {
        await sleep(2500);
        const expiredRes = await fetch(short.data.signedUrl);
        rec(tests, 'S11', 'expired signed URL fails', expiredRes.status >= 400, {
          status: expiredRes.status,
        });
      } else {
        rec(tests, 'S11', 'expired signed URL fails', false, { error: short.error?.message });
      }
    }
  } finally {
    for (const p of probePathA) {
      await admin.storage.from('documents').remove([p]);
    }
    if (userA?.id) {
      await admin.from('user_roles').delete().eq('user_id', userA.id);
      await admin.from('profiles').delete().eq('id', userA.id);
      await admin.auth.admin.deleteUser(userA.id);
    }
    if (userB?.id) {
      await admin.from('user_roles').delete().eq('user_id', userB.id);
      await admin.from('profiles').delete().eq('id', userB.id);
      await admin.auth.admin.deleteUser(userB.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : { findings: [], environment: 'staging' };
  const finding = report.findings?.find((f) => f.id === 'C1') || { id: 'C1' };
  finding.tests = tests;
  finding.testResult = failed.length === 0 ? 'PASS' : 'FAIL';
  finding.testedAt = new Date().toISOString();
  report.findings = [...(report.findings || []).filter((f) => f.id !== 'C1'), finding];
  report.updatedAt = new Date().toISOString();
  report.productionTouched = false;
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ failed: failed.length, tests }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
