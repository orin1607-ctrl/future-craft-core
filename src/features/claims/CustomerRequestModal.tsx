import { useEffect, useState } from 'react';
import type { ClaimRecord } from './claimsConstants';
import { displayClaimNum } from './claimsConstants';
import { customerStatusLabel, customerStatusOf } from './claimWorkAlerts';
import {
  CUSTOMER_REQUEST_CENTER_KINDS,
  appendRequestHistory,
  customerRequestTitle,
  docsForCustomerRequest,
  fileFromTemplate,
  joinLinkedDocIds,
  mergeDocRequestItems,
  newTextTemplate,
  parseLinkedDocIds,
  parseRequestHistory,
  requestCenterKindLabel,
  templateFromFile,
  uniqueTreatmentAction,
  type SignTemplate,
} from './customerRequestCenter';
import { buildFreeTextSignPdf } from './signedClaimPdf';
import type { ClaimsApi } from './claimsService';

type ClaimFile = {
  id: string;
  doc_request_id?: string | null;
  original_name?: string;
  source?: string;
  created_at?: string;
};

type DocRequest = { id?: string; label?: string; doc_key?: string; status?: string };

type Step = 'form' | 'sign_chooser' | 'sign_compose' | 'sign_preview';

type Props = {
  open: boolean;
  claim: ClaimRecord;
  actorName: string;
  editTask: ClaimRecord | null;
  files: ClaimFile[];
  requests: DocRequest[];
  api: ClaimsApi;
  toast: (msg: string, type?: string) => void;
  onClose: () => void;
  onReload: () => Promise<void>;
  mintCustomerLink: (claimId: string, rotate?: boolean) => Promise<string>;
  openSendModal: (kind: 'draft', extras?: { to?: string; subject?: string; body?: string }) => Promise<void> | void;
  openRecurring: (treatmentTaskId: string) => void;
  sendOpeningFormLink: (claimId: string) => Promise<void>;
  onPendingSend: (taskId: string) => void;
  previewFile: (fileId: string) => void;
  onWhatsApp?: (message: string) => void;
};

