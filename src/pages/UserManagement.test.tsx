import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserManagement from '@/pages/UserManagement';
import { GARAGE_OPS_JOB_TITLE } from '@/lib/garageOps';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'sa-1', role: 'super_admin', full_name: 'אדמין' },
    impersonate: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/components/user-management/CreateUserWizardDialog', () => ({
  default: () => <div data-testid="create-wizard" />,
}));

vi.mock('@/components/user-management/SettingsBackBar', () => ({ default: () => null }));
vi.mock('@/components/user-management/TwoFactorApprovalSection', () => ({ default: () => null }));
vi.mock('@/components/user-management/AuthAuditLogPanel', () => ({ default: () => null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const profiles = [
        {
          id: 'fm-1',
          full_name: 'מנהל צי בדיקה',
          phone: '0500000001',
          company_name: 'אכבים',
          is_active: true,
          approval_status: 'approved',
          two_factor_approved: false,
          two_factor_approved_at: null,
          two_factor_approved_by: null,
          job_title: 'מנהל צי',
        },
        {
          id: 'ops-1',
          full_name: 'מנהל מוסך בדיקה',
          phone: '0500000002',
          company_name: 'אכבים',
          is_active: true,
          approval_status: 'approved',
          two_factor_approved: false,
          two_factor_approved_at: null,
          two_factor_approved_by: null,
          job_title: GARAGE_OPS_JOB_TITLE,
        },
      ];
      const result =
        table === 'user_roles'
          ? {
              data: [
                { user_id: 'fm-1', role: 'fleet_manager' },
                { user_id: 'ops-1', role: 'fleet_manager' },
              ],
              error: null,
            }
          : { data: profiles, error: null };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async () => ({ data: null, error: null }),
        update: () => api,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return api;
    },
    functions: { invoke },
  },
}));

describe('UserManagement fleet foundation edit', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (_name: string, opts: { body?: { action?: string; user_id?: string } }) => {
      if (opts?.body?.action === 'list-users') {
        return { data: { emails: { 'fm-1': 'fleet@test.com', 'ops-1': 'ops@test.com' } }, error: null };
      }
      return { data: { success: true }, error: null };
    });
  });

  it('lets super_admin switch an existing fleet_manager to מנהל מוסך without a new role', async () => {

    render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('מנהל צי בדיקה')).toBeInTheDocument());
    expect(screen.getByTestId('garage-ops-badge-ops-1')).toHaveTextContent('מנהל מוסך');
    expect(screen.queryByTestId('garage-ops-badge-fm-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'עריכה' })[0]);
    expect(screen.getByTestId('edit-fleet-foundation-choice')).toBeInTheDocument();
    expect(screen.getByTestId('edit-fleet-foundation-fleet')).toBeChecked();
    expect(screen.getByTestId('edit-fleet-foundation-garage-ops')).not.toBeChecked();

    fireEvent.click(screen.getByTestId('edit-fleet-foundation-garage-ops'));
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => {
      const updateCall = invoke.mock.calls.find(([, opts]) => opts?.body?.action === 'update-profile' && opts?.body?.user_id === 'fm-1');
      expect(updateCall?.[1]?.body).toMatchObject({
        action: 'update-profile',
        user_id: 'fm-1',
        role: 'fleet_manager',
        job_title: GARAGE_OPS_JOB_TITLE,
      });
    });
  });

  it('loads מנהל מוסך as selected when editing an existing garage-ops fleet_manager', async () => {
    render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('מנהל מוסך בדיקה')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'עריכה' })[1]);
    expect(screen.getByTestId('edit-fleet-foundation-garage-ops')).toBeChecked();
    expect(screen.getByTestId('edit-fleet-foundation-fleet')).not.toBeChecked();

    fireEvent.click(screen.getByTestId('edit-fleet-foundation-fleet'));
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => {
      const updateCall = invoke.mock.calls.find(([, opts]) => opts?.body?.action === 'update-profile' && opts?.body?.user_id === 'ops-1');
      expect(updateCall?.[1]?.body).toMatchObject({
        action: 'update-profile',
        user_id: 'ops-1',
        role: 'fleet_manager',
        job_title: '',
      });
    });
  });
});
