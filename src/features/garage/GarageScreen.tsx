import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invokeGarageGmail, listGarageCases, startGarageGmailReconnect } from './garageGmail';

type CaseRow = {
  id: string;
  case_number: string;
  status: string;
  customer_name_snapshot: string;
  vehicle_plate_snapshot: string;
  vehicle_label_snapshot?: string;
  gmail_thread_id?: string | null;
};

type MediaFile = {
  id: string;
  title: string;
  original_name?: string;
  mime_type: string;
  byte_size: number;
  category: string;
};

type HistRow = {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
  actor_name?: string;
  payload?: Record<string, unknown>;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function GarageScreen() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [curId, setCurId] = useState('');
  const [status, setStatus] = useState<{ connected?: boolean; email?: string; reconnectRequired?: boolean; sendEnabled?: boolean; sendScope?: boolean }>({});
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [history, setHistory] = useState<HistRow[]>([]);
  const [pending, setPending] = useState<Array<Record<string, unknown>>>([]);
  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailSubj, setMailSubj] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [previewOn, setPreviewOn] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [ack, setAck] = useState(false);
  const [sending, setSending] = useState(false);
  const [pkg, setPkg] = useState<{ packageBytes?: number; overLimit?: boolean; suggestion?: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const idemp = useRef(`gg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const cur = useMemo(() => cases.find((c) => c.id === curId) || null, [cases, curId]);

  const refreshStatus = useCallback(async () => {
    const r = await invokeGarageGmail('status');
    setStatus({
      connected: r.connected === true,
      email: r.email,
      reconnectRequired: r.reconnectRequired === true,
      sendEnabled: r.sendEnabled !== false,
      sendScope: r.sendScope === true,
    });
  }, []);

  const refreshCases = useCallback(async () => {
    setCases((await listGarageCases()) as CaseRow[]);
  }, []);

  const refreshCaseMail = useCallback(async (id: string) => {
    const [filesR, histR, pendR] = await Promise.all([
      invokeGarageGmail('list_case_files', { case_id: id }),
      invokeGarageGmail('list_history', { case_id: id }),
      invokeGarageGmail('list_pending'),
    ]);
    setFiles(filesR.files || []);
    setHistory(histR.history || []);
    setPending(pendR.data || []);
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshCases();
  }, [refreshCases, refreshStatus]);

  useEffect(() => {
    if (!curId) return;
    void refreshCaseMail(curId);
    const row = cases.find((c) => c.id === curId);
    if (row && !mailSubj) setMailSubj(`תיק מוסך ${row.case_number} — ${row.vehicle_plate_snapshot || ''}`.trim());
  }, [cases, curId, mailSubj, refreshCaseMail]);

  const toggleFile = (id: string) => {
    setSendIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPreviewOn(false);
    setConfirmOn(false);
    setAck(false);
  };

  const doPreview = async () => {
    if (!curId) return;
    const r = await invokeGarageGmail('validate_send', {
      case_id: curId,
      to: mailTo,
      cc: mailCc,
      subject: mailSubj,
      body: mailBody,
      file_ids: sendIds,
    });
    setPkg({ packageBytes: r.packageBytes, overLimit: r.overLimit, suggestion: r.suggestion });
    if (r.success === false) {
      setMsg(String(r.error || r.suggestion || 'Preview נכשל'));
      setPreviewOn(false);
      return;
    }
    setMsg('');
    setPreviewOn(true);
    setConfirmOn(false);
    setAck(false);
  };

  const doSend = async () => {
    if (sending || !ack || !previewOn || pkg?.overLimit) return;
    setSending(true);
    setMsg('');
    try {
      const r = await invokeGarageGmail('send_garage', {
        confirm: true,
        case_id: curId,
        to: mailTo,
        cc: mailCc,
        subject: mailSubj,
        body: mailBody,
        file_ids: sendIds,
        idempotency_key: idemp.current,
        thread_id: cur?.gmail_thread_id || undefined,
      });
      if (r.error === 'already_sent') setMsg('המייל כבר נשלח — אין שליחה כפולה');
      else if (!r.success || r.realEmailSend !== true) setMsg(String(r.error || 'השליחה נכשלה'));
      else {
        setMsg(`נשלח מ-${r.from} · ${r.gmail_message_id}`);
        idemp.current = `gg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setConfirmOn(false);
        setAck(false);
        setPreviewOn(false);
        await refreshCaseMail(curId);
        await refreshStatus();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex bg-background text-foreground" dir="rtl" data-testid="garage-root">
      <aside className="w-72 shrink-0 border-l overflow-auto p-3">
        <h1 className="font-bold text-lg mb-2">ניהול המוסך</h1>
        <div className="text-xs mb-3" data-testid="garage-gmail-status">
          {status.connected ? `מחובר: ${status.email}` : status.reconnectRequired ? 'נדרש חיבור מחדש ל-Google' : 'בודק חיבור…'}
          {status.connected && status.sendScope !== true ? ' · חסרה הרשאת שליחה' : ''}
        </div>
        {status.reconnectRequired || status.sendScope !== true ? (
          <button className="w-full mb-2 rounded-md border px-2 py-1 text-sm" data-testid="garage-gmail-reconnect" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await startGarageGmailReconnect();
              const authUrl = r.pagesAuthUrl || r.authUrl;
              if (authUrl) window.location.href = String(authUrl);
              else setMsg(String(r.error || 'לא ניתן לפתוח חיבור Google'));
            } finally { setBusy(false); }
          }}>חבר הרשאת שליחה ל-yoni191177</button>
        ) : null}
        <button className="w-full mb-2 rounded-md border px-2 py-1 text-sm" data-testid="garage-scan" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await invokeGarageGmail('scan_inbox');
            setMsg(r.success ? `נסרק · שויך ${r.auto || 0} · ממתין ${r.needsReview || 0}` : String(r.error || 'scan failed'));
            if (curId) await refreshCaseMail(curId);
          } finally { setBusy(false); }
        }}>סרוק תיבת המוסך</button>
        {cases.map((c) => (
          <button key={c.id} data-testid={`garage-case-${c.case_number}`} className={`w-full text-right rounded-md px-2 py-2 mb-1 border ${c.id === curId ? 'bg-primary/10 border-primary' : ''}`} onClick={() => setCurId(c.id)}>
            <div className="font-bold">{c.case_number}</div>
            <div className="text-xs opacity-70">{c.customer_name_snapshot} · {c.vehicle_plate_snapshot}</div>
          </button>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-4">
        {!cur ? <p>בחרו תיק מוסך</p> : (
          <div>
            <h2 className="text-xl font-bold mb-1">{cur.case_number}</h2>
            <p className="text-sm mb-4">{cur.customer_name_snapshot} · רכב {cur.vehicle_plate_snapshot} · {cur.status}</p>
            {pending.filter((p) => p.decision === 'needs_review').length > 0 && (
              <section className="mb-4 border rounded-lg p-3" data-testid="garage-pending">
                <h3 className="font-bold mb-2">ממתין לשיוך ידני</h3>
                {(pending as Array<{ id: string; subject?: string; from_addr?: string; reason?: string; decision?: string }>).filter((p) => p.decision === 'needs_review').map((p) => (
                  <div key={p.id} className="flex gap-2 items-center text-sm mb-1">
                    <span>{p.subject} · {p.from_addr} · {p.reason}</span>
                    <button className="border rounded px-2" onClick={async () => {
                      await invokeGarageGmail('assign_pending', { pending_id: p.id, case_id: curId });
                      await refreshCaseMail(curId);
                    }}>שייך לתיק זה</button>
                  </div>
                ))}
              </section>
            )}
            <section className="border rounded-lg p-3 mb-4" data-testid="garage-mail">
              <h3 className="font-bold mb-3">מיילים / התכתבויות</h3>
              <label className="block text-sm mb-2">To
                <input className="w-full border rounded px-2 py-1" data-testid="garage-mail-to" value={mailTo} onChange={(e) => { setMailTo(e.target.value); setPreviewOn(false); }} />
              </label>
              <label className="block text-sm mb-2">CC
                <input className="w-full border rounded px-2 py-1" data-testid="garage-mail-cc" value={mailCc} onChange={(e) => { setMailCc(e.target.value); setPreviewOn(false); }} />
              </label>
              <label className="block text-sm mb-2">Subject
                <input className="w-full border rounded px-2 py-1" data-testid="garage-mail-subject" value={mailSubj} onChange={(e) => setMailSubj(e.target.value)} />
              </label>
              <label className="block text-sm mb-2">Body
                <textarea className="w-full border rounded px-2 py-1 min-h-28" data-testid="garage-mail-body" value={mailBody} onChange={(e) => setMailBody(e.target.value)} />
              </label>
              <div className="text-sm font-bold mb-1">קבצים מתוך תיק המוסך — בחירה ידנית בלבד</div>
              <div data-testid="garage-mail-files" className="max-h-40 overflow-auto border rounded p-2 mb-2">
                {files.length === 0 ? <div>אין קבצים בתיק</div> : files.map((f) => (
                  <label key={f.id} className="flex gap-2 items-center text-sm">
                    <input type="checkbox" checked={sendIds.includes(f.id)} onChange={() => toggleFile(f.id)} />
                    <span>{f.original_name || f.title} · {fmtBytes(Number(f.byte_size || 0))}</span>
                  </label>
                ))}
              </div>
              {pkg?.overLimit ? <div className="text-destructive text-sm mb-2" data-testid="garage-mail-oversize">{pkg.suggestion}</div> : null}
              {previewOn && (
                <div className="border rounded p-2 mb-2 text-sm" data-testid="garage-mail-preview">
                  <div className="font-bold">Preview לפני שליחה</div>
                  <div>From: yoni191177@gmail.com</div>
                  <div>To: {mailTo}</div>
                  <div>CC: {mailCc || '—'}</div>
                  <div>Subject: {mailSubj}</div>
                  <pre className="whitespace-pre-wrap">{mailBody}</pre>
                  <div>קבצים: {sendIds.length} · {fmtBytes(pkg?.packageBytes || 0)}</div>
                </div>
              )}
              {confirmOn && (
                <div className="border rounded p-2 mb-2 text-sm" data-testid="garage-mail-confirm">
                  <div className="font-bold">אישור SEND — מייל אמיתי יישלח מ-yoni191177@gmail.com בלי לפתוח Gmail</div>
                  <label className="flex gap-2 mt-2">
                    <input type="checkbox" data-testid="garage-mail-ack" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                    אני מאשר לשלוח את המייל הזה
                  </label>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <button className="border rounded px-3 py-1" data-testid="garage-mail-preview-btn" disabled={sending} onClick={() => void doPreview()}>Preview</button>
                {!confirmOn ? (
                  <button className="border rounded px-3 py-1" data-testid="garage-mail-send-btn" disabled={sending || !previewOn || pkg?.overLimit === true} onClick={() => setConfirmOn(true)}>SEND</button>
                ) : (
                  <button className="border rounded px-3 py-1 bg-destructive text-destructive-foreground" data-testid="garage-mail-confirm-send" disabled={sending || !ack || pkg?.overLimit === true} onClick={() => void doSend()}>{sending ? 'שולח…' : 'אישור SEND'}</button>
                )}
              </div>
              {msg ? <div className="mt-2 text-sm" data-testid="garage-mail-msg">{msg}</div> : null}
            </section>
            <section className="border rounded-lg p-3" data-testid="garage-mail-history">
              <h3 className="font-bold mb-2">היסטוריית התכתבות</h3>
              {history.length === 0 ? <div>אין היסטוריה עדיין</div> : history.map((h) => (
                <div key={h.id} className="text-sm border-b py-2">
                  <div className="font-bold">{h.summary}</div>
                  <div className="opacity-60 text-xs">{h.event_type} · {h.actor_name || ''} · {new Date(h.created_at).toLocaleString('he-IL')}</div>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
