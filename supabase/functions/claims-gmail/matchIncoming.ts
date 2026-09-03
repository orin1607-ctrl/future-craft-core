/** Conservative incoming-mail → claim matcher. No guessing. Staging Claims Gmail.
 * Also binds exact claim id / claimNum tokens (not only DAL-YYYY-NNNN). */



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
  const hayU = hay.toUpperCase();
  const dalHits = uniqueClaims(claims.filter((c) => {
    const keys = [c.id, c.claimNum].map((x) => String(x || "").trim().toUpperCase()).filter((k) => k.length >= 8);
    return keys.some((k) => dalIds.includes(k) || hayU.includes(k));
  }));

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

export type SuggestFile = {
  id: string;
  staff_type?: string;
  doc_kind?: string;
  staff_title?: string;
  original_name?: string;
};

const REQUEST_TYPES: Array<{ re: RegExp; type: string; label: string }> = [
  { re: /אי[\s-]?הגשת|אי הגשת תביעה/, type: "no_claim_form", label: "טופס אי-הגשת תביעה" },
  { re: /רישיון נהיגה/, type: "driver_license", label: "רישיון נהיגה" },
  { re: /רישיון רכב/, type: "vehicle_license", label: "רישיון רכב" },
  { re: /הודעה על תאונה|טופס אירוע/, type: "accident_notice", label: "טופס הודעה על תאונה" },
  { re: /עותק.{0,12}פוליסה|פוליסת הביטוח|(?:נא |חסר.{0,12}|העביר.{0,18}|צרף.{0,18}|השלמ.{0,18})פוליסה/, type: "policy", label: "פוליסה" },
  { re: /אישור משטרה/, type: "police", label: "אישור משטרה" },
  { re: /דוח שמאי|שמאות/, type: "surveyor_report", label: "דוח שמאי" },
  { re: /חשבונית מוסך|חשבונית/, type: "garage_invoice", label: "חשבונית מוסך" },
  { re: /תמונ(?:ות|ה) נזק/, type: "damage_photos", label: "תמונות נזק" },
];

export type DetectedRequestKind = "doc" | "sign" | "generic" | "info" | "reply" | "update" | "approve" | "reject" | "other";
export type DetectedRequest = { type: string; label: string; kind: DetectedRequestKind };

const INTENT_TYPES: Array<{ re: RegExp; type: string; label: string; kind: DetectedRequestKind }> = [
  { re: /נא למסור|נבקש לדעת|נדרש מידע|פרטים נוספים|נא לעדכן אותנו/, type: "info", label: "בקשת מידע", kind: "info" },
  { re: /נא להגיב|נבקש תגובה|נא לאשר קבלה|נדרשת תגובה|ממתינים לתשובתכם/, type: "reply", label: "בקשת תגובה", kind: "reply" },
  { re: /עדכון סטטוס|סטטוס התיק|נעדכן כי|התיק עבר לסטטוס/, type: "update", label: "עדכון", kind: "update" },
  { re: /אושרה התביעה|אישור תשלום|אושר לשלם|אושרה לתשלום/, type: "approve", label: "אישור", kind: "approve" },
  { re: /נדחתה התביעה|דחיית התביעה|התביעה נדחתה|לא אושרה התביעה/, type: "reject", label: "דחייה", kind: "reject" },
  { re: /נא לטפל|יש לטפל בפנייה|נדרש טיפול בתיק/, type: "other", label: "טיפול אחר", kind: "other" },
];

function requestHay(text: string) {
  return String(text || "")
    .split(/כמפורט בתקנון החברה|PERSONAL_MAIL_NR/)[0]
    .slice(0, 2500);
}

export function isDocMailRequest(kind: string) {
  return kind === "doc" || kind === "sign" || kind === "generic";
}

