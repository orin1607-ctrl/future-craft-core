import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  activeConversationStorageKey,
  conversationMatchesClaim,
  conversationsForClaim,
  messagesForModel,
  pendingActionOf,
  titleFromFirstMessage,
  type ClaimsAiAttachment,
  type ClaimsAiClaimContext,
  type ClaimsAiConversation,
  type ClaimsAiMessage,
  type ClaimsAiPendingAction,
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

interface StagedAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  previewUrl?: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadChatAttachmentToClaim(claimId: string, file: File): Promise<{ success: boolean; file_id?: string; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const form = new FormData();
    form.set('action', 'staff_upload');
    form.set('claim_id', claimId);
    form.set('file', file);
    form.set('doc_kind', file.type.startsWith('image/') ? 'surveyor_photo' : 'general');
    form.set('staff_type', file.type.startsWith('image/') ? 'damage_photos' : 'other');
    form.set('staff_title', file.name);

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { success?: boolean; file_id?: string; error?: string };
    if (!res.ok || json.success === false) {
      return { success: false, error: json.error || `HTTP ${res.status}` };
    }
    return { success: true, file_id: String(json.file_id || '') };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

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
  attachments?: Array<{ name: string; mime_type: string; byte_size: number; file_id?: string; data_base64?: string }>;
  onDelta: (full: string) => void;
  onPendingAction?: (pending: ClaimsAiPendingAction) => void;
}): Promise<{ text: string; pendingAction: ClaimsAiPendingAction | null }> {
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
      attachments: input.attachments,
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
  let receivedPendingAction: ClaimsAiPendingAction | null = null;

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
          if (parsed.pending_action) {
            const rawPending = parsed.pending_action as Record<string, unknown>;
            const pendingObj: ClaimsAiPendingAction = {
              preview_id: String(rawPending.preview_id || ''),
              summary: String(rawPending.summary || ''),
              tool_name: String(rawPending.tool_name || ''),
              action_type: String(rawPending.action_type || ''),
              status: 'pending',
              parameters: (rawPending.parameters && typeof rawPending.parameters === 'object')
                ? (rawPending.parameters as Record<string, unknown>)
                : undefined,
            };
            receivedPendingAction = pendingObj;
            input.onPendingAction?.(pendingObj);
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
  return { text: full, pendingAction: receivedPendingAction };
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
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const sendRef = useRef<(text: string, source: 'text' | 'voice') => Promise<void>>(async () => {});

  useEffect(() => {
    setMicOk(!!speechCtor() && !!window.isSecureContext);
  }, []);

  useEffect(() => {
    return () => {
      stagedAttachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, [stagedAttachments]);

  const addFilesToStaged = useCallback((files: File[]) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    const newStaged: StagedAttachment[] = [];
    const errors: string[] = [];

    for (const f of files) {
      const mime = f.type.toLowerCase();
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      const isImageExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      const isPdfExt = ext === 'pdf';

      if (!allowed.includes(mime) && !isImageExt && !isPdfExt) {
        errors.push(`הקובץ "${f.name}" אינו נתמך (נתמכים: JPG, PNG, WEBP, PDF)`);
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        errors.push(`הקובץ "${f.name}" גדול מדי (מקסימום 15MB)`);
        continue;
      }

      const isImage = mime.startsWith('image/') || isImageExt;
      const previewUrl = isImage ? URL.createObjectURL(f) : undefined;
      newStaged.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        name: f.name,
        size: f.size,
        mimeType: mime || (isPdfExt ? 'application/pdf' : 'image/jpeg'),
        previewUrl,
      });
    }

    if (errors.length > 0) {
      setBanner(errors.join('\n'));
    } else {
      setBanner('');
    }

    if (newStaged.length > 0) {
      setStagedAttachments((prev) => [...prev, ...newStaged]);
    }
  }, []);

  const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    addFilesToStaged(Array.from(files));
    e.target.value = '';
  }, [addFilesToStaged]);

  const removeStagedAttachment = useCallback((id: string) => {
    setStagedAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
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
    setStagedAttachments([]);
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
    if ((!trimmed && stagedAttachments.length === 0) || loading) return;
    const effectiveText = trimmed || (stagedAttachments.length === 1 ? 'צירפתי קובץ לבדיקה' : 'צירפתי קבצים לבדיקה');
    const filesToUpload = [...stagedAttachments];

    setInput('');
    setStagedAttachments([]);
    setLoading(true);
    setBanner('');
    let conversationId = activeId;
    try {
      if (!conversationId) {
        const created = await createClaimsAiConversation({
          userId,
          claimId,
          title: titleFromFirstMessage(effectiveText),
        });
        if (created.error || !created.data) throw new Error(created.error?.message || 'יצירת השיחה נכשלה');
        conversationId = created.data.id;
        setConversations((prev) => [created.data!, ...prev]);
        setActiveId(conversationId);
        writeActiveId(userId, claimId, conversationId);
      } else if ((conversations.find((row) => row.id === conversationId)?.title || 'שיחה חדשה') === 'שיחה חדשה'
        && messages.filter((m) => m.role === 'user').length === 0) {
        const title = titleFromFirstMessage(effectiveText);
        await renameClaimsAiConversation(conversationId, title);
        setConversations((prev) => prev.map((row) => row.id === conversationId ? { ...row, title } : row));
      }

      const finalAttachments: Array<{
        name: string;
        mime_type: string;
        byte_size: number;
        file_id?: string;
        data_base64?: string;
        preview_url?: string;
      }> = [];

      for (const staged of filesToUpload) {
        try {
          const base64 = await readFileAsBase64(staged.file);
          let fileId: string | undefined = undefined;
          if (claimId) {
            const upRes = await uploadChatAttachmentToClaim(claimId, staged.file);
            if (upRes.success && upRes.file_id) {
              fileId = upRes.file_id;
            }
          }
          finalAttachments.push({
            name: staged.name,
            mime_type: staged.mimeType,
            byte_size: staged.size,
            file_id: fileId,
            data_base64: base64,
            preview_url: staged.previewUrl,
          });
        } catch (err) {
          console.error('Failed reading/uploading attachment:', staged.name, err);
        }
      }

      const userSaved = await insertClaimsAiMessage({
        conversationId,
        role: 'user',
        content: effectiveText,
        metadata: {
          claim_id: claimId,
          source,
          attachments: finalAttachments.map((a) => ({
            name: a.name,
            mime_type: a.mime_type,
            byte_size: a.byte_size,
            file_id: a.file_id,
            preview_url: a.preview_url,
            data_base64: a.mime_type.startsWith('image/') ? a.data_base64 : undefined,
          })),
        },
      });
      if (userSaved.error || !userSaved.data) throw new Error(userSaved.error?.message || 'שמירת ההודעה נכשלה');
      const history = [...messages, userSaved.data];
      setMessages(history);

      let draft = '';
      let pendingFromStream: ClaimsAiPendingAction | null = null;
      const answer = await streamHelpAi({
        messages: messagesForModel(history),
        claimId,
        companyName,
        attachments: finalAttachments.map((a) => ({
          name: a.name,
          mime_type: a.mime_type,
          byte_size: a.byte_size,
          file_id: a.file_id,
          data_base64: a.data_base64,
        })),
        onDelta: (full) => {
          draft = full;
          setMessages([...history, {
            id: 'draft',
            conversation_id: conversationId!,
            role: 'assistant',
            content: full,
            created_at: new Date().toISOString(),
            tool_name: null,
            metadata: pendingFromStream ? { pending_action: pendingFromStream } : {},
          }]);
        },
        onPendingAction: (pending) => {
          pendingFromStream = pending;
        },
      });
      const saved = await insertClaimsAiMessage({
        conversationId,
        role: 'assistant',
        content: answer.text || draft,
        tool_name: answer.pendingAction?.tool_name || null,
        metadata: {
          claim_id: claimId,
          model: 'help-ai-chat',
          ...(answer.pendingAction ? { pending_action: answer.pendingAction } : {}),
        },
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
  }, [activeId, claimId, companyName, conversations, loading, messages, stagedAttachments, userId]);

  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  const handleConfirmPending = useCallback(async (msg: ClaimsAiMessage, pending: ClaimsAiPendingAction) => {
    setExecutingActionId(msg.id);
    setBanner('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('יש להתחבר למערכת');

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'execute_pending_action',
          claim_id: claimId,
          conversation_id: activeId,
          pending_action: pending,
        }),
      });

      const result = await resp.json().catch(() => ({ error: 'שגיאה בפענוח תשובת השרת' }));
      if (!resp.ok || result.success === false) {
        throw new Error(result.message || result.error || 'ביצוע הפעולה נכשל');
      }

      const confirmText = `✅ ${result.message || 'הפעולה בוצעה בהצלחה'}`;
      let confirmedRow: ClaimsAiMessage | null = null;
      if (activeId) {
        const confirmed = await insertClaimsAiMessage({
          conversationId: activeId,
          role: 'assistant',
          content: confirmText,
          metadata: {
            claim_id: claimId,
            executed_action: pending.action_type,
            preview_id: pending.preview_id,
          },
        });
        confirmedRow = confirmed.data || null;
      }

      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  metadata: {
                    ...m.metadata,
                    pending_action: { ...pending, status: 'executed' as const },
                  },
                }
              : m
          )
          .concat(confirmedRow ? [confirmedRow] : [])
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה בביצוע הפעולה';
      setBanner(message);
    } finally {
      setExecutingActionId(null);
    }
  }, [activeId, claimId]);

  const handleCancelPending = useCallback(async (msg: ClaimsAiMessage, pending: ClaimsAiPendingAction) => {
    setBanner('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch(CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'cancel_pending_action',
            claim_id: claimId,
            conversation_id: activeId,
            pending_action: pending,
          }),
        });
      }

      let cancelRow: ClaimsAiMessage | null = null;
      if (activeId) {
        const cancelMsg = await insertClaimsAiMessage({
          conversationId: activeId,
          role: 'assistant',
          content: `❌ הפעולה בוטלה על ידי המשתמש (${pending.summary})`,
          metadata: {
            claim_id: claimId,
            cancelled_action: pending.action_type,
            preview_id: pending.preview_id,
          },
        });
        cancelRow = cancelMsg.data || null;
      }

      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  metadata: {
                    ...m.metadata,
                    pending_action: { ...pending, status: 'cancelled' as const },
                  },
                }
              : m
          )
          .concat(cancelRow ? [cancelRow] : [])
      );
    } catch (err) {
      console.error('Cancel action error:', err);
    }
  }, [activeId, claimId]);

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
            <span>📊 <b>ניהול תביעות כללי</b> (אין תיק פתוח) · סקירת כלל התביעות, מיילים ומשימות במערכת</span>
          )}
        </div>

        <div className="claims-ai-thread" ref={threadRef} data-testid="claims-ai-thread">
          {banner ? <div className="claims-ai-bubble" data-testid="claims-ai-error" style={{ border: '1px solid var(--rd2)' }}>{banner}</div> : null}
          {messages.length === 0 && !loading ? (
            <div className="claims-ai-empty">
              {claim
                ? 'שאלו בשפה חופשית על התיק הפתוח. ההודעות נשמרות ב-Staging ונשארות אחרי סגירת החלון.'
                : 'שאלו בשפה חופשית על כלל התביעות, סיכומים, מיילים מהיום, ומשימות פתוחות במערכת.'}
            </div>
          ) : null}
          {messages.map((msg) => {
            const pending = pendingActionOf(msg.metadata);
            const toolError = typeof msg.metadata.tool_error === 'string' ? msg.metadata.tool_error : '';
            const msgAttachments = Array.isArray(msg.metadata?.attachments) ? (msg.metadata.attachments as any[]) : [];
            return (
              <div key={msg.id} className={`claims-ai-row ${msg.role}${msg.metadata.error === true ? ' error' : ''}`}>
                <div className="claims-ai-bubble">
                  {msgAttachments.length > 0 ? (
                    <div className="claims-ai-msg-attachments" data-testid="claims-ai-msg-attachments">
                      {msgAttachments.map((att: any, idx: number) => (
                        <div key={idx} className="claims-ai-msg-att-badge" data-testid={`claims-ai-msg-attachment-${idx}`}>
                          {att.data_base64 && String(att.mime_type || '').startsWith('image/') ? (
                            <img src={`data:${att.mime_type};base64,${att.data_base64}`} alt={att.name} className="claims-ai-msg-att-thumb" />
                          ) : att.preview_url ? (
                            <img src={att.preview_url} alt={att.name} className="claims-ai-msg-att-thumb" />
                          ) : (
                            <span className="claims-ai-msg-att-icon">📄</span>
                          )}
                          <div className="claims-ai-msg-att-info">
                            <span className="claims-ai-msg-att-name" title={att.name}>{att.name}</span>
                            {att.byte_size ? <span className="claims-ai-msg-att-size">{formatFileSize(att.byte_size)}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {msg.content}
                  {toolError ? <div className="claims-ai-tool-err">הכלי נכשל: {toolError}</div> : null}
                  {pending ? (
                    <div className="claims-ai-preview" data-testid="claims-ai-preview">
                      <div className="claims-ai-preview-head" style={{ fontWeight: 600, marginBottom: 4 }}>
                        {pending.status === 'executed'
                          ? '✅ פעולה בוצעה בהצלחה:'
                          : pending.status === 'cancelled'
                          ? '❌ פעולה בוטלה:'
                          : '⚠️ עומד להתבצע (נדרש אישורך):'}
                      </div>
                      <div className="claims-ai-preview-summary">{pending.summary}</div>
                      {pending.status === 'executed' ? (
                        <div style={{ color: 'var(--c-emerald, #10b981)', fontSize: '0.85rem', marginTop: 6 }}>
                          הפעולה בוצעה במערכת ונשמרה בתיק.
                        </div>
                      ) : pending.status === 'cancelled' ? (
                        <div style={{ color: 'var(--c-muted, #94a3b8)', fontSize: '0.85rem', marginTop: 6 }}>
                          הפעולה בוטלה ולא שונה דבר בתיק.
                        </div>
                      ) : executingActionId === msg.id ? (
                        <div className="claims-ai-status" style={{ marginTop: 6 }}>מבצע את הפעולה...</div>
                      ) : (
                        <div className="claims-ai-preview-acts" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            data-testid="claims-ai-confirm-btn"
                            disabled={!!executingActionId}
                            onClick={() => void handleConfirmPending(msg, pending)}
                          >
                            אישור
                          </button>
                          <button
                            type="button"
                            className="btn btn-g btn-sm"
                            data-testid="claims-ai-cancel-btn"
                            disabled={!!executingActionId}
                            onClick={() => void handleCancelPending(msg, pending)}
                          >
                            ביטול
                          </button>
                        </div>
                      )}
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

        {stagedAttachments.length > 0 ? (
          <div className="claims-ai-attachments-tray" data-testid="claims-ai-attachments-tray">
            {stagedAttachments.map((att) => (
              <div key={att.id} className="claims-ai-attachment-badge" data-testid={`claims-ai-attachment-badge-${att.id}`}>
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="claims-ai-attachment-thumb" />
                ) : (
                  <span className="claims-ai-attachment-icon">📄</span>
                )}
                <div className="claims-ai-attachment-info">
                  <span className="claims-ai-attachment-name" title={att.name}>{att.name}</span>
                  <span className="claims-ai-attachment-size">{formatFileSize(att.size)}</span>
                </div>
                <button
                  type="button"
                  className="claims-ai-attachment-remove"
                  data-testid={`claims-ai-remove-attachment-${att.id}`}
                  title="הסר קובץ"
                  aria-label={`הסר קובץ ${att.name}`}
                  onClick={() => removeStagedAttachment(att.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="claims-ai-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input, 'text');
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
            data-testid="claims-ai-file-input"
            onChange={handleFilesSelected}
          />
          <button
            type="button"
            className="claims-ai-icon attach"
            data-testid="claims-ai-attach-btn"
            disabled={loading}
            title="צרף קובץ / תמונה"
            aria-label="צרף קובץ / תמונה"
            onClick={() => fileInputRef.current?.click()}
          >📎</button>
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
          <button
            type="submit"
            className="claims-ai-icon send"
            data-testid="claims-ai-send"
            disabled={loading || (!input.trim() && stagedAttachments.length === 0)}
          >שלח</button>
        </form>
      </section>
    </div>
  );
}
