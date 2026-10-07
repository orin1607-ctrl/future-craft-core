import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  activeConversationStorageKey,
  conversationMatchesClaim,
  conversationsForClaim,
  messagesForModel,
  pendingActionOf,
  titleFromFirstMessage,
  type ClaimsAiClaimContext,
  type ClaimsAiConversation,
  type ClaimsAiMessage,
} from './claimsAiModel';
import {
  archiveClaimsAiConversation,
  claimsAiSchemaMissing,
  createClaimsAiConversation,
  insertClaimsAiMessage,
  listClaimsAiConversations,
  listClaimsAiMessages,
  renameClaimsAiConversation,
} from './claimsAiStore';
import './claims-ai.css';

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-ai-chat`;

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function speakAnswer(text: string) {
  const synth = window.speechSynthesis;
  if (!synth || !text.trim()) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'he-IL';
  synth.speak(utter);
}

function readActiveId(userId: string, claimId: string | null): string | null {
  try {
    return sessionStorage.getItem(activeConversationStorageKey(userId, claimId));
  } catch {
    return null;
  }
}

function writeActiveId(userId: string, claimId: string | null, id: string | null) {
  try {
    const key = activeConversationStorageKey(userId, claimId);
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* pointer only — messages live in Staging */
  }
}

async function streamHelpAi(input: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  claimId: string | null;
  companyName: string | null;
  onDelta: (full: string) => void;
}): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('יש להתחבר למערכת');

  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages: input.messages,
      company_name: input.companyName,
      module: 'claims',
      claim_id: input.claimId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'שגיאה' }));
    throw new Error(String(err.error || `שגיאה ${resp.status}`));
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await resp.json();
    throw new Error(String(data.error || 'שגיאת AI'));
  }
  if (!resp.body) throw new Error('אין תשובה מהשרת');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          nl = -1;
          break;
        }
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (delta) {
            full += delta;
            input.onDelta(full);
          }
        } catch {
          buffer = `${line}\n${buffer}`;
          break;
        }
      }
      nl = buffer.indexOf('\n');
    }
  }
  if (!full.trim()) throw new Error('תשובה ריקה מהשרת');
  return full;
}

export function ClaimsAiWorkspace({
  open,
  onClose,
  claim,
  userId,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  claim: ClaimsAiClaimContext | null;
  userId: string;
  companyName: string | null;
}) {
  const claimId = claim?.claimId || null;
  const [conversations, setConversations] = useState<ClaimsAiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClaimsAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [showList, setShowList] = useState(false);
  const [banner, setBanner] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ClaimsAiConversation | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const sendRef = useRef<(text: string, source: 'text' | 'voice') => Promise<void>>(async () => {});

  useEffect(() => {
    setMicOk(!!speechCtor() && !!window.isSecureContext);
  }, []);

  const loadList = useCallback(async () => {
    const listed = await listClaimsAiConversations(userId, claimId);
    if (listed.error) {
      setBanner(claimsAiSchemaMissing(listed.error)
        ? 'שמירת השיחות עדיין לא הותקנה ב-Staging. צריך להריץ את מיגרציית claims_ai על פרויקט Staging בלבד.'
        : listed.error.message);
      setConversations([]);
      return;
    }
    setBanner('');
    const rows = conversationsForClaim(listed.data || [], claimId);
    setConversations(rows);
    const remembered = readActiveId(userId, claimId);
    const next = rows.find((row) => row.id === remembered) || rows[0] || null;
    setActiveId(next?.id || null);
  }, [userId, claimId]);

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput('');
    setPendingDelete(null);
    void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open || !activeId) {
      if (open && !activeId) setMessages([]);
      return;
    }
    const conversation = conversations.find((row) => row.id === activeId);
    if (conversation && !conversationMatchesClaim(conversation.claim_id, claimId)) {
      setActiveId(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    void listClaimsAiMessages(activeId).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setBanner(res.error.message);
        setMessages([]);
        return;
      }
      setMessages(res.data || []);
      writeActiveId(userId, claimId, activeId);
    });
    return () => { cancelled = true; };
  }, [open, activeId, conversations, claimId, userId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string, source: 'text' | 'voice') => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setLoading(true);
    setBanner('');
    let conversationId = activeId;
    try {
      if (!conversationId) {
        const created = await createClaimsAiConversation({
          userId,
          claimId,
          title: titleFromFirstMessage(trimmed),
        });
        if (created.error || !created.data) throw new Error(created.error?.message || 'יצירת השיחה נכשלה');
        conversationId = created.data.id;
        setConversations((prev) => [created.data!, ...prev]);
        setActiveId(conversationId);
        writeActiveId(userId, claimId, conversationId);
      } else if ((conversations.find((row) => row.id === conversationId)?.title || 'שיחה חדשה') === 'שיחה חדשה'
        && messages.filter((m) => m.role === 'user').length === 0) {
        const title = titleFromFirstMessage(trimmed);
        await renameClaimsAiConversation(conversationId, title);
        setConversations((prev) => prev.map((row) => row.id === conversationId ? { ...row, title } : row));
      }

      const userSaved = await insertClaimsAiMessage({
        conversationId,
        role: 'user',
        content: trimmed,
        metadata: { claim_id: claimId, source },
      });
      if (userSaved.error || !userSaved.data) throw new Error(userSaved.error?.message || 'שמירת ההודעה נכשלה');
      const history = [...messages, userSaved.data];
      setMessages(history);

      let draft = '';
      const answer = await streamHelpAi({
        messages: messagesForModel(history),
        claimId,
        companyName,
        onDelta: (full) => {
          draft = full;
          setMessages([...history, {
            id: 'draft',
            conversation_id: conversationId!,
            role: 'assistant',
            content: full,
            created_at: new Date().toISOString(),
            tool_name: null,
            metadata: {},
          }]);
        },
      });
      const saved = await insertClaimsAiMessage({
        conversationId,
        role: 'assistant',
        content: answer || draft,
        metadata: { claim_id: claimId, model: 'help-ai-chat' },
      });
      if (saved.error || !saved.data) throw new Error(saved.error?.message || 'שמירת התשובה נכשלה');
      setMessages([...history, saved.data]);
      setConversations((prev) => prev.map((row) => row.id === conversationId ? { ...row, updated_at: saved.data!.created_at } : row));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה';
      setBanner(message);
      if (conversationId) {
        const failed = await insertClaimsAiMessage({
          conversationId,
          role: 'assistant',
          content: message,
          metadata: { error: true, claim_id: claimId },
        });
        if (failed.data) {
          setMessages((prev) => [...prev.filter((m) => m.id !== 'draft'), failed.data!]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeId, claimId, companyName, conversations, loading, messages, userId]);

  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  const toggleMic = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript || '';
        if (ev.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      setInput(`${finalText}${interim}`.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setBanner('הדיבור לא נקלט. אפשר לכתוב את השאלה.');
      }
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      const spoken = finalText.trim();
      if (spoken) void sendRef.current(spoken, 'voice');
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setBanner('');
    } catch {
      setBanner('לא ניתן להפעיל את המיקרופון בדפדפן הזה.');
    }
  };

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
    setShowList(false);
    writeActiveId(userId, claimId, null);
  };

  const confirmArchive = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    const error = await archiveClaimsAiConversation(id);
    if (error) {
      setBanner(error.message);
      return;
    }
    setConversations((prev) => prev.filter((row) => row.id !== id));
    if (activeId === id) startNew();
    setPendingDelete(null);
  };

  if (!open) return null;
  const active = conversations.find((row) => row.id === activeId) || null;

  return (
    <div
      className={`claims-ai-workspace${showList ? ' show-list' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="דליה AI לניהול תביעות"
      data-testid="claims-ai-workspace"
    >
      <aside className="claims-ai-side">
        <div className="claims-ai-side-h">
          <strong>שיחות</strong>
          <button type="button" className="btn btn-p" data-testid="claims-ai-new" onClick={startNew}>שיחה חדשה</button>
        </div>
        {pendingDelete ? (
          <div className="claims-ai-confirm" data-testid="claims-ai-delete-confirm">
            <div>להסיר את «{pendingDelete.title}» מהרשימה? השיחה תעבור לארכיון ורק אחרי האישור הזה.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-rd btn-sm" data-testid="claims-ai-delete-yes" onClick={() => void confirmArchive()}>אישור</button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setPendingDelete(null)}>ביטול</button>
            </div>
          </div>
        ) : null}
        <div className="claims-ai-list" data-testid="claims-ai-list">
          {conversations.length === 0 ? <div className="claims-ai-empty">אין שיחות שמורות לתיק הזה.</div> : conversations.map((row) => (
            <div className="claims-ai-conv-row" key={row.id}>
              <button
                type="button"
                className={`claims-ai-conv${row.id === activeId ? ' active' : ''}`}
                onClick={() => { setActiveId(row.id); setShowList(false); }}
              >
                <b>{row.title}</b>
                <span>{new Date(row.updated_at).toLocaleString('he-IL')}</span>
              </button>
              <button type="button" className="claims-ai-archive" aria-label={`מחק ${row.title}`} onClick={() => setPendingDelete(row)}>מחק</button>
            </div>
          ))}
        </div>
      </aside>

      <section className="claims-ai-main">
        <header className="claims-ai-top">
          <div>
            <h2>{active?.title || 'שיחה חדשה'}</h2>
            <div className="claims-ai-status">דליה AI · ניהול תביעות</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-g btn-sm claims-ai-list-toggle" onClick={() => setShowList((v) => !v)}>שיחות</button>
            <button type="button" className="btn btn-g" data-testid="claims-ai-close" onClick={onClose}>סגור</button>
          </div>
        </header>

        <div className="claims-ai-context" data-testid="claims-ai-context">
          {claim ? (
            <>
              <span>תיק <b>{claim.claimId}</b></span>
              <span>מספר תביעה <b>{claim.claimNum}</b></span>
              <span>רכב <b>{claim.vehicle}</b></span>
              <span>לקוח <b>{claim.clientName}</b></span>
              <span>ביטוח <b>{claim.insCompany}</b></span>
              <span>סטטוס <b>{claim.status}</b></span>
            </>
          ) : (
            <span>אין תיק פתוח. השיחה לא משויכת לתיק קודם.</span>
          )}
        </div>

        <div className="claims-ai-thread" ref={threadRef} data-testid="claims-ai-thread">
          {banner ? <div className="claims-ai-bubble" data-testid="claims-ai-error" style={{ border: '1px solid var(--rd2)' }}>{banner}</div> : null}
          {messages.length === 0 && !loading ? (
            <div className="claims-ai-empty">
              שאלו בשפה חופשית על התיק הפתוח. ההודעות נשמרות ב-Staging ונשארות אחרי סגירת החלון.
            </div>
          ) : null}
          {messages.map((msg) => {
            const pending = pendingActionOf(msg.metadata);
            const toolError = typeof msg.metadata.tool_error === 'string' ? msg.metadata.tool_error : '';
            return (
              <div key={msg.id} className={`claims-ai-row ${msg.role}${msg.metadata.error === true ? ' error' : ''}`}>
                <div className="claims-ai-bubble">
                  {msg.content}
                  {toolError ? <div className="claims-ai-tool-err">הכלי נכשל: {toolError}</div> : null}
                  {pending ? (
                    <div className="claims-ai-preview" data-testid="claims-ai-preview">
                      <div>עומד להתבצע: {pending.summary}</div>
                      <div className="claims-ai-preview-acts">
                        <button
                          type="button"
                          className="btn btn-p btn-sm"
                          onClick={() => setBanner('האישור נקלט. ביצוע כתיבה עדיין לא מחובר בשלב הזה, והפעולה לא רצה.')}
                        >אישור</button>
                        <button type="button" className="btn btn-g btn-sm" onClick={() => setBanner('הפעולה בוטלה. שום דבר לא השתנה בתיק.')}>ביטול</button>
                      </div>
                    </div>
                  ) : null}
                  {msg.role === 'assistant' && msg.metadata.error !== true && typeof window.speechSynthesis !== 'undefined' ? (
                    <button type="button" className="claims-ai-speak" onClick={() => speakAnswer(msg.content)}>הקרא</button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {loading ? <div className="claims-ai-status" data-testid="claims-ai-loading">דליה חושבת…</div> : null}
        </div>

        <form
          className="claims-ai-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input, 'text');
          }}
        >
          <button
            type="button"
            className={`claims-ai-icon${listening ? ' live' : ''}`}
            data-testid="claims-ai-mic"
            aria-pressed={listening}
            disabled={!micOk || loading}
            title={micOk ? 'דבר אל דליה' : 'הדפדפן לא תומך בזיהוי דיבור'}
            onClick={toggleMic}
          >{listening ? '■' : '🎤'}</button>
          <textarea
            data-testid="claims-ai-input"
            value={input}
            dir="rtl"
            placeholder={claim ? 'שאלה על התיק הפתוח…' : 'פתחו תיק, או שאלו שאלה כללית…'}
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input, 'text');
              }
            }}
          />
          <button type="submit" className="claims-ai-icon send" data-testid="claims-ai-send" disabled={loading || !input.trim()}>שלח</button>
        </form>
      </section>
    </div>
  );
}
