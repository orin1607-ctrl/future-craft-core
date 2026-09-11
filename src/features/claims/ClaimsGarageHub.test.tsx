import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsGarageHub } from './ClaimsGarageHub';

vi.mock('@/features/claims/ClaimsScreen', () => ({
  ClaimsScreen: () => <div data-testid="claims-screen-unmodified">claims</div>,
}));

vi.mock('@/features/claims/claimsService', () => ({
  createClaimsApi: () => ({
    getClaims: async () => ({ success: true, data: [{ id: 'c1', clientName: 'דן', plate: '12-345-67', status: 'בטיפול', claimNum: 'DAL-1' }] }),
  }),
}));

vi.mock('@/modules/garage-management/garageBook', async () => {
  const actual = await vi.importActual<typeof import('@/modules/garage-management/garageBook')>('@/modules/garage-management/garageBook');
  return {
    ...actual,
    probeGarageBook: vi.fn(async () => ({ ready: false, pending: true, error: actual.GARAGE_BOOK_PENDING_MESSAGE })),
    listCases: vi.fn(async () => []),
  };
});

describe('ClaimsGarageHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the three manager tabs and both new-file actions without rewriting claims', async () => {
    render(
      <MemoryRouter>
        <ClaimsGarageHub actor={{ id: 'u1', full_name: 'ישראל', role: 'super_admin' }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('hub-tab-all')).toHaveTextContent('הכול');
    expect(screen.getByTestId('hub-tab-claims')).toHaveTextContent('תביעות ביטוח');
    expect(screen.getByTestId('hub-tab-garage')).toHaveTextContent('תיקי מוסך');
    expect(screen.getByTestId('hub-new-claim')).toHaveTextContent('תיק תביעה');
    expect(screen.getByTestId('hub-new-garage')).toHaveTextContent('תיק מוסך חדש');
    expect(screen.getByTestId('claims-screen-unmodified')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/מסד נתוני המוסך עדיין ממתינה/)).toBeInTheDocument());
  });
});
