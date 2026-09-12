import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import GarageApp from './GarageApp';
import approvedSourceHtml from './approved-source.html?raw';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', full_name: 'יוסי', role: 'super_admin' } }),
}));

vi.mock('./garageBook', async () => {
  const actual = await vi.importActual<typeof import('./garageBook')>('./garageBook');
  return {
    ...actual,
    listCases: vi.fn(async () => []),
    getCase: vi.fn(async () => null),
    probeGarageBook: vi.fn(async () => ({ ready: false, pending: true, error: actual.GARAGE_BOOK_PENDING_MESSAGE })),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/garage-management/:caseId" element={<GarageApp />} />
        <Route path="/garage-management" element={<GarageApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('garage-management approved source', () => {
  it('mounts the approved HTML prototype on the existing route', () => {
    renderAt('/garage-management');
    const frame = screen.getByTitle('ניהול מוסך') as HTMLIFrameElement;
    expect(frame).toBeInTheDocument();
    expect(frame.getAttribute('allow')).toContain('camera');
    expect(frame.srcdoc).toContain('פתח תיק');
    expect(frame.srcdoc).toContain('דליה — לקוחות ישירים');
    expect(frame.srcdoc).toContain('מפת נזקים אינטראקטיבית');
    expect(frame.srcdoc).toContain('הזמנת עבודה');
    expect(frame.srcdoc).toContain('שיתוף מאובטח');
    expect(frame.srcdoc).toContain('קבלת רכב');
    expect(frame.srcdoc).toContain('מה המסלול של התיק?');
    expect(frame.srcdoc).toContain('סיום עבודה');
    expect(frame.srcdoc).toContain('סגירת תיק');
  });

  it('keeps nested garage-management case ids on the approved source', () => {
    renderAt('/garage-management/case-1056');
    expect(screen.getByTitle('ניהול מוסך')).toBeInTheDocument();
  });

  it('preserves the approved flow screens and persist bridge', () => {
    expect(approvedSourceHtml).toContain('id="s-home"');
    expect(approvedSourceHtml).toContain('id="s-choose"');
    expect(approvedSourceHtml).toContain('id="s-search"');
    expect(approvedSourceHtml).toContain('id="s-newtype"');
    expect(approvedSourceHtml).toContain('id="s-newform"');
    expect(approvedSourceHtml).toContain('id="s-newvehicle"');
    expect(approvedSourceHtml).toContain('id="s-vehform"');
    expect(approvedSourceHtml).toContain('id="s-case"');
    expect(approvedSourceHtml).toContain('function go(id)');
    expect(approvedSourceHtml).toContain('function createShareLink()');
    expect(approvedSourceHtml).toContain('function confirmIntake()');
    expect(approvedSourceHtml).toContain('function confirmCloseCase()');
    expect(approvedSourceHtml).toContain("callHost('gm:saveCase'");
    expect(approvedSourceHtml).toContain('saveCustomerAndContinue');
    expect(approvedSourceHtml).toContain('home-cases');
    expect(approvedSourceHtml).toContain('gm:goManager');
    expect(approvedSourceHtml).toContain('חזרה למסך הניהול');
    expect(approvedSourceHtml).toContain('garage_case_id');
    expect(approvedSourceHtml).toContain('book-pending-banner');
    expect(approvedSourceHtml).toContain('function schedulePersist()');
    expect(approvedSourceHtml).toContain('startScreen');
    expect(approvedSourceHtml).not.toContain('אלדן');
    expect(approvedSourceHtml).not.toContain('orders@aldan.co.il');
    expect(approvedSourceHtml).not.toContain('תיק #1056');
    expect(approvedSourceHtml).not.toContain('12-345-67');
    expect(approvedSourceHtml).not.toContain('ישראל ישראלי');
    expect(approvedSourceHtml).not.toContain('רהיטי הצפון');
    expect(approvedSourceHtml).toContain('function bindLiveCase()');
    expect(approvedSourceHtml).toContain('quote-works-empty');
    expect(approvedSourceHtml).toContain('clearCustomerForm');
    expect(approvedSourceHtml).toContain('מה המסלול של התיק?');
    expect(approvedSourceHtml).toContain('שיטת עבודה ברירת מחדל');
    expect(approvedSourceHtml).toContain('ברירת מחדל מכרטיס הלקוח');
    expect(approvedSourceHtml).not.toContain('ברירת מחדל לפי סוג הלקוח');
    expect(approvedSourceHtml).toContain('capture="environment"');
    expect(approvedSourceHtml).toContain("callHost('gm:uploadMedia'");
    expect(approvedSourceHtml).toContain('4 תמונות חובה לקבלת רכב');
    expect(approvedSourceHtml).toContain('תמונות נזק / הצעת מחיר');
    expect(approvedSourceHtml).not.toContain('צילומי חובה — 4 זוויות');
  });

  it('keeps the approved iframe script syntactically valid', () => {
    const script = approvedSourceHtml.split('<script>')[1]?.split('</script>')[0] || '';
    expect(script.length).toBeGreaterThan(100);
    expect(() => new Script(script)).not.toThrow();
  });

  it('opens a new garage file from /garage-management?new=1', () => {
    renderAt('/garage-management?new=1');
    expect(screen.getByTitle('ניהול מוסך')).toBeInTheDocument();
  });
});
