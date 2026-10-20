import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ClaimsCatalogWidget } from './ClaimsAiWorkspace';

describe('Claims Permanent Form Gallery & Authentic POA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the permanent gallery question and both choices when a file is picked for upload', async () => {
    const onPrepareLink = vi.fn();
    const onUploadCustomFile = vi.fn().mockResolvedValue({
      success: true,
      file_id: 'file-123',
      storage_path: 'templates/gallery/sample.pdf',
    });

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-TEST"
        onPrepareLink={onPrepareLink}
        onUploadCustomFile={onUploadCustomFile}
      />
    );

    // Initial state: click "העלה מסמך משלך"
    const openUploadBtn = screen.getByTestId('claims-catalog-upload-custom-btn');
    expect(openUploadBtn).toBeDefined();

    // Simulate file input change
    const file = new File(['%PDF-1.4 test bytes'], 'custom-waiver.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Check dialog opens
    const dialog = screen.getByTestId('claims-catalog-upload-dialog');
    expect(dialog).toBeDefined();

    // Check the required prompt is visible
    const promptContainer = screen.getByTestId('claims-catalog-permanent-choice');
    expect(promptContainer.textContent).toContain('האם לשמור את הטופס הזה כטופס קבוע במאגר המסמכים של דליה לשימוש חוזר עם לקוחות נוספים?');

    // Check the two options
    const yesOption = screen.getByTestId('radio-save-permanent-yes');
    const noOption = screen.getByTestId('radio-save-permanent-no');
    expect(yesOption).toBeDefined();
    expect(noOption).toBeDefined();
    expect(promptContainer.textContent).toContain('כן, שמור במאגר הקבוע');
    expect(promptContainer.textContent).toContain('לא, לתיק הנוכחי בלבד');

    // Default is "כן, שמור במאגר הקבוע"
    expect((yesOption as HTMLInputElement).checked).toBe(true);
  });

  it('uploads with isPermanent=true when "כן, שמור במאגר הקבוע" is selected', async () => {
    const onUploadCustomFile = vi.fn().mockImplementation(async (file, name, cat, isPerm) => ({
      success: true,
      file_id: 'file-global-1',
      storage_path: 'templates/gallery/waiver.pdf',
      is_permanent: isPerm,
    }));

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-TEST"
        onPrepareLink={vi.fn()}
        onUploadCustomFile={onUploadCustomFile}
      />
    );

    const file = new File(['sample bytes'], 'special-form.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const nameInput = screen.getByTestId('claims-catalog-custom-name-input');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'טופס מוסך קבוע' } });
    });

    // Keep "כן, שמור במאגר הקבוע"
    const saveBtn = screen.getByTestId('claims-catalog-save-custom-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verify upload called with 4th argument true
    expect(onUploadCustomFile).toHaveBeenCalledWith(file, 'טופס מוסך קבוע', 'cat_b', true);
  });

  it('uploads with isPermanent=false when "לא, לתיק הנוכחי בלבד" is selected', async () => {
    const onUploadCustomFile = vi.fn().mockImplementation(async (file, name, cat, isPerm) => ({
      success: true,
      file_id: 'file-current-only',
      storage_path: 'package-forms/current/waiver.pdf',
      is_permanent: isPerm,
    }));

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-TEST"
        onPrepareLink={vi.fn()}
        onUploadCustomFile={onUploadCustomFile}
      />
    );

    const file = new File(['sample bytes'], 'one-off.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const nameInput = screen.getByTestId('claims-catalog-custom-name-input');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'טופס חד פעמי' } });
    });

    // Select "לא, לתיק הנוכחי בלבד"
    const noOption = screen.getByTestId('radio-save-permanent-no');
    await act(async () => {
      fireEvent.click(noOption);
    });
    expect((noOption as HTMLInputElement).checked).toBe(true);

    const saveBtn = screen.getByTestId('claims-catalog-save-custom-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verify upload called with 4th argument false
    expect(onUploadCustomFile).toHaveBeenCalledWith(file, 'טופס חד פעמי', 'cat_b', false);
  });

  it('renders authentic POA badge for ייפוי כוח in Category B', () => {
    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-TEST"
        onPrepareLink={vi.fn()}
      />
    );

    const poaInput = screen.getByLabelText(/ייפוי כוח/);
    expect(poaInput).toBeDefined();
    const poaLabel = poaInput.closest('label');
    expect(poaLabel?.textContent).toContain('טופס מקורי מעודכן');
  });
});
