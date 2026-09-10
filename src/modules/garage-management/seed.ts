import type { GarageCase, GarageCustomer, GarageState, GarageVehicle } from './types';

const worker = 'יוסי כהן';

export const SEED_CUSTOMERS: GarageCustomer[] = [
  { id: 'c1', kind: 'private', name: 'ישראל ישראלי', phone: '050-1112233', email: 'israel@mail.com' },
  { id: 'c2', kind: 'private', name: 'מיכל כהן', phone: '052-9870030', email: 'michal@mail.com' },
  { id: 'c3', kind: 'private', name: 'עומר לוי', phone: '054-7730005' },
  { id: 'c4', kind: 'company', name: 'אלדן', phone: '03-5550100', email: 'fleet@eldan.co.il', companyName: 'אלדן' },
  { id: 'c5', kind: 'company', name: 'שלמה תחבורה', phone: '03-5550200', companyName: 'שלמה תחבורה' },
  { id: 'c6', kind: 'business', name: 'אבי הובלות בע"מ', phone: '03-5550300', companyName: 'אבי הובלות בע"מ' },
];

export const SEED_VEHICLES: GarageVehicle[] = [
  { id: 'v1', plate: '12-345-67', manufacturer: 'טויוטה', model: 'קורולה', year: '2021', type: 'פרטי', customerId: 'c1' },
  { id: 'v2', plate: '21-987-30', manufacturer: 'מאזדה', model: '3', year: '2020', type: 'פרטי', customerId: 'c2' },
  { id: 'v3', plate: '77-300-05', manufacturer: 'סקודה', model: 'אוקטביה', year: '2019', type: 'פרטי', customerId: 'c3' },
  { id: 'v4', plate: '12-345-67', manufacturer: 'יונדאי', model: 'i10', year: '2022', type: 'מסחרי', customerId: 'c4' },
];

