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

  it('defaults a private customer to quote-first and does not require 5 intake photos before the quote', () => {
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
    expect(win.document.getElementById('s-inspect')?.textContent).toContain('אינן 5 תמונות קבלת הרכב');
    expect(win.document.getElementById('s-intake')?.textContent).toContain('5 תמונות חובה לקבלת רכב');
    expect(win.document.getElementById('s-intake')?.textContent).toContain('קילומטראז\' נוכחי');
    expect(win.document.getElementById('s-intake')?.textContent).toContain('לוח שעונים');
    expect(win.document.getElementById('s-intake')?.querySelector('[data-intake-angle="dashboard"]')).toBeTruthy();
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
    expect(win.document.getElementById('exist-wf-quote_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('exist-wf-intake_first')?.classList.contains('sel')).toBe(false);

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

  type OpenCaseWin = Window & {
    applyBootstrap: (payload: Record<string, unknown>) => void;
    startNewCustomer: (type: string) => void;
    continueToVehicleStep: (force: boolean) => void;
    saveVehicleAndCreateCase: () => void;
    returnToGarageDashboard: () => void;
    backFromVehicleForm: () => void;
    go: (id: string) => void;
    callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    alert: (msg?: string) => void;
    document: Document;
  };

  function bootOpenCase(duplicates: unknown[] = []) {
    const win = bootFlow() as unknown as OpenCaseWin;
    const calls: Array<{ type: string; payload: Record<string, unknown> }> = [];
    win.alert = () => {};
    win.callHost = (type: string, payload: Record<string, unknown> = {}) => {
      calls.push({ type, payload });
      if (type === 'gm:checkCustomerDuplicates') return Promise.resolve({ duplicates });
      if (type === 'gm:createCustomer') {
        const draft = payload.draft as Record<string, unknown>;
        return Promise.resolve({ customer: { ...draft, id: 'cust-new-qa', customer_number: 1500 }, duplicates: [], needsConfirm: false });
      }
      if (type === 'gm:createVehicle') {
        const draft = payload.draft as Record<string, unknown>;
        return Promise.resolve({ vehicle: { ...draft, id: 'veh-new-qa' } });
      }
      if (type === 'gm:createCase') {
        return Promise.resolve({ created: { id: 'case-new-qa', case_number: 'GM-2026-0500', case_data: {} } });
      }
      if (type === 'gm:saveCase' || type === 'gm:listMedia') return Promise.resolve({ ok: true, items: [] });
      return Promise.resolve({ ok: true });
    };
    win.applyBootstrap({ mode: 'home', cases: [], startScreen: 's-home', bookPending: false });
    return { win, calls };
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const active = (win: OpenCaseWin, id: string) => win.document.getElementById(id)?.classList.contains('active');

  it('new customer form: notes last, + הוסף רכב instead of + הוסף איש קשר', () => {
    const { win } = bootOpenCase();
    win.startNewCustomer('private');
    const form = win.document.getElementById('s-newform') as HTMLElement;
    expect(form.textContent).not.toContain('+ הוסף איש קשר');
    const addVehicle = win.document.getElementById('cust-add-vehicle-btn') as HTMLElement;
    expect(addVehicle.textContent).toBe('+ הוסף רכב');
    expect(addVehicle.style.display).toBe('');
    expect((win.document.getElementById('cust-save-btn') as HTMLElement).style.display).toBe('none');
    const fields = Array.from(form.querySelectorAll('.content > .field'));
    const notesField = win.document.getElementById('cust-notes')?.closest('.field');
    expect(fields[fields.length - 1]).toBe(notesField);
    // notes come right before the next action
    expect(notesField?.compareDocumentPosition(addVehicle)).toBe(4);
    // preferred channel sits directly before notes
    const channelField = form.querySelector('[data-channel]')?.closest('.field');
    expect(fields[fields.length - 2]).toBe(channelField);
    // route choices are not on the customer step, only in the case hub
    expect(form.textContent).not.toContain('המלצת מסלול');
    expect(form.textContent).not.toContain('הצעת מחיר תחילה');
    expect(form.textContent).not.toContain('קבלת רכב');
    expect(form.querySelector('.route-opt')).toBeNull();
    const hub = win.document.getElementById('s-case')?.textContent || '';
    expect(hub).toContain('הצעת מחיר תחילה');
    expect(hub).toContain('קבלת רכב');
  });

  it('direct-customers home returns to the garage ops center, open-case returns to direct customers', () => {
    const { win } = bootOpenCase();
    const posted: Array<{ type?: string }> = [];
    const originalPost = win.parent.postMessage.bind(win.parent);
    win.parent.postMessage = ((data: unknown, targetOrigin?: string, transfer?: Transferable[]) => {
      posted.push((data || {}) as { type?: string });
      return originalPost(data, targetOrigin as string, transfer);
    }) as typeof win.parent.postMessage;
    const opsBack = win.document.querySelector('#s-home [data-testid="gm-ops-center-back"]') as HTMLElement;
    expect(opsBack.textContent).toContain('חזרה למרכז תפעול המוסך');
    opsBack.click();
    expect(posted.map((m) => m.type)).toEqual(['gm:goOpsCenter']);
    win.go('s-choose');
    const back = win.document.querySelector('#s-choose [data-testid="gm-dash-home"]') as HTMLElement;
    expect(back.textContent).toContain('חזרה ללקוחות ישירים');
    back.click();
    expect(win.document.getElementById('s-home')?.classList.contains('active')).toBe(true);
    expect(posted.map((m) => m.type)).toEqual(['gm:goOpsCenter']);
  });

  for (const type of ['private', 'business', 'fleet']) {
    it(`${type}: customer → notes → + הוסף רכב → vehicle → אישור, only then the case hub`, async () => {
      const { win, calls } = bootOpenCase();
      win.startNewCustomer(type);
      (win.document.getElementById('cust-name') as HTMLInputElement).value = `לקוח QA ${type}`;
      (win.document.getElementById('cust-phone') as HTMLInputElement).value = '0501500150';
      (win.document.getElementById('cust-notes') as HTMLTextAreaElement).value = 'הערת QA';
      win.continueToVehicleStep(false);
      await tick();
      expect(active(win, 's-vehform')).toBe(true);
      expect(active(win, 's-case')).toBe(false);
      expect(calls.map((c) => c.type)).toEqual(['gm:checkCustomerDuplicates']);

      win.backFromVehicleForm();
      expect(active(win, 's-newform')).toBe(true);
      expect((win.document.getElementById('cust-name') as HTMLInputElement).value).toBe(`לקוח QA ${type}`);
      win.continueToVehicleStep(false);
      await tick();

      win.saveVehicleAndCreateCase();
      await tick();
      expect(active(win, 's-case')).toBe(false);
      expect(calls.some((c) => c.type === 'gm:createCustomer')).toBe(false);

      (win.document.getElementById('veh-plate') as HTMLInputElement).value = '12-345-67';
      (win.document.getElementById('veh-make') as HTMLInputElement).value = 'Mazda';
      win.saveVehicleAndCreateCase();
      await tick();
      await tick();
      await tick();
      const types = calls.map((c) => c.type);
      expect(types.filter((t) => t === 'gm:createCustomer')).toHaveLength(1);
      expect(types.indexOf('gm:createCustomer')).toBeLessThan(types.indexOf('gm:createVehicle'));
      expect(types.indexOf('gm:createVehicle')).toBeLessThan(types.indexOf('gm:createCase'));
      const customerDraft = calls.find((c) => c.type === 'gm:createCustomer')?.payload.draft as Record<string, unknown>;
      expect(customerDraft.customer_type).toBe(type);
      expect(customerDraft.notes).toBe('הערת QA');
      const vehicleDraft = calls.find((c) => c.type === 'gm:createVehicle')?.payload.draft as Record<string, unknown>;
      expect(vehicleDraft.customer_id).toBe('cust-new-qa');
      expect(vehicleDraft.plate).toBe('12-345-67');
      expect(active(win, 's-case')).toBe(true);
    });
  }


  it('shows existing-customer duplicates on + הוסף רכב without creating anything', async () => {
    const { win, calls } = bootOpenCase([{ id: 'cust-old', customer_number: 7, name: 'קיים', phone: '0501500150' }]);
    win.startNewCustomer('business');
    (win.document.getElementById('cust-name') as HTMLInputElement).value = 'קיים';
    (win.document.getElementById('cust-phone') as HTMLInputElement).value = '0501500150';
    win.continueToVehicleStep(false);
    await tick();
    expect(active(win, 's-newform')).toBe(true);
    expect(win.document.getElementById('cust-dupes')?.textContent).toContain('לקוח קיים #7');
    expect(calls.map((c) => c.type)).toEqual(['gm:checkCustomerDuplicates']);
  });

  it('returns to the garage dashboard from every open-case screen without creating customer, vehicle or case', async () => {
    const shell = bootFlow();
    for (const screen of ['s-choose', 's-search', 's-newtype', 's-newform', 's-newvehicle', 's-vehform']) {
      expect(shell.document.querySelector(`#${screen} [data-testid="gm-dash-home"]`)).toBeTruthy();
    }
    const { win, calls } = bootOpenCase();
    win.go('s-choose');
    win.startNewCustomer('fleet');
    (win.document.getElementById('cust-name') as HTMLInputElement).value = 'לא לשמור';
    (win.document.getElementById('cust-phone') as HTMLInputElement).value = '0509999999';
    win.continueToVehicleStep(false);
    await tick();
    (win.document.getElementById('veh-plate') as HTMLInputElement).value = '99-999-99';
    win.returnToGarageDashboard();
    await tick();
    expect(active(win, 's-home')).toBe(true);
    expect(calls.map((c) => c.type).filter((t) => /create/.test(t))).toEqual([]);
    expect((win.document.getElementById('cust-name') as HTMLInputElement).value).toBe('');
    expect((win.document.getElementById('veh-plate') as HTMLInputElement).value).toBe('');
    win.saveVehicleAndCreateCase();
    await tick();
    expect(calls.map((c) => c.type).filter((t) => /create/.test(t))).toEqual([]);
  });


  it('blocks intake until mileage and 5 required photos including dashboard, and keeps extras unlimited', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      confirmIntake: () => void;
      go: (id: string) => void;
      alert: (msg?: string) => void;
      document: Document;
    };
    const alerts: string[] = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    (win as unknown as { state: { intakeKm: string; intakeAngles: Record<string, boolean> } }).state = Object.assign(
      (win as unknown as { state: object }).state || {},
      {
        intakeKm: '',
        intakeAngles: { front: true, rear: true, right: true, left: true, dashboard: false },
      },
    );
    (win.document.getElementById('intake-km') as HTMLInputElement).value = '';
    win.confirmIntake();
    expect(alerts.some((a) => /קילומטראז/.test(a))).toBe(true);
    (win.document.getElementById('intake-km') as HTMLInputElement).value = '12000';
    win.confirmIntake();
    expect(alerts.some((a) => /לוח השעונים|לוח שעונים/.test(a))).toBe(true);
    expect(win.document.getElementById('s-intake')?.textContent).toContain('תמונה נוספת');
    expect(win.document.getElementById('s-intake')?.textContent).toContain('בלי הגבלה');
  });

  it('shows extracted order fields for worker confirm and does not save until saveWorkOrder', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      showOrderExtractReview: (extract: Record<string, unknown>) => void;
      applyExtractedOrderToForm: () => void;
      saveWorkOrder: () => void;
      alert: (msg?: string) => void;
      document: Document;
    };
    win.alert = () => {};
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.showOrderExtractReview({
      source: 'pdf_text',
      note: 'חולץ מטקסט המסמך: מספר הזמנה, מספר תיק / אסמכתא, תאריך הזמנה.',
      fields: { order_number: '88900123', case_ref: 'TK-4421', order_date: '12/09/2026' },
    });
    expect(win.document.getElementById('wo-scan-result')?.getAttribute('style') || '').not.toContain('display:none');
    expect((win.document.getElementById('wo-scan-num') as HTMLInputElement).value).toBe('88900123');
    expect((win.document.getElementById('wo-scan-ref') as HTMLInputElement).value).toBe('TK-4421');
    expect((win.document.getElementById('wo-scan-date') as HTMLInputElement).value).toBe('12/09/2026');
    expect(win.document.getElementById('wo-scan-result')?.textContent).not.toContain('חברה');
    expect((win.document.getElementById('wo-num') as HTMLInputElement).value).toBe('');
    win.showOrderExtractReview('order-PO-4455-99-888-77-claim-QA12.pdf');
    expect((win.document.getElementById('wo-scan-num') as HTMLInputElement).value).toBe('');
    win.showOrderExtractReview({
      source: 'pdf_text',
      fields: { order_number: '88900123', case_ref: 'TK-4421', order_date: '12/09/2026' },
    });
    win.applyExtractedOrderToForm();
    expect((win.document.getElementById('wo-num') as HTMLInputElement).value).toBe('88900123');
    expect((win.document.getElementById('wo-ref') as HTMLInputElement).value).toBe('TK-4421');
    expect((win.document.getElementById('wo-date') as HTMLInputElement).value).toBe('12/09/2026');
    expect((win as unknown as { state: { workOrderSaved?: boolean } }).state.workOrderSaved).toBeFalsy();
    (win.document.getElementById('wo-amount') as HTMLInputElement).value = '1500';
    win.saveWorkOrder();
    expect((win as unknown as { state: { workOrderSaved?: boolean; workOrderNumber?: string; workOrderDate?: string } }).state.workOrderSaved).toBe(true);
    expect((win as unknown as { state: { workOrderNumber?: string } }).state.workOrderNumber).toBe('88900123');
    expect((win as unknown as { state: { workOrderDate?: string } }).state.workOrderDate).toBe('12/09/2026');
  });

  it('prefills the existing send area from the live case with email as default', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      go: (id: string) => void;
      fillSendFromCase: () => void;
      document: Document;
    };
    const loaded = {
      ...qaCase,
      customer: {
        ...qaCase.customer,
        email: 'qa-garage@example.com',
        phone: '0509991111',
        company_name: '',
      },
      case_data: { route: 'quote_first', workOrderNumber: 'PO-4455', quoteWorks: [{ part: 'דלת', qty: 1, price: 200 }] },
    };
    win.applyBootstrap({ mode: 'case', loaded, bookPending: false });
    (win as unknown as { state: { workOrderNumber: string; quoteWorks: Array<{ price: number; qty: number }> } }).state.workOrderNumber = 'PO-4455';
    (win as unknown as { state: { quoteWorks: Array<{ price: number; qty: number }> } }).state.quoteWorks = [{ price: 200, qty: 1 }];
    win.go('s-compose');
    expect(win.document.getElementById('compose-channel-row')?.querySelector('.chip.selected')?.textContent).toContain('מייל');
    expect((win.document.getElementById('compose-to') as HTMLInputElement).value).toContain('qa-garage@example.com');
    expect((win.document.getElementById('compose-subject') as HTMLInputElement).value).toContain('GM-2026-0099');
    expect((win.document.getElementById('compose-body') as HTMLTextAreaElement).value).toContain('99-888-77');
    expect((win.document.getElementById('compose-body') as HTMLTextAreaElement).value).toContain('PO-4455');
    expect(win.document.getElementById('s-compose')?.textContent).toContain('WhatsApp');
    expect(win.document.getElementById('s-compose')?.textContent).toContain('לא תיבת Claims');
    expect(win.document.getElementById('s-compose')?.textContent).toContain('yoni191177@gmail.com');
    win.go('s-comm');
    expect(win.document.getElementById('s-comm')?.textContent).toContain('מיילים / התכתבויות / עדכונים');
    expect(win.document.getElementById('s-comm')?.textContent).toContain('yoni191177@gmail.com');
    expect(win.document.getElementById('s-comm')?.textContent).toContain('yoni122222@gmail.com');
  });

  it('shows exactly הצעת מחיר תחילה and קבלת רכב on the case route picker', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      confirmIntake: () => void;
      document: Document;
    };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    const quote = win.document.getElementById('route-opt-quote_first')?.textContent || '';
    const intake = win.document.getElementById('route-opt-intake_first')?.textContent || '';
    expect(quote).toContain('הצעת מחיר תחילה');
    expect(intake).toContain('קבלת רכב');
    expect(intake).not.toContain('הרכב התקבל');
    expect(intake).not.toContain('הרכב מתקבל');
    expect(intake).not.toContain('הרכב הגיע למוסך');
    expect(intake).not.toContain('קבלת רכב תחילה');
    expect(win.document.getElementById('exist-wf-intake_first')?.textContent).toContain('קבלת רכב');
    expect(win.document.getElementById('exist-wf-intake_first')?.textContent).not.toContain('קבלת רכב תחילה');
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('בדיקת רכב');
  });

  it('blocks vehicle intake until mileage and all 5 required photos exist, then sets status הרכב התקבל', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      confirmIntake: () => void;
      go: (id: string) => void;
      alert: (msg?: string) => void;
      document: Document;
      state: {
        intakeKm?: string;
        intakeAngles: Record<string, boolean>;
        intakeDone: boolean;
        workStarted: boolean;
      };
    };
    const alerts: string[] = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    win.HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) { cb(null); };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.go('s-intake');
    (win.document.getElementById('intake-km') as HTMLInputElement).value = '';
    win.confirmIntake();
    expect(alerts.some((msg) => msg.includes('קילומטראז'))).toBe(true);
    expect(win.state.intakeDone).toBe(false);

    (win.document.getElementById('intake-km') as HTMLInputElement).value = '48210';
    win.state.intakeAngles = { front: true, rear: true, right: true, left: true, dashboard: false };
    win.confirmIntake();
    expect(alerts.some((msg) => /לוח השעונים|לוח שעונים/.test(msg))).toBe(true);
    expect(win.state.intakeDone).toBe(false);
    expect(win.document.getElementById('case-status-badge')?.textContent).not.toBe('הרכב התקבל');

    win.state.intakeAngles.dashboard = true;
    win.confirmIntake();
    expect(alerts.some((msg) => msg.includes('הרכב התקבל'))).toBe(true);
    expect(win.state.intakeDone).toBe(false);

    win.document.getElementById('intake-worker-confirm')?.classList.add('checked');
    win.confirmIntake();
    expect(win.state.intakeDone).toBe(true);
    expect(win.state.workStarted).toBe(false);
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('הרכב התקבל');
    expect(win.document.getElementById('s-case')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('s-intake')?.textContent).toContain('תמונה נוספת');
  });

  it('does not force case route from customer default_workflow and requires closeout gates', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      confirmCloseCase: () => void;
      finishWork: () => void;
      markDeliveryDone: () => void;
      confirmDeliverySignature: () => void;
      reopenClosedCase: () => void;
      alert: (msg?: string) => void;
      document: Document;
      state: Record<string, unknown>;
    };
    const alerts: string[] = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    win.HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) { cb(null); };
    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        customer: { ...qaCase.customer, customer_type: 'fleet', default_workflow: 'intake_first', company_name: 'QA צי' },
        case_data: { route: 'quote_first' },
      },
      bookPending: false,
    });
    expect(win.document.getElementById('route-opt-quote_first')?.classList.contains('sel')).toBe(true);
    expect(win.document.getElementById('s-case')?.textContent).toContain('העובד בוחר את המסלול בכל תיק');
    expect(win.document.getElementById('s-newform')?.textContent).not.toContain('+ הוסף איש קשר');
    expect(win.document.getElementById('s-newvehicle')?.textContent).toContain('+ הוסף איש קשר');
    win.finishWork();
    expect(win.state.workFinished).toBeFalsy();
    expect(alerts.some((msg) => /לא ניתן לסיים את העבודה/.test(msg))).toBe(true);
    win.state.workFinished = true;
    win.state.quoteApproved = true;
    win.state.quoteWorks = [{ part: 'תיקון', qty: 1, price: 100 }];
    win.state.finishAngles = { front: true, rear: true, right: true, left: true };
    win.confirmCloseCase();
    expect(alerts.some((msg) => /לא ניתן לסגור/.test(msg))).toBe(true);
    expect(win.state.caseClosed).toBeFalsy();
    expect(win.document.getElementById('s-close')?.textContent).toContain('אני מאשר שקיבלתי את הרכב');
    expect(win.document.getElementById('s-close')?.textContent).toContain('קילומטראז\' במסירה');
  });

  it('gates finish work on 4 photos and approved price, then drops the case from the open list', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      finishWork: () => void;
      captureFinishFields: () => void;
      setHomeBucket: (bucket: string) => void;
      reopenClosedCase: () => void;
      go: (id: string) => void;
      alert: (msg?: string) => void;
      document: Document;
      state: Record<string, unknown>;
    };
    const alerts: string[] = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    win.applyBootstrap({
      mode: 'home',
      cases: [
        { id: 'open-1', case_number: 'GM-1', status: 'בדיקת רכב', customer_name_snapshot: 'פתוח QA', vehicle_plate_snapshot: '11-111-11', vehicle_label_snapshot: 'Open', case_data: {} },
        { id: 'work-1', case_number: 'GM-2', status: 'בעבודה', customer_name_snapshot: 'בעבודה QA', vehicle_plate_snapshot: '22-222-22', vehicle_label_snapshot: 'Work', case_data: { workStarted: true } },
        { id: 'done-1', case_number: 'GM-3', status: 'סגור', customer_name_snapshot: 'סגור QA', vehicle_plate_snapshot: '33-333-33', vehicle_label_snapshot: 'Done', case_data: { workFinished: true } },
      ],
      bookPending: false,
    });
    const openList = win.document.getElementById('home-cases')?.textContent || '';
    expect(openList).toContain('פתוח QA');
    expect(openList).not.toContain('בעבודה QA');
    expect(openList).not.toContain('סגור QA');
    win.setHomeBucket('in_work');
    expect(win.document.getElementById('home-cases')?.textContent).toContain('בעבודה QA');
    expect(win.document.getElementById('home-cases')?.textContent).not.toContain('פתוח QA');
    win.setHomeBucket('closed');
    expect(win.document.getElementById('home-cases')?.textContent).toContain('סגור QA');
    expect(win.document.getElementById('home-cases')?.textContent).not.toContain('פתוח QA');

    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        case_data: {
          quoteApproved: true,
          quoteWorks: [{ part: 'תיקון', qty: 1, price: 250 }],
          workStarted: true,
        },
      },
      bookPending: false,
      userName: 'יוסי QA',
    });
    win.go('s-finish');
    expect(win.document.getElementById('s-finish')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('confirm-finish-btn')).toHaveProperty('disabled', true);
    win.finishWork();
    expect(win.state.workFinished).toBeFalsy();
    expect(alerts.some((msg) => /תמונות סיום/.test(msg))).toBe(true);

    win.state.finishAngles = { front: true, rear: true, right: true, left: false };
    win.finishWork();
    expect(win.state.workFinished).toBeFalsy();

    win.state.quoteApproved = false;
    win.state.finishAngles = { front: true, rear: true, right: true, left: true };
    win.finishWork();
    expect(win.state.workFinished).toBeFalsy();
    expect(alerts.some((msg) => /מחיר סופי מאושר/.test(msg))).toBe(true);

    win.state.quoteApproved = true;
    (win.document.getElementById('finish-km') as HTMLInputElement).value = '51200';
    (win.document.getElementById('finish-notes') as HTMLTextAreaElement).value = 'נמסר מוכן לנסיעה';
    win.finishWork();
    expect(win.state.workFinished).toBe(true);
    expect(win.state.finishKm).toBe('51200');
    expect(win.state.finishNotes).toBe('נמסר מוכן לנסיעה');
    expect(win.state.workFinishedBy).toBe('יוסי QA');
    expect(win.state.caseClosed).toBeFalsy();
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('סגור');
    expect(win.document.getElementById('s-case')?.classList.contains('active')).toBe(true);
    const timeline = win.document.getElementById('timeline-content')?.textContent || '';
    expect(timeline).toContain('סיום עבודה / סגירת רכב');
    expect(timeline).toContain('ק״מ בסיום 51200');
    expect(timeline).toContain('הערות סיום: נמסר מוכן לנסיעה');

    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        status: 'סגור',
        case_data: {
          workStarted: true,
          workFinished: true,
          workFinishedAt: '2026-09-12T12:00:00.000Z',
          workFinishedBy: 'יוסי QA',
          finishKm: '51200',
          finishNotes: 'נמסר מוכן לנסיעה',
          finishAngles: { front: true, rear: true, right: true, left: true },
          quoteApproved: true,
          quoteWorks: [{ part: 'תיקון', qty: 1, price: 250 }],
          finalApprovedAmount: 295,
          timeline: [
            { at: '2026-09-12T12:00:00.000Z', text: 'סיום עבודה · מחיר מאושר · ק״מ בסיום 51200' },
            { at: '2026-09-12T12:00:01.000Z', text: 'הערות סיום: נמסר מוכן לנסיעה' },
          ],
        },
      },
      bookPending: false,
    });
    expect(win.state.workFinished).toBe(true);
    expect(win.state.finishKm).toBe('51200');
    expect(win.state.finishNotes).toBe('נמסר מוכן לנסיעה');
    expect(win.state.workFinishedBy).toBe('יוסי QA');
    expect((win.document.getElementById('finish-km') as HTMLInputElement).value).toBe('51200');
    expect((win.document.getElementById('finish-notes') as HTMLTextAreaElement).value).toBe('נמסר מוכן לנסיעה');
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('סגור');
    expect(win.document.getElementById('timeline-content')?.textContent).toContain('הערות סיום: נמסר מוכן לנסיעה');

    win.reopenClosedCase();
    expect(win.state.workFinished).toBe(false);
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('רכב בעבודה');
    expect((win.document.getElementById('timeline-content')?.textContent || '')).toContain('תיק נפתח מחדש');
  });

  it('keeps extra-work email send from looking like customer approval', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      sendExtraApproval: (channel: string) => void;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      document: Document;
      state: { extraApprovals: Array<{ status?: string; approvedAt?: string }> };
    };
    win.callHost = (type: string) => {
      if (type === 'gm:saveCase' || type === 'gm:listMedia' || type === 'gm:garageGmailStatus') {
        return Promise.resolve({ ok: true, items: [], connected: true, canSend: true });
      }
      if (type === 'gm:sendGarageMail') {
        return Promise.resolve({
          ok: true,
          realEmailSend: true,
          gmail_message_id: 'msg-extra-1',
          gmail_thread_id: 'thr-extra-1',
          appliedThisCase: { correspondence: [], timeline: [] },
        });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    win.alert = () => {};
    (win as unknown as { __garageGmailServerConnected: boolean }).__garageGmailServerConnected = true;
    (win as unknown as { __garageGmailCanSend: boolean }).__garageGmailCanSend = true;
    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        customer: { ...qaCase.customer, email: 'qa-garage@example.com' },
      },
      bookPending: false,
    });
    (win.document.getElementById('extra-text') as HTMLTextAreaElement).value = 'תוספת עבודה QA';
    (win.document.getElementById('extra-price') as HTMLInputElement).value = '250';
    win.sendExtraApproval('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(win.state.extraApprovals[0].status).toBe('sent');
    expect(win.state.extraApprovals[0].approvedAt).toBeFalsy();
    expect(win.document.getElementById('extra-approval-list')?.textContent).toContain('נשלח מהתוכנה');
    expect(win.document.getElementById('extra-approval-list')?.textContent).toContain('מה נוסף');
    expect(win.document.getElementById('extra-approval-list')?.textContent).toContain('qa-garage@example.com');
    expect(win.document.getElementById('extra-approval-list')?.textContent).not.toContain('אושר ·');
  });

  it('sends composed email through the host instead of mailto', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      go: (id: string) => void;
      sendComposedEmail: () => void;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      document: Document;
      alert: (msg?: string) => void;
    };
    const sent: Array<Record<string, unknown>> = [];
    win.alert = () => {};
    win.callHost = (type: string, payload?: Record<string, unknown>) => {
      if (type === 'gm:saveCase' || type === 'gm:listMedia' || type === 'gm:garageGmailStatus') {
        return Promise.resolve({ ok: true, items: [], connected: true, canSend: true });
      }
      if (type === 'gm:sendGarageMail') {
        sent.push(payload || {});
        return Promise.resolve({
          ok: true,
          realEmailSend: true,
          gmail_message_id: 'msg-send-1',
          gmail_thread_id: 'thr-send-1',
          file_names: ['qa.png'],
          appliedThisCase: {
            correspondence: [{
              gmail_message_id: 'msg-send-1',
              gmail_thread_id: 'thr-send-1',
              subject: 'הצעת מחיר — GM-2026-0099',
              from_addr: 'yoni191177@gmail.com',
              to_addr: 'qa-garage@example.com',
              body_text: 'שלום',
              direction: 'outgoing',
              file_names: ['qa.png'],
            }],
            timeline: [{ text: 'נשלח מייל מתוך התוכנה' }],
            quoteSent: true,
          },
        });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    (win as unknown as { __garageGmailServerConnected: boolean }).__garageGmailServerConnected = true;
    (win as unknown as { __garageGmailCanSend: boolean }).__garageGmailCanSend = true;
    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        customer: { ...qaCase.customer, email: 'qa-garage@example.com' },
      },
      bookPending: false,
    });
    win.go('s-compose');
    expect(win.document.getElementById('s-compose')?.textContent).toContain('שלח מייל מהתוכנה');
    expect(win.document.getElementById('s-compose')?.textContent).not.toContain('פתח שליחה');
    win.sendComposedEmail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain('qa-garage@example.com');
    expect(String(sent[0].to || '')).not.toContain('yoni122222');
    expect(win.document.getElementById('s-comm')?.classList.contains('active')).toBe(true);
    expect(win.document.getElementById('comm-thread-all')?.textContent).toContain('נשלח מתוך התוכנה');
    expect(win.document.getElementById('comm-thread-all')?.textContent).toContain('qa.png');
  });

  it('keeps a mail chain on the case, never auto-applies a priced order, and does not guess ambiguous mail', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      go: (id: string) => void;
      ingestGarageMail: (mail: Record<string, unknown>, match: Record<string, unknown>) => void;
      assignPendingGarageMail: () => void;
      approveGarageDetectedPrice: () => void;
      showOrderExtractReview: (extract: Record<string, unknown>) => void;
      document: Document;
      state: Record<string, unknown>;
      alert: (msg?: string) => void;
    };
    win.alert = () => {};
    win.applyBootstrap({
      mode: 'case',
      loaded: {
        ...qaCase,
        case_data: {
          quoteSent: true,
          quoteWorks: [{ part: 'תיקון', qty: 1, price: 1525.42 }],
          workOrderAmount: 1800,
        },
      },
      bookPending: false,
    });
    win.ingestGarageMail({
      messageId: 'm-a',
      threadId: 't-qa',
      subject: 'חסרה תמונה',
      body: 'נא לשלוח תמונה נוספת',
      from: 'fleet@example.com',
      sentAt: '2026-09-12T10:00:00.000Z',
    }, { decision: 'auto', caseId: qaCase.id, reason: 'ok', candidates: [qaCase.id] });
    win.ingestGarageMail({
      messageId: 'm-b',
      threadId: 't-qa',
      subject: 'הזמנה מתומחרת PO-88001',
      body: 'סכום מאושר לתשלום: 1,950 ₪',
      from: 'fleet@example.com',
      filenames: ['priced-order.pdf'],
      sentAt: '2026-09-12T11:00:00.000Z',
    }, { decision: 'auto', caseId: qaCase.id, reason: 'ok', candidates: [qaCase.id] });
    expect((win.state.correspondence as Array<{ gmail_message_id: string }>).map((m) => m.gmail_message_id)).toEqual(['m-a', 'm-b']);
    expect(win.state.quoteApproved).toBeFalsy();
    expect(win.state.workOrderAmount).toBe(1800);
    win.go('s-comm');
    const comm = win.document.getElementById('s-comm')?.textContent || '';
    expect(comm).toContain('חסרה תמונה');
    expect(comm).toContain('הזמנה מתומחרת');
    expect(comm).toContain('priced-order.pdf');
    expect(comm).toContain('פער במחיר');
    expect(comm).toContain('אשר מחיר לתיק');
    expect((win.document.getElementById('wo-amount') as HTMLInputElement).value).toBe('1800');
    win.approveGarageDetectedPrice();
    expect(win.state.quoteApproved).toBe(true);
    expect(win.state.workOrderAmount).toBe(1950);
    expect(win.state.finalApprovedAmount).toBe(1950);
    expect((win.document.getElementById('timeline-content')?.textContent || '')).toContain('העובד אישר את המחיר');

    win.ingestGarageMail({
      messageId: 'm-ambiguous',
      subject: 'עדכון',
      body: 'שלום, נא מסמך',
    }, { decision: 'needs_review', reason: 'אותו רכב ביותר מתיק מוסך אחד', candidates: ['a', 'b'] });
    expect(win.document.getElementById('garage-mail-pending')?.textContent).toContain('מייל דורש שיוך ידני');
    expect(win.document.getElementById('garage-mail-pending')?.textContent).toContain('לא מנחשים');
    win.assignPendingGarageMail();
    expect((win.state.correspondence as Array<{ gmail_message_id: string }>).some((m) => m.gmail_message_id === 'm-ambiguous')).toBe(true);
    expect((win.document.getElementById('timeline-content')?.textContent || '')).toContain('מסמך שויך ידנית לתיק');

    win.showOrderExtractReview({
      source: 'pdf_text',
      detectedAmount: 2200,
      priceLabel: 'נמצא מחיר מאושר/מתומחר: 2,200 ₪',
      fields: { order_number: 'PO-9', case_ref: '', order_date: '' },
    });
    expect((win.document.getElementById('wo-amount') as HTMLInputElement).value).toBe('1950');
    expect(win.state.workOrderAmount).toBe(1950);
  });

  it('opens Google for yoni191177 when סרוק תיבת מוסך is clicked without a mailbox connection', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      go: (id: string) => void;
      scanGarageMail: () => void;
      startGarageGmailBrowser: (clientId: string, scanAfter?: boolean) => void;
      openGarageGoogleAuthUrl: (authUrl: string) => boolean;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      document: Document;
      alert: (msg?: string) => void;
    };
    const alerts: string[] = [];
    const hostCalls: string[] = [];
    win.alert = (msg?: string) => { alerts.push(String(msg || '')); };
    win.callHost = (type: string) => {
      hostCalls.push(type);
      if (type === 'gm:saveCase' || type === 'gm:listMedia') return Promise.resolve({ ok: true, items: [] });
      if (type === 'gm:garageGmailStatus') {
        return Promise.resolve({ connected: false, pending: true, mailbox: 'yoni191177@gmail.com' });
      }
      if (type === 'gm:garageGmailOauthStart') {
        return Promise.resolve({
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa-garage.apps.googleusercontent.com&login_hint=yoni191177%40gmail.com&scope=https://www.googleapis.com/auth/gmail.readonly&redirect_uri=https://orin1607-ctrl.github.io/future-craft-core/oauth/google-callback.html',
        });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    let gisClientId = '';
    let openedAuthUrl = '';
    win.startGarageGmailBrowser = (clientId: string) => {
      gisClientId = clientId;
    };
    win.openGarageGoogleAuthUrl = (authUrl: string) => {
      openedAuthUrl = authUrl;
      return true;
    };
    (win as unknown as { __garageGmailClientId: string }).__garageGmailClientId = 'qa-garage.apps.googleusercontent.com';
    (win as unknown as { __garageGmailAuthUrl: string }).__garageGmailAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa-garage.apps.googleusercontent.com&login_hint=yoni191177%40gmail.com&scope=https://www.googleapis.com/auth/gmail.readonly&redirect_uri=https://orin1607-ctrl.github.io/future-craft-core/oauth/google-callback.html';
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.go('s-comm');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(win.document.getElementById('s-comm')?.textContent).toContain('חבר yoni191177@gmail.com');
    expect(win.document.getElementById('s-comm')?.textContent).toContain('סרוק תיבת מוסך');
    expect(hostCalls).toContain('gm:garageGmailStatus');
    expect(hostCalls).not.toContain('gm:garageGmailOauthStart');
    win.scanGarageMail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openedAuthUrl).toContain('accounts.google.com');
    expect(openedAuthUrl).toContain('yoni191177');
    expect(openedAuthUrl).toContain('gmail.readonly');
    expect(openedAuthUrl).not.toContain('yoni122222');
    expect(gisClientId).toBe('');
    expect(alerts.some((msg) => /עדיין לא מחוברת/.test(msg))).toBe(false);
  });

  it('scans from the server mailbox without opening Google after yoni191177 is already connected', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      go: (id: string) => void;
      scanGarageMail: () => void;
      openGarageGoogleAuthUrl: (authUrl: string) => boolean;
      callHost: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      document: Document;
      alert: (msg?: string) => void;
    };
    const hostCalls: string[] = [];
    let openedAuthUrl = '';
    let scanned = 0;
    win.alert = () => {};
    win.openGarageGoogleAuthUrl = (authUrl: string) => {
      openedAuthUrl = authUrl;
      return true;
    };
    win.callHost = (type: string) => {
      hostCalls.push(type);
      if (type === 'gm:saveCase' || type === 'gm:listMedia') return Promise.resolve({ ok: true, items: [] });
      if (type === 'gm:garageGmailStatus') {
        return Promise.resolve({
          connected: true,
          canSend: true,
          ok: true,
          email: 'yoni191177@gmail.com',
          mailbox: 'yoni191177@gmail.com',
        });
      }
      if (type === 'gm:scanGarageMail') {
        scanned += 1;
        return Promise.resolve({
          ok: true,
          pending: false,
          matched: [],
          needs_review: [],
        });
      }
      throw new Error(`unexpected host call: ${type}`);
    };
    (win as unknown as { __garageGmailAuthUrl: string }).__garageGmailAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa-garage.apps.googleusercontent.com&login_hint=yoni191177%40gmail.com&scope=https://www.googleapis.com/auth/gmail.readonly';
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    win.go('s-comm');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(win.document.getElementById('garage-mail-status-hint')?.textContent).toContain('מחובר לסריקה ולשליחה מתוך התוכנה');
    expect(win.document.getElementById('garage-mail-connect-row')?.innerHTML).toBe('');
    expect((win.document.getElementById('garage-mail-connect-btn') as HTMLButtonElement | null)?.style.display).toBe('none');
    expect((win as unknown as { __garageGmailServerConnected: boolean }).__garageGmailServerConnected).toBe(true);
    win.scanGarageMail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openedAuthUrl).toBe('');
    expect(scanned).toBe(1);
    expect(hostCalls.filter((type) => type === 'gm:scanGarageMail')).toEqual(['gm:scanGarageMail']);
    expect(hostCalls).not.toContain('gm:garageGmailOauthStart');
    win.go('s-case');
    win.go('s-comm');
    await new Promise((resolve) => setTimeout(resolve, 0));
    win.scanGarageMail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openedAuthUrl).toBe('');
    expect(scanned).toBe(2);
    expect(hostCalls).not.toContain('gm:garageGmailOauthStart');
  });

  it('shows desktop case identity fields and extra-work history rows without changing Gmail', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      document: Document;
    };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    expect(win.document.getElementById('s-case')?.innerHTML).toContain('case-desk');
    expect(win.document.getElementById('fact-customer')?.textContent).toContain('לקוח בדיקת מוסך QA');
    expect(win.document.getElementById('fact-vehicle')?.textContent).toContain('99-888-77');
    expect(win.document.getElementById('fact-case')?.textContent).toContain('GM-2026-0099');
    expect(win.document.getElementById('q-docs')?.textContent).toContain('מסמך להצעה');
    expect(approvedSourceHtml).toContain("callHost('gm:sendGarageMail'");
    expect(approvedSourceHtml).not.toContain('claims-gmail');
  });

  it('keeps vehicle documents scoped to the open garage case and never mixes another vehicle', async () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      renderGarageGallery: (id: string) => void;
      mediaItems: Array<Record<string, string>>;
      document: Document;
    };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    win.mediaItems = [
      { id: 'keep', garage_case_id: 'qa-case-id-1', category: 'parts_invoices', title: 'חשבונית רכב זה', mime_type: 'application/pdf' },
      { id: 'drop', garage_case_id: 'other-vehicle-case', category: 'parts_invoices', title: 'חשבונית רכב אחר', mime_type: 'application/pdf' },
      { id: 'dash', garage_case_id: 'qa-case-id-1', category: 'angles', title: 'לוח שעונים / מד קילומטראז', mime_type: 'image/jpeg' },
    ];
    win.renderGarageGallery('qa-case-id-1');
    const gal = win.document.getElementById('garage-gallery-body')?.textContent || '';
    expect(gal).toContain('חשבונית רכב זה');
    expect(gal).not.toContain('חשבונית רכב אחר');
    expect(gal).toContain('דשבורד / קילומטראז');
    expect(win.document.getElementById('vehicle-docs-identity')?.textContent).toContain('99-888-77');
    expect(win.document.getElementById('vehicle-docs-identity')?.textContent).toContain('GM-2026-0099');
    expect(win.document.querySelector('#s-gallery h1')?.textContent).toBe('מסמכים לרכב');
    expect(win.document.getElementById('s-case')?.textContent).toContain('מסמכים לרכב בתיק זה');
    expect(win.document.getElementById('s-finish')?.textContent).toContain('סיום עבודה / סגירת רכב');
    expect(win.document.getElementById('s-finish')?.textContent).toContain('אין מחיקה');
  });
});
