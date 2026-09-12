import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { garageMailIsClaimsMailbox, garageMailIsOwnMailbox, matchGarageMail, type GarageMatchCase } from './garageMailMatch';
import { compareSentAndReturned, detectPricedOrder } from './garagePriceFromMail';
import { applyMatchedMail, approveDetectedPrice, classifyGarageMailCategory, routeIncomingGarageMail } from './garageMail';

const openCase: GarageMatchCase = {
  id: 'case-open',
  case_number: 'GM-2026-0101',
  plate: '1111111',
  customer_name: 'לקוח פתוח QA',
  order_number: 'PO-88001',
};
const workCase: GarageMatchCase = {
  id: 'case-work',
  case_number: 'GM-2026-0102',
  plate: '2222222',
  customer_name: 'אלדן QA',
  company_name: 'אלדן QA',
  order_number: 'PO-88002',
  threads: ['thread-work'],
};
const samePlateA: GarageMatchCase = {
  id: 'case-a',
  case_number: 'GM-2026-0201',
  plate: '3333333',
  customer_name: 'חברה א',
};
const samePlateB: GarageMatchCase = {
  id: 'case-b',
  case_number: 'GM-2026-0202',
  plate: '3333333',
  customer_name: 'חברה ב',
};

describe('garage mail match — never guess', () => {
  it('binds a clear order number to the right garage case', () => {
    const r = matchGarageMail({
      messageId: 'm1',
      subject: 'הזמנה מתומחרת',
      body: 'מספר הזמנה: PO-88001 מצורף PDF',
      filenames: ['order-priced.pdf'],
    }, [openCase, workCase]);
    expect(r.decision).toBe('auto');
    expect(r.caseId).toBe('case-open');
    expect(r.via).toBe('order_number');
  });

  it('binds plate + customer name when the plate is shared', () => {
    const r = matchGarageMail({
      messageId: 'm2',
      subject: 'עדכון',
      body: 'רכב 33-333-33 לקוח חברה א נא מסמך',
    }, [samePlateA, samePlateB]);
    expect(r.decision).toBe('auto');
    expect(r.caseId).toBe('case-a');
    expect(r.via).toBe('plate_name');
  });

  it('does not guess when the plate is on two cases and the name is missing', () => {
    const r = matchGarageMail({
      messageId: 'm3',
      subject: 'עדכון',
      body: 'רכב 3333333 נא מסמך',
    }, [samePlateA, samePlateB]);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('plate_ambiguous');
    expect(r.caseId).toBeUndefined();
    expect(r.candidates.sort()).toEqual(['case-a', 'case-b']);
  });

  it('does not auto-bind on customer name alone', () => {
    const r = matchGarageMail({
      messageId: 'm4',
      subject: 'שאלה',
      body: 'שלום, כאן לקוח פתוח QA, חסר מסמך',
    }, [openCase, workCase]);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('name_only');
    expect(r.caseId).toBeUndefined();
  });
});

