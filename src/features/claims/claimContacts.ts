/** Claims contact directory helpers. No auto-save / auto-merge / auto-send. */

export const CONTACT_ROLES: Array<{ key: string; label: string }> = [
  { key: 'client', label: 'לקוח' },
  { key: 'insurer', label: 'חברת ביטוח' },
  { key: 'insurer_dept', label: 'מחלקה בחברת ביטוח' },
  { key: 'agent', label: 'סוכן' },
  { key: 'surveyor', label: 'שמאי' },
  { key: 'garage', label: 'מוסך' },
  { key: 'lawyer', label: 'עורך דין' },
  { key: 'other', label: 'אחר' },
];

export type ContactChannelKind = 'email' | 'phone' | 'whatsapp';

export type ClaimContactChannel = {
  id: string;
  contact_id: string;
  kind: ContactChannelKind;
  value: string;
  value_norm: string;
  label: string;
};

export type ClaimContact = {
  id: string;
  full_name: string;
  role: string;
  company_name: string;
  department: string;
  note: string;
  active: boolean;
  listed_in_directory: boolean;
  channels: ClaimContactChannel[];
  is_primary_treatment?: boolean;
  linked?: boolean;
  source?: 'directory' | 'claim_fields';
};

export function contactRoleLabel(role: string) {
  return CONTACT_ROLES.find((r) => r.key === role)?.label || role || 'אחר';
}

export function normEmail(raw: string) {
  return String(raw || '').trim().toLowerCase();
}

export function normPhoneDigits(raw: string) {
  let d = String(raw || '').trim().replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9720')) d = `972${d.slice(4)}`;
  else if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return d;
}

export function normChannel(kind: ContactChannelKind, value: string) {
  return kind === 'email' ? normEmail(value) : normPhoneDigits(value);
}

export function parseFromAddr(raw: string): { name: string; email: string } {
  const s = String(raw || '').trim();
  const angled = s.match(/^(.*?)\s*<([^>]+@[^>]+)>\s*$/);
  if (angled) return { name: angled[1].replace(/^"|"$/g, '').trim(), email: normEmail(angled[2]) };
  const email = (s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
  return { name: email ? s.replace(email, '').replace(/[<>]/g, '').trim() : s, email: normEmail(email) };
}

export function contactEmails(c: ClaimContact) {
  return c.channels.filter((x) => x.kind === 'email' && x.value).map((x) => x.value);
}

export function contactPhones(c: ClaimContact) {
  return c.channels.filter((x) => x.kind === 'phone' || x.kind === 'whatsapp').map((x) => x.value);
}

export function contactWhatsAppPhone(c: ClaimContact) {
  return c.channels.find((x) => x.kind === 'whatsapp' && x.value)?.value
    || c.channels.find((x) => x.kind === 'phone' && x.value)?.value
    || '';
}

export function contactMatchesQuery(c: ClaimContact, q: string) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return true;
  const blob = [
    c.full_name, c.company_name, c.department, contactRoleLabel(c.role), c.note,
    ...c.channels.map((ch) => `${ch.value} ${ch.value_norm}`),
  ].join(' ').toLowerCase();
  return blob.includes(t);
}

export function sameCompany(a: string, b: string) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase() && !!String(a || '').trim();
}

/** Rank for composer / request pickers. Suggestion only — never auto-select send. */
export function rankContactsForClaim(
  contacts: ClaimContact[],
  claim: { id?: string; insCompany?: string; clientEmail?: string; clientName?: string },
) {
  const ins = String(claim.insCompany || '').trim();
  const score = (c: ClaimContact) => {
    if (c.linked || c.is_primary_treatment) return 100 + (c.is_primary_treatment ? 20 : 0);
    if (ins && sameCompany(c.company_name, ins)) return 80;
    if (c.role === 'client') return 60;
    if (c.role === 'agent') return 50;
    return 10;
  };
  return [...contacts]
    .filter((c) => c.active !== false)
    .sort((a, b) => score(b) - score(a) || a.full_name.localeCompare(b.full_name, 'he'));
}

