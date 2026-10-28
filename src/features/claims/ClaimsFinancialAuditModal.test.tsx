/**
 * ClaimsFinancialAuditModal.test.tsx
 *
 * בדיקות יחידה עבור מסך בדיקת דוח שמאי ותשלומים בכרטיס התביעה.
 */
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimsFinancialAuditModal, type ClaimCardData, type ClaimDocFile } from './ClaimsFinancialAuditModal';

const sampleClaim: ClaimCardData = {
  id: 'DAL-2026-0020',
  plate: '63-292-03',
  clientName: 'אליהו אטיאס',
  status: 'בטיפול',
  insCompany: 'AIG',
  claimNum: '1260010522488',
  finAmount: '22756.50',
  finApproved: '15696.50',
  finPaid: '15696.50',
  finPayDate: '2026-09-07',
  finRef: 'TR-1002',
  finBalance: '7060',
  notes: 'דוח שמאי גליל גולן שמאות - סה"כ לתשלום: 22,756.50 ₪',
};

const sampleFiles: ClaimDocFile[] = [
  {
    id: 'F-1',
    original_name: '0010002508.pdf',
    doc_kind: 'surveyor_report',
    byte_size: 34424,
    created_at: '2026-09-06T16:57:03.000Z',
    doc_meta: {
      staff_title: '0010002508.pdf',
      staff_type: 'surveyor_report',
    },
  },
  {
    id: 'F-2',
    original_name: 'rcv0001.JPG',
    doc_kind: 'surveyor_photo',
    byte_size: 91593,
    created_at: '2026-09-06T16:58:00.000Z',
    doc_meta: {
      reportDate: '2026-05-06',
      reportNumber: '2241-0-1',
      surveyorName: 'גליל גולן שמאות',
    },
  },
];

describe('ClaimsFinancialAuditModal Component (Single Claim Focus)', () => {
  it('מרנדר בהצלחה אך ורק את נתוני התיק והלקוח הספציפי', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claim={sampleClaim}
        files={sampleFiles}
        onSaveClaimFinancials={handleSave}
        actorName="בודק מערכת"
      />
    );

    expect(screen.getByText('בדיקת דוח שמאי ותשלומים')).toBeDefined();
    expect(screen.getByText(/אליהו אטיאס/)).toBeDefined();
    expect(screen.getByText(/63-292-03/)).toBeDefined();
    expect(screen.getByText('דרישת שומה (שמאי שלנו)')).toBeDefined();
  });

  it('מציג את מסמכי השומה בתיק ואת סטטוס הקריאה שלהם', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claim={sampleClaim}
        files={sampleFiles}
        onSaveClaimFinancials={handleSave}
        actorName="בודק מערכת"
      />
    );

    const docsTabBtn = screen.getByText(/מסמכי השומה בתיק/);
    fireEvent.click(docsTabBtn);

    expect(screen.getByText('0010002508.pdf')).toBeDefined();
    expect(screen.getByText('rcv0001.JPG')).toBeDefined();
  });

  it('מציג את טופס האישור ומפעיל שמירה רק בלחיצה יזומה', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claim={sampleClaim}
        files={sampleFiles}
        onSaveClaimFinancials={handleSave}
        actorName="יוני מנהל"
      />
    );

    const saveBtn = screen.getByText('💾 אשר והזן נתונים לכרטיס התביעה');
    expect(saveBtn).toBeDefined();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith('DAL-2026-0020', expect.any(Object));
    });
  });

  it('מפיק טיוטת מכתב השגה מותאם אישית ללקוח ולמבטחת', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claim={sampleClaim}
        files={sampleFiles}
        onSaveClaimFinancials={handleSave}
        actorName="יוני מנהל"
      />
    );

    const letterTabBtn = screen.getByText('✉️ טיוטת מכתב השגה למבטחת');
    fireEvent.click(letterTabBtn);

    expect(screen.getAllByText(/השגה ודרישת הפרשים/).length).toBeGreaterThan(0);
    expect(screen.getByText('📋 העתק נוסח מכתב')).toBeDefined();
  });

  it('מציג כפתור OCR ומפעיל סריקה יזומה למסמך ספציפי', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);
    const handleOcr = vi.fn(async (fileId: string) => ({
      success: true,
      text: 'דוח שמאי - חלפים: 12,000 ₪, פחחות: 4,000 ₪, צבע: 2,500 ₪, סה"כ לתשלום: 21,645 ₪',
    }));

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claim={sampleClaim}
        files={sampleFiles}
        onSaveClaimFinancials={handleSave}
        onTriggerDocOcr={handleOcr}
        actorName="יוני מנהל"
      />
    );

    // מעבר לטאב מסמכים
    const docsTabBtn = screen.getByText(/מסמכי השומה בתיק/);
    fireEvent.click(docsTabBtn);

    // איתור כפתור ה-OCR לקובץ
    const ocrBtn = screen.getByText(/בצע OCR/);
    expect(ocrBtn).toBeDefined();

    fireEvent.click(ocrBtn);

    await waitFor(() => {
      expect(handleOcr).toHaveBeenCalledWith('F-1');
    });
  });
});
