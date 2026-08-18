/**
 * P0-F / C4 / C5 tests — Staging only. Disposable QA rows, no customer data.
 * node scripts/verify-p0-token-scope-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes, randomUUID } from 'crypto';

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
  const tokenA = randomBytes(32).toString('hex');
  const tokenB = randomBytes(32).toString('hex');
  const examTokenA = randomBytes(24).toString('hex');
  const examTokenB = randomBytes(24).toString('hex');
  let declA = null;
  let declB = null;
  let examA = null;
  let examB = null;

  try {
    const insDeclA = await admin.from('driver_declarations').insert({
      driver_id: randomUUID(),
      driver_name: 'QA P0-F A',
      company_name: 'QA-P0-F',
      declaration_text: 'QA fixture — not customer data',
      status: 'pending',
      token: tokenA,
    }).select('id, token').single();
    const insDeclB = await admin.from('driver_declarations').insert({
      driver_id: randomUUID(),
      driver_name: 'QA P0-F B',
      company_name: 'QA-P0-F-OTHER',
      declaration_text: 'QA fixture B — not customer data',
      status: 'pending',
      token: tokenB,
    }).select('id, token').single();
    declA = insDeclA.data;
    declB = insDeclB.data;
    rec(tests, 'D1', 'inserted disposable declaration fixtures', Boolean(declA?.id && declB?.id), {
      error: insDeclA.error?.message || insDeclB.error?.message,
    });

    const { data: anonAll, error: anonAllErr } = await anon.from('driver_declarations').select('id');
    rec(
      tests,
      'D2',
      'anon cannot SELECT all driver_declarations',
      Boolean(anonAllErr) || !anonAll?.length,
      { error: anonAllErr?.message, count: anonAll?.length ?? null },
    );

    const { data: anonEq, error: anonEqErr } = await anon
      .from('driver_declarations')
      .select('id, token, declaration_text')
      .eq('token', tokenA);
    rec(
      tests,
      'D3',
      'anon table SELECT by token does not return rows',
      Boolean(anonEqErr) || !anonEq?.length,
      { error: anonEqErr?.message, count: anonEq?.length ?? null },
    );

    const { data: rpcOk, error: rpcOkErr } = await anon.rpc('get_declaration_by_token', { p_token: tokenA });
    const rpcRow = Array.isArray(rpcOk) ? rpcOk[0] : rpcOk;
    rec(tests, 'D4', 'valid token RPC returns the matching declaration', Boolean(!rpcOkErr && rpcRow?.id === declA.id), {
      error: rpcOkErr?.message,
      gotId: rpcRow?.id,
    });

    const { data: rpcWrong } = await anon.rpc('get_declaration_by_token', { p_token: tokenA });
    const wrongRows = Array.isArray(rpcWrong) ? rpcWrong : rpcWrong ? [rpcWrong] : [];
    rec(
      tests,
      'D5',
      'valid token RPC does not leak other declarations',
      wrongRows.length <= 1 && wrongRows.every((r) => r.id === declA.id),
      { count: wrongRows.length },
    );

    const { data: rpcMiss, error: rpcMissErr } = await anon.rpc('get_declaration_by_token', {
      p_token: '0'.repeat(32),
    });
    const missRow = Array.isArray(rpcMiss) ? rpcMiss[0] : rpcMiss;
    rec(tests, 'D6', 'wrong token RPC returns no row', Boolean(!rpcMissErr && !missRow), {
      error: rpcMissErr?.message,
    });

    const { data: upd, error: updErr } = await anon
      .from('driver_declarations')
      .update({ status: 'signed', signature_url: 'hack' })
      .eq('id', declB.id)
      .select('id');
    rec(
      tests,
      'D7',
      'anon table UPDATE of another row fails',
      Boolean(updErr) || !upd?.length,
      { error: updErr?.message, count: upd?.length ?? null },
    );

    const { data: signed, error: signErr } = await anon.rpc('sign_declaration_by_token', {
      p_token: tokenA,
      p_signature_url: 'declarations/qa-p0f-sig.png',
    });
    const signedRow = Array.isArray(signed) ? signed[0] : signed;
    rec(tests, 'D8', 'valid token can sign its own declaration', Boolean(!signErr && signedRow?.status === 'signed'), {
      error: signErr?.message,
      status: signedRow?.status,
    });

    const insExamA = await admin.from('driving_exams').insert({
      driver_id: randomUUID(),
      driver_name: 'QA P0-F Exam A',
      company_name: 'QA-P0-F',
      questions: [],
      status: 'sent',
      token: examTokenA,
    }).select('id, token').single();
    const insExamB = await admin.from('driving_exams').insert({
      driver_id: randomUUID(),
      driver_name: 'QA P0-F Exam B',
      company_name: 'QA-P0-F-OTHER',
      questions: [],
      status: 'sent',
      token: examTokenB,
    }).select('id, token').single();
    examA = insExamA.data;
    examB = insExamB.data;
    rec(tests, 'E1', 'inserted disposable exam fixtures', Boolean(examA?.id && examB?.id), {
      error: insExamA.error?.message || insExamB.error?.message,
    });

    const { data: examAll, error: examAllErr } = await anon.from('driving_exams').select('id');
    rec(
      tests,
      'E2',
      'anon cannot SELECT all driving_exams',
      Boolean(examAllErr) || !examAll?.length,
      { error: examAllErr?.message, count: examAll?.length ?? null },
    );

    const { data: examRpc, error: examRpcErr } = await anon.rpc('get_driving_exam_by_token', {
      p_token: examTokenA,
    });
    const examRow = Array.isArray(examRpc) ? examRpc[0] : examRpc;
    rec(tests, 'E3', 'valid exam token RPC returns matching exam', Boolean(!examRpcErr && examRow?.id === examA.id), {
      error: examRpcErr?.message,
    });

    const { data: examUpd, error: examUpdErr } = await anon
      .from('driving_exams')
      .update({ status: 'completed', score: 100 })
      .eq('id', examB.id)
      .select('id');
    rec(
      tests,
      'E4',
      'anon table UPDATE of another exam fails',
      Boolean(examUpdErr) || !examUpd?.length,
      { error: examUpdErr?.message, count: examUpd?.length ?? null },
    );

    const { data: submitted, error: subErr } = await anon.rpc('submit_driving_exam_by_token', {
      p_token: examTokenA,
      p_answers: [],
      p_score: 80,
      p_correct_count: 8,
      p_total_questions: 10,
      p_passed: true,
      p_category_breakdown: {},
      p_signature_url: 'data:image/png;base64,qa',
    });
    const subRow = Array.isArray(submitted) ? submitted[0] : submitted;
    rec(tests, 'E5', 'valid exam token can submit its own exam', Boolean(!subErr && subRow?.status === 'completed'), {
      error: subErr?.message,
      status: subRow?.status,
    });
  } finally {
    if (declA?.id) await admin.from('driver_declarations').delete().eq('id', declA.id);
    if (declB?.id) await admin.from('driver_declarations').delete().eq('id', declB.id);
    if (examA?.id) await admin.from('driving_exams').delete().eq('id', examA.id);
    if (examB?.id) await admin.from('driving_exams').delete().eq('id', examB.id);
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : { findings: [], environment: 'staging' };
  const finding = {
    id: 'C4-C5',
    code: 'P0-F',
    title: 'driver_declarations / driving_exams anon USING(true)',
    rootCause: 'Anon SELECT/UPDATE policies used USING(true); client .eq(token) is not an RLS bound.',
    changeMade: 'Dropped anon USING(true) policies; added SECURITY DEFINER token RPCs; SignDeclaration and TakeDrivingExam use RPCs.',
    files: [
      'supabase/migrations/20260818221000_p0_token_scope_declarations_exams.sql',
      'src/lib/tokenScopedAccess.ts',
      'src/pages/SignDeclaration.tsx',
      'src/pages/TakeDrivingExam.tsx',
      'src/components/driving-exam/ExamRunner.tsx',
    ],
    tests,
    testResult: failed.length === 0 ? 'PASS' : 'FAIL',
    testedAt: new Date().toISOString(),
  };
  report.findings = [...(report.findings || []).filter((f) => f.id !== 'C4-C5'), finding];
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
