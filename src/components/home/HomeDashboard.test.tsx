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

vi.mock('@/modules/garage-management/garageBook', () => ({
  listCases: async () => [],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], count: 0 }),
    }),
  },
}));

function renderDash() {
  return render(
    <MemoryRouter>
      <HomeDashboard />
    </MemoryRouter>,
  );
}

describe('HomeDashboard garage-ops foundation', () => {
  it('keeps the existing fleet home for a regular fleet_manager', async () => {
    authState.user.garageOps = false;
    authState.user.hasClaimsAccess = false;
    renderDash();
    expect(screen.getByText('דליה — מרכז שליטה')).toBeInTheDocument();
    expect(screen.queryByTestId('garage-ops-home-metrics')).not.toBeInTheDocument();
    expect(screen.getByText('רכבים')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('רכבים')).toBeInTheDocument());
  });

  it('reuses HomeDashboard with garage metrics and the three default modules', async () => {
    authState.user.garageOps = true;
    authState.user.hasClaimsAccess = true;
    renderDash();
    expect(screen.getByText('מרכז תפעול למוסך')).toBeInTheDocument();
    expect(screen.getByTestId('garage-ops-home-metrics')).toBeInTheDocument();
    expect(screen.getByText('ניהול מוסך')).toBeInTheDocument();
    expect(screen.getByText('ניהול תביעות')).toBeInTheDocument();
    expect(screen.getByText('דוחות')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('garage-ops-metric-due_today')).toHaveTextContent('—'));
  });
});
