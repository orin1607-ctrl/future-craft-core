import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriInspectionMetaCard } from '@/components/vehicles/TriInspectionMetaCard';
import { TriInspectionNotesField } from '@/components/vehicles/TriInspectionNotesField';
import { formatInspectionDateHe } from '@/lib/triInspectionDisplay';

describe('TriInspectionMetaCard', () => {
  it('shows last performed date, internal number and vehicle year', () => {
    render(
      <TriInspectionMetaCard
        lastInspectionDate="2026-03-12"
        internalNumber="OC-17"
        year={2019}
      />,
    );
    expect(screen.getByTestId('tri-last-inspection-date').textContent).toBe(
      `בדיקה אחרונה: ${formatInspectionDateHe('2026-03-12')}`,
    );
    expect(screen.getByTestId('tri-internal-number').textContent).toContain('OC-17');
    expect(screen.getByTestId('tri-vehicle-year').textContent).toBe('2019');
    expect(screen.getByText(/בדיקה אחרונה:/)).toBeTruthy();
    expect(screen.getByText('מספר פנימי')).toBeTruthy();
    expect(screen.getByText('שנת הרכב')).toBeTruthy();
  });

  it('shows לא קיימת בדיקה קודמת when no tri inspection was performed yet', () => {
    render(<TriInspectionMetaCard lastInspectionDate={null} internalNumber="" year={null} />);
    expect(screen.getByTestId('tri-last-inspection-date').textContent).toBe(
      'בדיקה אחרונה: לא קיימת בדיקה קודמת',
    );
    expect(screen.getByTestId('tri-vehicle-year').textContent).toBe('—');
  });
});

describe('TriInspectionNotesField', () => {
  it('is a wrapping textarea without ✓/✕ inside the notes area', () => {
    render(
      <TriInspectionNotesField
        value="התחלה של משפט ארוך שנמשך גם בהמשך"
        onChange={() => {}}
      />,
    );
    const box = screen.getByTestId('tri-inspection-notes');
    expect(box.querySelector('button')).toBeNull();
    expect(box.textContent).not.toMatch(/[✓✕✗]/);
    const area = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(area.value).toContain('התחלה של משפט ארוך');
    expect(area.className).toMatch(/whitespace-pre-wrap/);
    expect(area.className).toMatch(/min-h-\[14rem\]/);
    expect(area.className).toMatch(/text-base/);
    expect(area.rows).toBe(10);
  });
});

describe('tri inspection form order', () => {
  it('keeps the large free-text notes block above the digital signature', () => {
    const src = readFileSync('src/pages/PrivateVehicleInspection.tsx', 'utf8');
    const notesAt = src.indexOf('<TriInspectionNotesField');
    const signatureAt = src.indexOf('data-testid="tri-inspection-signature"');
    expect(notesAt).toBeGreaterThan(0);
    expect(signatureAt).toBeGreaterThan(notesAt);
    expect(src).toContain('DigitalSignaturePad');
    expect(src).toContain('TriInspectionMetaCard');
    expect(src).toContain("eq('inspection_type', TRI_SEMI_INSPECTION_TYPE)");
    expect(src).toContain('pickLatestTriInspectionDate');
  });
});
