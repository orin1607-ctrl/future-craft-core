/**
 * Conservative garage-mail → case matcher.
 * Pattern copied from Claims matchIncoming: auto only when unique, never guess.
 * Garage cases only. Never claims_records.
 */

export const GARAGE_MAILBOX = 'yoni191177@gmail.com';
export const CLAIMS_MAILBOX = 'yoni122222@gmail.com';

export type GarageMatchCase = {
  id: string;
  case_number?: string;
  plate?: string;
  customer_name?: string;
  company_name?: string;
  order_number?: string;
  case_ref?: string;
  threads?: string[];
};

export type GarageMatchMail = {
  messageId: string;
  threadId?: string;
  subject?: string;
  body?: string;
  from?: string;
  to?: string;
  filenames?: string[];
};

export type GarageMatchResult = {
  decision: 'auto' | 'needs_review';
  caseId?: string;
  reason: string;
  candidates: string[];
  via?: string;
};

export function normPlate(v: string) {
  return String(v || '').replace(/[^\dA-Za-z]/g, '').toUpperCase();
}

export function normName(v: string) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function extractGarageCaseNumbers(text: string) {
  return [...new Set((String(text || '').toUpperCase().match(/GM-\d{4}-\d{4,}/g) || []))];
}

export function extractPlates(text: string) {
  const raw = String(text || '');
  const found: string[] = [];
  const re = /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = normPlate(m[1]);
    if (n.length >= 7 && n.length <= 8) found.push(n);
  }
  return [...new Set(found)];
}

function uniqueCases(rows: GarageMatchCase[]) {
  const map = new Map<string, GarageMatchCase>();
  rows.forEach((c) => { if (c?.id) map.set(c.id, c); });
  return [...map.values()];
}

function haystack(mail: GarageMatchMail) {
  return `${mail.subject || ''}\n${mail.body || ''}\n${(mail.filenames || []).join(' ')}\n${mail.from || ''}`;
}

