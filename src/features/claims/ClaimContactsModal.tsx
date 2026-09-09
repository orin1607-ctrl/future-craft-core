import { useEffect, useMemo, useState } from 'react';
import {
  CONTACT_ROLES,
  contactEmails,
  contactMatchesQuery,
  contactPhones,
  contactRoleLabel,
  contactWhatsAppPhone,
  projectClaimContacts,
  rankContactsForClaim,
  sameCompany,
  type ClaimContact,
  type ContactChannelKind,
} from './claimContacts';
import type { ClaimRecord, ClaimsApi } from './claimsService';

type SaveDraft = {
  full_name: string;
  role: string;
  company_name: string;
  department: string;
  note: string;
  email: string;
  phone: string;
  whatsapp: string;
  listed_in_directory: boolean;
  linkClaim: boolean;
};

const emptyDraft = (claim: ClaimRecord | null): SaveDraft => ({
  full_name: '',
  role: 'other',
  company_name: claim?.insCompany || '',
  department: '',
  note: '',
  email: '',
  phone: '',
  whatsapp: '',
  listed_in_directory: true,
  linkClaim: true,
});

export function ClaimContactsModal({
  open,
  claim,
  api,
  onClose,
  onMail,
  onWhatsApp,
  onCall,
  toast,
}: {
  open: boolean;
  claim: ClaimRecord | null;
  api: ClaimsApi;
  onClose: () => void;
  onMail: (email: string, contact: ClaimContact) => void;
  onWhatsApp: (phone: string, contact: ClaimContact) => void;
  onCall: (phone: string, contact: ClaimContact) => void;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}) {
  const [q, setQ] = useState('');
  const [roleFil, setRoleFil] = useState('');
  const [rows, setRows] = useState<ClaimContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SaveDraft>(emptyDraft(claim));
  const [dup, setDup] = useState<ClaimContact | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; contact: ClaimContact; value: string } | null>(null);

  const load = async () => {
    if (!claim) return;
    const r = await api.listClaimContacts(claim.id);
    if (!r.success) { toast(r.error || 'טעינת אנשי קשר נכשלה', 'err'); return; }
    setRows(r.data);
  };

  useEffect(() => {
    if (!open || !claim) return;
    setQ('');
    setRoleFil('');
    setAdding(false);
    setDup(null);
    setConfirm(null);
    setDraft(emptyDraft(claim));
    void load();
  }, [open, claim?.id]);

  const projected = useMemo(() => (claim ? projectClaimContacts(claim) : []), [claim]);
  const linked = rows.filter((c) => c.linked);
  const primary = linked.find((c) => c.is_primary_treatment);
  const directory = rankContactsForClaim(
    rows.filter((c) => c.listed_in_directory !== false),
    claim || {},
  );
  const visibleDir = directory.filter((c) => contactMatchesQuery(c, q) && (!roleFil || c.role === roleFil));
  const visibleLinked = linked.filter((c) => contactMatchesQuery(c, q) && (!roleFil || c.role === roleFil));
  const visibleProj = projected.filter((c) => contactMatchesQuery(c, q) && (!roleFil || c.role === roleFil));

  const saveDraft = async () => {
    if (!claim) return;
    if (!draft.full_name.trim()) { toast('נא למלא שם', 'err'); return; }
    setBusy(true);
    const channels: Array<{ kind: ContactChannelKind; value: string; label?: string }> = [];
    if (draft.email.trim()) channels.push({ kind: 'email', value: draft.email.trim() });
    if (draft.phone.trim()) channels.push({ kind: 'phone', value: draft.phone.trim() });
    if (draft.whatsapp.trim()) channels.push({ kind: 'whatsapp', value: draft.whatsapp.trim() });
    const r = await api.saveContact({
      full_name: draft.full_name.trim(),
      role: draft.role,
      company_name: draft.company_name.trim(),
      department: draft.department.trim(),
      note: draft.note.trim(),
      listed_in_directory: draft.listed_in_directory,
      claimId: claim.id,
      linkClaim: draft.linkClaim,
      channels,
    });
    setBusy(false);
    if (r.duplicate && r.existing) {
      setDup(r.existing);
      toast('איש קשר עם אותם פרטים כבר קיים — אפשר לשייך במקום ליצור כפילות', 'err');
      return;
    }
    if (!r.success) { toast(String(r.error || 'שמירה נכשלה'), 'err'); return; }
    toast('איש הקשר נשמר רק אחרי האישור שלך');
    setAdding(false);
    setDraft(emptyDraft(claim));
    await load();
  };

  const linkExisting = async (c: ClaimContact) => {
    if (!claim) return;
    setBusy(true);
    const r = await api.linkContactToClaim(claim.id, c.id, c.role);
    setBusy(false);
    if (!r.success) { toast(String(r.error || 'שיוך נכשל'), 'err'); return; }
    toast(r.already ? 'כבר משויך לתיק זה' : 'שויך לתיק — לא נוצרה כפילות');
    setDup(null);
    setAdding(false);
    await load();
  };

  const makePrimary = async (c: ClaimContact) => {
    if (!claim) return;
    const r = await api.setPrimaryClaimContact(claim.id, c.id);
    if (!r.success) { toast(String(r.error || 'לא ניתן לסמן ראשי'), 'err'); return; }
    await load();
  };

  const ask = (action: string, contact: ClaimContact, value: string) => {
    if (!value) { toast('אין ערך לבחירה', 'err'); return; }
    setConfirm({ action, contact, value });
  };

  const go = () => {
    if (!confirm) return;
    const { action, contact, value } = confirm;
    setConfirm(null);
    if (action === 'mail') onMail(value, contact);
    if (action === 'wa') onWhatsApp(value, contact);
    if (action === 'call') onCall(value, contact);
  };

  const card = (c: ClaimContact, extra?: string) => {
    const emails = contactEmails(c);
    const phones = contactPhones(c);
    const wa = contactWhatsAppPhone(c);
    return (
      <div key={c.id} className={`claim-contact-card${c.is_primary_treatment ? ' is-primary' : ''}`} data-testid={`claim-contact-${c.id}`}>
        <div className="claim-contact-head">
          <div>
            <div className="claim-contact-name">{c.full_name || '—'}</div>
            <div className="claim-contact-meta">
              {contactRoleLabel(c.role)}
              {c.company_name ? ` · ${c.company_name}` : ''}
              {c.department ? ` · ${c.department}` : ''}
              {extra ? ` · ${extra}` : ''}
            </div>
          </div>
          {c.is_primary_treatment ? <span className="lbl-pill">ראשי לטיפול</span> : null}
        </div>
        {emails.map((e) => <div key={e} className="claim-contact-line" dir="ltr">{e}</div>)}
        {phones.map((p) => <div key={p} className="claim-contact-line" dir="ltr">{p}</div>)}
        {c.note ? <div className="claim-contact-note">{c.note}</div> : null}
        <div className="claim-contact-acts">
          {phones[0] ? <button type="button" className="btn btn-g btn-sm" onClick={() => ask('call', c, phones[0])}>התקשר</button> : null}
          {wa ? <button type="button" className="btn btn-g btn-sm" data-testid={`contact-wa-${c.id}`} onClick={() => ask('wa', c, wa)}>WhatsApp</button> : null}
          {emails[0] ? <button type="button" className="btn btn-g btn-sm" data-testid={`contact-mail-${c.id}`} onClick={() => ask('mail', c, emails[0])}>מייל</button> : null}
          {c.source !== 'claim_fields' && claim ? (
            c.linked
              ? <button type="button" className="btn btn-sm" onClick={() => void makePrimary(c)}>ראשי לטיפול</button>
              : <button type="button" className="btn btn-p btn-sm" onClick={() => void linkExisting(c)}>שייך לתיק</button>
          ) : null}
          {c.source === 'claim_fields' ? (
            <button type="button" className="btn btn-p btn-sm" onClick={() => {
              setAdding(true);
              setDraft({
                ...emptyDraft(claim),
                full_name: c.full_name === '—' ? '' : c.full_name,
                role: c.role,
                company_name: c.company_name,
                email: emails[0] || '',
                phone: phones[0] || '',
                whatsapp: wa || '',
                listed_in_directory: true,
                linkClaim: true,
              });
            }}>שמור במאגר</button>
          ) : null}
        </div>
      </div>
    );
  };

  if (!open || !claim) return null;
  const ins = String(claim.insCompany || '').trim();

  return (
    <div className="ov open" data-testid="mo-contacts">
      <div className="modal modal-md">
        <div className="mh">
          <div className="mh-t">אנשי קשר</div>
          <button className="mcl" data-testid="contacts-close" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
            מאגר אחד. אין Auto-Save, אין Auto-Send, אין Merge אוטומטי. בחירת נמען ממלאת בלבד.
            {ins ? <> סינון מוצע לחברת הביטוח של התיק: <b>{ins}</b>.</> : null}
          </div>
          {primary ? (
            <div className="claim-contact-primary" data-testid="contact-primary">
              <div className="sdiv"><div className="sdiv-t">איש קשר ראשי לטיפול</div><div className="sdiv-l" /></div>
              {card(primary)}
            </div>
          ) : null}
          <div className="fg"><label className="fl">חיפוש</label>
            <input className="fi" data-testid="contacts-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם / חברה / תפקיד / Email / טלפון" />
          </div>
          <div className="fg"><label className="fl">סוג</label>
            <select className="fse fi" data-testid="contacts-role" value={roleFil} onChange={(e) => setRoleFil(e.target.value)}>
              <option value="">הכל</option>
              {CONTACT_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-p btn-sm" data-testid="contacts-add" onClick={() => { setAdding((v) => !v); setDup(null); }}>+ הוסף איש קשר</button>
          {adding ? (
            <div className="claim-contact-form" data-testid="contacts-add-form">
              <div className="fg"><label className="fl">שם *</label><input className="fi" data-testid="contact-name" value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></div>
              <div className="fg"><label className="fl">סוג/תפקיד</label>
                <select className="fse fi" data-testid="contact-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  {CONTACT_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">חברה</label><input className="fi" data-testid="contact-company" value={draft.company_name} onChange={(e) => setDraft({ ...draft, company_name: e.target.value })} /></div>
              <div className="fg"><label className="fl">מחלקה</label><input className="fi" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="תביעות / מסמכים / שמאות" /></div>
              <div className="fg"><label className="fl">Email</label><input className="fi" data-testid="contact-email" dir="ltr" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
              <div className="fg"><label className="fl">טלפון</label><input className="fi" data-testid="contact-phone" dir="ltr" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
              <div className="fg"><label className="fl">WhatsApp / נייד</label><input className="fi" data-testid="contact-wa" dir="ltr" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></div>
              <div className="fg"><label className="fl">הערה</label><input className="fi" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
              <label className="pick-row"><input type="radio" name="ct-scope" checked={draft.listed_in_directory && draft.linkClaim} onChange={() => setDraft({ ...draft, listed_in_directory: true, linkClaim: true })} /> שמור במאגר המרכזי + שייך לתביעה זו</label>
              <label className="pick-row"><input type="radio" name="ct-scope" checked={!draft.listed_in_directory && draft.linkClaim} onChange={() => setDraft({ ...draft, listed_in_directory: false, linkClaim: true })} /> איש קשר לתביעה זו בלבד (לא במאגר הכללי)</label>
              <div style={{ fontSize: 11, color: 'var(--t3)', margin: '6px 0' }}>שמירה רק אחרי לחיצה. אם כבר קיים Email/Phone — תוצע שיוך, לא כפילות.</div>
              {dup ? (
                <div data-testid="contact-dup" style={{ background: 'rgba(245,158,11,.12)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  קיים: <b>{dup.full_name}</b> · {contactRoleLabel(dup.role)} · {dup.company_name || '—'}
                  <div className="claim-contact-acts" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-p btn-sm" data-testid="contact-dup-link" onClick={() => void linkExisting(dup)}>שייך את הקיים</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setDup(null)}>לא עכשיו</button>
                  </div>
                </div>
              ) : null}
              <button type="button" className="btn btn-p" data-testid="contact-save" disabled={busy} onClick={() => void saveDraft()}>{busy ? 'שומר…' : 'שמור (אישור מפורש)'}</button>
            </div>
          ) : null}
          <div className="sdiv"><div className="sdiv-t">אנשי קשר בתיק</div><div className="sdiv-l" /></div>
          {visibleLinked.length ? visibleLinked.map((c) => card(c)) : <div className="empty">אין אנשי קשר משויכים עדיין</div>}
          <div className="sdiv"><div className="sdiv-t">שדות שכבר שמורים בתיק (לא במאגר)</div><div className="sdiv-l" /></div>
          {visibleProj.map((c) => card(c, 'שדה תיק קיים'))}
          {ins ? (
            <>
              <div className="sdiv"><div className="sdiv-t">מוצע לפי חברת הביטוח · {ins}</div><div className="sdiv-l" /></div>
              {visibleDir.filter((c) => !c.linked && sameCompany(c.company_name, ins)).map((c) => card(c, 'הצעה'))}
            </>
          ) : null}
          <div className="sdiv"><div className="sdiv-t">מאגר כללי</div><div className="sdiv-l" /></div>
          {visibleDir.filter((c) => !c.linked && !(ins && sameCompany(c.company_name, ins))).map((c) => card(c))}
        </div>
        {confirm ? (
          <div className="claim-contact-confirm" data-testid="contact-confirm">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>אישור נמען — אין שליחה אוטומטית</div>
            <div>{confirm.contact.full_name} · {contactRoleLabel(confirm.contact.role)} · {confirm.contact.company_name || '—'}</div>
            <div dir="ltr">{confirm.value}</div>
            <div className="claim-contact-acts" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-p btn-sm" data-testid="contact-confirm-ok" onClick={go}>אשר</button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setConfirm(null)}>ביטול</button>
            </div>
          </div>
        ) : null}
        <div className="mf">
          <button className="btn btn-g" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

export function ContactPickerList({
  contacts,
  claim,
  channel,
  onPick,
}: {
  contacts: ClaimContact[];
  claim: ClaimRecord | null;
  channel: 'email' | 'phone';
  onPick: (contact: ClaimContact, value: string) => void;
}) {
  const [q, setQ] = useState('');
  const ranked = rankContactsForClaim(
    contacts.filter((c) => c.listed_in_directory !== false || c.linked),
    claim || {},
  ).filter((c) => contactMatchesQuery(c, q));
  return (
    <div className="claim-contact-picker" data-testid="contact-picker">
      <input className="fi" data-testid="contact-picker-search" placeholder="חיפוש במאגר" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
        {ranked.map((c) => {
          const values = channel === 'email' ? contactEmails(c) : [contactWhatsAppPhone(c)].filter(Boolean);
          if (!values.length) return null;
          return (
            <div key={c.id} className="claim-contact-pick-row">
              <div>
                <b>{c.full_name}</b>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {contactRoleLabel(c.role)}{c.company_name ? ` · ${c.company_name}` : ''}{c.linked ? ' · בתיק' : ''}
                  {claim?.insCompany && sameCompany(c.company_name, claim.insCompany) ? ' · אותה חברה' : ''}
                </div>
              </div>
              {values.map((v) => (
                <button key={v} type="button" className="btn btn-g btn-sm" data-testid={`pick-${c.id}-${v}`} onClick={() => onPick(c, v)}>{v}</button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
