/**
 * STAGING Claims only. Soft-delete proven TEST/DEMO/QA claims.
 * Never Gmail mailbox. Never Production. Never DAL-2026-0020 / real clients.
 *
 * Usage:
 *   node scripts/claims-test-demo-clean-staging.mjs            # worker-visible TEST only
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=... node scripts/claims-test-demo-clean-staging.mjs --admin
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused production');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-four-closeout-2026-09-06');
mkdirSync(OUT, { recursive: true });

const PROTECTED_IDS = new Set([
  'DAL-2026-0020',
  'DAL-2026-0014',
  'DAL-2026-0017',
  'DAL-2026-0001',
]);
const PROTECTED_NAME = /אליהו|אטיאס|מנחם|דליה(?!\s*QA)/;

function proof(row) {
  const rd = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
  const client = String(row.client_name || rd.clientName || '');
  const by = String(row.created_by_name || rd.createdByName || '');
  const source = String(rd.source || '');
  const reasons = [];
  if (String(row.id).startsWith('DAL-QA-')) reasons.push('id DAL-QA-*');
  if (/^TEST-|^TEST |TEST-CLOSEOUT|TEST-CLAIMS|TEST-INTAKE|TEST-CLAIMS-ISOLATION/i.test(client)) reasons.push(`client ${client}`);
  if (rd.qa === true || rd.qa === 'true') reasons.push('row_data.qa');
  if (/^QA$|TEST-CLAIMS-WORKER|TEST עובד תביעות|QA-CLOSEOUT/i.test(by)) reasons.push(`created_by ${by}`);
  if (source === 'create-user-claims-worker') reasons.push('source create-user-claims-worker');
  if (PROTECTED_IDS.has(row.id) || PROTECTED_NAME.test(client)) return { ok: false, reasons: ['PROTECTED'] };
  if (rd.deletedAt) return { ok: false, reasons: ['already soft-deleted'] };
  return { ok: reasons.length > 0, reasons, client, by, source };
}

const adminKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
const anon = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const useAdmin = process.argv.includes('--admin') && adminKey.length > 40;
const db = createClient(`https://${STAGING_REF}.supabase.co`, useAdmin ? adminKey : anon, { auth: { autoRefreshToken: false, persistSession: false } });
if (!useAdmin) {
  const { data, error } = await db.auth.signInWithPassword({
    email: 'qa.claims.worker.1788292403067@futurecraft.staging',
    password: 'QaWorker2026!',
  });
  if (error || !data.session) throw error || new Error('worker login failed');
  db.auth.setSession(data.session);
}

const { data: rows, error } = await db.from('claims_records').select('id, client_name, status, plate, created_by_name, row_data, created_at');
if (error) throw error;

const classified = (rows || []).map((r) => {
  const p = proof(r);
  return {
    id: r.id,
    client: p.client || r.client_name,
    status: r.status,
    plate: r.plate,
    created_by_name: r.created_by_name,
    created_at: r.created_at,
    deletedAt: r.row_data?.deletedAt || '',
    decide: p.ok ? 'TEST_DELETE' : (p.reasons.includes('PROTECTED') ? 'REAL_KEEP' : (p.reasons.includes('already soft-deleted') ? 'ALREADY_GONE' : 'KEEP_UNCERTAIN')),
    reasons: p.reasons,
  };
});

const toDelete = classified.filter((x) => x.decide === 'TEST_DELETE');
const restore = {
  at: new Date().toISOString(),
  mode: useAdmin ? 'admin' : 'worker-visible',
  productionTouched: false,
  gmailMailboxMutated: false,
  note: 'Soft-delete only (row_data.deletedAt). Documents/mail/history rows stay. Gmail mailbox untouched.',
  classified,
  toDelete,
};
writeFileSync(join(OUT, useAdmin ? 'restore-point-admin.json' : 'restore-point-worker.json'), JSON.stringify(restore, null, 2));
console.log(JSON.stringify({ mode: restore.mode, visible: classified.length, toDelete: toDelete.map((x) => x.id), keep: classified.filter((x) => x.decide !== 'TEST_DELETE').map((x) => ({ id: x.id, decide: x.decide, client: x.client })) }, null, 2));

const nowIso = new Date().toISOString();
const nowHe = new Date().toLocaleString('he-IL');
const deleted = [];
for (const item of toDelete) {
  const { data: live, error: le } = await db.from('claims_records').select('id, client_name, row_data').eq('id', item.id).maybeSingle();
  if (le || !live) throw le || new Error(`missing ${item.id}`);
  const again = proof(live);
  if (!again.ok) throw new Error(`refused ${item.id}: ${again.reasons.join(',')}`);
  const rd = { ...(live.row_data || {}), deletedAt: nowIso, treatmentPending: '', treatmentPendingAction: '' };
  const { error: up } = await db.from('claims_records').update({ row_data: rd }).eq('id', item.id);
  if (up) throw up;
  const hid = `HIS-QADEL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.from('claims_history').insert({
    id: hid,
    claim_id: item.id,
    row_data: {
      action: 'תיק נמחק (soft delete)',
      note: 'TEST/DEMO/QA closeout · לא נמחקו מסמכים/מיילים/Gmail',
      type: 'delete',
      at: nowHe,
      by: useAdmin ? 'staging-admin-clean' : 'qa-worker-clean',
    },
  });
  deleted.push({ id: item.id, client: item.client, reasons: item.reasons });
}

const { data: after } = await db.from('claims_records').select('id, client_name, row_data');
const visible = (after || []).filter((r) => !r.row_data?.deletedAt);
const leftoverTest = visible.filter((r) => proof(r).ok);
const result = {
  at: new Date().toISOString(),
  mode: restore.mode,
  deletedCount: deleted.length,
  deleted,
  leftoverTestVisible: leftoverTest.map((r) => ({ id: r.id, client: r.client_name })),
  visibleRemaining: visible.map((r) => ({ id: r.id, client: r.client_name })),
  gmailMailboxMutated: false,
  productionTouched: false,
};
writeFileSync(join(OUT, useAdmin ? 'clean-admin.json' : 'clean-worker.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (leftoverTest.length) process.exit(2);