export function detectMailRequests(text: string): DetectedRequest[] {
  const hay = requestHay(text);
  const out: DetectedRequest[] = [];
  const sign = /לחתום|חתום על|ולהחזיר|החזרה חתומ/;
  for (const req of REQUEST_TYPES) {
    if (req.re.test(hay)) out.push({ type: req.type, label: req.label, kind: sign.test(hay) ? "sign" : "doc" });
  }
  if (!out.length && sign.test(hay)) {
    out.push({ type: "sign_return", label: "לחתום ולהחזיר את המסמך המצורף", kind: "sign" });
  }
  if (!out.some((x) => isDocMailRequest(x.kind)) && /השלמת מסמכים|מסמכים חסרים|נא להעביר|נא לצרף|אודה להשלמת|חוסרים/.test(hay)) {
    out.push({ type: "docs_generic", label: "השלמת מסמכים לפי הבקשה במייל", kind: "generic" });
  }
  for (const req of INTENT_TYPES) {
    if (req.re.test(hay) && !out.some((x) => x.type === req.type)) out.push({ type: req.type, label: req.label, kind: req.kind });
  }
  return out;
}

export function suggestReply(text: string, files: SuggestFile[]) {
  const hay = requestHay(text);
  const found = REQUEST_TYPES.filter((x) => x.re.test(hay));
  const detected = detectMailRequests(text);
  if (!found.length && !detected.length) {
    return { ok: false as const, reason: "לא זוהתה בקשה ברורה", requested: [] as string[], attachments: [] as SuggestFile[], missing: [] as string[] };
  }
  const attachments: SuggestFile[] = [];
  const missing: string[] = [];
  for (const req of found) {
    const hits = files.filter((f) =>
      f.staff_type === req.type
      || (req.type === "surveyor_report" && (f.doc_kind === "surveyor_report" || f.doc_kind === "surveyor_attachment"))
      || (req.type === "garage_invoice" && f.doc_kind === "garage_invoice")
      || (req.type === "damage_photos" && f.doc_kind === "surveyor_photo")
    );
    if (hits.length === 1) attachments.push(hits[0]);
    else if (hits.length === 0) missing.push(req.label);
    else missing.push(`${req.label} (נמצאו ${hits.length} — בחירה ידנית)`);
  }
  const requested = [...new Set([...found.map((x) => x.label), ...detected.map((x) => x.label)])];
  if (!found.length) {
    return {
      ok: true as const,
      reason: `זוהתה ${requested.join(", ")} — טיוטה לאישור ידני. אין Auto-send.`,
      requested,
      attachments,
      missing,
    };
  }
  return {
    ok: missing.length === 0 && attachments.length > 0,
    reason: missing.length ? `חסר מסמך: ${missing.join(", ")}` : "מסמך מזוהה בתיק",
    requested,
    attachments,
    missing,
  };
}

export function normFileName(name: string) {
  return String(name || "").toLowerCase().replace(/\\/g, "/").split("/").pop()!.replace(/\s+/g, " ").trim();
}

export function isGenericAttachmentName(name: string) {
  const n = normFileName(name);
  return /^(image|img|photo|scan|document|attachment|file|untitled)[-_\s]?\d*\.(pdf|jpe?g|png|gif|webp|heic)$/i.test(n)
    || /^image-\d+\./.test(n);
}

export type SentPreviewDoc = { id?: string; original_name?: string; gmail_attachment_id?: string };

export function classifySentAttachment(opts: {
  filename: string;
  attachmentId?: string;
  match: MatchResult;
  claimDocs: SentPreviewDoc[];
}): { status: "already_in_claim" | "certain_new" | "needs_review" | "unmatched"; reason: string } {
  const name = normFileName(opts.filename);
  if (opts.match.decision !== "auto" || !opts.match.claimId) {
    if (opts.match.candidates.length) return { status: "needs_review", reason: opts.match.reason };
    return { status: "unmatched", reason: opts.match.reason || "אין מזהה מספיק" };
  }
  const attId = String(opts.attachmentId || "").trim();
  if (attId && opts.claimDocs.some((d) => String(d.gmail_attachment_id || "") === attId)) {
    return { status: "already_in_claim", reason: "הקובץ כבר בתיק לפי מזהה Gmail" };
  }
  const nameHits = opts.claimDocs.filter((d) => normFileName(d.original_name || "") === name);
  if (name && nameHits.length >= 1) {
    return { status: "already_in_claim", reason: "שם הקובץ כבר בתיק המותאם" };
  }
  if (!name || isGenericAttachmentName(opts.filename)) {
    return { status: "needs_review", reason: "שם קובץ כללי — אין שיוך לפי שם בלבד" };
  }
  return { status: "certain_new", reason: "התאמת תביעה ודאית והקובץ אינו בתיק" };
}
