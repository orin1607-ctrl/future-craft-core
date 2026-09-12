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

  it('defaults a private customer to quote-first and does not require 4 photos before the quote', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      setCaseRoute: (route: string) => void;
      document: Document;
    };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    expect(win.document.getElementById('route-opt-quote_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('next-action-label')?.textContent).toContain('הכנת הצעת מחיר');
    expect(win.document.getElementById('s-inspect')?.textContent).toContain('אופציונלי');
    expect(win.document.getElementById('s-inspect')?.textContent).not.toContain('צילומי חובה — 4 זוויות');
    expect(win.document.getElementById('s-intake')?.textContent).toContain('4 תמונות חובה לקבלת רכב');
    expect(win.document.getElementById('gm-file-camera')?.getAttribute('capture')).toBe('environment');
    win.setCaseRoute('intake_first');
    expect(win.document.getElementById('route-opt-intake_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('next-action-label')?.textContent).toContain('העלאת הזמנת לקוח');
  });

  it('does not treat a fleet customer as intake-first unless that is the saved customer default', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      startNewCustomer: (type: string) => void;
      document: Document;
    };
    win.startNewCustomer('fleet');
    expect(win.document.getElementById('cust-wf-quote_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('cust-wf-intake_first')?.classList.contains('sel')).toBe(false);

    const fleetQuote = {
      ...qaCase,
      id: 'qa-fleet-quote',
      case_number: 'GM-QA-FLEET-Q',
      customer_name_snapshot: 'QA / TEST חברה הצעה תחילה',
      customer: {
        id: 'cust-fq',
        customer_number: 9002,
        customer_type: 'fleet',
        default_workflow: 'quote_first',
        name: '',
        company_name: 'QA / TEST חברה הצעה תחילה',
        phone: '039000001',
        email: '',
      },
      case_data: { route: 'quote_first' },
    };
    win.applyBootstrap({ mode: 'case', loaded: fleetQuote, bookPending: false });
    expect(win.document.getElementById('route-opt-quote_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('next-action-label')?.textContent).toContain('הכנת הצעת מחיר');

    const fleetIntake = {
      ...fleetQuote,
      id: 'qa-fleet-intake',
      case_number: 'GM-QA-FLEET-I',
      customer_name_snapshot: 'QA / TEST חברה קבלה תחילה',
      customer: {
        ...fleetQuote.customer,
        id: 'cust-fi',
        default_workflow: 'intake_first',
        company_name: 'QA / TEST חברה קבלה תחילה',
      },
      case_data: { route: 'intake_first' },
    };
    win.applyBootstrap({ mode: 'case', loaded: fleetIntake, bookPending: false });
    expect(win.document.getElementById('route-opt-intake_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('next-action-label')?.textContent).toContain('העלאת הזמנת לקוח');
  });

  it('saves a customer-only record without creating a vehicle or garage case', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      startNewCustomer: (type: string) => void;
      saveCustomerAndContinue: (force: boolean) => void;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      alert: (msg?: string) => void;
      document: Document;
    };
    const hostCalls: string[] = [];
    const alerts: string[] = [];
    const posted: Array<{ type?: string }> = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    const originalPost = win.parent.postMessage.bind(win.parent);
    win.parent.postMessage = ((data: unknown, targetOrigin?: string, transfer?: Transferable[]) => {
      posted.push((data || {}) as { type?: string });
      return originalPost(data, targetOrigin as string, transfer);
    }) as typeof win.parent.postMessage;
    win.callHost = (type: string) => {
      hostCalls.push(type);
      if (type === 'gm:createCustomer') {
        return Promise.resolve({
          customer: {
            id: 'cust-only-qa',
            customer_number: 1410,
            customer_type: 'private',
            name: 'לקוח QA הקמת לקוח',
            company_name: '',
            phone: '0501410141',
            email: 'qa-customer-only@example.com',
            default_workflow: 'quote_first',
          },
          needsConfirm: false,
          duplicates: [],
        });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    win.applyBootstrap({
      mode: 'home',
      cases: [],
      startScreen: 's-newtype',
      customerOnly: true,
      bookPending: false,
    });
    expect(win.document.getElementById('s-newtype')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('newtype-title')?.textContent).toBe('הקמת לקוח');
    expect(win.document.getElementById('cust-save-btn')?.textContent).toBe('שמור לקוח');
    win.startNewCustomer('private');
    (win.document.getElementById('cust-name') as HTMLInputElement).value = 'לקוח QA הקמת לקוח';
    (win.document.getElementById('cust-phone') as HTMLInputElement).value = '0501410141';
    win.saveCustomerAndContinue(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hostCalls).toEqual(['gm:createCustomer']);
    expect(hostCalls).not.toContain('gm:createVehicle');
    expect(hostCalls).not.toContain('gm:createCase');
    expect(alerts).toContain('הלקוח הוקם בהצלחה');
    expect(posted.some((msg) => msg.type === 'gm:goManager')).toBe(true);
    expect(win.document.getElementById('s-newvehicle')?.classList.contains('active')).toBe(false);
    expect(win.document.getElementById('s-case')?.classList.contains('active')).toBe(false);
  });

  it('keeps + תיק מוסך חדש continuing from the customer form into the vehicle step', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      startNewCustomer: (type: string) => void;
      saveCustomerAndContinue: (force: boolean) => void;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      alert: (msg?: string) => void;
      document: Document;
    };
    win.alert = () => {};
    win.callHost = (type: string) => {
      if (type === 'gm:createCustomer') {
        return Promise.resolve({
          customer: {
            id: 'cust-case-qa',
            customer_number: 1411,
            customer_type: 'private',
            name: 'לקוח QA תיק חדש',
            company_name: '',
            phone: '0501411141',
            default_workflow: 'quote_first',
          },
          needsConfirm: false,
          duplicates: [],
        });
      }
      if (type === 'gm:listVehicles') {
        return Promise.resolve({ vehicles: [], history: [] });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    win.applyBootstrap({ mode: 'home', cases: [], startScreen: 's-choose', bookPending: false });
    expect(win.document.getElementById('cust-save-btn')?.textContent).toBe('שמור והמשך לרכב');
    win.startNewCustomer('private');
    (win.document.getElementById('cust-name') as HTMLInputElement).value = 'לקוח QA תיק חדש';
    (win.document.getElementById('cust-phone') as HTMLInputElement).value = '0501411141';
    win.saveCustomerAndContinue(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(win.document.getElementById('s-newvehicle')?.classList.contains('active')).toBe(true);
  });
});
