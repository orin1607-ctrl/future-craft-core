import { useEffect, useState } from 'react';
import { CLAIM_DOC_TYPES, displayClaimNum, type ClaimRecord } from './claimsConstants';
import { CUSTOMER_REQUEST_KINDS } from './claimWorkAlerts';
import {
  DEFAULT_REQUEST_TEMPLATES,
  applyTemplateToClaim,
  kindNeedsSignature,
  kindNeedsUpload,
  staffTypeForRequest,
  todayHeDate,
  type CustomerRequestKindKey,
  type CustomerRequestTemplate,
} from './customerRequestModel';
import { ContactPickerList } from './ClaimContactsModal';
import type { ClaimContact } from './claimContacts';
import { buildLetterPdf } from './letterPdf';
import type { ClaimsApi } from './claimsService';

type Props = {
  open: boolean;
  claim: ClaimRecord | null;
  api: ClaimsApi;
  actorName: string;
  contacts: ClaimContact[];
  onClose: () => void;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  mintLink: (rotate?: boolean) => Promise<string>;
  onMail: (to: string, subject: string, body: string, taskId: string) => void;
  onWhatsApp: (phone: string, body: string, taskId: string) => void;
};

export default function CustomerRequestModal({
  open, claim, api, actorName, contacts, onClose, toast, mintLink, onMail, onWhatsApp,
}: Props) {
  const [kind, setKind] = useState<CustomerRequestKindKey>('send_doc');
  const [docKey, setDocKey] = useState('license_driver');
  const [letterDate, setLetterDate] = useState(todayHeDate());
  const [letterTo, setLetterTo] = useState('');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterBody, setLetterBody] = useState('');
  const [needsSig, setNeedsSig] = useState(false);
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [picker, setPicker] = useState(false);
  const [contact, setContact] = useState<ClaimContact | null>(null);
  const [dest, setDest] = useState('');
  const [templates, setTemplates] = useState<CustomerRequestTemplate[]>(DEFAULT_REQUEST_TEMPLATES);
  const [tplId, setTplId] = useState('');
  const [tplName, setTplName] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!open || !claim) return;
    setKind('send_doc');
    setDocKey('license_driver');
    setLetterDate(todayHeDate());
    setLetterTo(claim.clientName || '');
    setLetterSubject(`תביעה ${displayClaimNum(claim)} — בקשה`);
    setLetterBody(`שלום ${claim.clientName || ''},\n\nבהמשך לתביעה ${displayClaimNum(claim)} עבור רכב ${claim.plate || '—'}, נבקש להשלים את המבוקש בקישור.\n\nבברכה,\nדליה ניהול תביעות`);
    setNeedsSig(false);
    setChannel('email');
    setPicker(false);
    setContact(null);
    setDest('');
    setTplId('');
    setTplName('');
    setLinkUrl('');
    void api.listRequestTemplates().then((r) => { if (r.data?.length) setTemplates(r.data); });
  }, [open, claim?.id]);

  if (!open || !claim) return null;

  const applyTpl = (id: string) => {
    setTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const filled = applyTemplateToClaim(tpl, claim);
    setKind(filled.kind);
    setLetterTo(filled.letterTo || claim.clientName || '');
    setLetterSubject(filled.letterSubject);
    setLetterBody(filled.letterBody);
    setNeedsSig(filled.needsSignature);
    setTplName(tpl.name);
  };

  const saveTpl = async () => {
    const name = tplName.trim();
    if (!name) { toast('נא שם לתבנית', 'err'); return; }
    const next: CustomerRequestTemplate = {
      id: tplId && !templates.find((t) => t.id === tplId)?.builtin ? tplId : `tpl-${Date.now()}`,
      name,
      kind,
      letterTo,
      letterSubject,
      letterBody,
      needsSignature: needsSig,
    };
    const list = [...templates.filter((t) => t.id !== next.id), next];
    const r = await api.saveRequestTemplates(list);
    if (!r.success) { toast(r.error || 'שמירת תבנית נכשלה', 'err'); return; }
    setTemplates(list);
    setTplId(next.id);
    toast('התבנית נשמרה לשימוש חוזר');
  };

  const submit = async () => {
    if (!letterBody.trim()) { toast('נא למלא את גוף המסמך / הבקשה', 'err'); return; }
    setBusy(true);
    try {
      const docType = CLAIM_DOC_TYPES.find((t) => t.key === docKey);
      const label = kind === 'send_doc' ? (docType?.label || 'מסמך חסר') : (CUSTOMER_REQUEST_KINDS.find((k) => k.key === kind)?.label || 'בקשה ללקוח');
      const reqKey = kind === 'send_doc' ? (docType?.key || 'custom') : (kind === 'affidavit' || kind === 'sign_doc' ? 'consent_form' : kind === 'complete_form' ? 'demand_form' : 'custom');
      const added = await api.addDocRequest(claim.id, label, reqKey);
      if (!added.success) { toast(added.error || 'יצירת בקשת מסמך נכשלה', 'err'); return; }
      const url = await mintLink(false);
      setLinkUrl(url);
      const staffType = staffTypeForRequest(kind, reqKey);
      let letterFileId = '';
      try {
        const pdf = await buildLetterPdf({
          title: label,
          date: letterDate,
          to: letterTo || claim.clientName || '',
          subject: letterSubject,
          body: letterBody,
          clientName: claim.clientName,
          claimNum: displayClaimNum(claim),
          plate: claim.plate,
          fileName: `${label}.pdf`,
        });
        const up = await api.staffUpload(claim.id, added.id, pdf, { staff_type: staffType, staff_title: label });
        if (up.success) letterFileId = up.file_id || '';
      } catch (err) {
        toast(`הבקשה נשמרת, אך הפקת ה-PDF נכשלה: ${String((err as Error).message || err)}`, 'err');
      }
      const row: Record<string, string> = {
        claimId: claim.id,
        audience: 'customer',
        customerKind: kind,
        action: `בקשה ללקוח — ${label}`,
        requestText: letterBody,
        note: letterBody,
        letterDate,
        letterTo,
        letterSubject,
        letterBody,
        needsSignature: needsSig || kindNeedsSignature(kind) ? 'true' : 'false',
        allowUpload: kindNeedsUpload(kind) ? 'true' : 'true',
        docRequestId: added.id,
        docLabel: label,
        requestType: staffType,
        letterFileId,
        customerLink: url,
        channel,
        customerStatus: 'sent',
        sentAt: new Date().toISOString(),
        createdBy: actorName,
        owner: actorName,
        done: 'false',
      };
      const saved = await api.saveTask(row);
      const bodyWithLink = url
        ? `${letterBody.trim()}\n\nקישור מאובטח להשלמת הבקשה:\n${url}\n`
        : letterBody;
      toast(url ? 'הבקשה נשמרה. הקישור מוכן לשליחה ידנית — אין Auto-Send.' : 'הבקשה נשמרה. הנפיקו קישור ללקוח ממסך המסמכים.');
      if (channel === 'whatsapp') onWhatsApp(dest || claim.clientPhone || '', bodyWithLink, String(saved.id || ''));
      else onMail(dest || claim.clientEmail || '', letterSubject || `תביעה ${displayClaimNum(claim)} – ${label}`, bodyWithLink, String(saved.id || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ov open" data-testid="mo-cust-req">
      <div className="modal modal-md">
        <div className="mh"><div className="mh-t">בקשה ללקוח</div><button className="mcl" onClick={onClose}>✕</button></div>
        <div className="mb">
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
            נשמר באותו תיק. קישור הלקוח הוא המנגנון הקיים (claims-docs). אין Auto-Send ואין מערכת מסמכים חדשה.
          </div>
          <div className="fg"><label className="fl">תבנית</label>
            <select className="fse fi" data-testid="cr-template" value={tplId} onChange={(e) => applyTpl(e.target.value)}>
              <option value="">— בחרי/י תבנית או כתבי חופשי —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">שם תבנית (לשמירה)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="fi" data-testid="cr-tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="לדוגמה: תצהיר לחברת ביטוח" />
              <button type="button" className="btn btn-g btn-sm" data-testid="cr-tpl-save" onClick={() => void saveTpl()}>{tplId && !templates.find((t) => t.id === tplId)?.builtin ? 'ערוך תבנית' : 'צור תבנית חדשה'}</button>
            </div>
          </div>
          <div className="fg"><label className="fl">סוג בקשה</label>
            <select className="fse fi" data-testid="cr-kind" value={kind} onChange={(e) => {
              const k = e.target.value as CustomerRequestKindKey;
              setKind(k);
              setNeedsSig(kindNeedsSignature(k));
            }}>
              {CUSTOMER_REQUEST_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          {kind === 'send_doc' ? (
            <div className="fg"><label className="fl">מסמך מבוקש</label>
              <select className="fse fi" data-testid="cr-doc-key" value={docKey} onChange={(e) => setDocKey(e.target.value)}>
                {CLAIM_DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          ) : null}
          <div className="letter-preview" data-testid="cr-letter">
            <div className="letter-kicker">מסמך רשמי</div>
            <div className="fg"><label className="fl">תאריך</label><input className="fi" data-testid="cr-date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} /></div>
            <div className="fg"><label className="fl">לכבוד</label><input className="fi" data-testid="cr-to" value={letterTo} onChange={(e) => setLetterTo(e.target.value)} /></div>
            <div className="fg"><label className="fl">הנדון</label><input className="fi" data-testid="cr-subject" value={letterSubject} onChange={(e) => setLetterSubject(e.target.value)} /></div>
            <div className="fg"><label className="fl">גוף המכתב / התצהיר *</label>
              <textarea className="fta" data-testid="cr-text" style={{ minHeight: 140 }} value={letterBody} onChange={(e) => setLetterBody(e.target.value)} />
            </div>
            <label className="pick-row">
              <input type="checkbox" data-testid="cr-need-sign" checked={needsSig} onChange={(e) => setNeedsSig(e.target.checked)} />
              נדרשת חתימת לקוח במקום המתאים
            </label>
          </div>
          <div className="fg"><label className="fl">ערוץ שליחת הקישור</label>
            <select className="fse fi" data-testid="cr-channel" value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'whatsapp')}>
              <option value="email">מייל (Composer קיים, בלי Auto-Send)</option>
              <option value="whatsapp">WhatsApp ידני (wa.me)</option>
            </select>
          </div>
          <div className="fg"><label className="fl">נמען מאנשי קשר</label>
            <button type="button" className="btn btn-g btn-sm" data-testid="cr-pick-contact" onClick={() => setPicker((v) => !v)}>בחר איש קשר</button>
            {contact ? <div data-testid="cr-selected" style={{ fontSize: 12, marginTop: 6 }}>נבחר: <b>{contact.full_name}</b> · <span dir="ltr">{dest}</span></div> : <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>ברירת מחדל: פרטי הלקוח בתיק.</div>}
            {picker ? (
              <ContactPickerList
                contacts={contacts}
                claim={claim}
                channel={channel === 'whatsapp' ? 'phone' : 'email'}
                onPick={(c, v) => { setContact(c); setDest(v); setPicker(false); }}
              />
            ) : null}
          </div>
          {linkUrl ? <div className="cust-link-url" data-testid="cr-link">{linkUrl}</div> : null}
        </div>
        <div className="mf">
          <button className="btn btn-g" onClick={onClose}>ביטול</button>
          <button className="btn btn-p" data-testid="cr-save" disabled={busy} onClick={() => void submit()}>{busy ? 'שומר…' : 'צור בקשה + קישור'}</button>
        </div>
      </div>
    </div>
  );
}
