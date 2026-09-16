import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCase, type GarageCustomer, type GarageVehicle } from './garageBook';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), profile: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: mocks.getUser }, from: mocks.from },
}));

const input = {
  customer: { id: 'customer', name: 'QA', shop_company_name: 'shop-a' } as GarageCustomer,
  vehicle: { id: 'vehicle', plate: '1234567', shop_company_name: 'shop-a' } as GarageVehicle,
  actor: { id: 'garage-user', full_name: 'Garage user', company_name: 'shop-a' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'garage-user' } }, error: null });
  mocks.profile.mockResolvedValue({ data: { full_name: 'Actual admin' }, error: null });
  mocks.insert.mockImplementation((payload) => ({ select: () => ({ single: async () => ({ data: { id: 'case', ...payload }, error: null }) }) }));
  mocks.from.mockImplementation((table) => table === 'profiles'
    ? { select: () => ({ eq: () => ({ single: mocks.profile }) }) }
    : { insert: mocks.insert });
});

describe('garage case authenticated author', () => {
  it('preserves direct garage login and tenant payload', async () => {
    await createCase(input);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      opened_by: 'garage-user', opened_by_name: 'Garage user',
      shop_company_name: 'shop-a', customer_id: 'customer', vehicle_id: 'vehicle',
    }));
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it('uses the real authenticated author during impersonation without changing the shop', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-admin' } }, error: null });
    await createCase(input);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      opened_by: 'real-admin', opened_by_name: 'Actual admin', shop_company_name: 'shop-a',
    }));
  });

  it('does not insert when authentication is absent or fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    await expect(createCase(input)).rejects.toThrow('אין משתמש מאומת');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not attribute an impersonated name when the real profile cannot be read', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'real-admin' } }, error: null });
    mocks.profile.mockResolvedValue({ data: null, error: new Error('denied') });
    await expect(createCase(input)).rejects.toThrow('לא ניתן לאמת');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('propagates RLS rejection without retrying or changing the tenant', async () => {
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: null,
      error: { code: '42501', message: 'new row violates row-level security policy for table garage_cases' },
    }) }) });
    await expect(createCase(input)).rejects.toThrow('row-level security');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