export default function CustomerRequestModal({
  open,
  claim,
  actorName,
  editTask,
  files,
  requests,
  api,
  toast,
  onClose,
  onReload,
  mintCustomerLink,
  openSendModal,
  openRecurring,
  sendOpeningFormLink,
  onPendingSend,
  previewFile,
  onWhatsApp,
}: Props) {
  const [kind, setKind] = useState('ask_document');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [fromWhom, setFromWhom] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [showLabel, setShowLabel] = useState(true);
  const [channel, setChannel] = useState('email');
  const [when, setWhen] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState<ClaimRecord | null>(editTask);
  const [templates, setTemplates] = useState<SignTemplate[]>([]);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [saveUploadAsTemplate, setSaveUploadAsTemplate] = useState(false);
  const [previewName, setPreviewName] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const [workingFileId, setWorkingFileId] = useState('');
  const [reaskNote, setReaskNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const t = editTask;
    setTask(t);
    setKind(t?.customerKind || 'ask_document');
    setTitle(t ? customerRequestTitle(t) : '');
    setText(t?.requestText || '');
    setFromWhom(t?.fromWhom || claim.clientName || '');
    setNote(t?.staffNote || t?.note || '');
    setDue(t?.dueDate || '');
    setShowLabel(t ? (t.tableAlert !== 'off' && t.showOnLabels !== 'false') : true);
    setChannel(t?.channel || 'email');
    setWhen('');
    setStep('form');
    setReaskNote('');
    setSaveAsTemplate(false);
    setSaveUploadAsTemplate(false);
    setWorkingFileId(t?.signFileId || '');
    setPreviewName(t?.signDocumentTitle || '');
    setPreviewBody(t?.signBody || '');
    void api.getSignTemplates().then((r) => { if (r.success) setTemplates(r.data || []); });
  }, [open, editTask, claim.clientName, api]);

  if (!open) return null;

  const linked = task ? docsForCustomerRequest(task, files) : [];
  const history = parseRequestHistory(task?.requestHistory);
  const status = task ? customerStatusOf(task) : 'pending';

  const persistTemplates = async (next: SignTemplate[]) => {
    const r = await api.saveSignTemplates(next);
    if (!r.success) { toast(String(r.error || 'שמירת התבנית נכשלה'), 'err'); return false; }
    setTemplates(next);
    return true;
  };

  const saveCore = async (extras: Record<string, string> = {}) => {
    if (!title.trim() && !text.trim()) {
      toast('נא להזין כותרת או מה מבקשים', 'err');
      return null;
    }
    const kindLabel = requestCenterKindLabel(kind);
    const rowTitle = title.trim() || text.trim().slice(0, 42);
    const prev = task;
    const row: Record<string, string> = {
      ...(prev || {}),
      id: prev?.id || '',
      claimId: claim.id,
      audience: 'customer',
      requestCenter: 'true',
      customerKind: kind,
      title: rowTitle,
      action: prev?.treatmentTaskId ? (prev.action || kindLabel) : kindLabel,
      requestText: text.trim() || rowTitle,
      fromWhom: fromWhom.trim() || claim.clientName || '',
      staffNote: note,
      note: note || text.trim() || rowTitle,
      channel,
      dueDate: due,
      showOnLabels: showLabel ? 'true' : 'false',
      tableAlert: showLabel ? (prev?.tableAlert === 'keep' ? 'keep' : 'on') : 'off',
      customerStatus: prev?.customerStatus || 'pending',
      openedAt: prev?.openedAt || new Date().toISOString(),
      createdBy: prev?.createdBy || actorName,
      owner: prev?.owner || actorName,
      createdAt: prev?.createdAt || '',
      done: prev?.done === 'true' ? 'true' : 'false',
      requestHistory: prev?.requestHistory || '[]',
      linkedDocIds: prev?.linkedDocIds || '',
      treatmentTaskId: prev?.treatmentTaskId || '',
      ...extras,
    };
    if (channel === 'email' && when && !prev?.mailFollowupId) {
      const to = claim.clientEmail || '';
      if (!to) { toast('אין כתובת מייל ללקוח בתיק', 'err'); return null; }
      const whenIso = new Date(when).toISOString();
      if (Number.isNaN(Date.parse(whenIso))) { toast('מועד לא תקין', 'err'); return null; }
      const fu = await api.upsertMailFollowup({
        claim_id: claim.id,
        mail_to: to,
        mail_subject: `תביעה ${displayClaimNum(claim)} – ${rowTitle}`,
        mail_body: text.trim() || rowTitle,
        mail_kind: 'email_once',
        attach_mode: 'none',
        next_run_at: whenIso,
        recipient_kind: 'client',
      });
      if (!fu.success) { toast(String(fu.error || 'תזמון המייל נכשל'), 'err'); return null; }
      row.mailFollowupId = String(fu.id || '');
      row.scheduledAt = whenIso;
    }
    row.action = uniqueTreatmentAction(rowTitle, prev?.id || 'new');
    row.requestKind = kind === 'ask_document' ? 'doc' : kind === 'ask_signature' ? 'sign' : 'info';
    const saved = await api.saveTask(row);
    const id = String(saved.id || row.id);
    row.action = uniqueTreatmentAction(rowTitle, id);
    row.treatmentTaskId = prev?.treatmentTaskId || id;
    if (!prev?.id || prev.action !== row.action || prev.treatmentTaskId !== row.treatmentTaskId) {
      await api.saveTask({ ...row, id });
    }
    const next = { ...row, id, treatmentTaskId: row.treatmentTaskId || id } as ClaimRecord;
    setTask(next);
    return next;
  };

  const saveAndContinue = async () => {
    setBusy(true);
    try {
      const saved = await saveCore();
      if (!saved) return;
      if (kind === 'ask_signature') {
        setStep('sign_chooser');
        toast('הבקשה נשמרה — בחרו מה לשלוח לחתימה');
        await onReload();
        return;
      }
      if (channel === 'whatsapp') {
        onPendingSend(saved.id);
        if (when) {
          await api.saveReminder({
            claimId: claim.id,
            date: when.slice(0, 10),
            note: `תזכורת לשלוח WhatsApp ללקוח: ${saved.requestText || saved.title}`,
            owner: actorName,
            sent: 'false',
          });
          toast('נשמרה בקשה + תזכורת. אין שליחת WhatsApp אוטומטית');
          onClose();
          await onReload();
          return;
        }
        onWhatsApp?.(saved.requestText || saved.title || '');
        toast('בקשה נשמרה — שליחת WhatsApp ידנית בחלון הבא');
        await onReload();
        return;
      }
      if (channel === 'email' && when) {
        toast('בקשה נשמרה · מייל מתוזמן (Dry Run)');
        onClose();
        await onReload();
        return;
      }
      onPendingSend(saved.id);
      await openSendModal('draft', {
        to: claim.clientEmail || '',
        subject: `תביעה ${displayClaimNum(claim)} – ${customerRequestTitle(saved)}`,
        body: saved.requestText || '',
      });
      toast('בקשה נשמרה — המייל לא נשלח עד אישור ידני');
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const mintUpload = async (rotate = false, base?: ClaimRecord | null) => {
    const current = base || task || (await saveCore());
    if (!current) return;
    setBusy(true);
    try {
      const label = customerRequestTitle(current);
      const items = mergeDocRequestItems(requests, { label, doc_key: 'custom' });
      await api.invokeDocs('save_doc_requests', { claim_id: claim.id, items });
      const listed = await api.invokeDocs('list_docs', { claim_id: claim.id });
      const reqs = Array.isArray(listed.requests) ? listed.requests as Array<{ id?: string; label?: string }> : [];
      const req = reqs.find((r) => String(r.label || '') === label);
      const url = await mintCustomerLink(claim.id, rotate);
      const next = {
        ...current,
        docRequestId: String(req?.id || current.docRequestId || ''),
        requestLabel: label,
        uploadLinkAt: new Date().toISOString(),
        uploadLinkUrl: url || current.uploadLinkUrl || '',
        customerStatus: current.customerStatus === 'pending' ? 'sent' : current.customerStatus,
        requestHistory: appendRequestHistory(current.requestHistory, {
          at: new Date().toISOString(),
          by: actorName,
          action: rotate ? 'קישור העלאה חדש' : 'נוצר קישור להעלאה',
          note: label,
        }),
      };
      await api.saveTask(next);
      setTask(next);
      toast(url ? 'קישור ההעלאה מוכן — המסמך ייכנס למסמכי התיק' : 'הבקשה עודכנה');
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const askAgain = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const next = {
        ...task,
        customerStatus: 'reask',
        done: 'false',
        tableAlert: showLabel ? (task.tableAlert === 'off' ? 'on' : task.tableAlert) : task.tableAlert,
        requestText: [task.requestText, reaskNote.trim() ? `תיקון: ${reaskNote.trim()}` : ''].filter(Boolean).join('\n'),
        lastReaskNote: reaskNote.trim(),
        requestHistory: appendRequestHistory(task.requestHistory, {
          at: new Date().toISOString(),
          by: actorName,
          action: 'בקש שוב',
          note: reaskNote.trim() || 'נדרש תיקון',
        }),
      };
      await api.saveTask(next);
      setTask(next);
      if (kind === 'ask_document' || task.customerKind === 'ask_document') {
        await mintUpload(true, next);
      } else {
        toast('הבקשה נשארה פתוחה — אפשר לשלוח תזכורת');
        await onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  const setLabelOn = async (on: boolean) => {
    const current = task || (await saveCore());
    if (!current) return;
    const next = { ...current, showOnLabels: on ? 'true' : 'false', tableAlert: on ? 'on' : 'off' };
    await api.saveTask(next);
    setTask(next);
    setShowLabel(on);
    toast(on ? 'הבקשה בתוויות הטבלה' : 'התווית הוסרה. הבקשה נשמרה');
    await onReload();
  };

  const closeRequest = async () => {
    if (!task) return;
    await api.saveTask({
      ...task,
      customerStatus: 'done',
      done: 'true',
      completedAt: new Date().toISOString(),
      requestHistory: appendRequestHistory(task.requestHistory, {
        at: new Date().toISOString(),
        by: actorName,
        action: 'טופל — סגור בקשה',
        note: '',
      }),
    });
    toast('הבקשה נסגרה. המסמכים וההיסטוריה נשארו');
    onClose();
    await onReload();
  };

  const keepOpen = async () => {
    const saved = await saveCore({ customerStatus: task?.customerStatus || 'pending', done: 'false' });
    if (saved) toast('נשמר להמשך טיפול');
    onClose();
    await onReload();
  };

  const uploadWorkingCopy = async (file: File, staffTitle: string) => {
    const up = await api.staffUpload(claim.id, '', file, { staff_type: 'other', staff_title: staffTitle });
    if (!up.success || !up.file_id) {
      toast(String(up.error || 'העלאת המסמך נכשלה'), 'err');
      return '';
    }
    return up.file_id;
  };

  const useTextDocument = async () => {
    if (!composeTitle.trim() || !composeBody.trim()) {
      toast('נא להזין כותרת ותוכן', 'err');
      return;
    }
    setBusy(true);
    try {
      if (saveAsTemplate) {
        const ok = await persistTemplates([...templates, newTextTemplate(composeTitle.trim(), composeBody.trim())]);
        if (!ok) return;
        toast('הנוסח נשמר במאגר התבניות');
      }
      const pdf = await buildFreeTextSignPdf({
        title: composeTitle.trim(),
        body: composeBody.trim(),
        clientName: claim.clientName,
        claimLabel: displayClaimNum(claim),
      });
      const fileId = await uploadWorkingCopy(pdf, composeTitle.trim());
      if (!fileId) return;
      setWorkingFileId(fileId);
      setPreviewName(composeTitle.trim());
      setPreviewBody(composeBody.trim());
      setStep('sign_preview');
    } finally {
      setBusy(false);
    }
  };

  const useTemplate = async (tpl: SignTemplate) => {
    setBusy(true);
    try {
      if (tpl.kind === 'text') {
        setComposeTitle(tpl.name);
        setComposeBody(tpl.body || '');
        setSaveAsTemplate(false);
        setStep('sign_compose');
        return;
      }
      const file = fileFromTemplate(tpl);
      if (!file) { toast('לא ניתן לפתוח את קובץ התבנית', 'err'); return; }
      const copy = new File([file], `${tpl.name} — ${displayClaimNum(claim)}.pdf`, { type: file.type });
      const fileId = await uploadWorkingCopy(copy, `${tpl.name} — עותק לתיק`);
      if (!fileId) return;
      setWorkingFileId(fileId);
      setPreviewName(tpl.name);
      setPreviewBody('');
      setStep('sign_preview');
    } finally {
      setBusy(false);
    }
  };

  const useClaimFile = async (fileId: string, name: string) => {
    const urlRes = await api.invokeDocs('signed_url', { claim_id: claim.id, file_id: fileId });
    if (!urlRes.success || !urlRes.url) { toast('לא ניתן לפתוח את המסמך', 'err'); return; }
    const res = await fetch(String(urlRes.url));
    const blob = await res.blob();
    const copy = new File([blob], `${name.replace(/\.pdf$/i, '')} — עותק.pdf`, { type: blob.type || 'application/pdf' });
    const newId = await uploadWorkingCopy(copy, `${name} — עותק לחתימה`);
    if (!newId) return;
    setWorkingFileId(newId);
    setPreviewName(name);
    setPreviewBody('');
    setStep('sign_preview');
  };

  const useUploaded = async (file: File) => {
    setBusy(true);
    try {
      if (saveUploadAsTemplate) {
        const made = await templateFromFile(file.name.replace(/\.pdf$/i, ''), file);
        if ('error' in made) toast(made.error, 'err');
        else {
          const ok = await persistTemplates([...templates, made]);
          if (ok) toast('הקובץ נשמר במאגר לשימוש עתידי');
        }
      }
      const fileId = await uploadWorkingCopy(file, file.name);
      if (!fileId) return;
      setWorkingFileId(fileId);
      setPreviewName(file.name);
      setPreviewBody('');
      setStep('sign_preview');
    } finally {
      setBusy(false);
    }
  };

  const sendForSignature = async (openingForm = false) => {
    const current = task || (await saveCore({ customerKind: 'ask_signature' }));
    if (!current) return;
    setBusy(true);
    try {
      if (openingForm) {
        await sendOpeningFormLink(claim.id);
        const next = {
          ...current,
          customerKind: 'ask_signature',
          customerStatus: 'awaiting_signature',
          signDocumentTitle: 'טופס פתיחת תביעה',
          sentAt: new Date().toISOString(),
          requestHistory: appendRequestHistory(current.requestHistory, {
            at: new Date().toISOString(),
            by: actorName,
            action: 'נשלח טופס פתיחה לחתימה',
            note: '',
          }),
        };
        await api.saveTask(next);
        setTask(next);
        toast('קישור החתימה הקיים הועתק');
        await onReload();
        return;
      }
      if (!workingFileId && !previewBody) {
        toast('אין מסמך לשליחה', 'err');
        return;
      }
      let fileId = workingFileId;
      if (!fileId && previewBody) {
        const pdf = await buildFreeTextSignPdf({
          title: previewName || current.title,
          body: previewBody,
          clientName: claim.clientName,
          claimLabel: displayClaimNum(claim),
        });
        fileId = await uploadWorkingCopy(pdf, previewName || current.title);
        if (!fileId) return;
        setWorkingFileId(fileId);
      }
      const r = await api.invokeIntake('create_link', {
        claim_id: claim.id,
        purpose: 'sign_document',
        sign_document_id: fileId,
        sign_document_title: previewName || customerRequestTitle(current),
        customer_task_id: current.id,
        sign_body: previewBody,
      });
      if (!r.success || !r.token) { toast(String(r.error || 'יצירת קישור חתימה נכשלה'), 'err'); return; }
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL || '/';
      const url = `${origin}${base && base !== '/' ? base.replace(/\/$/, '') : ''}/claims-intake?t=${r.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      const next = {
        ...current,
        customerKind: 'ask_signature',
        customerStatus: 'awaiting_signature',
        signFileId: fileId,
        signDocumentTitle: previewName || customerRequestTitle(current),
        signBody: previewBody,
        signLinkUrl: url,
        sentAt: new Date().toISOString(),
        linkedDocIds: joinLinkedDocIds([...parseLinkedDocIds(current.linkedDocIds), fileId]),
        requestHistory: appendRequestHistory(current.requestHistory, {
          at: new Date().toISOString(),
          by: actorName,
          action: 'נשלח מסמך לחתימה',
          note: previewName || '',
        }),
      };
      await api.saveTask(next);
      setTask(next);
      onPendingSend(current.id);
      toast('קישור החתימה הועתק — נשלח במנגנון הקיים');
      await openSendModal('draft', {
        to: claim.clientEmail || '',
        subject: `תביעה ${displayClaimNum(claim)} – חתימה על ${previewName || customerRequestTitle(current)}`,
        body: `${current.requestText || `נא לחתום על ${previewName}`}\n\nקישור לחתימה:\n${url}`,
      });
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal modal-md" data-testid="cust-req-center">
      <div className="mh">
        <div className="mh-t">{task ? 'בקשה ללקוח' : 'בקשה ללקוח — מרכז בקשות'}</div>
        <button className="mcl" onClick={onClose}>✕</button>
      </div>
      <div className="mb">
        {step === 'form' ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
              הרחבה של הבקשה הקיימת. קישור העלאה, חתימה, מסמכים ומייל — אותם מנגנונים. לא נסגר אוטומטית.
            </div>
            <div className="fg"><label className="fl">סוג בקשה</label>
              <select className="fse fi" data-testid="cr-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {CUSTOMER_REQUEST_CENTER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">כותרת</label><input className="fi" data-testid="cr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל חשבונית / צילום רישיון" /></div>
            <div className="fg"><label className="fl">מה אני מבקש *</label><textarea className="fta" data-testid="cr-text" style={{ minHeight: 80 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="מה הלקוח צריך לבצע" /></div>
            <div className="fg"><label className="fl">ממי</label><input className="fi" data-testid="cr-from" value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" data-testid="cr-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" data-testid="cr-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="fg"><label className="fl">הצג בתוויות / דורש מעקב</label>
              <select className="fse fi" data-testid="cr-show-label" value={showLabel ? 'yes' : 'no'} onChange={(e) => setShowLabel(e.target.value === 'yes')}>
                <option value="yes">כן</option>
                <option value="no">לא</option>
              </select>
            </div>
            <div className="fg"><label className="fl">ערוץ</label>
              <select className="fse fi" data-testid="cr-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="email">מייל</option>
                <option value="whatsapp">WhatsApp (ידני, מנגנון קיים)</option>
              </select>
            </div>
            <div className="fg"><label className="fl">תזמון שליחה (ריק = עכשיו)</label><input className="fi" data-testid="cr-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
            {task ? (
              <div data-testid="cr-existing" style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 8, padding: 10, margin: '10px 0' }}>
                <div className={`row-alert tone-${status === 'done' ? 'info' : 'wait'}`}>{customerStatusLabel(status)}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>נפתח: {task.openedAt || task.createdAt || '—'} · יעד: {task.dueDate || '—'}</div>
                {task.signDocumentTitle ? <div style={{ fontSize: 12, marginTop: 4 }}>מסמך: {task.signDocumentTitle}{task.sentAt ? ` · נשלח ${new Date(task.sentAt).toLocaleString('he-IL')}` : ''}</div> : null}
                {task.signLinkUrl ? <div style={{ fontSize: 11, color: 'var(--t3)', wordBreak: 'break-all' }}>{task.signLinkUrl}</div> : null}
                {linked.length ? (
                  <div style={{ marginTop: 8 }} data-testid="cr-linked-docs">
                    <div style={{ fontWeight: 700, fontSize: 12 }}>מסמכים בבקשה (אותם קבצים שבתיק)</div>
                    {linked.map((f) => (
                      <button key={f.id} type="button" className="btn btn-g btn-sm" style={{ margin: '4px 4px 0 0' }} onClick={() => previewFile(f.id)}>{f.original_name || f.id}</button>
                    ))}
                  </div>
                ) : null}
                {history.length ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t3)' }} data-testid="cr-history">
                    {history.map((h, i) => <div key={`${h.at}-${i}`}>{h.action}{h.note ? ` · ${h.note}` : ''} · {h.by}</div>)}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {showLabel
                    ? <button type="button" className="btn btn-g btn-sm" data-testid="cr-label-off" onClick={() => void setLabelOn(false)}>הסר מהתוויות</button>
                    : <button type="button" className="btn btn-g btn-sm" data-testid="cr-label-on" onClick={() => void setLabelOn(true)}>הוסף לתוויות</button>}
                  {(kind === 'ask_document' || task.customerKind === 'ask_document') ? (
                    <button type="button" className="btn btn-p btn-sm" data-testid="cr-mint-link" disabled={busy} onClick={() => void mintUpload(false)}>בקש מסמך / צור קישור להעלאה</button>
                  ) : null}
                  {(kind === 'ask_signature' || task.customerKind === 'ask_signature') ? (
                    <button type="button" className="btn btn-p btn-sm" data-testid="cr-sign-open" onClick={() => setStep('sign_chooser')}>שלח מסמך לחתימה</button>
                  ) : null}
                  <button type="button" className="btn btn-g btn-sm" data-testid="cr-remind" onClick={() => openRecurring(task.treatmentTaskId || task.id)}>תזכורת / מייל מתמשך</button>
                </div>
                <div className="fg" style={{ marginTop: 10 }}><label className="fl">בקש שוב — מה חסר / לתקן</label>
                  <textarea className="fta" data-testid="cr-reask-note" style={{ minHeight: 56 }} value={reaskNote} onChange={(e) => setReaskNote(e.target.value)} />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 'sign_chooser' ? (
          <div data-testid="cr-sign-chooser">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>מה תרצה לשלוח לחתימה?</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button type="button" className="btn btn-p" data-testid="cr-sign-tpl" onClick={() => setStep('sign_compose')}>1. בחר תבנית מהמאגר / צור מסמך חדש</button>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, margin: '6px 0' }}>2. בחר מסמך מוכן מהמאגר או מהתיק</div>
                {templates.filter((t) => t.kind === 'file').map((t) => (
                  <button key={t.id} type="button" className="btn btn-g btn-sm" style={{ margin: 4 }} onClick={() => void useTemplate(t)}>{t.name}</button>
                ))}
                {files.map((f) => (
                  <button key={f.id} type="button" className="btn btn-g btn-sm" style={{ margin: 4 }} onClick={() => void useClaimFile(f.id, f.original_name || f.id)}>תיק: {f.original_name}</button>
                ))}
                <button type="button" className="btn btn-g btn-sm" data-testid="cr-sign-opening" onClick={() => void sendForSignature(true)}>טופס פתיחת תביעה (מנגנון קיים)</button>
              </div>
              <button type="button" className="btn btn-p" data-testid="cr-sign-create" onClick={() => { setComposeTitle(title); setComposeBody(text); setStep('sign_compose'); }}>3. צור מסמך חדש עכשיו</button>
              <label className="btn btn-g" data-testid="cr-sign-upload">
                4. העלה מסמך חדש
                <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void useUploaded(f); }} />
              </label>
              <label style={{ fontSize: 12 }}><input type="checkbox" data-testid="cr-save-upload-tpl" checked={saveUploadAsTemplate} onChange={(e) => setSaveUploadAsTemplate(e.target.checked)} /> שמור גם במאגר לשימוש עתידי</label>
              {templates.filter((t) => t.kind === 'text').length ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>תבניות טקסט</div>
                  {templates.filter((t) => t.kind === 'text').map((t) => (
                    <button key={t.id} type="button" className="btn btn-g btn-sm" style={{ margin: 4 }} data-testid={`cr-tpl-${t.id}`} onClick={() => void useTemplate(t)}>{t.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'sign_compose' ? (
          <div data-testid="cr-sign-compose">
            <div className="fg"><label className="fl">כותרת המסמך</label><input className="fi" data-testid="cr-doc-title" value={composeTitle} onChange={(e) => setComposeTitle(e.target.value)} /></div>
            <div className="fg"><label className="fl">תוכן לחתימה</label><textarea className="fta" data-testid="cr-doc-body" style={{ minHeight: 140 }} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} /></div>
            <label style={{ fontSize: 12 }}><input type="checkbox" data-testid="cr-save-tpl" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} /> שמור כתבנית לשימוש עתידי</label>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-p" disabled={busy} onClick={() => void useTextDocument()}>תצוגה מקדימה + יצירת PDF</button>
            </div>
          </div>
        ) : null}

        {step === 'sign_preview' ? (
          <div data-testid="cr-sign-preview">
            <div style={{ fontWeight: 800 }}>{previewName}</div>
            {previewBody ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '8px 0', maxHeight: 220, overflow: 'auto' }}>{previewBody}</div> : <div style={{ fontSize: 12, color: 'var(--t3)' }}>עותק עבודה לתיק זה. התבנית המקורית לא משתנה.</div>}
            {workingFileId ? <button type="button" className="btn btn-g btn-sm" onClick={() => previewFile(workingFileId)}>פתח את העותק במסמכי התיק</button> : null}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-p" data-testid="cr-sign-send" disabled={busy} onClick={() => void sendForSignature(false)}>שלח ללקוח לחתימה</button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mf">
        {step !== 'form' ? <button className="btn btn-g" onClick={() => setStep('form')}>חזרה לבקשה</button> : <button className="btn btn-g" onClick={onClose}>ביטול</button>}
        {step === 'form' ? (
          <>
            {task ? (
              <>
                <button className="btn btn-g" data-testid="cr-keep" disabled={busy} onClick={() => void keepOpen()}>השאר להמשך טיפול</button>
                <button className="btn btn-g" data-testid="cr-reask" disabled={busy} onClick={() => void askAgain()}>בקש שוב</button>
                <button className="btn btn-p" data-testid="cr-close" disabled={busy} onClick={() => void closeRequest()}>טופל — סגור בקשה</button>
              </>
            ) : null}
            {(kind === 'ask_document' && !task) ? <button className="btn btn-g" data-testid="cr-create-link" disabled={busy} onClick={() => void mintUpload(false)}>בקש מסמך / צור קישור</button> : null}
            <button className="btn btn-p" data-testid="cr-save" disabled={busy} onClick={() => void saveAndContinue()}>{busy ? 'שומר…' : 'שמור / המשך'}</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
