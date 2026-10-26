import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HomeDashboard from '@/components/home/HomeDashboard';
import FleetDaliaAiPage from '@/features/fleet-dalia-ai/FleetDaliaAiPage';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u1',
    full_name: 'מנהל צי',
    company_name: 'בדיקה',
    role: 'fleet_manager' as string,
    hasClaimsAccess: false,
  },
  realUser: null,
  isImpersonating: false,
}));

const fleetOn = vi.hoisted(() => ({ value: true }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({
  useCompanyScope: () => ({ selectedCompany: 'בדיקה' }),
}));

vi.mock('@/features/fleet-dalia-ai/stagingGate', async () => {
  const actual = await vi.importActual<typeof import('@/features/fleet-dalia-ai/stagingGate')>(
    '@/features/fleet-dalia-ai/stagingGate',
  );
  return {
    ...actual,
    isFleetDaliaAiEnabled: () => fleetOn.value,
  };
});

vi.mock('@/components/home/HomeAlertsWidget', () => ({
  default: () => <div>alerts</div>,
}));

vi.mock('@/hooks/useHiddenButtons', () => ({
  useHiddenButtons: () => [],
}));

vi.mock('@/hooks/useTransportModule', () => ({
  useTransportModule: () => ({ enabled: true, loading: false }),
}));

vi.mock('@/hooks/useHomeAlertPrefs', () => ({
  useHomeAlertPrefs: () => ({ prefs: {}, setPrefs: () => undefined }),
}));

vi.mock('@/lib/vehicleTrackingData', () => ({
  countTrackingAttention: async () => 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const query: {
    select: () => typeof query;
    eq: () => typeof query;
    neq: () => typeof query;
    in: () => typeof query;
    then: (resolve: (value: { data: never[]; error: null; count: number }) => void) => void;
  } = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    then: (resolve) => resolve({ data: [], error: null, count: 0 }),
  };
  return { supabase: { from: () => query } };
});

describe('dashboard AI דליה card', () => {
  it('opens the existing fleet assistant for a fleet manager on staging', () => {
    fleetOn.value = true;
    authState.user.role = 'fleet_manager';
    render(
      <MemoryRouter>
        <HomeDashboard />
      </MemoryRouter>,
    );
    const card = screen.getByTestId('dashboard-ai-dalia');
    expect(card).toHaveTextContent('AI דליה');
    expect(card).toHaveAttribute('href', '/fleet-dalia-ai');
    expect(screen.getByText('רכבים')).toBeInTheDocument();
    expect(screen.getByText('נהגים')).toBeInTheDocument();
  });

  it('hides the card from a driver and when the staging gate is off', () => {
    fleetOn.value = true;
    authState.user.role = 'driver';
    const { unmount } = render(
      <MemoryRouter>
        <HomeDashboard />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('dashboard-ai-dalia')).not.toBeInTheDocument();
    unmount();

    fleetOn.value = false;
    authState.user.role = 'super_admin';
    render(
      <MemoryRouter>
        <HomeDashboard />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('dashboard-ai-dalia')).not.toBeInTheDocument();
    expect(screen.getByText('רכבים')).toBeInTheDocument();
  });
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('fleet assistant return path', () => {
  it('returns to the main dashboard', () => {
    fleetOn.value = true;
    authState.user.role = 'fleet_manager';
    render(
      <MemoryRouter initialEntries={['/fleet-dalia-ai']}>
        <FleetDaliaAiPage />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('fleet-dalia-back-dashboard'));
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
    expect(screen.getByTestId('fleet-dalia-cat-vehicles')).toHaveTextContent('רכבים');
    expect(screen.getByTestId('fleet-dalia-cat-drivers')).toHaveTextContent('נהגים');
    expect(screen.getByTestId('fleet-dalia-cat-vehicle_tracking')).toHaveTextContent('מעקב רכבים');
    expect(screen.getByTestId('fleet-dalia-cat-driver_tracking')).toHaveTextContent('מעקב נהגים');
    expect(screen.getByTestId('fleet-dalia-cat-reports')).toHaveTextContent('דוחות');
    expect(screen.getByTestId('fleet-dalia-cat-tasks')).toHaveTextContent('משימות והתראות');
    expect(screen.getByTestId('fleet-dalia-cat-chat')).toHaveTextContent('שיחה כללית');
  });
});
