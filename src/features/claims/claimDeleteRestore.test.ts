import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

/** Minimal in-memory stand-in for the supabase query builder used by claimsService. */
function from(table: string) {
  const rows = () => (db[table] ||= []);
  let filters: Array<(r: Row) => boolean> = [];
  let patch: Row | null = null;
  const pick = () => rows().filter((r) => filters.every((f) => f(r)));
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return builder; },
    not: (k: string, op: string, v: unknown) => {
      const json = k.match(/^(\w+)->>(\w+)$/);
      filters.push((r) => {
        const val = json ? (r[json[1]] as Row | null)?.[json[2]] : r[k];
        return op === 'is' && v === null ? val !== undefined && val !== null : true;
      });
      return builder;
    },
    update: (p: Row) => { patch = p; return builder; },
    insert: (p: Row) => { rows().push(p); return Promise.resolve({ data: null, error: null }); },
    upsert: (p: Row) => { rows().push(p); return Promise.resolve({ data: null, error: null }); },
    delete: () => builder,
    maybeSingle: () => Promise.resolve({ data: pick()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (patch) { pick().forEach((r) => Object.assign(r, patch)); patch = null; }
      const out = { data: pick(), error: null };
      filters = [];
      return Promise.resolve(out).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => from(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));

const { createClaimsApi, isCustomerSubmittedClaim } = await import('./claimsService');

const listIds = async (api: ReturnType<typeof createClaimsApi>) => ((await api.getClaims()).data || []).map((c) => c.id);

const actor = { id: 'u1', email: 'staff@example.test', full_name: 'Staff' } as never;

function seed(id: string, rowData: Row) {
  db.claims_records.push({ id, status: 'תביעה חדשה – התקבלה', client_name: 'לקוח', plate: '1', row_data: { id, ...rowData } });
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.claims_records = [];
});

describe('isCustomerSubmittedClaim', () => {
  it('detects signed intake, completed upload or customer intake source', () => {
    expect(isCustomerSubmittedClaim({ signedAt: '2026-10-20T07:40:18Z' })).toBe(true);
    expect(isCustomerSubmittedClaim({ completedByCustomerAt: '2026-10-20T07:48:08Z' })).toBe(true);
    expect(isCustomerSubmittedClaim({ source: 'Customer Accident Intake' })).toBe(true);
    expect(isCustomerSubmittedClaim({ source: 'staff' })).toBe(false);
    expect(isCustomerSubmittedClaim({})).toBe(false);
  });
});

describe('soft delete guard', () => {
  it('refuses to delete a customer-submitted claim without explicit approval', async () => {
    seed('DAL-T-1', { signedAt: '2026-10-20T07:40:18Z' });
    const api = createClaimsApi(actor);
    const r = await api.softDeleteClaim('DAL-T-1', 'מחק');
    expect(r.success).toBe(false);
    expect('code' in r && r.code).toBe('customer_submitted');
    expect((db.claims_records[0].row_data as Row).deletedAt).toBeUndefined();
  });

  it('deletes a customer-submitted claim when explicitly allowed', async () => {
    seed('DAL-T-2', { signedAt: '2026-10-20T07:40:18Z' });
    const api = createClaimsApi(actor);
    const r = await api.softDeleteClaim('DAL-T-2', 'מחק', { allowCustomerSubmitted: true });
    expect(r.success).toBe(true);
    expect((db.claims_records[0].row_data as Row).deletedAt).toBeTruthy();
  });

  it('still deletes ordinary staff drafts', async () => {
    seed('DAL-T-3', { source: 'staff' });
    const r = await createClaimsApi(actor).softDeleteClaim('DAL-T-3', 'מחק');
    expect(r.success).toBe(true);
  });
});

describe('deleted claims view and restore', () => {
  it('lists only deleted claims and restores one without touching other fields', async () => {
    seed('DAL-T-4', { deletedAt: '2026-10-22T10:47:43.661Z', clientName: 'לקוח א', signedAt: 'x', insCompany: 'ליברה' });
    seed('DAL-T-5', { clientName: 'לקוח ב' });
    const api = createClaimsApi(actor);

    const deleted = await api.getDeletedClaims();
    expect(deleted.map((c) => c.id)).toEqual(['DAL-T-4']);
    expect(await listIds(api)).toEqual(['DAL-T-5']);

    const r = await api.restoreDeletedClaim('DAL-T-4');
    expect(r.success).toBe(true);
    const rd = db.claims_records[0].row_data as Row;
    expect('deletedAt' in rd).toBe(false);
    expect(rd).toMatchObject({ clientName: 'לקוח א', signedAt: 'x', insCompany: 'ליברה' });
    expect((await listIds(api)).sort()).toEqual(['DAL-T-4', 'DAL-T-5']);
    expect(db.claims_history.some((h) => (h.row_data as Row).action === 'שוחזר ממחיקה')).toBe(true);
  });

  it('refuses to restore a claim that is not deleted', async () => {
    seed('DAL-T-6', {});
    const r = await createClaimsApi(actor).restoreDeletedClaim('DAL-T-6');
    expect(r.success).toBe(false);
  });
});
