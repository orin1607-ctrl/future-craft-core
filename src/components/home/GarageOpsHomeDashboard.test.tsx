import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import GarageOpsHomeDashboard from './GarageOpsHomeDashboard';
import { emptyCaseData } from '@/modules/garage-management/garageBook';

const authState = vi.hoisted(() => ({
  user: {
    id: 'fm-ops',
    full_name: 'מנהל מוסך בדיקה',
    company_name: 'אכבים',
    role: 'fleet_manager',
    garageOps: true,
    hasClaimsAccess: true,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock('@/components/home/DashboardCardGate', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/modules/garage-management/garageBook', async () => {
  const actual = await vi.importActual<typeof import('@/modules/garage-management/garageBook')>(
    '@/modules/garage-management/garageBook',
  );
  return {
    ...actual,
    listCases: async () => [
      {
        id: 'case-open',
        case_number: 'G-100',
        customer_id: 'c1',
        vehicle_id: 'v1',
        status: 'פתוח',
        opened_by: 'u1',
        opened_by_name: 'בודק',
        customer_name_snapshot: 'לקוח א',
        vehicle_plate_snapshot: '12-345-67',
        vehicle_label_snapshot: 'מאזדה',
        case_data: { ...emptyCaseData(), intakeDone: true, quoteSent: true, waitingForApproval: true },
        created_at: '2026-09-02T10:00:00Z',
      },
      {
        id: 'case-work',
        case_number: 'G-101',
        customer_id: 'c1',
        vehicle_id: 'v2',
        status: 'בעבודה',
        opened_by: 'u1',
        opened_by_name: 'בודק',
        customer_name_snapshot: 'לקוח ב',
        vehicle_plate_snapshot: '98-765-43',
        vehicle_label_snapshot: 'טויוטה',
        case_data: { ...emptyCaseData(), intakeDone: true, workStarted: true },
        created_at: '2026-09-03T10:00:00Z',
      },
    ],
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({
        data: [{ id: 'clm-1', status: 'בטיפול', row_data: {} }],
        error: null,
      }),
    }),
  },
}));

describe('GarageOpsHomeDashboard', () => {
  it('shows the garage work dashboard instead of the fleet home', async () => {
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
    expect(screen.getByTestId('garage-ops-quick-actions')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('garage-ops-queue-open')).toHaveTextContent('G-100'));
    expect(screen.getByTestId('garage-ops-queue-in-work')).toHaveTextContent('G-101');
    expect(screen.getByTestId('garage-ops-queue-waiting')).toHaveTextContent('G-100');
    expect(screen.getByTestId('garage-ops-open-claims')).toHaveTextContent('clm-1');
  });
});
