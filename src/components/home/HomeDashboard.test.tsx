import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HomeDashboard from './HomeDashboard';

const authState = vi.hoisted(() => ({
  user: {
    id: 'fm-1',
    full_name: 'מנהל בדיקה',
    company_name: 'אכבים',
    role: 'fleet_manager',
    garageOps: false,
    hasClaimsAccess: false,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({
  useCompanyScope: () => ({ selectedCompany: null }),
}));

vi.mock('@/hooks/useHomeAlertPrefs', () => ({
  useHomeAlertPrefs: () => ({ prefs: {}, setPrefs: () => undefined }),
}));

vi.mock('@/components/home/HomeAlertsWidget', () => ({
  default: () => null,
}));

vi.mock('@/components/home/DashboardCardGate', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/lib/vehicleTrackingData', () => ({
  countTrackingAttention: async () => 0,
}));

vi.mock('@/hooks/useCompanyFilter', () => ({
  applyCompanyScope: (query: { then?: unknown }) => query,
}));

vi.mock('@/lib/vehicleArchive', () => ({
  applyExcludeArchivedVehicles: async () => ({ count: 0 }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], count: 0 }),
    }),
  },
}));

describe('HomeDashboard fleet home', () => {
  it('keeps the existing fleet home for a regular fleet_manager', async () => {
    authState.user.garageOps = false;
    render(
      <MemoryRouter>
        <HomeDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('דליה — מרכז שליטה')).toBeInTheDocument();
    expect(screen.queryByTestId('garage-ops-home-metrics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('garage-ops-home')).not.toBeInTheDocument();
    expect(screen.getByText('רכבים')).toBeInTheDocument();
    expect(screen.getByText('נהגים')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('רכבים')).toBeInTheDocument());
  });
});