const placeholder = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1c3564"/><stop offset="1" stop-color="#0d1f3c"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="160" text-anchor="middle" fill="white" font-size="22" font-family="Arial">${label}</text></svg>`,
  )}`;

export function seedCase1054(): GarageCase {
  const fl = placeholder('קדמי שמאל');
  const fr = placeholder('קדמי ימין');
  const rl = placeholder('אחורי שמאל');
  return {
    id: 'case-1054',
    number: '1054',
    status: 'awaiting_approval',
    customer: SEED_CUSTOMERS[3],
    vehicle: SEED_VEHICLES[3],
    worker,
    openedAt: '2026-09-10',
    eventNumber: 'EV-220',
    damageArea: 'כנף אחורית שמאל + מכסה מנוע',
    damageDescription: 'שריטה + שקע קל',
    angles: { fl, fr, rl },
    extraPhotos: {},
    parts: [
      { id: 'hood', name: 'מכסה מנוע', state: 'damaged', description: 'שריטה + שקע קל, כ-15 ס"מ', photoIds: [] },
      { id: 'fender_rl', name: 'כנף אחורית שמאל', state: 'fix', description: 'מיועד לתיקון וצבע', photoIds: [] },
    ],
    works: [
      { id: 'w1', part: 'כנף קדמית שמאל', workType: 'תיקון + צבע', detail: 'שריטה עמוקה בצד שמאל', price: 650 },
      { id: 'w2', part: 'פגוש קדמי', workType: 'תיקון + צבע', detail: 'שקע ושפשוף מרכזי', price: 800 },
      { id: 'w3', part: 'מכסה מנוע', workType: 'תיקון', detail: 'שריטה + שקע קל', price: 900 },
    ],
    partsLines: [
      { id: 'p1', name: 'פנס קדמי ימין', sku: 'XXXXX', qty: 1, price: 1250, supplier: 'us' },
      { id: 'p2', name: 'גריל קדמי', sku: '', qty: 1, price: 0, supplier: 'customer', supplierLabel: 'אלדן מספקת' },
    ],
    quotePhotoIds: [],
    photos: [
      { id: 'ph1', topic: 'four_angles', label: 'קדמי שמאל', dataUrl: fl, createdAt: '08:20' },
      { id: 'ph2', topic: 'four_angles', label: 'קדמי ימין', dataUrl: fr, createdAt: '08:21' },
      { id: 'ph3', topic: 'four_angles', label: 'אחורי שמאל', dataUrl: rl, createdAt: '08:22' },
      { id: 'ph4', topic: 'damage', label: 'מכסה מנוע', dataUrl: placeholder('נזק'), createdAt: '08:30' },
    ],
    orders: [
      {
        version: 2,
        number: 'A-8821',
        date: '10/09/2026',
        company: 'אלדן',
        plate: '12-345-67',
        approvedAmount: 3200,
        contact: 'רותי — צי אלדן',
        notes: 'גרסה מתוקנת לאחר עדכון מחיר פנס',
        createdAt: '10:15',
      },
      {
        version: 1,
        number: 'A-8821',
        date: '09/09/2026',
        company: 'אלדן',
        plate: '12-345-67',
        approvedAmount: 2900,
        contact: 'רותי — צי אלדן',
        notes: 'גרסה ראשונה',
        createdAt: '16:40',
      },
    ],
    mails: [
      {
        id: 'm1',
        from: 'fleet@eldan.co.il',
        to: 'garage@dalia-car.online',
        subject: 'הזמנה מתוקנת A-8821',
        body: 'מצורפת הזמנה מתוקנת לתיק 1054.',
        at: '09:20',
        direction: 'in',
      },
      {
        id: 'm2',
        from: 'fleet@eldan.co.il',
        to: 'garage@dalia-car.online',
        subject: 'שאלה לגבי מועד מסירה',
        body: 'מתי הרכב צפוי להיות מוכן?',
        at: '09:15',
        direction: 'in',
      },
    ],
    history: [
      { id: 'h1', at: '08:15', text: 'יוסי פתח תיק' },
      { id: 'h2', at: '08:22', text: 'תמונות צולמו — 3 מתוך 4 זוויות' },
      { id: 'h3', at: '08:30', text: 'נזק סומן במכסה מנוע' },
      { id: 'h4', at: '08:35', text: 'נוצרה הצעת מחיר' },
      { id: 'h5', at: '09:20', text: 'התקבלה הזמנה מתוקנת V2' },
    ],
    shares: [],
  };
}

export function seedCaseMichal(): GarageCase {
  return {
    id: 'case-q4790',
    number: 'Q-4790',
    status: 'approved',
    customer: SEED_CUSTOMERS[1],
    vehicle: SEED_VEHICLES[1],
    worker,
    openedAt: '2026-09-05',
    damageArea: 'כנף קדמית ימין',
    damageDescription: 'כנף קדמית ימין — שריטה + שקע. פגוש קדמי — שפשוף.',
    angles: {},
    extraPhotos: {},
    parts: [],
    works: [
      { id: 'mw1', part: 'כנף קדמית ימין', workType: 'תיקון + צבע', detail: 'שריטה + שקע', price: 700 },
      { id: 'mw2', part: 'פגוש קדמי', workType: 'תיקון + צבע', detail: 'שפשוף', price: 600 },
    ],
    partsLines: [{ id: 'mp1', name: 'קלפה פגוש', sku: 'MZ-44', qty: 1, price: 800, supplier: 'us' }],
    quotePhotoIds: [],
    photos: [
      { id: 'mph1', topic: 'damage', label: 'כנף ימין', dataUrl: placeholder('כנף'), createdAt: '05/09' },
      { id: 'mph2', topic: 'quote', label: 'פגוש', dataUrl: placeholder('פגוש'), createdAt: '05/09' },
      { id: 'mph3', topic: 'four_angles', label: 'קדמי', dataUrl: placeholder('קדמי'), createdAt: '05/09' },
    ],
    orders: [],
    mails: [],
    history: [
      { id: 'mh1', at: '05/09', text: 'הצעה נוצרה ונשלחה' },
      { id: 'mh2', at: '05/09', text: 'הלקוחה אישרה את ההצעה' },
    ],
    shares: [],
  };
}

export function emptyDraft(): GarageState['draft'] {
  return {
    customerMode: 'new',
    customerKind: 'private',
    customer: {},
    vehicleMode: 'new',
    vehicle: {},
  };
}

export function createInitialState(): GarageState {
  return {
    customers: SEED_CUSTOMERS,
    vehicles: SEED_VEHICLES,
    cases: [seedCase1054(), seedCaseMichal()],
    draft: emptyDraft(),
  };
}
