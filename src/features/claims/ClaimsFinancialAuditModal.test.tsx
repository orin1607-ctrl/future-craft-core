/**
 * ClaimsFinancialAuditModal.test.tsx
 *
 * בדיקות יחידה עבור מסך בקרה כספית ותשלומי ביטוח.
 */
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimsFinancialAuditModal, type ClaimSummary } from './ClaimsFinancialAuditModal';

const sampleClaims: ClaimSummary[] = [
  {
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
    row_data: {
      notes: 'דוח שמאי גליל גולן שמאות - סה"כ לתשלום: 22,756.50 ₪',
    },
  },
  {
    id: 'DAL-2026-0017',
    plate: '49-325-04',
    clientName: 'אושרי יעקוב',
    status: 'בטיפול',
    insCompany: 'איילון',
    claimNum: '2006402605242',
    finAmount: '41702',
    finApproved: '38000',
    finPaid: '0',
    finBalance: '41702',
  },
];

describe('ClaimsFinancialAuditModal Component', () => {
  it('מרנדר בהצלחה את הכותרת וכרטיסי הסטטיסטיקה', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claims={sampleClaims}
        onSaveClaimFinancials={handleSave}
        actorName="בודק מערכת"
      />
    );

    expect(screen.getByText('בקרה כספית ותשלומי ביטוח')).toBeDefined();
    expect(screen.getByText('תביעות פעילות')).toBeDefined();
    expect(screen.getByText('סה"כ דרישות שמאים')).toBeDefined();
    expect(screen.getByText('פער כולל לגבייה / השגה')).toBeDefined();
  });

  it('מציג כפתור סריקה והשוואה ומבצע סריקה בלחיצה', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        claims={sampleClaims}
        onSaveClaimFinancials={handleSave}
        actorName="בודק מערכת"
      />
    );

    const scanBtn = screen.getByText('🔍 סרוק והשווה תביעות קיימות');
    expect(scanBtn).toBeDefined();

    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText('הסריקה הושלמה בהצלחה!')).toBeDefined();
    });
  });

  it('מציג את טופס התצוגה המקדימה ומפעיל שמירה לכרטיס התביעה', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        activeClaimId="DAL-2026-0020"
        claims={sampleClaims}
        onSaveClaimFinancials={handleSave}
        actorName="יוני מנהל"
      />
    );

    // בדיקה שהטאב של בדיקת דוח שמאי נפתח עבור התיק הנבחר
    expect(screen.getByText(/תיק DAL-2026-0020/)).toBeDefined();

    // כפתור אישור והזנת נתונים
    const saveBtn = screen.getByText('💾 אשר והזן נתונים לכרטיס התביעה');
    expect(saveBtn).toBeDefined();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalled();
    });
  });

  it('מפיק טיוטת מכתב השגה למבטחת עם הסעיפים והפערים', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn(async () => true);

    render(
      <ClaimsFinancialAuditModal
        isOpen={true}
        onClose={handleClose}
        activeClaimId="DAL-2026-0020"
        claims={sampleClaims}
        onSaveClaimFinancials={handleSave}
        actorName="יוני מנהל"
      />
    );

    const letterTabBtn = screen.getByText('✉️ מכתב השגה למבטחת');
    fireEvent.click(letterTabBtn);

    expect(screen.getAllByText(/השגה ודרישת הפרשים/).length).toBeGreaterThan(0);
    expect(screen.getByText('📋 העתק נוסח מכתב')).toBeDefined();
  });
});
