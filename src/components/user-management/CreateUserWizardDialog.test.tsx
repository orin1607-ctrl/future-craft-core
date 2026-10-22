import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateUserWizardDialog from './CreateUserWizardDialog';
import { toast } from '@/hooks/use-toast';

const insertCustomer = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'customers') return { insert: insertCustomer };
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: [] }),
          }),
        }),
      };
    },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

function renderWizard(props: Partial<ComponentProps<typeof CreateUserWizardDialog>> = {}) {
  return render(
    <CreateUserWizardDialog
      open
      onOpenChange={() => undefined}
      companyOptions={['אכבים']}
      onCreated={() => undefined}
      {...props}
    />,
  );
}

describe('CreateUserWizardDialog fleet foundation', () => {
  it('lets super_admin pick garage-ops without creating a new role', () => {
    render(
      <CreateUserWizardDialog
        open
        onOpenChange={() => undefined}
        companyOptions={['אכבים']}
        onCreated={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('מנהל צי רכב'));
    expect(screen.getByTestId('fleet-foundation-choice')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-foundation-fleet')).toBeChecked();
    expect(screen.getByTestId('fleet-foundation-garage-ops')).not.toBeChecked();
    expect(screen.getByText('מנהל מוסך')).toBeInTheDocument();
    expect(screen.getByText(/ניהול מוסך \+ ניהול תביעות \+ דוחות/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fleet-foundation-garage-ops'));
    expect(screen.getByTestId('fleet-foundation-garage-ops')).toBeChecked();
    expect(screen.queryByText('תפקיד')).not.toBeInTheDocument();
  });
});

describe('CreateUserWizardDialog new company', () => {
  beforeEach(() => {
    insertCustomer.mockReset();
    insertCustomer.mockResolvedValue({ error: null });
    vi.mocked(toast).mockClear();
  });

  it('hides the new-company button when the caller cannot create a company', () => {
    renderWizard();
    fireEvent.click(screen.getByText('מנהל צי רכב'));
    expect(screen.queryByTestId('create-company-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-user-field-company_assigned')).toBeInTheDocument();
  });

  it('opens the company dialog, saves the company, and selects it for the new user', async () => {
    const onCompanyCreated = vi.fn();
    renderWizard({ canCreateCompany: true, onCompanyCreated });
    fireEvent.click(screen.getByText('מנהל צי רכב'));

    fireEvent.click(screen.getByTestId('create-company-open'));
    expect(screen.getByRole('heading', { name: 'הוספת לקוח / חברה חדשה' })).toBeInTheDocument();
    expect(screen.getByTestId('create-company-name')).toBeInTheDocument();
    expect(screen.getByTestId('create-company-business-id')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('create-company-name'), { target: { value: 'חברת בדיקה חדשה' } });
    fireEvent.change(screen.getByTestId('create-company-business-id'), { target: { value: '514000001' } });
    fireEvent.click(screen.getByTestId('create-company-submit'));

    await waitFor(() => {
      expect(insertCustomer).toHaveBeenCalledWith({
        name: 'חברת בדיקה חדשה',
        company_name: 'חברת בדיקה חדשה',
        business_id: '514000001',
      });
    });
    expect(onCompanyCreated).toHaveBeenCalledWith('חברת בדיקה חדשה');
    expect(screen.getByTestId('create-user-field-company_assigned')).toHaveTextContent('חברת בדיקה חדשה');

    fireEvent.change(screen.getByTestId('create-user-field-full_name'), { target: { value: 'יוסי כהן' } });
    fireEvent.change(screen.getByTestId('create-user-field-phone'), { target: { value: '0501234567' } });
    fireEvent.change(screen.getByTestId('create-user-field-login_email'), { target: { value: 'yosi@example.com' } });
    fireEvent.change(screen.getByTestId('create-user-field-password'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));

    expect(screen.getByText('סיכום לפני יצירה')).toBeInTheDocument();
    expect(screen.getByText('חברת בדיקה חדשה')).toBeInTheDocument();
  });

  it('still assigns an existing company without creating a new one', () => {
    renderWizard({ canCreateCompany: true });
    fireEvent.click(screen.getByText('נהג'));
    fireEvent.click(screen.getByTestId('create-user-field-company_assigned'));
    fireEvent.click(screen.getByRole('option', { name: 'אכבים' }));
    expect(insertCustomer).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-user-field-company_assigned')).toHaveTextContent('אכבים');
  });
});
