// Fictitious data only. Fake task table: list and insert are async, insert enforces the primary key,
// so concurrent scans interleave the way they do against Postgres.
import { describe, expect, it } from 'vitest';
import {
  insertMailTaskOnce,
  isOpenTask,
  mailTaskScope,
  type TaskRow,
  type TasksDb,
} from '../../../docs/audit-reports/claims-gmail-deploy-prep-2026-10-14/dedupe/claims-gmail/mailTaskDedupe';

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeDb(seed: TaskRow[] = []) {
  const rows: Array<TaskRow & { claim_id: string }> = seed.map((t) => ({ ...t, claim_id: 'C1' }));
  const db: TasksDb & { rows: typeof rows } = {
    rows,
    async listTasks(claimId) {
      await tick();
      return rows.filter((r) => r.claim_id === claimId).map((r) => ({ id: r.id, row_data: { ...(r.row_data as object) } }));
    },
    async insertTask(id, claimId, row) {
      await tick();
      if (rows.some((r) => r.id === id)) return { error: { code: '23505', message: 'duplicate key' } };
      rows.push({ id, claim_id: claimId, row_data: row });
      return { error: null };
    },
  };
  return db;
}

// One email asking for one request, the way ensureMailTasks calls it.
function mail(db: TasksDb, type: string, messageId: string, threadId = 'TH-1', claimId = 'C1') {
  return insertMailTaskOnce(
    db,
    { claimId, type, threadId, messageId, mailIdem: `mail:${messageId}:${type}` },
    (id) => ({ id, claimId, requestType: type, gmailMessageId: messageId, gmailThreadId: threadId, mailIdem: `mail:${messageId}:${type}`, done: 'false', workStatus: 'waiting_doc' }),
  );
}

const FIVE = ['no_claim_form', 'driver_license', 'vehicle_license', 'surveyor_report', 'garage_invoice'];
const open = (db: ReturnType<typeof fakeDb>, type?: string) =>
  db.rows.filter((r) => isOpenTask(r.row_data as Record<string, unknown>) && (!type || (r.row_data as Record<string, string>).requestType === type));