function orderTokens(text: string) {
  const hay = String(text || '').toUpperCase();
  const labeled = hay.match(/(?:מספר הזמנה|הזמנה מספר|ORDER(?:\s+NO\.?|#)?|P\.?O\.?)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/_-]{2,24})/g) || [];
  const tokens = labeled.map((row) => {
    const m = row.match(/([A-Z0-9][A-Z0-9/_-]{2,24})$/);
    return m?.[1] || '';
  }).filter(Boolean);
  return [...new Set(tokens)];
}

export function matchGarageMail(mail: GarageMatchMail, cases: GarageMatchCase[]): GarageMatchResult {
  const hay = haystack(mail);
  const hayU = hay.toUpperCase();
  const empty: GarageMatchResult = { decision: 'needs_review', reason: 'אין מזהה מספיק — דורש שיוך ידני', candidates: [] };

  const threadHits = uniqueCases(cases.filter((c) => mail.threadId && (c.threads || []).includes(mail.threadId)));
  const gmIds = extractGarageCaseNumbers(hay);
  const caseHits = uniqueCases(cases.filter((c) => {
    const keys = [c.id, c.case_number].map((x) => String(x || '').trim().toUpperCase()).filter((k) => k.length >= 8);
    return keys.some((k) => gmIds.includes(k) || hayU.includes(k));
  }));
  const orderIds = orderTokens(hay);
  const orderHits = uniqueCases(cases.filter((c) => {
    const order = String(c.order_number || '').trim().toUpperCase();
    const ref = String(c.case_ref || '').trim().toUpperCase();
    if (order && (orderIds.includes(order) || hayU.includes(order))) return true;
    if (ref && ref.length >= 4 && (orderIds.includes(ref) || hayU.includes(ref))) return true;
    return false;
  }));
  const plates = extractPlates(hay);
  const plateHits = uniqueCases(cases.filter((c) => {
    const p = normPlate(c.plate || '');
    return p && plates.includes(p);
  }));
  const names = uniqueCases(cases.filter((c) => {
    const n = normName(c.customer_name || c.company_name || '');
    return n.length >= 4 && normName(hay).includes(n);
  }));

  if (threadHits.length === 1) {
    const hit = threadHits[0];
    if (caseHits.length === 1 && caseHits[0].id !== hit.id) {
      return { decision: 'needs_review', reason: 'סתירה: Thread מול מספר תיק אחר', candidates: [hit.id, caseHits[0].id], via: 'thread_vs_case' };
    }
    if (plateHits.length === 1 && plateHits[0].id !== hit.id) {
      return { decision: 'needs_review', reason: 'סתירה: Thread מול רכב של תיק אחר', candidates: [hit.id, plateHits[0].id], via: 'thread_vs_plate' };
    }
    return { decision: 'auto', caseId: hit.id, reason: 'Gmail Thread ID קיים בתיק המוסך', candidates: [hit.id], via: 'thread' };
  }
  if (threadHits.length > 1) {
    return { decision: 'needs_review', reason: 'אותו Thread משויך ליותר מתיק מוסך אחד', candidates: threadHits.map((c) => c.id), via: 'thread' };
  }

  if (caseHits.length > 1) {
    return { decision: 'needs_review', reason: 'יותר ממספר תיק מוסך אחד במייל', candidates: caseHits.map((c) => c.id), via: 'case_number' };
  }
  if (caseHits.length === 1) {
    const hit = caseHits[0];
    const otherPlate = plateHits.filter((c) => c.id !== hit.id);
    if (otherPlate.length === 1 && !plateHits.some((c) => c.id === hit.id)) {
      return { decision: 'needs_review', reason: 'סתירה: מספר תיק מתיק אחד + רכב מתיק אחר', candidates: [hit.id, otherPlate[0].id], via: 'case_vs_plate' };
    }
    return { decision: 'auto', caseId: hit.id, reason: 'מספר תיק מוסך חד-משמעי', candidates: [hit.id], via: 'case_number' };
  }

  if (orderHits.length === 1) {
    const hit = orderHits[0];
    const otherPlate = plateHits.filter((c) => c.id !== hit.id);
    if (otherPlate.length === 1 && !plateHits.some((c) => c.id === hit.id)) {
      return { decision: 'needs_review', reason: 'סתירה: מספר הזמנה מתיק אחד + רכב מתיק אחר', candidates: [hit.id, otherPlate[0].id], via: 'order_vs_plate' };
    }
    return { decision: 'auto', caseId: hit.id, reason: 'מספר הזמנה / אסמכתא חד-משמעי', candidates: [hit.id], via: 'order_number' };
  }
  if (orderHits.length > 1) {
    return { decision: 'needs_review', reason: 'מספר הזמנה מתאים ליותר מתיק אחד', candidates: orderHits.map((c) => c.id), via: 'order_ambiguous' };
  }

  if (plateHits.length === 1) {
    return { decision: 'auto', caseId: plateHits[0].id, reason: 'מספר רכב מופיע בתיק מוסך אחד בלבד', candidates: [plateHits[0].id], via: 'plate_unique' };
  }
  if (plateHits.length > 1) {
    const named = plateHits.filter((c) => names.some((n) => n.id === c.id));
    if (named.length === 1) {
      return { decision: 'auto', caseId: named[0].id, reason: 'רכב + שם לקוח מתאימים לתיק אחד', candidates: [named[0].id], via: 'plate_name' };
    }
    return { decision: 'needs_review', reason: 'אותו רכב ביותר מתיק מוסך אחד ואין מספר הזמנה/תיק מספיק', candidates: plateHits.map((c) => c.id), via: 'plate_ambiguous' };
  }

  if (names.length === 1 && names[0].customer_name && normName(names[0].customer_name).length >= 8) {
    return { decision: 'needs_review', reason: 'נמצא שם לקוח בלבד — לא משייכים אוטומטית בלי מספר הזמנה/רכב/תיק', candidates: [names[0].id], via: 'name_only' };
  }
  if (names.length > 1) {
    return { decision: 'needs_review', reason: 'שם לקוח מתאים ליותר מתיק אחד', candidates: names.map((c) => c.id), via: 'name_ambiguous' };
  }

  return empty;
}

export function garageMailIsOwnMailbox(addr: string) {
  return String(addr || '').toLowerCase().includes(GARAGE_MAILBOX);
}

export function garageMailIsClaimsMailbox(addr: string) {
  return String(addr || '').toLowerCase().includes(CLAIMS_MAILBOX);
}