type Claimish = Record<string, string>;

function virtual(id: string, role: string, name: string, company: string, channels: Array<{ kind: ContactChannelKind; value: string; label?: string }>): ClaimContact | null {
  const ch = channels.filter((x) => String(x.value || '').trim()).map((x, i) => ({
    id: `${id}-ch-${i}`,
    contact_id: id,
    kind: x.kind,
    value: String(x.value).trim(),
    value_norm: normChannel(x.kind, x.value),
    label: x.label || '',
  }));
  if (!name && !ch.length && !company) return null;
  return {
    id,
    full_name: name || company || '—',
    role,
    company_name: company,
    department: '',
    note: 'מתוך שדות התיק — לא נשמר במאגר עד אישור',
    active: true,
    listed_in_directory: false,
    channels: ch,
    source: 'claim_fields',
    linked: false,
  };
}

/** Read-only projection of existing claim fields. Never writes / never mass-migrates. */
export function projectClaimContacts(c: Claimish): ClaimContact[] {
  const out: ClaimContact[] = [];
  const client = virtual('claim-client', 'client', c.clientName || '', '', [
    { kind: 'email', value: c.clientEmail || '' },
    { kind: 'phone', value: c.clientPhone || c.phoneMobile || c.phoneHome || '' },
    { kind: 'whatsapp', value: c.phoneMobile || c.clientPhone || '' },
  ]);
  if (client) out.push(client);
  const ins = virtual('claim-insurer', 'insurer', c.insCompany || '', c.insCompany || '', [
    { kind: 'email', value: c.insEmail || '', label: 'חברה' },
  ]);
  if (ins) out.push(ins);
  const insRep = virtual('claim-ins-rep', 'insurer_dept', c.insRepName || '', c.insCompany || '', [
    { kind: 'email', value: c.insRepEmail || '', label: 'נציג' },
    { kind: 'phone', value: c.insRepPhone || '' },
  ]);
  if (insRep && (c.insRepName || c.insRepEmail || c.insRepPhone)) out.push(insRep);
  const agent = virtual('claim-agent', 'agent', c.agentName || '', '', []);
  if (agent && c.agentName) out.push(agent);
  const surv = virtual('claim-surveyor', 'surveyor', c.surveyor || c.surveyorName || '', '', [
    { kind: 'email', value: c.survEmail || '' },
    { kind: 'phone', value: c.survPhone || '' },
  ]);
  if (surv && (c.surveyor || c.surveyorName || c.survEmail || c.survPhone)) out.push(surv);
  const garage = virtual('claim-garage', 'garage', c.garageName || '', c.garageName || '', []);
  if (garage && c.garageName) out.push(garage);
  const legal = virtual('claim-lawyer', 'lawyer', c.legalLawyer || '', c.legalFirm || '', [
    { kind: 'email', value: c.legalEmail || '' },
    { kind: 'phone', value: c.legalPhone || '' },
  ]);
  if (legal && (c.legalLawyer || c.legalEmail || c.legalPhone)) out.push(legal);
  return out;
}

export function emailsUnknownToDirectory(rawTo: string, contacts: ClaimContact[]) {
  const known = new Set(
    contacts.flatMap((c) => c.channels.filter((x) => x.kind === 'email').map((x) => x.value_norm || normEmail(x.value))),
  );
  return String(rawTo || '')
    .split(/[,;]/)
    .map((x) => normEmail(x))
    .filter((e) => e.includes('@') && !known.has(e));
}

export function phoneUnknownToDirectory(raw: string, contacts: ClaimContact[]) {
  const n = normPhoneDigits(raw);
  if (!n) return '';
  const known = contacts.some((c) => c.channels.some((x) => (x.kind === 'phone' || x.kind === 'whatsapp') && x.value_norm === n));
  return known ? '' : n;
}
