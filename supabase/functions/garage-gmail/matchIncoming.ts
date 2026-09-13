/** Conservative incoming-mail → garage case matcher. No guessing. */

export type MatchCase = {
  id: string;
  caseNumber?: string;
  plate?: string;
  customerName?: string;
  companyName?: string;
  workOrderNumber?: string;
  workOrderRef?: string;
  threads?: string[];
};

export type MatchMail = {
  messageId: string;
  threadId?: string;
  subject?: string;
  body?: string;
  from?: string;
  filenames?: string[];
};

export type MatchResult = {
  decision: "auto" | "needs_review";
  caseId?: string;
  reason: string;
  candidates: string[];
  via?: string;
};

export function normPlate(v: string) {
  return String(v || "").replace(/[^\dA-Za-zא-ת]/g, "").toLowerCase();
}

export function extractGmIds(text: string) {
  return [...new Set((String(text || "").toUpperCase().match(/GM-\d{4}-\d{4}/g) || []))];
}

export function extractPlates(text: string) {
  const raw = String(text || "");
  const found: string[] = [];
  const re = /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = normPlate(m[1]);
    if (n.length >= 7 && n.length <= 8) found.push(n);
    else if (n.length >= 3 && n.length <= 8) found.push(n);
  }
  return [...new Set(found)];
}

function uniqueCases(rows: MatchCase[]) {
  const map = new Map<string, MatchCase>();
  rows.forEach((c) => { if (c?.id) map.set(c.id, c); });
  return [...map.values()];
}

export function matchIncomingGarage(mail: MatchMail, cases: MatchCase[]): MatchResult {
  const hay = `${mail.subject || ""}\n${mail.body || ""}\n${(mail.filenames || []).join(" ")}\n${mail.from || ""}`;
  const empty: MatchResult = { decision: "needs_review", reason: "אין מזהה מספיק", candidates: [] };

  const threadHits = uniqueCases(cases.filter((c) => {
    const threads = [...(c.threads || [])];
    return mail.threadId && threads.filter(Boolean).includes(mail.threadId);
  }));

  const gmIds = extractGmIds(hay);
  const hayU = hay.toUpperCase();
  const gmHits = uniqueCases(cases.filter((c) => {
    const keys = [c.caseNumber, c.id].map((x) => String(x || "").trim().toUpperCase()).filter((k) => k.length >= 8);
    return keys.some((k) => gmIds.includes(k) || (k.startsWith("GM-") && hayU.includes(k)));
  }));

  const orderHits = uniqueCases(cases.filter((c) => {
    const keys = [c.workOrderNumber, c.workOrderRef].map((x) => String(x || "").trim()).filter((k) => k.length >= 4);
    return keys.some((k) => hayU.includes(k.toUpperCase()));
  }));

  const plates = extractPlates(hay);
  const plateHits = uniqueCases(cases.filter((c) => {
    const p = normPlate(c.plate || "");
    return p && plates.includes(p);
  }));

  const nameHits = uniqueCases(cases.filter((c) => {
    const names = [c.customerName, c.companyName].map((x) => String(x || "").trim()).filter((n) => n.length >= 3);
    return names.some((n) => hay.includes(n));
  }));

  if (threadHits.length === 1) {
    const hit = threadHits[0];
    if (gmHits.length === 1 && gmHits[0].id !== hit.id) {
      return { decision: "needs_review", reason: "סתירה: Thread מול מספר תיק אחר", candidates: [hit.id, gmHits[0].id], via: "thread_vs_case" };
    }
    if (plateHits.length === 1 && plateHits[0].id !== hit.id && gmHits.every((d) => d.id === plateHits[0].id)) {
      return { decision: "needs_review", reason: "סתירה: Thread מול רכב של תיק אחר", candidates: [hit.id, plateHits[0].id], via: "thread_vs_plate" };
    }
    return { decision: "auto", caseId: hit.id, reason: "Gmail Thread ID קיים בתיק", candidates: [hit.id], via: "thread" };
  }
  if (threadHits.length > 1) {
    return { decision: "needs_review", reason: "אותו Thread משויך ליותר מתיק אחד", candidates: threadHits.map((c) => c.id), via: "thread" };
  }

  if (gmHits.length > 1) {
    return { decision: "needs_review", reason: "יותר ממספר תיק מוסך אחד במייל", candidates: gmHits.map((c) => c.id), via: "case_number" };
  }
  if (gmHits.length === 1) {
    const hit = gmHits[0];
    const otherPlate = plateHits.filter((c) => c.id !== hit.id);
    if (otherPlate.length === 1 && !plateHits.some((c) => c.id === hit.id)) {
      return { decision: "needs_review", reason: "סתירה: מספר תיק מתיק אחד + רכב מתיק אחר", candidates: [hit.id, otherPlate[0].id], via: "case_vs_plate" };
    }
    return { decision: "auto", caseId: hit.id, reason: "מספר תיק מוסך חד-משמעי", candidates: [hit.id], via: "case_number" };
  }

  if (orderHits.length === 1) {
    const hit = orderHits[0];
    const other = plateHits.filter((c) => c.id !== hit.id);
    if (other.length === 1 && !plateHits.some((c) => c.id === hit.id)) {
      return { decision: "needs_review", reason: "סתירה: מספר הזמנה מתיק אחד + רכב מתיק אחר", candidates: [hit.id, other[0].id], via: "order_vs_plate" };
    }
    return { decision: "auto", caseId: hit.id, reason: "מספר הזמנה חד-משמעי", candidates: [hit.id], via: "work_order" };
  }
  if (orderHits.length > 1) {
    return { decision: "needs_review", reason: "יותר ממספר הזמנה אחד במייל", candidates: orderHits.map((c) => c.id), via: "work_order" };
  }

  if (plateHits.length === 1) {
    return { decision: "auto", caseId: plateHits[0].id, reason: "מספר רכב מופיע בתיק אחד בלבד", candidates: [plateHits[0].id], via: "plate_unique" };
  }
  if (plateHits.length > 1) {
    return { decision: "needs_review", reason: "אותו רכב ביותר מתיק מוסך אחד", candidates: plateHits.map((c) => c.id), via: "plate_ambiguous" };
  }

  if (nameHits.length === 1) {
    return { decision: "auto", caseId: nameHits[0].id, reason: "שם לקוח/חברה חד-משמעי", candidates: [nameHits[0].id], via: "customer_unique" };
  }
  if (nameHits.length > 1) {
    return { decision: "needs_review", reason: "שם לקוח/חברה ביותר מתיק אחד", candidates: nameHits.map((c) => c.id), via: "customer_ambiguous" };
  }

  return empty;
}

export function extractPriceCandidates(text: string): number[] {
  const raw = String(text || "");
  const out: number[] = [];
  const re = /(?:₪|ש["״]ח|NIS|ILS)?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:₪|ש["״]ח|NIS|ILS)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = Number(String(m[1]).replace(/[,\s]/g, ""));
    if (Number.isFinite(n) && n >= 50 && n <= 5_000_000) out.push(n);
  }
  return [...new Set(out)];
}
