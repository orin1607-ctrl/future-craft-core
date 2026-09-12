import { describe, expect, it } from 'vitest';
import {
  customerDisplayName,
  defaultRouteForCustomer,
  deriveCaseStatus,
  emptyCaseData,
  extractWorkOrderHints,
  findDuplicateCustomers,
  garageNextAction,
  isGarageSchemaMissing,
  isGarageWorkflowColumnMissing,
  normalizePhone,
  normalizePlate,
  routeLabel,
  sanitizeCaseData,
  vehicleLabel,
} from './garageBook';

describe('garage book helpers', () => {
  it('normalizes Israeli phones and plates', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567');
    expect(normalizePhone('+972501234567')).toBe('0501234567');
    expect(normalizePlate('12-345-67')).toBe('1234567');
  });

  it('extracts work-order hints from a filename without auto-saving them', () => {
    const hints = extractWorkOrderHints({
      fileName: 'order-PO-8821-99-888-77-claim-DAL99.pdf',
      company: 'QA / TEST חברה',
      contact: 'רותי',
      casePlate: '9988877',
    });
    expect(hints.order_number).toMatch(/8821/);
    expect(hints.plate).toBe('9988877');
    expect(hints.claim_ref).toMatch(/DAL99/i);
    expect(hints.company).toBe('QA / TEST חברה');
    expect(hints.fromFile.length).toBeGreaterThan(0);
    expect(hints.fromCase).toContain('חברה מהתיק');
  });

  it('warns on duplicate phone / business id / name without merging', () => {
    const existing = [
      {
        id: '1',
        customer_number: 1281,
        customer_type: 'business' as const,
        name: '',
        company_name: 'חברת בדיקה בע"מ',
        phone: '03-9001234',
        second_phone: '',
        email: '',
        address: '',
        business_id: '512345678',
        contact_person: '',
        preferred_channel: '',
        notes: '',
      },
    ];
    expect(findDuplicateCustomers(existing, {
      customer_type: 'business',
      name: '',
      company_name: 'חברת בדיקה בע"מ',
      phone: '039001234',
      business_id: '',
    })).toHaveLength(1);
    expect(findDuplicateCustomers(existing, {
      customer_type: 'private',
      name: 'מישהו אחר',
      company_name: '',
      phone: '0500000000',
      business_id: '512345678',
    })).toHaveLength(1);
  });

  it('strips data URLs and base64 from case_data', () => {
    const cleaned = sanitizeCaseData({
      quoteCreated: true,
      signaturePng: 'data:image/png;base64,aaaa',
      photos: { fl: true, shot: 'data:image/jpeg;base64,bbbb' },
    });
    expect(cleaned.quoteCreated).toBe(true);
    expect((cleaned as { signaturePng?: string }).signaturePng).toBeUndefined();
    expect((cleaned.photos as { fl?: boolean }).fl).toBe(true);
    expect((cleaned.photos as { shot?: string }).shot).toBeUndefined();
  });

  it('derives status from flow flags', () => {
    expect(deriveCaseStatus(emptyCaseData())).toBe('בדיקת רכב');
    expect(deriveCaseStatus({ quoteCreated: true })).toBe('הצעה בהכנה');
    expect(deriveCaseStatus({ quoteSent: true })).toBe('ממתין לאישור');
    expect(deriveCaseStatus({ waitingForApproval: true })).toBe('ממתין לאישור');
    expect(deriveCaseStatus({ intakeDone: true, route: 'intake_first' })).toBe('הרכב התקבל');
    expect(deriveCaseStatus({ workFinished: true })).toBe('מוכן למסירה');
    expect(deriveCaseStatus({ caseClosed: true })).toBe('סגור');
  });

  it('uses the customer default_workflow field and never infers route from customer_type', () => {
    expect(defaultRouteForCustomer({ customer_type: 'private' })).toBe('quote_first');
    expect(defaultRouteForCustomer({ customer_type: 'business' })).toBe('quote_first');
    expect(defaultRouteForCustomer({ customer_type: 'fleet' })).toBe('quote_first');
    expect(defaultRouteForCustomer({ customer_type: 'fleet', default_workflow: 'intake_first' })).toBe('intake_first');
    expect(defaultRouteForCustomer({ customer_type: 'business', default_workflow: 'quote_first' })).toBe('quote_first');
    expect(defaultRouteForCustomer({ customer_type: 'private', default_workflow: 'intake_first' })).toBe('intake_first');
    expect(routeLabel('quote_first')).toBe('הצעת מחיר תחילה');
    expect(routeLabel('intake_first')).toBe('קבלת רכב');
    expect(garageNextAction({ route: 'quote_first' })).toBe('הכנת הצעת מחיר');
    expect(garageNextAction({ route: 'quote_first', quoteSent: true })).toBe('ממתינים לאישור הלקוח');
    expect(garageNextAction({ route: 'quote_first', quoteApproved: true })).toBe('קבלת רכב + 5 תמונות');
    expect(garageNextAction({ route: 'intake_first' })).toBe('העלאת הזמנת לקוח');
    expect(garageNextAction({ route: 'intake_first', workOrderSaved: true })).toBe('קבלת רכב + 5 תמונות');
    expect(garageNextAction({ route: 'intake_first', intakeDone: true })).toBe('הכנת הצעת מחיר');
  });

  it('builds display labels', () => {
    expect(customerDisplayName({ customer_type: 'private', name: 'ישראל', company_name: '' })).toBe('ישראל');
    expect(vehicleLabel({ make: 'Toyota', model: 'Corolla', year: 2021 })).toBe('Toyota · Corolla · 2021');
  });

  it('detects missing garage schema without treating it as a generic failure', () => {
    expect(isGarageSchemaMissing({ code: 'PGRST205', message: "Could not find the table 'public.garage_cases'" })).toBe(true);
    expect(isGarageSchemaMissing({ message: 'permission denied' })).toBe(false);
  });

  it('detects a missing default_workflow column without treating it as a missing table', () => {
    expect(isGarageWorkflowColumnMissing({
      code: 'PGRST204',
      message: "Could not find the 'default_workflow' column of 'garage_customers' in the schema cache",
    })).toBe(true);
    expect(isGarageWorkflowColumnMissing({ code: 'PGRST205', message: "Could not find the table 'public.garage_cases'" })).toBe(false);
  });
});
