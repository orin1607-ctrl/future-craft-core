/**
 * Filling claim fields from documents the user attached in the claims chat (driving licence, vehicle licence,
 * insurance certificate…). Pure functions; no I/O.
 *
 * The model proposes which value goes to which field. The server accepts a value only when it is written in
 * the text read from the documents (OCR / PDF text) — a value that is not in a document is rejected, never
 * filled. Empty fields are filled; a field that already holds a different value is a conflict and is changed
 * only when the user asked for that field explicitly. Nothing is ever cleared.
 */
import { CLAIM_EDIT_FIELDS, currentFieldValue, planClaimFieldEdit, type FieldChange } from './claimFieldEdit.ts';

/** The third-party section of the claim, in the order shown to the user. */
export const THIRD_PARTY_FIELDS = [
  'thirdParty', 'thirdId', 'thirdLicense', 'thirdPhone', 'thirdAddress',
  'thirdPlate', 'thirdMakeModel', 'thirdOwner', 'thirdInsured',
  'thirdInsCompany', 'thirdPolicy', 'thirdClaimNum',
] as const;

/** Main claim details checked by "what is still missing". */
export const CLAIM_CORE_FIELDS = [
  'clientName', 'clientPhone', 'plate', 'carModel', 'eventDate', 'claimKind',
  'insCompany', 'policyNum', 'claimNum', 'surveyor',
] as const;

export type DocText = { name: string; text: string };
export type FillProposal = { field: string; value: string };
export type Grounding = { doc: string; quote: string };

export type FillConflict = FieldChange & { applied: boolean; doc: string; quote: string };

export type DocFillPlan = {
  /** Empty fields that will be filled. */
  fills: Array<FieldChange & { doc: string; quote: string }>;
  /** Fields that already hold another value; applied only when the user named the field in overrideFields. */
  conflicts: FillConflict[];
  /** Values already in the claim. */
  same: string[];
  /** Proposals refused, with the reason (not in any document, invalid, not a claim field…). */
  rejected: string[];
  /** Third-party fields still empty after this update. */
  missing: string[];
  /** What the approval will write: fills + conflicts the user approved. */
  changes: FieldChange[];
};

