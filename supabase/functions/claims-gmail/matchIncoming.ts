/** Conservative incoming-mail → claim matcher. No guessing. Staging Claims Gmail. */

export type MatchClaim = {
  id: string;
  claimNum?: string;
  plate?: string;
  eventDate?: string;
  clientName?: string;
  insCompany?: string;
  policyNum?: string;
  surveyor?: string;
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
  claimId?: string;
  reason: string;
  candidates: string[];
  via?: string;
};

export function normPlate(v: string) {
  return String(v || "").replace(/[^\dA-Za-zא-ת]/g, "").toLowerCase();
}

export function normDate(v: string) {
  const s = String(v || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

export function extractDalIds(text: string) {
  return [...new Set((String(text || "").toUpperCase().match(/DAL-\d{4}-\d{4}/g) || []))];
}

export function extractPlates(text: string) {
  const raw = String(text || "");
  const found: string[] = [];
  const re = /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = normPlate(m[1]);
    if (n.length >= 7 && n.length <= 8) found.push(n);
  }
  return [...new Set(found)];
}

export function extractDates(text: string) {
  const raw = String(text || "");
  const out: string[] = [];
  const re = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = normDate(m[1]);
    if (n) out.push(n);
  }
  return [...new Set(out)];
}

function uniqueClaims(rows: MatchClaim[]) {
  const map = new Map<string, MatchClaim>();
  rows.forEach((c) => { if (c?.id) map.set(c.id, c); });
  return [...map.values()];
}

export function matchIncomingMail(mail: MatchMail, claims: MatchClaim[]): MatchResult {
  const hay = `${mail.subject || ""}\n${mail.body || ""}\n${(mail.filenames || []).join(" ")}\n${mail.from || ""}`;
  const empty: MatchResult = { decision: "needs_review", reason: "אין מזהה מספיק", candidates: [] };

  const threadHits = uniqueClaims(claims.filter((c) => {
    const threads = [...(c.threads || []), ];
    return mail.threadId && threads.filter(Boolean).includes(mail.threadId);
  }));

  const dalIds = extractDalIds(hay);
  const dalHits = uniqueClaims(dalIds.map((id) => claims.find((c) => c.id === id || c.claimNum === id)).filter(Boolean) as MatchClaim[]);

  const plates = extractPlates(hay);
  const plateHits = uniqueClaims(claims.filter((c) => {
    const p = normPlate(c.plate || "");
    return p && plates.includes(p);
  }));

  const dates = extractDates(hay);
  const datePlateHits = uniqueClaims(plateHits.filter((c) => {
    const d = normDate(c.eventDate || "");
    return d && dates.includes(d);
  }));

  if (threadHits.length === 1) {
    const claim = threadHits[0];
    if (dalHits.length === 1 && dalHits[0].id !== claim.id) {
      return { decision: "needs_review", reason: "סתירה: Thread מול מספר תביעה אחר", candidates: [claim.id, dalHits[0].id], via: "thread_vs_claim" };
    }
    if (plateHits.length === 1 && plateHits[0].id !== claim.id && dalHits.every((d) => d.id === plateHits[0].id)) {
      return { decision: "needs_review", reason: "סתירה: Thread מול רכב של תיק אחר", candidates: [claim.id, plateHits[0].id], via: "thread_vs_plate" };
    }
    return { decision: "auto", claimId: claim.id, reason: "Gmail Thread ID קיים בתיק", candidates: [claim.id], via: "thread" };
  }
  if (threadHits.length > 1) {
    return { decision: "needs_review", reason: "אותו Thread משויך ליותר מתיק אחד", candidates: threadHits.map((c) => c.id), via: "thread" };
  }

  if (dalHits.length > 1) {
    return { decision: "needs_review", reason: "יותר ממספר תביעה אחד במייל", candidates: dalHits.map((c) => c.id), via: "claim_number" };
  }
  if (dalHits.length === 1) {
    const claim = dalHits[0];
    const otherPlate = plateHits.filter((c) => c.id !== claim.id);
    if (otherPlate.length === 1 && plateHits.every((c) => c.id === otherPlate[0].id || c.id === claim.id) && !plateHits.some((c) => c.id === claim.id)) {
      return { decision: "needs_review", reason: "סתירה: מספר תביעה מתיק אחד + רכב מתיק אחר", candidates: [claim.id, otherPlate[0].id], via: "claim_vs_plate" };
    }
    return { decision: "auto", claimId: claim.id, reason: "מספר תביעה חד-משמעי", candidates: [claim.id], via: "claim_number" };
  }

  if (datePlateHits.length === 1 && plateHits.length > 1) {
    return { decision: "auto", claimId: datePlateHits[0].id, reason: "רכב + תאריך אירוע מתאימים לתיק אחד", candidates: [datePlateHits[0].id], via: "plate_date" };
  }
  if (plateHits.length === 1) {
    return { decision: "auto", claimId: plateHits[0].id, reason: "מספר רכב מופיע בתיק אחד בלבד במערכת", candidates: [plateHits[0].id], via: "plate_unique" };
  }
  if (plateHits.length > 1) {
    return { decision: "needs_review", reason: "אותו רכב ביותר מתביעה אחת ואין מספר תביעה/תאריך מספיק", candidates: plateHits.map((c) => c.id), via: "plate_ambiguous" };
  }

  return empty;
}
