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
    expect(alerts.some((a) => /5 תמונות/.test(a))).toBe(true);
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
    expect(win.document.getElementById('cust-wf-intake_first')?.textContent).toContain('קבלת רכב');
    expect(win.document.getElementById('cust-wf-intake_first')?.textContent).not.toContain('קבלת רכב תחילה');
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
    expect(alerts.some((msg) => msg.includes('5 תמונות'))).toBe(true);
    expect(win.state.intakeDone).toBe(false);
    expect(win.document.getElementById('case-status-badge')?.textContent).not.toBe('הרכב התקבל');

    win.state.intakeAngles.dashboard = true;
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
    expect(win.document.getElementById('s-newform')?.textContent).toContain('+ הוסף איש קשר');
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
    expect(win.state.caseClosed).toBeFalsy();
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('העבודה הסתיימה / מוכן למסירה');
    expect(win.document.getElementById('s-case')?.classList.contains('active')).toBe(true);
    const timeline = win.document.getElementById('timeline-content')?.textContent || '';
    expect(timeline).toContain('סיום עבודה');
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
    expect((win.document.getElementById('finish-km') as HTMLInputElement).value).toBe('51200');
    expect((win.document.getElementById('finish-notes') as HTMLTextAreaElement).value).toBe('נמסר מוכן לנסיעה');
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('העבודה הסתיימה / מוכן למסירה');
    expect(win.document.getElementById('timeline-content')?.textContent).toContain('הערות סיום: נמסר מוכן לנסיעה');

    win.reopenClosedCase();
    expect(win.state.workFinished).toBe(false);
    expect(win.document.getElementById('case-status-badge')?.textContent).toBe('רכב בעבודה');
    expect((win.document.getElementById('timeline-content')?.textContent || '')).toContain('תיק נפתח מחדש');
  });

  it('keeps mailto extra-work send from looking like customer approval', () => {
    const win = bootFlow() as Window & {
      applyBootstrap: (payload: Record<string, unknown>) => void;
      sendExtraApproval: (channel: string) => void;
      document: Document;
      state: { extraApprovals: Array<{ status?: string; approvedAt?: string }> };
    };
    win.applyBootstrap({ mode: 'case', loaded: qaCase, bookPending: false });
    (win.document.getElementById('extra-text') as HTMLTextAreaElement).value = 'תוספת עבודה QA';
    (win.document.getElementById('extra-price') as HTMLInputElement).value = '250';
    win.sendExtraApproval('email');
    expect(win.state.extraApprovals[0].status).toBe('sent_mailto');
    expect(win.state.extraApprovals[0].approvedAt).toBeFalsy();
    expect(win.document.getElementById('extra-approval-list')?.textContent).toContain('נפתח מייל');
    expect(win.document.getElementById('extra-approval-list')?.textContent).not.toContain('אושר ·');
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
});
