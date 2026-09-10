import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import GarageApp from './GarageApp';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/garage-management/*" element={<GarageApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('garage-management screens', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens a case from existing customer through to the case hub', () => {
    renderAt('/garage-management');
    expect(screen.getByText('ניהול מוסך')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ פתח תיק' }));
    expect(screen.getByText('לקוח קיים')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /לקוח קיים/ }));
    expect(screen.getByPlaceholderText('שם / טלפון / חברה')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'בחר ←' })[0]);
    expect(screen.getByText('רכב')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /בחר ופתח תיק/ })[0]);
    expect(screen.getByText('הפעולה הבאה')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'בדיקת רכב' }));
    expect(screen.getByText('4 זוויות חובה')).toBeInTheDocument();
  });

  it('opens every Case Hub action for the seeded Eldan file', () => {
    renderAt('/garage-management/cases/case-1054');
    expect(screen.getByText('תיק #1054')).toBeInTheDocument();
    const buttons = [
      'מפת נזקים',
      'הצעת מחיר',
      'הזמנת עבודה',
      'גלריה',
      'תקשורת',
      'שיתוף מאובטח',
      'קבלת רכב',
      'היסטוריה',
    ];
    for (const label of buttons) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'הצעת מחיר' }));
    expect(screen.getByText('כנף קדמית שמאל')).toBeInTheDocument();
    expect(screen.getByText('פנס קדמי ימין')).toBeInTheDocument();
  });

  it('opens communication, share, intake, history and complete from the hub', () => {
    renderAt('/garage-management/cases/case-1054');
    fireEvent.click(screen.getByRole('button', { name: 'תקשורת' }));
    expect(screen.getByText('Thread')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    fireEvent.click(screen.getByRole('button', { name: 'שיתוף מאובטח' }));
    expect(screen.getByText('בחר מה לשתף')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    fireEvent.click(screen.getByRole('button', { name: 'קבלת רכב' }));
    expect(screen.getByText("קילומטראז'")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    fireEvent.click(screen.getByRole('button', { name: 'היסטוריה' }));
    expect(screen.getByText('יוסי פתח תיק')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    fireEvent.click(screen.getByRole('button', { name: 'סיום / סגירה' }));
    expect(screen.getByText(/שום מידע לא נמחק/)).toBeInTheDocument();
  });
});
