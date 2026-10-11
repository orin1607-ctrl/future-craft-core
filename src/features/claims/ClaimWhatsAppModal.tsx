import { useMemo, useState } from 'react';
import { TEMPLATES } from './claimsConstants';
import { contactWhatsAppPhone, phoneUnknownToDirectory, type ClaimContact } from './claimContacts';
import {
  WA_TEMPLATE_KEYS,
  fillWaPlaceholders,
  findHeldDuplicate,
  isWaReady,
  israelDateTimeParts,
  israelLocalToUtc,
  suggestWaPlan,
  waMeHref,
  waPhoneError,
  waStatusLabel,
  type WaScheduleRow,
} from './claimWhatsApp';

type ClaimLike = Record<string, string> & { id: string };

type Props = {
  claim: ClaimLike;
  contacts: ClaimContact[];
  held: WaScheduleRow[];
  initialPhone?: string;
  initialBody?: string;
  onClose: () => void;
  onOpenManual: (entry: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  onHold: (entry: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  onUpdateHeld: (id: string, patch: { body?: string; phone?: string; plannedAt?: string; contactName?: string; waStatus?: string }) => Promise<{ success: boolean; error?: string }>;
  onNoteOpened: (id: string) => Promise<{ success: boolean; error?: string }>;
  onMarkSent: (id: string) => Promise<{ success: boolean; error?: string }>;
  onSavePhone?: (phone: string) => Promise<{ success: boolean; error?: string }>;
  toast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function ClaimWhatsAppModal({
  claim, contacts, held, initialPhone = '', initialBody = '', onClose, onOpenManual, onHold, onUpdateHeld, onNoteOpened, onMarkSent, onSavePhone, toast,
}: Props) {
  const suggestion = useMemo(() => suggestWaPlan(claim, contacts.map((c) => ({
    full_name: c.full_name,
    role: c.role,
    phone: contactWhatsAppPhone(c),
  }))), [claim, contacts]);
  const [phone, setPhone] = useState(initialPhone || claim.clientPhone || '');
  const [contactName, setContactName] = useState(claim.clientName || '');
  const [body, setBody] = useState(initialBody);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);

  const previewHref = useMemo(() => (phone && body ? waMeHref(phone, body) : ''), [phone, body]);
  const phoneErr = phone ? waPhoneError(phone) : '';

  function applySuggestion() {
    setPhone(suggestion.phone);
    setContactName(suggestion.contactName);
    setBody(suggestion.body);
    setDate(suggestion.date);
    setTime(suggestion.time);
    setConfirmed(false);
  }

  function applyTemplate(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    setBody(fillWaPlaceholders(tpl.body, { ...claim, claimNum: claim.claimNum || claim.id }));
    setConfirmed(false);
  }

  function pickContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;
    setContactName(contact.full_name || '');
    setPhone(contactWhatsAppPhone(contact));
    setConfirmed(false);
  }

  async function openManual() {
    if (!confirmed) { toast('סמן אישור לפני פתיחת WhatsApp', 'err'); return; }
    if (phoneErr || !body.trim()) { toast(phoneErr || 'נא לכתוב הודעה', 'err'); return; }
    setBusy(true);
    try {
      const href = waMeHref(phone, body);
      window.open(href, '_blank', 'noopener,noreferrer');
      const saved = await onOpenManual({
        claimId: claim.id,
        type: 'wa',
        phone,
        body,
        contactName,
        direction: 'out',
        waStatus: 'opened_not_sent',
        provider: 'wa.me',
        delivery: 'not_sent',
      });
      if (!saved.success) { toast(saved.error || 'התיעוד נכשל. ההודעה לא סומנה כנשלחה', 'err'); return; }
      toast('WhatsApp נפתח. צריך ללחוץ שליחה שם. ההודעה לא סומנה כנשלחה.');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function hold() {
    if (!confirmed) { toast('סמן אישור לפני תזמון', 'err'); return; }
    if (phoneErr || !body.trim()) { toast(phoneErr || 'נא לכתוב הודעה', 'err'); return; }
    const when = israelLocalToUtc(date, time);
    if (!when.ok) { toast(when.error, 'err'); return; }
    if (findHeldDuplicate(held, phone, body, when.runAtIso, editingId)) {
      toast('כבר קיימת הודעה ממתינה עם אותו נמען, נוסח ומועד', 'err');
      return;
    }
    setBusy(true);
    try {
      const entry = {
        claimId: claim.id,
        type: 'wa',
        phone,
        body,
        contactName,
        direction: 'out',
        waStatus: 'scheduled_blocked',
        provider: 'none',
        delivery: 'not_sent',
        plannedAt: when.runAtIso,
        plannedLabel: when.israelLabel,
      };
      const saved = editingId
        ? await onUpdateHeld(editingId, { body, phone, plannedAt: when.runAtIso, contactName })
        : await onHold(entry);
      if (!saved.success) { toast(saved.error || 'התזמון לא נשמר', 'err'); return; }
      toast(`נשמר לתאריך ${when.israelLabel}. במועד תופיע התראה. ההודעה לא תישלח לבד.`);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function cancelHeld(id: string) {
    setBusy(true);
    try {
      const saved = await onUpdateHeld(id, { waStatus: 'cancelled' });
      if (!saved.success) { toast(saved.error || 'הביטול נכשל', 'err'); return; }
      toast('ההודעה המתוזמנת בוטלה לפני שליחה');
    } finally {
      setBusy(false);
    }
  }

  const pending = held.filter((row) => row.waStatus === 'scheduled_blocked');

  return (
    <div className="ov open" data-testid="mo-wa">
      <div className="modal modal-md">
        <div className="mh">
          <div className="mh-t">WhatsApp מתוך התיק</div>
          <button className="mcl" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ fontSize: 12, color: 'var(--yn2)', marginBottom: 10 }} data-testid="wa-no-provider">
            אין שליחה אוטומטית. במועד תופיע התראה, הפתיחה מכינה את ההודעה ב-WhatsApp שלך, ורק «סימנתי ששלחתי» מסמן שליחה.
          </div>
          <div data-testid="wa-suggestion" style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>הצעה לפי מצב התיק</div>
            <div>{suggestion.reason}</div>
            <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{suggestion.body}</div>
            <button type="button" className="btn btn-g btn-sm" data-testid="wa-apply-suggestion" onClick={applySuggestion}>השתמש בהצעה ואערוך</button>
          </div>
          <div className="fg">
            <label className="fl">איש קשר</label>
            <select className="fse fi" data-testid="wa-contact" value="" onChange={(e) => pickContact(e.target.value)}>
              <option value="">בחירה מאנשי הקשר</option>
              {contacts.map((c) => {
                const value = contactWhatsAppPhone(c);
                return value ? <option key={c.id} value={c.id}>{c.full_name} · {value}</option> : null;
              })}
            </select>
          </div>
          <div className="fg">
            <label className="fl">טלפון</label>
            <input className="fi" data-testid="wa-phone" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setConfirmed(false); }} />
            {phoneErr ? <div style={{ fontSize: 11, color: 'var(--rd2)' }}>{phoneErr}</div> : null}
            {onSavePhone && phoneUnknownToDirectory(phone, contacts) ? (
              <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 6 }} data-testid="wa-save-confirm" onClick={async () => {
                const saved = await onSavePhone(phone);
                if (!saved.success) { toast(saved.error || 'שמירה נכשלה', 'err'); return; }
                toast('המספר נשמר רק אחרי האישור הזה');
              }}>שמור את המספר באנשי הקשר</button>
            ) : null}
          </div>
          <div className="fg">
            <label className="fl">טיוטה לפי נתוני התיק</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WA_TEMPLATE_KEYS.map((key) => (
                <button key={key} type="button" className="btn btn-g btn-sm" data-testid={`wa-draft-${key}`} onClick={() => applyTemplate(key)}>{TEMPLATES[key].name}</button>
              ))}
            </div>
          </div>
          <div className="fg">
            <label className="fl">הודעה</label>
            <textarea className="fta" data-testid="wa-msg" style={{ minHeight: 120 }} value={body} onChange={(e) => { setBody(e.target.value); setConfirmed(false); }} />
          </div>
          <div className="fg2">
            <div className="fg"><label className="fl">תאריך (ישראל)</label><input className="fi" data-testid="wa-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setConfirmed(false); }} /></div>
            <div className="fg"><label className="fl">שעה (ישראל)</label><input className="fi" data-testid="wa-time" type="time" value={time} onChange={(e) => { setTime(e.target.value); setConfirmed(false); }} /></div>
          </div>
          <div data-testid="wa-preview" style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 8 }}>
            <div><b>נמען:</b> {contactName || '—'} · {phone || '—'}</div>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{body || 'אין נוסח עדיין'}</div>
            {previewHref ? <div style={{ marginTop: 6, wordBreak: 'break-all' }}><b>קישור לפתיחה:</b> {previewHref}</div> : null}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <input data-testid="wa-confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            אני מאשר את הנמען ואת הנוסח. פתיחה או תזמון אינם שליחה.
          </label>
          <div className="sdiv" style={{ marginTop: 12 }}><div className="sdiv-t">ממתינות בתיק ({pending.length})</div><div className="sdiv-l" /></div>
          {pending.length === 0 ? <div style={{ fontSize: 12, color: 'var(--t3)' }}>אין הודעה מתוזמנת</div> : pending.map((row) => (
            <div key={row.id} data-testid={`wa-held-${row.id}`} style={{ border: '1px solid var(--br)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{waStatusLabel(row.waStatus || '')}</div>
              <div>{row.phone} · {row.plannedAt ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.plannedAt)) : ''}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{row.body}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="button" className="btn btn-g btn-sm" onClick={() => {
                  setEditingId(row.id || '');
                  setPhone(row.phone || '');
                  setBody(row.body || '');
                  setContactName(row.contactName || '');
                  if (row.plannedAt) {
                    const parts = israelDateTimeParts(new Date(row.plannedAt));
                    setDate(parts.date);
                    setTime(parts.time);
                  }
                  setConfirmed(false);
                }}>ערוך</button>
                {isWaReady(row) && row.phone && row.body ? (
                  <a className="btn btn-p btn-sm" style={{ background: '#15803d' }} data-testid={`wa-ready-open-${row.id}`} href={waMeHref(row.phone, row.body)} target="_blank" rel="noreferrer" onClick={() => { if (row.id) void onNoteOpened(row.id); }}>פתח מוכן</a>
                ) : null}
                {isWaReady(row) && row.id ? (
                  <button type="button" className="btn btn-g btn-sm" data-testid={`wa-mark-${row.id}`} onClick={async () => {
                    const saved = await onMarkSent(row.id || '');
                    if (!saved.success) { toast(saved.error || 'הסימון נכשל', 'err'); return; }
                    toast('סומן ידנית כנשלח');
                  }}>סימנתי ששלחתי</button>
                ) : null}
                <button type="button" className="btn btn-sm" data-testid={`wa-cancel-${row.id}`} onClick={() => { if (row.id) void cancelHeld(row.id); }}>בטל לפני שליחה</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mf">
          <button className="btn btn-g" type="button" onClick={onClose}>סגור</button>
          <button className="btn btn-g" type="button" data-testid="wa-hold" disabled={busy} onClick={() => { void hold(); }}>{editingId ? 'עדכן תזמון' : 'שמור תזמון'}</button>
          <button className="btn btn-p" type="button" data-testid="wa-open" disabled={busy} style={{ background: '#15803d' }} onClick={() => { void openManual(); }}>פתח WhatsApp</button>
        </div>
      </div>
    </div>
  );
}
