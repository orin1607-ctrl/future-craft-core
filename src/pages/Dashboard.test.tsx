import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from '@/pages/Dashboard';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u1',
    full_name: 'משתמש',
    company_name: 'אכבים',
    role: 'fleet_manager' as const,
    garageOps: false,
    hasClaimsAccess: false,
    garagePhotographer: false,
    claimsWorkerOnly: false,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock('@/lib/entityNavContext', () => ({
  useDriverUrlContext: () => ({ driverId: null, driverName: '', locked: false }),
}));

vi.mock('@/hooks/useHiddenButtons', () => ({
  useHiddenButtonsState: () => ({ hiddenButtons: [], ready: true }),
}));

vi.mock('@/components/home/HomeDashboard', () => ({
  default: () => <div>fleet-home</div>,
}));

vi.mock('@/components/home/GarageOpsHomeDashboard', () => ({
  default: () => <div>garage-ops-home</div>,
}));

describe('Dashboard garage-ops switch', () => {
  it('keeps the existing fleet home for a regular fleet_manager', () => {
    authState.user.role = 'fleet_manager';
    authState.user.garageOps = false;
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('fleet-home')).toBeInTheDocument();
    expect(screen.queryByText('garage-ops-home')).not.toBeInTheDocument();
  });

  it('routes a garage-ops fleet_manager to the garage dashboard only', () => {
    authState.user.role = 'fleet_manager';
    authState.user.garageOps = true;
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('garage-ops-home')).toBeInTheDocument();
    expect(screen.queryByText('fleet-home')).not.toBeInTheDocument();
  });

  it('keeps super_admin on the existing home dashboard', () => {
    authState.user.role = 'super_admin';
    authState.user.garageOps = false;
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('fleet-home')).toBeInTheDocument();
    expect(screen.queryByText('garage-ops-home')).not.toBeInTheDocument();
  });
});
