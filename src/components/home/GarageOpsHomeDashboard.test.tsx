import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import GarageOpsHomeDashboard from './GarageOpsHomeDashboard';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'fm-ops',
      full_name: 'מנהל מוסך בדיקה',
      company_name: 'אכבים',
      role: 'fleet_manager',
      garageOps: true,
      hasClaimsAccess: true,
    },
  }),
}));

describe('GarageOpsHomeDashboard', () => {
  it('shows the three garage work areas and not the fleet home', () => {
    render(
      <MemoryRouter>
        <GarageOpsHomeDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('garage-ops-home')).toBeInTheDocument();
    expect(screen.getByText('מרכז תפעול למוסך')).toBeInTheDocument();
    expect(screen.queryByText('דליה — מרכז שליטה')).not.toBeInTheDocument();
    expect(screen.queryByText('רכבים')).not.toBeInTheDocument();
    expect(screen.getByText('ניהול מוסך')).toBeInTheDocument();
    expect(screen.getByText('ניהול תביעות')).toBeInTheDocument();
    expect(screen.getByText('דוחות')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ניהול מוסך/ })).toHaveAttribute('href', '/garage-management');
    expect(screen.getByRole('link', { name: /ניהול תביעות/ })).toHaveAttribute('href', '/claims');
    expect(screen.getByRole('link', { name: /דוחות/ })).toHaveAttribute('href', '/reports');
  });
});
