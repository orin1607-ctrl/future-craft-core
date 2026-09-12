import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import approvedSourceHtml from './approved-source.html?raw';

function bootFlow() {
  const dom = new JSDOM(approvedSourceHtml, {
    runScripts: 'dangerously',
    url: 'https://oren.test/garage-management',
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & {
    applyBootstrap: (payload: Record<string, unknown>) => void;
    go: (id: string) => void;
    startNewCustomer: (type: string) => void;
    saveWork: () => void;
    document: Document;
    scrollTo: (...args: unknown[]) => void;
  };
  win.scrollTo = () => {};
  return win;
}

const qaCase = {
  id: 'qa-case-id-1',
  case_number: 'GM-2026-0099',
  customer_name_snapshot: 'לקוח בדיקת מוסך QA',
  vehicle_plate_snapshot: '99-888-77',
  vehicle_label_snapshot: 'Mazda · 3',
  opened_by_name: 'QA',
  created_at: '2026-09-12T10:00:00.000Z',
  customer: {
    id: 'cust-1',
    customer_number: 1399,
    customer_type: 'private',
    name: 'לקוח בדיקת מוסך QA',
    company_name: '',
    phone: '050-9991111',
    email: '',
  },
  vehicle: {
    id: 'veh-1',
    plate: '99-888-77',
    make: 'Mazda',
    model: '3',
    year: 2020,
  },
  case_data: {},
};

describe('garage flow live case binding', () => {
  it('keeps the approved iframe script valid after stripping demo data', () => {
    const script = approvedSourceHtml.split('<script>')[1]?.split('</script>')[0] || '';
    expect(() => new Script(script)).not.toThrow();
  });

  it('binds quote header to the opened customer and starts with empty works/parts', () => {
    const win = bootFlow();
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.go('s-quote');
    const quote = win.document.getElementById('s-quote')?.textContent || '';
    expect(quote).toContain('לקוח בדיקת מוסך QA');
    expect(quote).toContain('GM-2026-0099');
    expect(quote).toContain('99-888-77');
    expect(quote).toContain('Mazda');
    expect(quote).toContain('#1399');
    expect(quote).toContain('אין עבודות עדיין');
    expect(quote).toContain('אין חלקים עדיין');
    expect(quote).not.toContain('אלדן');
    expect(quote).not.toContain('ישראל ישראלי');
    expect(quote).not.toContain('רהיטי');
    expect(quote).not.toMatch(/2,773/);
    expect(quote).not.toContain('Toyota Corolla');
  });

  it('clears the new-customer form instead of showing leftover demo values', () => {
    const win = bootFlow();
    win.applyBootstrap({ mode: 'home', cases: [], startScreen: 's-choose', bookPending: false });
    const name = win.document.getElementById('cust-name') as HTMLInputElement;
    name.value = 'ערך ישן';
    win.startNewCustomer('private');
    expect((win.document.getElementById('cust-name') as HTMLInputElement).value).toBe('');
    expect((win.document.getElementById('cust-phone') as HTMLInputElement).value).toBe('');
    expect(win.document.getElementById('s-newform')?.classList.contains('active')).toBe(true);
  });

  it('keeps added quote lines on the same live case', () => {
    const win = bootFlow();
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.go('s-quote');
    (win.document.getElementById('w-part') as HTMLInputElement).value = 'תיקון דלת QA';
    (win.document.getElementById('w-qty') as HTMLInputElement).value = '2';
    (win.document.getElementById('w-price') as HTMLInputElement).value = '100';
    win.saveWork();
    const quote = win.document.getElementById('s-quote')?.textContent || '';
    expect(quote).toContain('תיקון דלת QA');
    expect(quote).toContain('לקוח בדיקת מוסך QA');
    expect(quote).not.toContain('אלדן');
  });
});
