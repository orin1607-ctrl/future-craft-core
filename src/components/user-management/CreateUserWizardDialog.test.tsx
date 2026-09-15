import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreateUserWizardDialog from './CreateUserWizardDialog';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: [] }),
        }),
      }),
    }),
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

describe('CreateUserWizardDialog fleet foundation', () => {
  it('lets super_admin pick מנהל מוסך inside the existing fleet_manager flow', () => {
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

    fireEvent.click(screen.getByTestId('fleet-foundation-garage-ops'));
    expect(screen.getByTestId('fleet-foundation-garage-ops')).toBeChecked();
    expect(screen.queryByText('תפקיד')).not.toBeInTheDocument();
  });
});
