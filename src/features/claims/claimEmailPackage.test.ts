import { describe, expect, it } from 'vitest';
import {
  classifyClaimDoc,
  CLAIM_PACKAGE_CATEGORIES,
  formatPackageEmailBody,
} from './claimEmailPackageModel';

describe('claimEmailPackageModel and Classification', () => {
  it('has all 9 required categories defined with icons and labels', () => {
    expect(CLAIM_PACKAGE_CATEGORIES.length).toBe(9);
    const keys = CLAIM_PACKAGE_CATEGORIES.map((c) => c.key);
    expect(keys).toContain('claim_details');
    expect(keys).toContain('our_surveyor');
    expect(keys).toContain('counter_surveyor');
    expect(keys).toContain('invoices');
    expect(keys).toContain('payments');
    expect(keys).toContain('letters');
    expect(keys).toContain('damage_photos');
    expect(keys).toContain('legal_reports');
    expect(keys).toContain('other_docs');
  });

  it('classifies legal briefs correctly', () => {
    expect(
      classifyClaimDoc({
        id: '1',
        original_name: '01_תדריך_משפטי_מקיף_לעורך_הדין_DAL-2026-0008.pdf',
      })
    ).toBe('legal_reports');

    expect(
      classifyClaimDoc({
        id: '2',
        original_name: '03_טבלת_השוואת_שומות_מפורטת.pdf',
      })
    ).toBe('legal_reports');
  });

  it('classifies our surveyor vs counter surveyor correctly', () => {
    expect(
      classifyClaimDoc({
        id: '3',
        original_name: 'שומת_שמאי_ליונל_ויינהאוז_2201-0-1.pdf',
        doc_kind: 'surveyor_report',
      })
    ).toBe('our_surveyor');

    expect(
      classifyClaimDoc({
        id: '4',
        original_name: 'שמאות נגדית מבוטח לתביעה אלי אהרונסון.pdf',
        doc_kind: 'surveyor_report',
        doc_meta: { is_counter: true },
      })
    ).toBe('counter_surveyor');
  });

  it('classifies invoices and receipts correctly', () => {
    expect(
      classifyClaimDoc({
        id: '5',
        original_name: 'חשבון_עיסקה_שכט_שמאי_1263.jpg',
        doc_meta: { staff_type: 'fee_invoice' },
      })
    ).toBe('invoices');

    expect(
      classifyClaimDoc({
        id: '6',
        original_name: 'חשבונית מס יוני מרכז הפגושים 2503.pdf',
        doc_meta: { staff_type: 'garage_invoice' },
      })
    ).toBe('invoices');
  });

  it('classifies payment notices correctly', () => {
    expect(
      classifyClaimDoc({
        id: '7',
        original_name: 'הודעת תשלום וסילוק WeSure.pdf',
        doc_meta: { staff_type: 'payment_notice' },
      })
    ).toBe('payments');
  });

  it('classifies claim details and forms correctly', () => {
    expect(
      classifyClaimDoc({
        id: '8',
        original_name: 'טופס הודעה על תאונת רכב חתום.pdf',
        doc_meta: { staff_type: 'accident_notice' },
      })
    ).toBe('claim_details');

    expect(
      classifyClaimDoc({
        id: '9',
        original_name: 'כתבי הסכמה רכב ורישיון.pdf',
        doc_meta: { staff_type: 'consent_form' },
      })
    ).toBe('claim_details');
  });

  it('classifies correspondence and letters correctly', () => {
    expect(
      classifyClaimDoc({
        id: '10',
        original_name: 'מכתב דרישת מסמכים WeSure.pdf',
        doc_meta: { staff_type: 'rejection_letter' },
      })
    ).toBe('letters');
  });

  it('classifies damage photos correctly', () => {
    expect(
      classifyClaimDoc({
        id: '11',
        original_name: 'RCV0001.JPG',
        mime_type: 'image/jpeg',
      })
    ).toBe('damage_photos');
  });

  it('formats verified email body with grounded financial numbers without unverified claims', () => {
    const text = formatPackageEmailBody({
      claimId: 'DAL-2026-0008',
      clientName: 'פלורה כהן / אלימלך דוד',
      plate: '11874-503',
      insCompany: 'WeSure',
      fileCount: 19,
      totalMb: '9.72',
      shareUrl: 'https://staging.example/claims-share/?t=abc',
      expiresText: '05/11/2026, 20:50',
    });

    expect(text).toContain('DAL-2026-0008');
    expect(text).toContain('11874-503');
    expect(text).toContain('19 קבצים');
    expect(text).toContain('9.72 MB');
    expect(text).toContain('https://staging.example/claims-share/?t=abc');
    // Ensure no unverified claims
    expect(text).not.toContain('747');
    expect(text).not.toContain('2,336.81');
  });
});
