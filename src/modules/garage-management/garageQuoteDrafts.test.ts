// The pending-quote store: the shop table when it exists; this device only while it does not.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));

import { createQuoteDraftStore, type QuoteDraftInput } from './garageQuoteDrafts';

const actor = { id: 'u1', full_name: 'עובד בדיקה', company_name: 'מוסך בדיקה', role: 'fleet_manager' } as never;
const input: QuoteDraftInput = {
  status: 'pending_approval', customer_name: 'רינה בדיקה', customer_phone: '', customer_id: null, vehicle_id: null,
  vehicle_plate: '7778889', vehicle_make: 'טויוטה', vehicle_model: 'יאריס', vehicle_year: 2018,
  works: [{ name: 'טיפול', qty: 1, price: 450 }], parts: [], extras_note: '', total_net: 450, case_id: null,
};

/** A chainable fake query that resolves to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['insert', 'update', 'select', 'eq', 'order', 'limit']) q[m] = vi.fn(() => q);
  q.single = vi.fn(async () => result);
  q.then = (res: (v: unknown) => void) => res(result);
  return q;
}

beforeEach(() => {
  localStorage.clear();
  from.mockReset();
});

describe('pending quotes store', () => {
  it('table not created yet → kept on this device, and says so', async () => {
    from.mockImplementation(() => query({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.garage_quote_drafts' in the schema cache" } }));
    const store = createQuoteDraftStore(actor);
    const saved = await store.save(input);
    expect(saved.storage).toBe('device');
    expect(saved.id.startsWith('local-')).toBe(true);
    const list = await store.list();
    expect(list.map((q) => q.customer_name)).toEqual(['רינה בדיקה']);
    const updated = await store.update(saved.id, { status: 'approved' });
    expect(updated.status).toBe('approved');
    expect((await store.list())).toHaveLength(1); // updated in place, never a second copy
  });

  it('table exists → saved in the shop table with the shop name and the worker', async () => {
    const row = { id: 'db-1', status: 'pending_approval', customer_name: 'רינה בדיקה', customer_phone: '', customer_id: null, vehicle_id: null, vehicle_plate: '7778889', case_id: null, draft: { works: input.works, total_net: 450 }, created_by_name: 'עובד בדיקה', created_at: 'x', updated_at: 'x' };
    const q = query({ data: row, error: null });
    from.mockImplementation(() => q);
    const saved = await createQuoteDraftStore(actor).save(input);
    expect(from).toHaveBeenCalledWith('garage_quote_drafts');
    expect((q.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ shop_company_name: 'מוסך בדיקה', created_by: 'u1', status: 'pending_approval', vehicle_plate: '7778889' });
    expect(saved).toMatchObject({ id: 'db-1', storage: 'system', total_net: 450 });
  });

  it('a real database error is reported, not hidden on the device', async () => {
    from.mockImplementation(() => query({ data: null, error: { code: '42501', message: 'permission denied' } }));
    await expect(createQuoteDraftStore(actor).save(input)).rejects.toThrow('permission denied');
    expect(localStorage.length).toBe(0);
  });
});
