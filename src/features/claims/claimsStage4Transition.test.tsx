import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import ClaimsIntakePage from '../../pages/ClaimsIntakePage';
import ClaimsUploadPage from '../../pages/ClaimsUploadPage';

describe('Stage 4 - Transition from ClaimsIntakePage to ClaimsUploadPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('renders redirect transition and continue button when upload_url is returned for submitted intake', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (body.action === 'public_get' || (!body.action && urlStr.includes('action=public_get'))) {
        return new Response(JSON.stringify({
          success: true,
          submitted: true,
          claimId: 'DAL-2026-0265',
          has_pending_docs: true,
          upload_url: 'https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=uploadtoken123',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(
      <MemoryRouter initialEntries={['/claims-intake?t=token123']}>
        <ClaimsIntakePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('intake-success')).toBeDefined();
    });

    const contBtn = screen.getByTestId('intake-continue-to-docs');
    expect(contBtn).toBeDefined();
    expect(contBtn.getAttribute('href')).toBe('https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=uploadtoken123');
    expect(screen.getByText(/השלב הבא: העלאת מסמכים וטפסים לתביעה/)).toBeDefined();
    expect(screen.getByText(/מעביר אותך כעת באופן אוטומטי/)).toBeDefined();

    fetchSpy.mockRestore();
  });

  it('renders complete screen without redirect when no documents were requested (upload_url: null)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (body.action === 'public_get' || (!body.action && urlStr.includes('action=public_get'))) {
        return new Response(JSON.stringify({
          success: true,
          submitted: true,
          claimId: 'DAL-2026-0266',
          has_pending_docs: false,
          upload_url: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(
      <MemoryRouter initialEntries={['/claims-intake?t=token456']}>
        <ClaimsIntakePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('intake-success')).toBeDefined();
    });

    expect(screen.queryByTestId('intake-continue-to-docs')).toBeNull();
    expect(screen.getByText(/שאלון פתיחת התביעה הושלם/)).toBeDefined();
    expect(screen.getByText(/לא נדרשו מסמכים נוספים עבור תיק זה/)).toBeDefined();

    fetchSpy.mockRestore();
  });

  it('ClaimsUploadPage DOES NOT show completed screen if there are still pending documents, even if claimStatus is "תביעה חדשה – התקבלה"', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('action=public_get')) {
        return new Response(JSON.stringify({
          success: true,
          claimId: 'DAL-2026-0265',
          claimStatus: 'תביעה חדשה – התקבלה',
          clientName: 'ישראל ישראלי',
          plate: '12-345-67',
          docs: [
            { id: 'DCR-1', label: 'רישיון רכב', doc_key: 'vehicle_license', status: 'requested' },
            { id: 'DCR-2', label: 'ייפוי כוח', doc_key: 'power_of_attorney', status: 'requested' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(
      <MemoryRouter initialEntries={['/claims-upload?t=uploadtok123']}>
        <ClaimsUploadPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('רישיון רכב')).toBeDefined();
      expect(screen.getByText('ייפוי כוח')).toBeDefined();
    });

    // Verify it is NOT completed
    expect(screen.queryByTestId('cust-claim-completed')).toBeNull();
    expect(screen.getByTestId('cust-finish-submit-claim')).toBeDefined();

    fetchSpy.mockRestore();
  });

  it('ClaimsUploadPage DOES show completed screen when all documents are received', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('action=public_get')) {
        return new Response(JSON.stringify({
          success: true,
          claimId: 'DAL-2026-0265',
          claimStatus: 'תביעה חדשה – התקבלה',
          clientName: 'ישראל ישראלי',
          plate: '12-345-67',
          docs: [
            { id: 'DCR-1', label: 'רישיון רכב', doc_key: 'vehicle_license', status: 'received' },
            { id: 'DCR-2', label: 'ייפוי כוח', doc_key: 'power_of_attorney', status: 'received' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(
      <MemoryRouter initialEntries={['/claims-upload?t=uploadtokDone']}>
        <ClaimsUploadPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cust-claim-completed')).toBeDefined();
      expect(screen.getByText(/השאלון החתום, כל המסמכים וכל הטפסים החתומים התקבלו ונשמרו בתיק התביעה/)).toBeDefined();
    });

    fetchSpy.mockRestore();
  });
});
