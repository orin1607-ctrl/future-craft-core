import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, store } = vi.hoisted(() => ({
  api: {
    getClaims: vi.fn(),
    staffUpload: vi.fn(),
    invokeDocs: vi.fn(),
    logHistory: vi.fn(),
  },
  store: { listShareBatches: vi.fn(), deleteShareBatch: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', full_name: 'עובד', email: 'w@x', role: 'super_admin', hasClaimsAccess: true } }),
}));
vi.mock('@/features/claims/claimsService', () => ({ createClaimsApi: () => api }));
vi.mock('@/features/claims/claimDocumentRead', () => ({
  readPdfText: async () => 'Car-Part מכרז חלקים לרכב 1234567',
}));
vi.mock('@/features/claims/shareInbox/shareStore', () => store);
vi.mock('@/features/claims/shareInbox/registerShareTarget', () => ({ isShareTargetEnabled: () => true }));

import ClaimsShareInboxPage from './ClaimsShareInboxPage';

const claims = [
  { id: 'DAL-QA-0001', claimNum: 'CLM-1', plate: '12-345-67', clientName: 'לקוח א' },
  { id: 'DAL-QA-0002', claimNum: 'CLM-2', plate: '55-666-77', clientName: 'לקוח ב' },
];

function batch(files: Array<{ name: string; type: string }>) {
  return {
    id: 'S1',
    createdAt: Date.now(),
    title: '',
    text: '',
    url: '',
    files: files.map((f) => ({ ...f, size: 10, blob: new Blob(['x'], { type: f.type }) })),
  };
}

// jsdom's Blob has no arrayBuffer(); every browser that can share files does.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.readAsArrayBuffer(this);
    });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  api.getClaims.mockResolvedValue({ success: true, data: claims });
  api.staffUpload.mockResolvedValue({ success: true, file_id: 'CDM1', reused: false });
  api.invokeDocs.mockResolvedValue({ success: true });
  api.logHistory.mockResolvedValue({ success: true });
  store.deleteShareBatch.mockResolvedValue(undefined);
});

const renderPage = () => render(<MemoryRouter initialEntries={['/claims/share?batch=S1']}><ClaimsShareInboxPage /></MemoryRouter>);

describe('ClaimsShareInboxPage', () => {
  it('saves a Car-Part PDF straight into the one matching claim and clears the device copy', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'tender.pdf', type: 'application/pdf' }])]);
    renderPage();
    await waitFor(() => expect(api.staffUpload).toHaveBeenCalledTimes(1));
    expect(api.staffUpload.mock.calls[0][0]).toBe('DAL-QA-0001');
    await screen.findByText(/^נשמר/);
    expect(api.invokeDocs).toHaveBeenCalledWith('update_doc_meta', expect.objectContaining({ claim_id: 'DAL-QA-0001', file_id: 'CDM1', staff_note: expect.stringContaining('[share_to_dalia]') }));
    await waitFor(() => expect(store.deleteShareBatch).toHaveBeenCalledWith('S1'));
  });

  it('photos without an identifier wait for one claim choice, then all are saved there', async () => {
    store.listShareBatches.mockResolvedValue([batch([
      { name: 'IMG-20261027-WA0001.jpg', type: 'image/jpeg' },
      { name: 'IMG-20261027-WA0002.jpg', type: 'image/jpeg' },
    ])]);
    renderPage();
    await screen.findByText(/בחר תיק עבור 2 קבצים/);
    expect(api.staffUpload).not.toHaveBeenCalled();
    expect(store.deleteShareBatch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/חיפוש לפי מספר רכב/), { target: { value: '55-666' } });
    fireEvent.click(await screen.findByRole('button', { name: /CLM-2/ }));
    fireEvent.click(screen.getByRole('button', { name: /שמור בתיק/ }));

    await waitFor(() => expect(api.staffUpload).toHaveBeenCalledTimes(2));
    expect(api.staffUpload.mock.calls.map((c) => c[0])).toEqual(['DAL-QA-0002', 'DAL-QA-0002']);
    await waitFor(() => expect(store.deleteShareBatch).toHaveBeenCalledWith('S1'));
  });

  it('a file already in the claim is reported as a duplicate, not saved twice', async () => {
    api.staffUpload.mockResolvedValue({ success: true, file_id: 'CDM0', reused: true });
    store.listShareBatches.mockResolvedValue([batch([{ name: 'tender.pdf', type: 'application/pdf' }])]);
    renderPage();
    await screen.findByText(/כבר קיים בתיק/);
    expect(api.invokeDocs).not.toHaveBeenCalled();
  });

  it('rejects unsupported files without uploading', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'notes.docx', type: 'application/msword' }])]);
    renderPage();
    await screen.findByText(/סוג קובץ לא נתמך/);
    expect(api.staffUpload).not.toHaveBeenCalled();
  });
});
