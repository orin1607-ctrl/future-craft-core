import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsGarageHub } from './ClaimsGarageHub';
import { GARAGE_BOOK_PENDING_MESSAGE, probeGarageBook, listCases } from '@/modules/garage-management/garageBook';

vi.mock('@/features/claims/ClaimsScreen', () => ({
  ClaimsScreen: ({ openClaimId, startNewNonce }: { openClaimId?: string; startNewNonce?: number }) => (
    <div data-testid="claims-screen-unmodified">
      claims
      {openClaimId ? <span data-testid="open-claim">{openClaimId}</span> : null}
      {startNewNonce ? <span data-testid="start-new">{startNewNonce}</span> : null}
    </div>
  ),
}));

vi.mock('@/features/claims/claimsService', () => ({
  createClaimsApi: () => ({
    getClaims: async () => ({
      success: true,
      data: [{ id: 'c1', clientName: 'דן', plate: '12-345-67', status: 'בטיפול', claimNum: 'DAL-1' }],
    }),
  }),
}));

vi.mock('@/modules/garage-management/garageBook', async () => {
  const actual = await vi.importActual<typeof import('@/modules/garage-management/garageBook')>('@/modules/garage-management/garageBook');
  return {
    ...actual,
    probeGarageBook: vi.fn(),
    listCases: vi.fn(),
  };
});

const actor = { id: 'u1', full_name: 'ישראל', role: 'super_admin' as const };

function renderHub(path = '/claims') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/claims" element={<ClaimsGarageHub actor={actor} />} />
        <Route path="/garage-management" element={<div data-testid="garage-flow">garage-flow</div>} />
        <Route path="/garage-management/:caseId" element={<div data-testid="garage-case">garage-case</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ClaimsGarageHub', () => {
  beforeEach(() => {
    vi.mocked(probeGarageBook).mockReset();
    vi.mocked(listCases).mockReset();
    vi.mocked(probeGarageBook).mockResolvedValue({ ready: false, pending: true, error: GARAGE_BOOK_PENDING_MESSAGE });
    vi.mocked(listCases).mockResolvedValue([]);
  });

  it('renders the three manager tabs and both new-file actions without rewriting claims', async () => {
    renderHub();
    expect(screen.getByTestId('hub-tab-all')).toHaveTextContent('הכול');
    expect(screen.getByTestId('hub-tab-claims')).toHaveTextContent('תביעות ביטוח');
    expect(screen.getByTestId('hub-tab-garage')).toHaveTextContent('תיקי מוסך');
    expect(screen.getByTestId('hub-new-claim')).toHaveTextContent('תיק תביעה');
    expect(screen.getByTestId('hub-new-garage')).toHaveTextContent('תיק מוסך חדש');
    expect(screen.getByTestId('claims-screen-unmodified')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/מסד נתוני המוסך עדיין ממתינה/).length).toBeGreaterThan(0));
    expect(screen.getByTestId('hub-row-claim:c1')).toHaveTextContent('תביעת ביטוח');
    expect(screen.queryByTestId(/hub-row-garage:/)).not.toBeInTheDocument();
  });

  it('opens the existing garage flow from + תיק מוסך חדש and a garage row', async () => {
    vi.mocked(probeGarageBook).mockResolvedValue({ ready: true, pending: false });
    vi.mocked(listCases).mockResolvedValue([{
      id: 'case-9',
      case_number: 'GM-2026-0001',
      status: 'בדיקת רכב',
      customer_name_snapshot: 'ישראל',
      vehicle_label_snapshot: 'Toyota',
      vehicle_plate_snapshot: '1234567',
      opened_by_name: 'ישראל',
      created_at: '2026-09-11T12:00:00Z',
      case_data: {},
    } as never]);
    renderHub();
    await waitFor(() => expect(screen.getAllByTestId('hub-row-garage:case-9').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('hub-new-garage'));
    expect(screen.getByTestId('garage-flow')).toBeInTheDocument();
  });

  it('opens a garage case on /garage-management/:caseId without writing claims_records', async () => {
    vi.mocked(probeGarageBook).mockResolvedValue({ ready: true, pending: false });
    vi.mocked(listCases).mockResolvedValue([{
      id: 'case-9',
      case_number: 'GM-2026-0001',
      status: 'בדיקת רכב',
      customer_name_snapshot: 'ישראל',
      vehicle_label_snapshot: 'Toyota',
      vehicle_plate_snapshot: '1234567',
      opened_by_name: 'ישראל',
      created_at: '2026-09-11T12:00:00Z',
      case_data: {},
    } as never]);
    renderHub();
    await waitFor(() => expect(screen.getAllByTestId('hub-row-garage:case-9').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('hub-row-garage:case-9')[0]);
    expect(screen.getByTestId('garage-case')).toBeInTheDocument();
  });

  it('keeps + תיק תביעה on the existing Claims screen', async () => {
    renderHub();
    fireEvent.click(screen.getByTestId('hub-new-claim'));
    await waitFor(() => expect(screen.getByTestId('start-new')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('hub-row-claim:c1'));
    await waitFor(() => expect(screen.getByTestId('open-claim')).toHaveTextContent('c1'));
  });
});
