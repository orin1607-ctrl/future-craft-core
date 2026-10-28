import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, store, garageMock, vehicleMock } = vi.hoisted(() => ({
  api: {
    getClaims: vi.fn(),
    staffUpload: vi.fn(),
    invokeDocs: vi.fn(),
    logHistory: vi.fn(),
  },
  store: { listShareBatches: vi.fn(), deleteShareBatch: vi.fn() },
  garageMock: vi.fn(),
  vehicleMock: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', full_name: 'עובד', email: 'w@x', role: 'super_admin', hasClaimsAccess: true } }),
}));
vi.mock('@/features/claims/claimsService', () => ({ createClaimsApi: () => api }));
vi.mock('@/features/claims/claimDocumentRead', () => ({
  readPdfText: async () => 'Car-Part מכרז חלקים לרכב 12-345-67',
}));
vi.mock('@/features/claims/shareInbox/shareStore', () => store);
vi.mock('@/features/claims/shareInbox/registerShareTarget', () => ({ isShareTargetEnabled: () => true }));
vi.mock('@/features/claims/shareInbox/shareMultiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/claims/shareInbox/shareMultiService')>();
  return {
    ...actual,
    loadUserGarageCases: garageMock,
    loadUserVehicles: vehicleMock,
  };
});

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
  garageMock.mockResolvedValue([
    { id: 'g1', case_number: 'GC-1001', customer_name_snapshot: 'משה לוי', vehicle_plate_snapshot: '12-345-67' },
  ]);
  vehicleMock.mockResolvedValue([
    { id: 'v1', license_plate: '12-345-67', manufacturer: 'טויוטה', model: 'קורולה', company_name: 'אורן קאר' },
  ]);
  api.staffUpload.mockResolvedValue({ success: true, file_id: 'CDM1', reused: false });
  api.invokeDocs.mockResolvedValue({ success: true });
  api.logHistory.mockResolvedValue({ success: true });
  store.deleteShareBatch.mockResolvedValue(undefined);
});

const renderPage = () => render(<MemoryRouter initialEntries={['/claims/share?batch=S1']}><ClaimsShareInboxPage /></MemoryRouter>);

describe('ClaimsShareInboxPage (Multi-Module)', () => {
  it('identifies car plate from Car-Part PDF, preselects matching claim, and saves upon user confirmation', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'tender.pdf', type: 'application/pdf' }])]);
    renderPage();

    // Verify header and target auto-detection
    await screen.findByText(/שמירת מסמך בדליה/);
    await screen.findByText(/יעד נבחר:/);
    const matches = screen.getAllByText(/תביעה CLM-1/);
    expect(matches.length).toBeGreaterThan(0);

    // Click "שמור בתיק"
    const saveBtn = await screen.findByRole('button', { name: /שמור 1 קבצים ב-תביעה CLM-1/ });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(api.staffUpload).toHaveBeenCalledTimes(1));
    expect(api.staffUpload.mock.calls[0][0]).toBe('DAL-QA-0001');
    await screen.findByText(/נשמרו בהצלחה/);
    await waitFor(() => expect(store.deleteShareBatch).toHaveBeenCalledWith('S1'));
  });

  it('allows switching to Garage module and searching work cards', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'damage_photo.jpg', type: 'image/jpeg' }])]);
    renderPage();

    // Click "ניהול מוסך" tab
    const garageTab = await screen.findByRole('button', { name: /ניהול מוסך/ });
    fireEvent.click(garageTab);

    // Wait for the garage card to appear in results
    await screen.findByText(/כרטיס מוסך GC-1001/);
    const caseBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('GC-1001'));
    expect(caseBtn).toBeDefined();
    if (caseBtn) fireEvent.click(caseBtn);

    await screen.findByRole('button', { name: /שמור 1 קבצים ב-כרטיס מוסך GC-1001/ });
  });

  it('allows switching to Vehicles module and searching vehicles', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'car_doc.pdf', type: 'application/pdf' }])]);
    renderPage();

    // Click "ניהול רכבים" tab
    const vehicleTab = await screen.findByRole('button', { name: /ניהול רכבים/ });
    fireEvent.click(vehicleTab);

    // Wait for the vehicle card to appear in results
    await screen.findByText(/רכב 12-345-67/);
    const vehicleBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('12-345-67'));
    expect(vehicleBtn).toBeDefined();
    if (vehicleBtn) fireEvent.click(vehicleBtn);

    await screen.findByRole('button', { name: /שמור 1 קבצים ב-רכב 12-345-67/ });
  });

  it('allows editing the document name before saving', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'photo.jpg', type: 'image/jpeg' }])]);
    renderPage();

    const nameInput = await screen.findByPlaceholderText(/הזן שם למסמך/);
    fireEvent.change(nameInput, { target: { value: 'תמונת נזק פגוש קדמי' } });

    expect((nameInput as HTMLInputElement).value).toBe('תמונת נזק פגוש קדמי');
  });

  it('rejects unsupported files without uploading', async () => {
    store.listShareBatches.mockResolvedValue([batch([{ name: 'notes.exe', type: 'application/x-msdownload' }])]);
    renderPage();
    await screen.findByText(/סוג קובץ לא נתמך/);
    expect(api.staffUpload).not.toHaveBeenCalled();
  });
});
