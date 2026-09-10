import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const result = Promise.resolve({ data: [], error: null });
  const query = {
    order: () => result,
    eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    then: result.then.bind(result),
  };
  return {
    supabase: {
      from: () => ({ select: () => query }),
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', role: 'fleet_manager', full_name: 'QA', company_name: 'QA Co' },
  }),
}));

vi.mock('@/hooks/useCompanyFilter', () => ({
  useCompanyFilter: () => 'QA Co',
  applyCompanyScope: (q: unknown) => q,
}));

import VehicleInspections from '@/pages/VehicleInspections';

describe('VehicleInspections black-screen fix', () => {
  it('renders the existing inspections screen instead of crashing', async () => {
    render(
      <MemoryRouter initialEntries={['/vehicle-inspections?vehicleId=abc']}>
        <VehicleInspections />
      </MemoryRouter>,
    );
    expect(screen.getByText('ביקורת רכב')).toBeTruthy();
  });
});