const NUMERIC_KINDS = new Set(['plate', 'idnum', 'license', 'phone']);
const VEHICLE_CUE = /רכב|רישוי|לוחית|plate|vehicle/i;
const PERSON_NUMBER_CUE = /ת\.?\s?ז|ת["״]ז|זהות|רישיון\s*נהיגה|רשיון\s*נהיגה|\bID\b|licen[cs]e\s*no/i;

function lines(text: string) {
  return String(text || '').replace(/\r/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Letters and digits only, one space between words (Hebrew geresh / quotes / dots dropped). */
export function normalizeWords(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Numbers in a line: runs with one separator between digit groups (12-345-67, 012 345 678), and each
 * whitespace token on its own, so a licence field number ("5. 7654321") does not merge into the value.
 */
function digitRuns(line: string) {
  const runs = (line.match(/\d(?:[\s\-./]?\d)*/g) || []).map((r) => r.replace(/\D/g, ''));
  const tokens = line.split(/\s+/).map((t) => t.replace(/\D/g, '')).filter(Boolean);
  return [...runs, ...tokens];
}

/**
 * Where a value is written in the documents, or null. Numbers must appear as one number (not split from a
 * longer one); words must all appear in the same document as whole words.
 */
export function findInDocuments(field: string, value: string, docs: DocText[]): Grounding | null {
  const kind = CLAIM_EDIT_FIELDS[field]?.kind || 'text';
  const wantDigits = String(value || '').replace(/\D/g, '');
  const numeric = NUMERIC_KINDS.has(kind) || (wantDigits.length >= 5 && wantDigits.length >= normalizeWords(value).replace(/\s/g, '').length);
  for (const doc of docs) {
    const docLines = lines(doc.text);
    if (numeric) {
      if (!wantDigits) return null;
      // A plate only from a document about a vehicle; an ID / licence number never from a vehicle line.
      if (kind === 'plate' && !VEHICLE_CUE.test(doc.text)) continue;
      const lineOk = (l: string) => (kind === 'idnum' || kind === 'license' ? !VEHICLE_CUE.test(l) : true)
        && (kind === 'plate' ? !PERSON_NUMBER_CUE.test(l) : true);
      const strip0 = (d: string) => d.replace(/^0+/, '');
      const hit = docLines.find((l) => lineOk(l) && digitRuns(l).some((d) => d === wantDigits || (kind === 'idnum' && strip0(d) === strip0(wantDigits))));
      if (hit) return { doc: doc.name, quote: hit.slice(0, 160) };
      continue;
    }
    const words = normalizeWords(value).split(' ').filter(Boolean);
    if (!words.length) return null;
    const docWords = new Set(normalizeWords(doc.text).split(' '));
    if (words.every((w) => docWords.has(w))) {
      const quote = docLines.find((l) => normalizeWords(l).split(' ').some((w) => w === words[0])) || '';
      return { doc: doc.name, quote: quote.slice(0, 160) };
    }
  }
  return null;
}

export function planDocumentFill(
  rowData: Record<string, unknown>,
  proposals: FillProposal[],
  docs: DocText[],
  overrideFields: string[] = [],
  sectionFields: readonly string[] = THIRD_PARTY_FIELDS,
): DocFillPlan {
  const plan: DocFillPlan = { fills: [], conflicts: [], same: [], rejected: [], missing: [], changes: [] };
  // Field names and value checks come from the same rules as a manual field edit.
  const validated = planClaimFieldEdit(rowData, proposals);
  plan.rejected.push(...validated.errors);
  plan.same.push(...validated.unchanged);
  const override = new Set(overrideFields.map((f) => String(f || '').trim()).filter(Boolean));
  const overrideLabels = new Set([...override].map((f) => CLAIM_EDIT_FIELDS[f]?.label).filter(Boolean));

  for (const change of validated.changes) {
    const at = findInDocuments(change.field, change.after, docs);
    if (!at) {
      plan.rejected.push(`${change.label}: הערך "${change.after}" לא נמצא בטקסט של המסמכים שצורפו — לא יעודכן`);
      continue;
    }
    if (!change.before) {
      plan.fills.push({ ...change, ...at });
      continue;
    }
    const applied = override.has(change.field) || overrideLabels.has(change.label);
    plan.conflicts.push({ ...change, ...at, applied });
  }

  plan.changes = [
    ...plan.fills.map(({ doc: _d, quote: _q, ...c }) => c),
    ...plan.conflicts.filter((c) => c.applied).map(({ doc: _d, quote: _q, applied: _a, ...c }) => c),
  ];
  const filled = new Set(plan.changes.map((c) => c.field));
  plan.missing = sectionFields
    .filter((f) => !filled.has(f) && !currentFieldValue(rowData, f).trim())
    .map((f) => CLAIM_EDIT_FIELDS[f]?.label || f);
  return plan;
}

/** Empty fields of a claim, per section, for "what is still missing in the claim". */
export function missingClaimFields(rowData: Record<string, unknown>) {
  const empty = (keys: readonly string[]) => keys
    .filter((f) => !currentFieldValue(rowData, f).trim())
    .map((f) => CLAIM_EDIT_FIELDS[f]?.label || f);
  const isThirdParty = /צד\s*ג/.test(String(rowData?.claimKind || ''));
  return {
    claim: empty(CLAIM_CORE_FIELDS),
    third_party: empty(THIRD_PARTY_FIELDS),
    third_party_relevant: isThirdParty || THIRD_PARTY_FIELDS.some((f) => currentFieldValue(rowData, f).trim()),
  };
}

/** The approval card text: claim, what was found, what will be added, conflicts, what is still missing. */
export function describeDocumentFill(
  claim: { id: string; clientName: string },
  plan: DocFillPlan,
  docNames: string[],
) {
  const out: string[] = [
    `השלמת פרטים מהמסמכים — תיק ${claim.id}${claim.clientName ? ` · לקוח: ${claim.clientName}` : ''}`,
    `מסמכים שנקראו: ${docNames.length ? docNames.join(', ') : '—'}`,
  ];
  if (plan.fills.length) {
    out.push('', 'יתווסף לתיק (שדות ריקים):');
    for (const c of plan.fills) out.push(`• ${c.label}: ${c.after}  (מתוך: ${c.doc})`);
  }
  if (plan.conflicts.length) {
    out.push('', 'סותר מידע קיים בתיק:');
    for (const c of plan.conflicts) {
      out.push(`• ${c.label} — בתיק: ${c.before} · במסמך: ${c.after}  ${c.applied ? '← יוחלף (ביקשת במפורש)' : '← לא יוחלף בלי אישור מפורש לשדה הזה'}`);
    }
  }
  if (plan.same.length) out.push('', `כבר קיים בתיק עם אותו ערך: ${plan.same.join(', ')}`);
  if (plan.rejected.length) {
    out.push('', 'לא ייכלל:');
    for (const r of plan.rejected) out.push(`• ${r}`);
  }
  if (plan.missing.length) out.push('', `עדיין חסר בתיק: ${plan.missing.join(', ')}`);
  if (!plan.changes.length) out.push('', 'אין שינוי לשמירה.');
  return out.join('\n');
}
