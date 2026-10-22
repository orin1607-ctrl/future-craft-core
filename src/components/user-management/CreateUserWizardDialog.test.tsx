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