describe('priced-order detection and worker approval', () => {
  it('detects a priced order amount and does not apply it until the worker confirms', () => {
    const detection = detectPricedOrder({
      subject: 'הזמנה מתומחרת PO-88001',
      body: 'סכום מאושר לתשלום: 1,800 ₪',
      filenames: ['priced-order.pdf'],
    });
    expect(detection.likelyPricedOrder).toBe(true);
    expect(detection.amount).toBe(1800);
    const applied = applyMatchedMail({
      quoteSent: true,
      quoteWorks: [{ part: 'תיקון', qty: 1, price: 1525 }],
    }, {
      messageId: 'm-price',
      subject: 'הזמנה מתומחרת PO-88001',
      body: 'סכום מאושר לתשלום: 1,800 ₪',
      filenames: ['priced-order.pdf'],
    }, { decision: 'auto', caseId: 'case-open', reason: 'ok', candidates: ['case-open'] });
    expect(applied.data.quoteApproved).toBeFalsy();
    expect(applied.data.workOrderAmount).toBeFalsy();
    expect(applied.data.priceReview?.status).toBe('priced_order_received');
    expect(applied.data.priceReview?.detectedAmount).toBe(1800);
    expect(applied.data.unreadMail).toBe(true);
    const approved = approveDetectedPrice(applied.data, 'QA');
    expect(approved.quoteApproved).toBe(true);
    expect(approved.workOrderAmount).toBe(1800);
    expect(approved.finalApprovedAmount).toBe(1800);
    expect(approved.priceReview?.status).toBe('worker_approved');
    expect((approved.timeline || []).some((ev) => /העובד אישר את המחיר/.test(ev.text || ''))).toBe(true);
  });

  it('flags a returned price that differs from the sent quote and still waits for the worker', () => {
    expect(compareSentAndReturned(1800, 1950).status).toBe('mismatch');
    const applied = applyMatchedMail({
      quoteApproved: false,
      quoteWorks: [{ part: 'תיקון', qty: 1, price: 1525.42 }],
      workOrderAmount: 1800,
    }, {
      messageId: 'm-gap',
      subject: 'אישור מחיר',
      body: 'סכום מאושר: 1950 ₪',
    }, { decision: 'auto', caseId: 'case-open', reason: 'ok', candidates: ['case-open'] });
    expect(applied.data.priceReview?.compare).toBe('mismatch');
    expect(applied.data.quoteApproved).toBeFalsy();
    expect(applied.data.workOrderAmount).toBe(1800);
    expect((applied.data.timeline || []).some((ev) => /פער במחיר/.test(ev.text || ''))).toBe(true);
  });

  it('keeps a mail chain in order on the same case', () => {
    let data = applyMatchedMail({}, {
      messageId: 'm-a',
      threadId: 't1',
      subject: 'חסרה תמונה',
      body: 'נא לשלוח תמונה נוספת',
      sentAt: '2026-09-12T10:00:00.000Z',
    }, { decision: 'auto', caseId: 'x', reason: 'ok', candidates: ['x'] }).data;
    data = applyMatchedMail(data, {
      messageId: 'm-b',
      threadId: 't1',
      subject: 'הזמנה מתומחרת',
      body: 'סכום מאושר: 900 ₪',
      sentAt: '2026-09-12T11:00:00.000Z',
    }, { decision: 'auto', caseId: 'x', reason: 'ok', candidates: ['x'] }).data;
    expect(data.correspondence?.map((m) => m.gmail_message_id)).toEqual(['m-a', 'm-b']);
    expect(data.correspondence?.[0].body_text).toContain('תמונה');
    expect(classifyGarageMailCategory({ filename: 'priced-order.pdf', priced: true })).toBe('customer_approvals');
    expect(classifyGarageMailCategory({ filename: 'po.pdf', subject: 'הזמנה' })).toBe('customer_order');
  });

  it('routes through garage cases only, never a claims id', () => {
    const r = routeIncomingGarageMail({
      messageId: 'm-gm',
      subject: 'תיק GM-2026-0102',
      body: 'שלום',
    }, [
      {
        id: 'case-work',
        case_number: 'GM-2026-0102',
        vehicle_plate_snapshot: '2222222',
        customer_name_snapshot: 'אלדן QA',
        case_data: {},
      },
    ]);
    expect(r.caseId).toBe('case-work');
    expect(r.via).toBe('case_number');
  });

  it('keeps the garage mailbox separate from Claims and never calls claims-gmail', () => {
    expect(garageMailIsOwnMailbox('Yoni191177@gmail.com')).toBe(true);
    expect(garageMailIsClaimsMailbox('yoni122222@gmail.com')).toBe(true);
    expect(garageMailIsOwnMailbox('yoni122222@gmail.com')).toBe(false);
    const mailSrc = readFileSync(resolve('src/modules/garage-management/garageMail.ts'), 'utf8');
    const appSrc = readFileSync(resolve('src/modules/garage-management/GarageApp.tsx'), 'utf8');
    expect(mailSrc).toContain("invoke('garage-gmail'");
    expect(mailSrc).not.toContain("invoke('claims-gmail'");
    expect(mailSrc).not.toContain('claims-docs');
    expect(appSrc).toContain('gm:scanGarageMail');
    expect(appSrc).toContain('scanGarageMailbox');
    expect(appSrc).not.toContain('claims-gmail');
    expect(appSrc).not.toContain('claims-docs');
  });
});