describe('claims-gmail: one open task per request', () => {
  it('the same email imported again does not add a task', async () => {
    const db = fakeDb();
    expect((await mail(db, 'driver_license', 'M1')).status).toBe('created');
    expect(await mail(db, 'driver_license', 'M1')).toMatchObject({ status: 'same_mail' });
    expect(db.rows).toHaveLength(1);
  });

  it('seven emails in one thread asking for the same five documents → five tasks, not 35', async () => {
    const db = fakeDb();
    for (let m = 1; m <= 7; m++) for (const t of FIVE) await mail(db, t, `M${m}`);
    expect(db.rows).toHaveLength(5);
    expect(new Set(db.rows.map((r) => (r.row_data as Record<string, string>).requestType))).toEqual(new Set(FIVE));
  });

  it('another thread asking for the same named document still finds the open task', async () => {
    const db = fakeDb();
    await mail(db, 'surveyor_report', 'M1', 'TH-1');
    expect(await mail(db, 'surveyor_report', 'M2', 'TH-2')).toMatchObject({ status: 'open_exists' });
    expect(db.rows).toHaveLength(1);
  });

  it('running the scan again over the same emails adds nothing', async () => {
    const db = fakeDb();
    const scan = async () => { for (const m of ['M1', 'M2', 'M3']) for (const t of FIVE) await mail(db, t, m); };
    await scan();
    await scan();
    await scan();
    expect(db.rows).toHaveLength(5);
  });

  it('two or five scans at the same time over the same email → one task', async () => {
    const db = fakeDb();
    const res = await Promise.all([1, 2].map(() => mail(db, 'garage_invoice', 'M1')));
    expect(res.filter((r) => r.status === 'created')).toHaveLength(1);
    await Promise.all([1, 2, 3, 4, 5].map(() => mail(db, 'driver_license', 'M1')));
    expect(db.rows).toHaveLength(2);
  });

  it('parallel scans over different emails of the same claim → one task per request', async () => {
    const db = fakeDb();
    await Promise.all(['M1', 'M2', 'M3', 'M4'].flatMap((m) => FIVE.map((t) => mail(db, t, m))));
    for (const t of FIVE) expect(open(db, t)).toHaveLength(1);
    expect(db.rows).toHaveLength(5);
  });

  it('different documents are separate tasks, even with similar names', async () => {
    const db = fakeDb();
    await mail(db, 'driver_license', 'M1');
    await mail(db, 'vehicle_license', 'M1');
    expect(db.rows).toHaveLength(2);
  });

  it('other claims are not affected', async () => {
    const db = fakeDb();
    await mail(db, 'driver_license', 'M1', 'TH-1', 'C1');
    expect((await mail(db, 'driver_license', 'M9', 'TH-9', 'C2')).status).toBe('created');
    expect(db.rows).toHaveLength(2);
  });

  it('after the task is closed, a new request opens a new task', async () => {
    const db = fakeDb();
    await mail(db, 'policy', 'M1');
    (db.rows[0].row_data as Record<string, string>).done = 'true';
    const again = await mail(db, 'policy', 'M2');
    expect(again.status).toBe('created');
    expect(db.rows).toHaveLength(2);
    expect(db.rows[1].id).not.toBe(db.rows[0].id);
  });

  it('a cancelled task does not block a new request', async () => {
    const db = fakeDb();
    await mail(db, 'police', 'M1');
    (db.rows[0].row_data as Record<string, string>).workStatus = 'cancelled';
    expect((await mail(db, 'police', 'M2')).status).toBe('created');
  });

  it('an open task staff opened for the same request type blocks the twin; a free-text task does not', async () => {
    const staff = fakeDb([{ id: 'TSK-STAFF', row_data: { requestType: 'garage_invoice', action: 'חשבונית מוסך', done: 'false' } }]);
    expect(await mail(staff, 'garage_invoice', 'M1')).toMatchObject({ status: 'open_exists', id: 'TSK-STAFF' });
    const freeText = fakeDb([{ id: 'TSK-NOTE', row_data: { action: 'רישיון נהיגה', done: 'false' } }]);
    expect((await mail(freeText, 'driver_license', 'M1')).status).toBe('created');
  });

  it('generic requests are one per thread: a follow-up is the same, a new thread is new', async () => {
    const db = fakeDb();
    await mail(db, 'docs_generic', 'M1', 'TH-1');
    expect((await mail(db, 'docs_generic', 'M2', 'TH-1')).status).toBe('open_exists');
    expect((await mail(db, 'docs_generic', 'M3', 'TH-2')).status).toBe('created');
    expect((await mail(db, 'sign_return', 'M4', 'TH-2')).status).toBe('created');
    expect(db.rows).toHaveLength(3);
  });

  it('without a thread id, each email stands alone for generic requests', () => {
    expect(mailTaskScope('reply', '', 'M1')).toBe('message:M1:reply');
    expect(mailTaskScope('reply', '', 'M2')).not.toBe(mailTaskScope('reply', '', 'M1'));
    expect(mailTaskScope('driver_license', '', 'M1')).toBe('claim:driver_license');
  });

  it('a stale id after a deletion is retried, not reported as existing', async () => {
    const db = fakeDb();
    await mail(db, 'damage_photos', 'M1');
    (db.rows[0].row_data as Record<string, string>).done = 'true';
    await mail(db, 'damage_photos', 'M2');
    (db.rows[1].row_data as Record<string, string>).done = 'true';
    db.rows.splice(0, 1); // the first task was deleted
    const res = await mail(db, 'damage_photos', 'M3');
    expect(res.status).toBe('created');
    expect(open(db, 'damage_photos')).toHaveLength(1);
  });

  it('a database error is reported, not hidden as existing', async () => {
    const db = fakeDb();
    db.insertTask = async () => ({ error: { code: '42501', message: 'permission denied' } });
    expect(await mail(db, 'policy', 'M1')).toEqual({ status: 'failed', error: 'permission denied' });
  });
});
