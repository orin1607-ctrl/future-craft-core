import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  activeConversationStorageKey,
  conversationMatchesClaim,
  conversationsForClaim,
  documentCardsOf,
  messagesForModel,
  pendingActionOf,
  titleFromFirstMessage,
  toolTraceLine,
  toolTraceOf,
  type ClaimsAiAttachment,
  type ClaimsAiClaimContext,
  type ClaimsAiConversation,
  type ClaimsAiDocumentCard,
  type ClaimsAiMessage,
  type ClaimsAiPendingAction,
  type ClaimsAiToolTrace,
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
import { documentReadCaption } from './claimDocumentRead';
import { isApprovalText, isCancelText } from './claimsAiApproval';
import { NOT_READ_LABEL } from '../../../supabase/functions/_shared/claimDocumentLabel';
import { downloadRemoteFile } from './claimFileDownload';
import './claims-ai.css';

/** Claim-file actions the chat can run through the existing claims screen (signed URL, download, browser reader). */
export type ClaimsAiDocumentActions = {
  meta: (fileId: string) => Record<string, string> | null;
  open: (fileId: string) => Promise<string | null>;
  download: (fileId: string) => Promise<string | null>;
  /** Browser reading — only inside an open claim; the server reader covers the rest. */
  read?: (fileId: string) => Promise<string>;
};

async function signedDocUrl(claimId: string, fileId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('claims-docs', { body: { action: 'signed_url', claim_id: claimId, file_id: fileId, ...extra } });
  const url = !error && data && typeof data === 'object' ? String((data as Record<string, unknown>).url || '') : '';
  return url;
}

/** Open / download for a card when no claim is open (general chat). Same claims-docs call and permission check as the gallery. */
export function remoteDocumentActions(claimId: string, fileName = ''): ClaimsAiDocumentActions {
  return {
    meta: () => null,
    open: async (fileId) => {
      const win = window.open('', '_blank');
      const url = await signedDocUrl(claimId, fileId);
      if (!url) { win?.close(); return 'לא ניתן לפתוח את הקובץ (אין הרשאה או שהקובץ לא נמצא).'; }
      if (win) win.location.href = url;
      else window.open(url, '_blank', 'noopener');
      return null;
    },
    download: async (fileId) => {
      const url = await signedDocUrl(claimId, fileId, { purpose: 'download', filename: fileName || 'document' });
      if (!url) return 'לא ניתן להוריד את הקובץ (אין הרשאה או שהקובץ לא נמצא).';
      await downloadRemoteFile(url, fileName || 'document');
      return null;
    },
  };
}

function ChatDocumentCard({ card, actions }: { card: ClaimsAiDocumentCard; actions?: ClaimsAiDocumentActions }) {
  const [note, setNote] = useState('');
  const [reading, setReading] = useState(false);
  const [, setVersion] = useState(0);
  const started = useRef(false);
  const meta = actions?.meta(card.file_id) || null;
  const caption = documentReadCaption(meta);
  const readStatus = meta?.read_status || card.read_status;
  const needsRead = readStatus !== 'ready' && readStatus !== 'unreadable';

  useEffect(() => {
    if (!actions?.read || !needsRead || started.current) return;
    started.current = true;
    setReading(true);
    void actions.read(card.file_id)
      .then((msg) => setNote(msg))
      .catch(() => setNote('הקריאה נכשלה. המסמך לא השתנה.'))
      .finally(() => { setReading(false); setVersion((v) => v + 1); });
  }, [actions, card.file_id, needsRead]);

  const run = (fn?: (id: string) => Promise<string | null>) => {
    if (!fn) return;
    void fn(card.file_id).then((err) => { if (err) setNote(err); });
  };

  return (
    <div className="claims-ai-doc-card" data-testid={`claims-ai-doc-card-${card.file_id}`}>
      <div style={{ fontWeight: 600 }}>📄 {card.title}</div>
      {card.original_name && card.original_name !== card.title ? (
        <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>קובץ מקורי: {card.original_name}</div>
      ) : null}
      {actions ? (
        <div className="claims-ai-preview-acts" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn-p btn-sm" data-testid={`claims-ai-doc-open-${card.file_id}`} onClick={() => run(actions.open)}>פתח</button>
          <button type="button" className="btn btn-g btn-sm" data-testid={`claims-ai-doc-download-${card.file_id}`} onClick={() => run(actions.download)}>הורד</button>
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', marginTop: 6 }}>פתח את התיק כדי להציג את המסמך.</div>
      )}
      {reading ? <div className="claims-ai-status" style={{ marginTop: 6 }}>קורא את המסמך בדפדפן…</div> : null}
      {!reading && !caption && needsRead ? (
        <div style={{ fontSize: '0.8rem', marginTop: 6 }} data-testid={`claims-ai-doc-status-${card.file_id}`}>
          סטטוס קריאה: {NOT_READ_LABEL}{actions?.read ? '' : ' — אפשר לקרוא אותו מתוך התיק'}
        </div>
      ) : null}
      {caption ? (
        <div style={{ fontSize: '0.8rem', marginTop: 6 }} data-testid={`claims-ai-doc-read-${card.file_id}`}>
          <div>{caption.summary}</div>
          <div>{caption.details}</div>
          <div>{caption.source}</div>
        </div>
      ) : null}
      {note ? <div style={{ fontSize: '0.8rem', marginTop: 4 }} data-testid={`claims-ai-doc-note-${card.file_id}`}>{note}</div> : null}
    </div>
  );
}

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

async function uploadChatAttachmentToClaim(
  claimId: string,
  file: File,
  staffTitle?: string,
  category?: 'cat_b' | 'cat_a'
): Promise<{ success: boolean; file_id?: string; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const form = new FormData();
    form.set('action', 'staff_upload');
    form.set('claim_id', claimId);
    form.set('file', file);
    const isImage = file.type.startsWith('image/');
    const isForm = category === 'cat_b';
    form.set('doc_kind', isForm ? 'claim_form' : (isImage ? 'surveyor_photo' : 'general'));
    form.set('staff_type', isForm ? 'claim_form' : (isImage ? 'damage_photos' : 'other'));
    form.set('staff_title', staffTitle || file.name);

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

export function cleanTextForSpeech(markdown: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/:?-+:?/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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
  signal?: AbortSignal;
  onDelta: (full: string) => void;
  onPendingAction?: (pending: ClaimsAiPendingAction) => void;
}): Promise<{ text: string; pendingAction: ClaimsAiPendingAction | null; documentCards: ClaimsAiDocumentCard[]; toolsUsed: ClaimsAiToolTrace[] | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData?.session;
  if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60000)) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) session = refreshed.session;
  }
  if (!session?.access_token) throw new Error('יש להתחבר למערכת');

  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    signal: input.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
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
    let errMsg = `שגיאה ${resp.status}`;
    try {
      const err = await resp.json();
      if (err?.error) errMsg = String(err.error);
    } catch {
      // not JSON (e.g. Cloudflare gateway error)
    }
    if (resp.status === 504 || resp.status === 503 || errMsg.includes('504') || errMsg.includes('503')) {
      errMsg = 'שרת ה-AI עמוס כרגע (שגיאת עומס 504/503). אנא נסה שוב בעוד מספר רגעים.';
    }
    throw new Error(errMsg);
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
  let receivedCards: ClaimsAiDocumentCard[] = [];
  let receivedTools: ClaimsAiToolTrace[] | null = null;

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
          if (parsed.document_cards) {
            receivedCards = documentCardsOf(parsed.document_cards, input.claimId);
          }
          if (parsed.tools_used) {
            receivedTools = toolTraceOf(parsed.tools_used);
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
  return { text: full, pendingAction: receivedPendingAction, documentCards: receivedCards, toolsUsed: receivedTools };
}

interface ContentBlock {
  type: 'text' | 'table';
  text?: string;
  headers?: string[];
  rows?: string[][];
}

function parseBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ContentBlock[] = [];
  let currentTextLines: string[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSeparator = (l: string) => /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l);
  const parseRowCells = (l: string) => {
    const trimmed = l.trim();
    const inner = trimmed.startsWith('|') && trimmed.endsWith('|')
      ? trimmed.slice(1, -1)
      : trimmed;
    return inner.split('|').map((c) => c.trim());
  };

  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      if (currentTextLines.length > 0) {
        blocks.push({ type: 'text', text: currentTextLines.join('\n') });
        currentTextLines = [];
      }
      const headers = parseRowCells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseRowCells(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
    } else {
      currentTextLines.push(lines[i]);
      i++;
    }
  }
  if (currentTextLines.length > 0) {
    blocks.push({ type: 'text', text: currentTextLines.join('\n') });
  }
  return blocks;
}

function renderFormattedCell(text: string, onOpenClaim?: (claimId: string) => void) {
  const isUrgent = text.includes('🔴') || text.includes('[דחוף]');
  const isWait = text.includes('🟡') || text.includes('[ממתין]');

  const linkMatch = text.match(/\[(.*?)\]\(claim:([^)]+)\)/);
  if (linkMatch) {
    const label = linkMatch[1];
    const targetRef = linkMatch[2];
    return (
      <button
        type="button"
        className="claims-claim-btn"
        title={`פתח כרטיס תביעה ${targetRef}`}
        onClick={() => onOpenClaim?.(targetRef)}
      >
        🔍 {label || `פתח ${targetRef}`}
      </button>
    );
  }

  const claimMatch = text.match(/DAL-\d{4}-\d{4}|DAL-[A-Za-z0-9_-]+/);
  if (claimMatch) {
    const claimId = claimMatch[0];
    const isExplicit = text.includes('פתח תיק') || text.includes('claim:') || text.trim().startsWith('DAL-') || text.trim().startsWith('[DAL-');
    if (isExplicit) {
      return (
        <button
          type="button"
          className="claims-claim-btn"
          title={`פתח כרטיס תביעה ${claimId}`}
          onClick={() => onOpenClaim?.(claimId)}
        >
          🔍 {text.includes('פתח') ? text.replace(/[\[\]]/g, '') : `פתח ${claimId}`}
        </button>
      );
    }
  }

  if (isUrgent) {
    return <span className="claims-badge-urgent">{text}</span>;
  }
  if (isWait) {
    return <span className="claims-badge-wait">{text}</span>;
  }

  if (text.includes('<br>') || text.includes('\n')) {
    const parts = text.split(/<br\s*\/?>|\n/i);
    return (
      <>
        {parts.map((p, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 ? <br /> : null}
            {p}
          </React.Fragment>
        ))}
      </>
    );
  }

  return text;
}

function renderFormattedText(text: string, onOpenClaim?: (claimId: string) => void) {
  const parts = text.split(/(\[.*?\]\(claim:[A-Za-z0-9_-]+\)|DAL-\d{4}-\d{4})/g);
  return (
    <>
      {parts.map((part, idx) => {
        const linkMatch = part.match(/\[(.*?)\]\(claim:([A-Za-z0-9_-]+)\)/);
        if (linkMatch) {
          const label = linkMatch[1];
          const claimId = linkMatch[2];
          return (
            <button
              key={idx}
              type="button"
              className="claims-claim-btn"
              style={{ margin: '0 4px', display: 'inline-flex' }}
              onClick={() => onOpenClaim?.(claimId)}
            >
              🔍 {label || claimId}
            </button>
          );
        }
        if (/^DAL-\d{4}-\d{4}$/.test(part)) {
          return (
            <button
              key={idx}
              type="button"
              className="claims-claim-btn"
              style={{ margin: '0 4px', display: 'inline-flex' }}
              onClick={() => onOpenClaim?.(part)}
            >
              🔍 {part}
            </button>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

function ClaimsReportTable({
  headers,
  rows,
  onOpenClaim,
  onCopyText,
}: {
  headers: string[];
  rows: string[][];
  onOpenClaim?: (claimId: string) => void;
  onCopyText?: (text: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));
  }, [rows, filter]);

  const handleCopy = () => {
    const tsv = [
      headers.join('\t'),
      ...filteredRows.map((r) => r.join('\t')),
    ].join('\n');
    if (onCopyText) {
      onCopyText(tsv);
    } else if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tsv);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="claims-report-table-widget" data-testid="claims-report-table-widget">
      <div className="claims-report-table-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13, color: 'var(--t)' }}>
            📊 דוח תביעות ({filteredRows.length} {filteredRows.length === rows.length ? 'תיקים' : `מתוך ${rows.length}`})
          </strong>
          <button
            type="button"
            className="claims-ai-action-btn"
            onClick={handleCopy}
            title="העתק טבלה ללוח (בפורמט המתאים לאקסל/וורד)"
          >
            {copied ? '✓ הטבלה הועתקה!' : '📋 העתק טבלה'}
          </button>
        </div>
        <input
          type="text"
          className="claims-report-search"
          placeholder="🔍 חיפוש בטבלה..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="claims-report-table-scroll">
        <table className="claims-report-table">
          <thead>
            <tr>
              {headers.map((h, idx) => (
                <th key={idx}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} style={{ textAlign: 'center', padding: 16, color: 'var(--t3)' }}>
                  לא נמצאו תיקים התואמים את החיפוש "{filter}"
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderFormattedCell(cell, onOpenClaim)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClaimsMessageContent({
  content,
  onOpenClaim,
  onCopyText,
}: {
  content: string;
  onOpenClaim?: (claimId: string) => void;
  onCopyText?: (text: string) => void;
}) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="claims-message-content">
      {blocks.map((block, idx) => {
        if (block.type === 'table' && block.headers && block.rows) {
          return (
            <ClaimsReportTable
              key={idx}
              headers={block.headers}
              rows={block.rows}
              onOpenClaim={onOpenClaim}
              onCopyText={onCopyText}
            />
          );
        }
        return (
          <div key={idx} style={{ whiteSpace: 'pre-wrap' }}>
            {renderFormattedText(block.text || '', onOpenClaim)}
          </div>
        );
      })}
    </div>
  );
}

export const AVAILABLE_CUSTOMER_UPLOADS = [
  'רישיון רכב',
  'רישיון נהיגה',
  'תמונות נזק',
  'דוח שמאי',
  'טופס הודעה על תאונה',
  'אישור עבר ביטוחי',
  'תעודת ביטוח חובה',
  "הודעת צד ג'",
  'אישור משטרה',
  'קבלות / חשבוניות תיקון',
];

export const AVAILABLE_GARAGE_FORMS = [
  'ייפוי כוח',
  'הצהרת לקוח',
  'טופס הסכמה למסירת מידע',
  'אישור אי-הגשת תביעה',
  'כתב העברת זכויות',
  'אישור תשלום וסילוק',
];

type CustomDocItem = {
  id: string;
  name: string;
  category: 'cat_b' | 'cat_a';
  fileId?: string;
};

export function ClaimsCatalogWidget({
  claimId,
  onUploadCustomFile,
  onPrepareLink,
}: {
  claimId?: string;
  onUploadCustomFile?: (file: File, name: string, category: 'cat_b' | 'cat_a') => Promise<{ success: boolean; file_id?: string; error?: string }>;
  onPrepareLink: (docs: string[], forms: string[], ttlHours: number) => void | Promise<void>;
}) {
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<CustomDocItem[]>([]);
  const [ttlOption, setTtlOption] = useState<'24' | '168' | 'custom' | 'never'>('24');
  const [customTtlHours, setCustomTtlHours] = useState<number>(48);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  // State for manual file upload flow
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docName, setDocName] = useState<string>('');
  const [docCategory, setDocCategory] = useState<'cat_b' | 'cat_a'>('cat_b');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const toggleDoc = (doc: string) => {
    setSelectedDocs((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]
    );
  };

  const toggleForm = (form: string) => {
    setSelectedForms((prev) =>
      prev.includes(form) ? prev.filter((f) => f !== form) : [...prev, form]
    );
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setDocName(file.name.replace(/\.[^/.]+$/, ''));
    setDocCategory('cat_b'); // default to garage provided form
    setUploadError(null);
    e.target.value = '';
  };

  const handleSaveCustomDoc = async () => {
    if (!pendingFile || !docName.trim()) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const cleanTitle = docName.trim();
      let fileId: string | undefined;
      if (onUploadCustomFile) {
        const res = await onUploadCustomFile(pendingFile, cleanTitle, docCategory);
        if (!res.success) {
          setUploadError(res.error || 'שגיאה בהעלאת המסמך');
          setIsUploading(false);
          return;
        }
        fileId = res.file_id;
      } else {
        const targetClaim = claimId || 'DAL-2026-0249';
        const res = await uploadChatAttachmentToClaim(targetClaim, pendingFile, cleanTitle, docCategory);
        if (!res.success) {
          setUploadError(res.error || 'שגיאה בהעלאת המסמך');
          setIsUploading(false);
          return;
        }
        fileId = res.file_id;
      }

      // Add to custom items
      const newItem: CustomDocItem = {
        id: `custom-${Date.now()}`,
        name: cleanTitle,
        category: docCategory,
        fileId,
      };
      setCustomItems((prev) => [...prev, newItem]);

      // Automatically append to selections WITHOUT resetting previous selections
      if (docCategory === 'cat_b') {
        setSelectedForms((prev) => (prev.includes(cleanTitle) ? prev : [...prev, cleanTitle]));
      } else {
        setSelectedDocs((prev) => (prev.includes(cleanTitle) ? prev : [...prev, cleanTitle]));
      }

      // Reset upload modal/box
      setPendingFile(null);
      setDocName('');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const customDocs = customItems.filter((i) => i.category === 'cat_a');
  const customForms = customItems.filter((i) => i.category === 'cat_b');

  const allCategoryA = [...AVAILABLE_CUSTOMER_UPLOADS, ...customDocs.map((c) => c.name)];
  const allCategoryB = [...AVAILABLE_GARAGE_FORMS, ...customForms.map((c) => c.name)];

  const effectiveTtlHours = ttlOption === '24' ? 24 : ttlOption === '168' ? 168 : ttlOption === 'never' ? 0 : Math.max(1, customTtlHours || 24);
  const ttlLabel = ttlOption === '24'
    ? '24 שעות (יום אחד)'
    : ttlOption === '168'
    ? 'שבוע אחד (7 ימים)'
    : ttlOption === 'never'
    ? 'ללא תאריך תפוגה אוטומטי (פתוח עד לביטול)'
    : `${effectiveTtlHours} שעות`;

  return (
    <div
      className="claims-catalog-widget"
      data-testid="claims-catalog-widget"
      style={{
        marginTop: 12,
        padding: '16px 18px',
        background: '#071022',
        color: '#f8fafc',
        borderRadius: 10,
        border: '1.5px solid #334155',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        fontSize: '0.85rem',
        lineHeight: 1.5,
      }}
    >
      <div
        className="claims-catalog-head"
        style={{
          fontWeight: 800,
          color: '#ffffff',
          marginBottom: 10,
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📦</span>
          <span>הכנת חבילת פתיחת תיק ללקוח חדש (מאגר מסמכים וטפסים לבחירה מהירה):</span>
        </span>
        <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
          {selectedDocs.length + selectedForms.length} מסמכים/טפסים נבחרו
        </span>
      </div>

      {/* Step 1 & 2 Notice: Intake Questionnaire Always Included */}
      <div
        className="claims-catalog-intake-notice"
        data-testid="claims-catalog-intake-notice"
        style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1.5px solid #0284c7',
          borderRadius: 8,
          color: '#bae6fd',
          fontSize: '0.86rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>📋</span>
        <div>
          <div>שאלון פתיחת תביעה – תמיד כלול בחבילה (שלב 1)</div>
          <div style={{ fontSize: '0.78rem', color: '#7dd3fc', fontWeight: 500, marginTop: 2 }}>
            הלקוח ימלא את שאלון הדיווח ויחתום דיגיטלית, ולאחר מכן יעבור ישירות וברצף להעלאת המסמכים שנבחרו מטה.
          </div>
        </div>
      </div>

      {/* Category A: Requested Documents */}
      <div style={{ marginBottom: 14 }}>
        <div
          className="claims-catalog-section-title cat-a"
          style={{ fontWeight: 800, color: '#38bdf8', marginBottom: 8, fontSize: '0.88rem' }}
        >
          📥 קטגוריה א' – מסמכים שהלקוח נדרש להעלות אלינו:
        </div>
        <div
          className="claims-catalog-items-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {allCategoryA.map((doc) => {
            const isSelected = selectedDocs.includes(doc);
            const isCustom = customDocs.some((c) => c.name === doc);
            return (
              <label
                key={doc}
                className={`claims-catalog-item-label ${isSelected ? 'selected cat-a' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: isSelected ? '#0369a1' : '#0f172a',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: isSelected ? '2px solid #38bdf8' : '1.5px solid #334155',
                  boxShadow: isSelected ? '0 0 0 1px #38bdf8' : 'none',
                  minHeight: '46px',
                  boxSizing: 'border-box',
                }}
              >
                <input
                  type="checkbox"
                  className="claims-catalog-item-checkbox"
                  checked={isSelected}
                  onChange={() => toggleDoc(doc)}
                  style={{
                    width: 22,
                    height: 22,
                    minWidth: 22,
                    cursor: 'pointer',
                    accentColor: '#38bdf8',
                  }}
                />
                <span
                  className="claims-catalog-item-name"
                  style={{
                    fontWeight: isSelected ? 800 : 600,
                    fontSize: '13.5px',
                    color: '#ffffff',
                    flex: 1,
                  }}
                >
                  {doc} {isCustom ? '⭐ (הועלה ידנית)' : ''}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Category B: Provided Forms to fill & sign */}
      <div style={{ marginBottom: 14 }}>
        <div
          className="claims-catalog-section-title cat-b"
          style={{ fontWeight: 800, color: '#4ade80', marginBottom: 8, fontSize: '0.88rem' }}
        >
          📝 קטגוריה ב' – טפסים שאנו מספקים ללקוח למילוי וחתימה:
        </div>
        <div
          className="claims-catalog-items-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {allCategoryB.map((form) => {
            const isSelected = selectedForms.includes(form);
            const isCustom = customForms.some((c) => c.name === form);
            return (
              <label
                key={form}
                className={`claims-catalog-item-label ${isSelected ? 'selected cat-b' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: isSelected ? '#15803d' : '#0f172a',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: isSelected ? '2px solid #4ade80' : '1.5px solid #334155',
                  boxShadow: isSelected ? '0 0 0 1px #4ade80' : 'none',
                  minHeight: '46px',
                  boxSizing: 'border-box',
                }}
              >
                <input
                  type="checkbox"
                  className="claims-catalog-item-checkbox"
                  checked={isSelected}
                  onChange={() => toggleForm(form)}
                  style={{
                    width: 22,
                    height: 22,
                    minWidth: 22,
                    cursor: 'pointer',
                    accentColor: '#4ade80',
                  }}
                />
                <span
                  className="claims-catalog-item-name"
                  style={{
                    fontWeight: isSelected ? 800 : 600,
                    fontSize: '13.5px',
                    color: '#ffffff',
                    flex: 1,
                  }}
                >
                  ✍️ {form} {isCustom ? '⭐ (הועלה ידנית)' : ''}
                </span>
              </label>
            );
          })}
        </div>
        {selectedForms.filter((f) => !customForms.some((c) => c.name === f)).length > 0 ? (
          <div
            className="claims-catalog-missing-forms-notice"
            data-testid="claims-catalog-missing-forms-notice"
            style={{
              marginTop: 10,
              padding: '10px 14px',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1.5px solid #eab308',
              borderRadius: 8,
              color: '#fef08a',
              fontSize: '0.82rem',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 800, color: '#facc15', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span>
              <span>הטופס חסר, נא להעלות אותו (PDF/תמונה): {selectedForms.filter((f) => !customForms.some((c) => c.name === f)).join(', ')}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#fef9c3', marginBottom: 6 }}>
              הטופס מיועד להורדה, מילוי וחתימה ע"י הלקוח. באפשרותך להעלותו כעת (מצלמה/קובץ) והוא יישמר בתיק, או להמשיך ללא קובץ מוכן מראש.
            </div>
            <button
              type="button"
              className="btn btn-g"
              onClick={() => {
                const missing = selectedForms.filter((f) => !customForms.some((c) => c.name === f));
                if (missing[0]) setDocName(missing[0]);
                setDocCategory('cat_b');
                fileInputRef.current?.click();
              }}
              style={{
                background: '#854d0e',
                color: '#ffffff',
                border: '1px solid #ca8a04',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📤 העלה קובץ עכשיו עבור "{selectedForms.filter((f) => !customForms.some((c) => c.name === f))[0]}"
            </button>
          </div>
        ) : null}
      </div>

      {/* Permanent "➕ העלה מסמך משלך" button and file picker */}
      <div style={{ marginBottom: 14 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        {!pendingFile ? (
          <button
            type="button"
            className="btn btn-g"
            data-testid="claims-catalog-upload-custom-btn"
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 8,
              background: '#0f172a',
              border: '1.5px dashed #38bdf8',
              color: '#38bdf8',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s ease',
            }}
          >
            ➕ העלה מסמך משלך (מצלמה / קובץ / PDF)
          </button>
        ) : (
          <div
            className="claims-catalog-upload-box"
            data-testid="claims-catalog-upload-dialog"
            style={{
              background: '#0f172a',
              border: '1.5px solid #38bdf8',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>
              📎 הגדרת מסמך להעלאה: {pendingFile.name} ({formatFileSize(pendingFile.size)})
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 4, fontWeight: 600 }}>
                שם המסמך או הטופס:
              </label>
              <input
                type="text"
                data-testid="claims-catalog-custom-name-input"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="לדוגמה: טופס ויתור סודיות מותאם"
                style={{
                  width: '100%',
                  minHeight: '38px',
                  padding: '6px 10px',
                  background: '#071022',
                  border: '1px solid #475569',
                  borderRadius: 6,
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 600 }}>
                מטרת המסמך:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: docCategory === 'cat_b' ? 'rgba(74, 222, 128, 0.15)' : '#071022',
                    border: docCategory === 'cat_b' ? '1px solid #4ade80' : '1px solid #334155',
                    padding: '6px 10px',
                    borderRadius: 6,
                    color: '#ffffff',
                    fontSize: '0.8rem',
                  }}
                >
                  <input
                    type="radio"
                    name="custom-doc-category"
                    checked={docCategory === 'cat_b'}
                    onChange={() => setDocCategory('cat_b')}
                    style={{ accentColor: '#4ade80' }}
                  />
                  <span>📝 <strong>קטגוריה ב'</strong> – טופס שהמוסך מספק ללקוח למילוי ולחתימה (מומלץ)</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: docCategory === 'cat_a' ? 'rgba(56, 189, 248, 0.15)' : '#071022',
                    border: docCategory === 'cat_a' ? '1px solid #38bdf8' : '1px solid #334155',
                    padding: '6px 10px',
                    borderRadius: 6,
                    color: '#ffffff',
                    fontSize: '0.8rem',
                  }}
                >
                  <input
                    type="radio"
                    name="custom-doc-category"
                    checked={docCategory === 'cat_a'}
                    onChange={() => setDocCategory('cat_a')}
                    style={{ accentColor: '#38bdf8' }}
                  />
                  <span>📥 <strong>קטגוריה א'</strong> – מסמך שהלקוח נדרש להעלות אלינו</span>
                </label>
              </div>
            </div>

            {uploadError ? (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>
                ⚠️ {uploadError}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                data-testid="claims-catalog-save-custom-btn"
                className="btn btn-primary"
                disabled={isUploading || !docName.trim()}
                onClick={() => void handleSaveCustomDoc()}
                style={{
                  minHeight: '40px',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  flex: 1,
                }}
              >
                {isUploading ? '⏳ מעלה מסמך...' : '💾 שמור וצרף לבחירה'}
              </button>
              <button
                type="button"
                data-testid="claims-catalog-cancel-custom-btn"
                className="btn btn-g"
                disabled={isUploading}
                onClick={() => {
                  setPendingFile(null);
                  setDocName('');
                  setUploadError(null);
                }}
                style={{
                  minHeight: '40px',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Link Expiration Picker */}
      <div style={{ marginBottom: 14, background: '#0f172a', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #334155' }}>
        <div style={{ fontWeight: 800, color: '#f59e0b', marginBottom: 8, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>⏰</span>
          <span>שלב 3 – בחירת תוקף הקישור:</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: ttlOption === '24' ? 'rgba(245, 158, 11, 0.2)' : '#071022',
              border: ttlOption === '24' ? '1.5px solid #f59e0b' : '1px solid #334155',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: ttlOption === '24' ? 700 : 500,
            }}
          >
            <input
              type="radio"
              name="catalog-ttl"
              checked={ttlOption === '24'}
              onChange={() => setTtlOption('24')}
              style={{ accentColor: '#f59e0b' }}
            />
            <span>24 שעות (יום אחד) – ברירת מחדל</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: ttlOption === '168' ? 'rgba(245, 158, 11, 0.2)' : '#071022',
              border: ttlOption === '168' ? '1.5px solid #f59e0b' : '1px solid #334155',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: ttlOption === '168' ? 700 : 500,
            }}
          >
            <input
              type="radio"
              name="catalog-ttl"
              checked={ttlOption === '168'}
              onChange={() => setTtlOption('168')}
              style={{ accentColor: '#f59e0b' }}
            />
            <span>שבוע (7 ימים)</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: ttlOption === 'never' ? 'rgba(245, 158, 11, 0.2)' : '#071022',
              border: ttlOption === 'never' ? '1.5px solid #f59e0b' : '1px solid #334155',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: ttlOption === 'never' ? 700 : 500,
            }}
          >
            <input
              type="radio"
              name="catalog-ttl"
              checked={ttlOption === 'never'}
              onChange={() => setTtlOption('never')}
              style={{ accentColor: '#f59e0b' }}
            />
            <span>ללא תאריך תפוגה אוטומטי (פתוח עד לביטול ידני)</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: ttlOption === 'custom' ? 'rgba(245, 158, 11, 0.2)' : '#071022',
              border: ttlOption === 'custom' ? '1.5px solid #f59e0b' : '1px solid #334155',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: ttlOption === 'custom' ? 700 : 500,
            }}
          >
            <input
              type="radio"
              name="catalog-ttl"
              checked={ttlOption === 'custom'}
              onChange={() => setTtlOption('custom')}
              style={{ accentColor: '#f59e0b' }}
            />
            <span>הגדרה מותאמת אישית</span>
          </label>
        </div>

        {ttlOption === 'custom' ? (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>מספר שעות תוקף:</span>
            <input
              type="number"
              min={1}
              max={8760}
              value={customTtlHours}
              onChange={(e) => setCustomTtlHours(parseInt(e.target.value, 10) || 24)}
              style={{
                width: '100px',
                minHeight: '34px',
                padding: '4px 8px',
                background: '#071022',
                border: '1.5px solid #f59e0b',
                borderRadius: 6,
                color: '#ffffff',
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>שעות (לדוגמה 12, 48, 72)</span>
          </div>
        ) : null}
      </div>

      {/* Step 4: Package Summary Card */}
      <div
        className="claims-catalog-summary-card"
        data-testid="claims-catalog-summary-card"
        style={{
          marginBottom: 14,
          background: '#0c1b33',
          padding: '12px 14px',
          borderRadius: 8,
          border: '1.5px solid #2563eb',
          fontSize: '0.84rem',
        }}
      >
        <div style={{ fontWeight: 800, color: '#60a5fa', marginBottom: 6, fontSize: '0.88rem' }}>
          📑 סיכום החבילה להפקה:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, color: '#e2e8f0' }}>
          <div>📋 <strong>שאלון פתיחת תיק:</strong> כלול ומאושר ✅</div>
          <div>📥 <strong>מסמכים להעלאה:</strong> {selectedDocs.length > 0 ? `${selectedDocs.length} נבחרו` : 'ללא מסמכים נוספים'}</div>
          <div>📝 <strong>טפסים לחתימה:</strong> {selectedForms.length > 0 ? `${selectedForms.length} נבחרו` : 'ללא טפסים נוספים'}</div>
          <div>⏰ <strong>תוקף הקישור:</strong> {ttlLabel}</div>
        </div>
      </div>

      {prepareError ? (
        <div
          className="claims-catalog-error-banner"
          data-testid="claims-catalog-error-banner"
          style={{
            marginBottom: 10,
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1.5px solid #ef4444',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div>⚠️ {prepareError}</div>
          <div style={{ fontSize: '0.78rem', color: '#fecaca' }}>
            כל המסמכים והטפסים שסימנת נשמרו. באפשרותך ללחוץ על הכפתור מטה כדי לנסות שוב.
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-primary"
        data-testid="claims-catalog-prepare-btn"
        disabled={isPreparing}
        onClick={async () => {
          setIsPreparing(true);
          setPrepareError(null);
          try {
            if (ttlOption === '24') {
              await onPrepareLink(selectedDocs, selectedForms);
            } else {
              await onPrepareLink(selectedDocs, selectedForms, effectiveTtlHours);
            }
          } catch (err) {
            setPrepareError(err instanceof Error ? err.message : String(err));
          } finally {
            setIsPreparing(false);
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontWeight: 700,
          fontSize: '0.94rem',
          minHeight: '48px',
          padding: '10px 18px',
          borderRadius: 8,
          width: '100%',
          cursor: !isPreparing ? 'pointer' : 'not-allowed',
          background: '#2563eb',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
        }}
      >
        {isPreparing ? (
          '⏳ מפיק חבילת פתיחת תיק...'
        ) : prepareError ? (
          `🔄 נסה שוב להכין כרטיס אישור (${selectedDocs.length + selectedForms.length})`
        ) : (
          `✨ אשר את החבילה והפק קישור (${selectedDocs.length + selectedForms.length})`
        )}
      </button>
    </div>
  );
}

export function ClaimsAiWorkspace({
  open,
  onClose,
  claim,
  userId,
  companyName,
  documentActions,
  onActionExecuted,
  onOpenClaim,
}: {
  open: boolean;
  onClose: () => void;
  claim: ClaimsAiClaimContext | null;
  userId: string;
  companyName: string | null;
  documentActions?: ClaimsAiDocumentActions;
  /** Called after an approved action ran, so the screen can reload the claim. */
  onActionExecuted?: (pending: ClaimsAiPendingAction) => void;
  /** Opens the specified claim card directly in the main screen without losing chat. */
  onOpenClaim?: (claimId: string) => void;
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
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');

  const [dockedReport, setDockedReport] = useState<{
    headers: string[];
    rows: string[][];
    title?: string;
    updatedAt: string;
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem(`claims_ai_docked_${userId}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [dockedTableState, setDockedTableState] = useState<'normal' | 'expanded' | 'collapsed' | 'hidden'>('normal');
  const [dockedFilter, setDockedFilter] = useState('');
  const [copiedDocked, setCopiedDocked] = useState(false);
  const [copiedLinkMap, setCopiedLinkMap] = useState<Record<string, boolean>>({});
  const [uploadingMissingDocKey, setUploadingMissingDocKey] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // graceful ignore
      }
    }
    setCopiedLinkMap((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedLinkMap((prev) => ({ ...prev, [key]: false }));
    }, 2500);
  }, []);

  const handleUploadMissingDoc = useCallback(async (
    msg: ClaimsAiMessage,
    pending: ClaimsAiPendingAction,
    missingDocName: string,
    file: File
  ) => {
    const targetClaim = String(pending.parameters?.claim_id || claimId || '');
    if (!targetClaim) {
      setBanner('לא צוין מספר תיק לשמירת המסמך');
      return;
    }
    setUploadingMissingDocKey(missingDocName);
    try {
      const upRes = await uploadChatAttachmentToClaim(targetClaim, file);
      if (!upRes.success || !upRes.file_id) {
        throw new Error(upRes.error || 'העלאת המסמך נכשלה');
      }
      const newFileId = upRes.file_id;
      const newTitle = file.name;
      const currentIds = Array.isArray(pending.parameters?.file_ids) ? [...(pending.parameters.file_ids as string[])] : [];
      const currentTitles = Array.isArray(pending.parameters?.file_titles) ? [...(pending.parameters.file_titles as string[])] : [];
      const currentMissing = Array.isArray(pending.parameters?.missing_documents) ? [...(pending.parameters.missing_documents as string[])] : [];

      currentIds.push(newFileId);
      currentTitles.push(newTitle);
      const updatedMissing = currentMissing.filter((m) => m !== missingDocName);

      let newShareUrl = String(pending.parameters?.share_url || '');
      let newWaLink = String(pending.parameters?.wa_link || '');
      if (updatedMissing.length === 0) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              action: 'create_share',
              claim_id: targetClaim,
              recipient_name: String(pending.parameters?.recipient_name || 'לקוח'),
              recipient_kind: String(pending.parameters?.recipient_kind || 'client'),
              file_ids: currentIds,
              ttl_hours: Number(pending.parameters?.ttl_hours || 72),
            }),
          });
          const shareData = await res.json();
          if (shareData.token) {
            newShareUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-share/?t=${encodeURIComponent(shareData.token)}`;
            const cleanPhone = String(pending.parameters?.recipient_phone || '').replace(/\D/g, '');
            const waText = `שלום ${String(pending.parameters?.recipient_name || 'לקוח')},\nמצורף קישור מאובטח לצפייה ולהורדת המסמכים בתיק ${targetClaim}:\n${newShareUrl}`;
            newWaLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;
          }
        } catch (err) {
          console.error('Failed minting share token after upload:', err);
        }
      }

      const updatedParams = {
        ...pending.parameters,
        file_ids: currentIds,
        file_titles: currentTitles,
        missing_documents: updatedMissing,
        share_url: newShareUrl || pending.parameters?.share_url,
        wa_link: newWaLink || pending.parameters?.wa_link,
      };

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                metadata: {
                  ...m.metadata,
                  pending_action: {
                    ...pending,
                    parameters: updatedParams,
                  },
                },
              }
            : m
        )
      );
    } catch (err) {
      const em = err instanceof Error ? err.message : 'שגיאה בהעלאת המסמך החסר';
      setBanner(em);
    } finally {
      setUploadingMissingDocKey(null);
    }
  }, [claimId]);

  const handleWhatsAppClick = useCallback((e: React.MouseEvent, waUrl: string) => {
    if (!waUrl) return;
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      e.preventDefault();
      window.location.href = waUrl;
    }
  }, []);

  const handleRemoveRequestedDoc = useCallback((msgId: string, docName: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const p = pendingActionOf(m.metadata);
        if (!p || !p.parameters) return m;
        const current = Array.isArray(p.parameters.requested_documents) ? p.parameters.requested_documents : [];
        const updated = current.filter((d: string) => d !== docName);
        return {
          ...m,
          metadata: {
            ...m.metadata,
            pending_action: {
              ...p,
              parameters: {
                ...p.parameters,
                requested_documents: updated,
              },
            },
          },
        };
      })
    );
  }, []);

  const handleRemoveProvidedForm = useCallback((msgId: string, formName: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const p = pendingActionOf(m.metadata);
        if (!p || !p.parameters) return m;
        const current = Array.isArray(p.parameters.provided_forms) ? p.parameters.provided_forms : [];
        const updated = current.filter((f: string) => f !== formName);
        return {
          ...m,
          metadata: {
            ...m.metadata,
            pending_action: {
              ...p,
              parameters: {
                ...p.parameters,
                provided_forms: updated,
              },
            },
          },
        };
      })
    );
  }, []);

  const [uploadingFormForMsg, setUploadingFormForMsg] = useState<string | null>(null);
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const currentFormTargetRef = useRef<{ msgId: string; claimId: string } | null>(null);

  const handleTriggerFormUpload = useCallback((msgId: string, targetClaimId: string) => {
    currentFormTargetRef.current = { msgId, claimId: targetClaimId };
    formFileInputRef.current?.click();
  }, []);

  const handleFormFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentFormTargetRef.current) return;
    const { msgId, claimId: targetClaim } = currentFormTargetRef.current;
    setUploadingFormForMsg(msgId);
    try {
      const res = await uploadChatAttachmentToClaim(targetClaim, file);
      if (res.success) {
        const formName = file.name.replace(/\.[^/.]+$/, '');
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const p = pendingActionOf(m.metadata);
            if (!p || !p.parameters) return m;
            const forms = Array.isArray(p.parameters.provided_forms) ? [...p.parameters.provided_forms] : [];
            if (!forms.includes(formName)) forms.push(formName);
            const missing = Array.isArray(p.parameters.missing_forms)
              ? p.parameters.missing_forms.filter((mName: string) => mName !== formName)
              : [];
            return {
              ...m,
              metadata: {
                ...m.metadata,
                pending_action: {
                  ...p,
                  parameters: {
                    ...p.parameters,
                    provided_forms: forms,
                    missing_forms: missing,
                  },
                },
              },
            };
          })
        );
      } else {
        setBanner(`העלאת הטופס נכשלה: ${res.error || 'שגיאה לא ידועה'}`);
      }
    } finally {
      setUploadingFormForMsg(null);
      e.target.value = '';
    }
  }, []);

  const isSubmittingRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [batchUploadProgress, setBatchUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const prevClaimIdRef = useRef<string | null>(claimId);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const updateSize = () => {
      if (!vv) return;
      setViewportHeight(vv.height);
      document.documentElement.style.setProperty('--app-viewport-height', `${vv.height}px`);
    };
    vv.addEventListener('resize', updateSize);
    vv.addEventListener('scroll', updateSize);
    updateSize();
    return () => {
      vv.removeEventListener('resize', updateSize);
      vv.removeEventListener('scroll', updateSize);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceToBottom < 90;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = threadRef.current;
    if (!el) return;
    try {
      if (smooth && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    } catch {
      el.scrollTop = el.scrollHeight;
    }
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isListeningRef = useRef(false);
  const isManualStopRef = useRef(false);
  const baseInputRef = useRef('');
  const finalTranscriptRef = useRef('');
  const inputRef = useRef(input);
  inputRef.current = input;
  const sendRef = useRef<(text: string, source: 'text' | 'voice') => Promise<void>>(async () => {});
  const executingRef = useRef<Set<string>>(new Set());
  const confirmRef = useRef<(msg: ClaimsAiMessage, pending: ClaimsAiPendingAction) => Promise<void>>(async () => {});
  const cancelRef = useRef<(msg: ClaimsAiMessage, pending: ClaimsAiPendingAction) => Promise<void>>(async () => {});

  const currentUtterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceModeActiveRef = useRef(false);
  const voiceRecognitionRef = useRef<SpeechRec | null>(null);
  const voiceSilenceTimerRef = useRef<any>(null);
  const voicePhaseRef = useRef<'idle' | 'listening' | 'processing' | 'speaking'>('idle');

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();
      } catch {}
    }
    currentUtterRef.current = null;
    setSpeakingMsgId(null);
  }, []);

  const speakAnswer = useCallback((msgId: string, rawText: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    stopSpeaking();

    const clean = cleanTextForSpeech(rawText);
    if (!clean) {
      onEndCallback?.();
      return;
    }

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'he-IL';
    utter.rate = 1.0;
    currentUtterRef.current = utter;
    setSpeakingMsgId(msgId);

    utter.onend = () => {
      currentUtterRef.current = null;
      setSpeakingMsgId(null);
      onEndCallback?.();
    };
    utter.onerror = () => {
      currentUtterRef.current = null;
      setSpeakingMsgId(null);
      onEndCallback?.();
    };

    try {
      window.speechSynthesis.speak(utter);
    } catch {
      setSpeakingMsgId(null);
      onEndCallback?.();
    }
  }, [stopSpeaking]);

  const stopVoiceRecognition = useCallback(() => {
    if (voiceSilenceTimerRef.current) {
      clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (voiceRecognitionRef.current) {
      try {
        voiceRecognitionRef.current.onresult = null;
        voiceRecognitionRef.current.onerror = null;
        voiceRecognitionRef.current.onend = null;
        voiceRecognitionRef.current.stop();
      } catch {}
      voiceRecognitionRef.current = null;
    }
  }, []);

  const startVoiceListening = useCallback(() => {
    if (!voiceModeActiveRef.current) return;
    stopVoiceRecognition();
    stopSpeaking();

    const Ctor = speechCtor();
    if (!Ctor) {
      setVoiceModeActive(false);
      voiceModeActiveRef.current = false;
      setBanner('זיהוי דיבור אינו נתמך בדפדפן זה.');
      return;
    }

    voicePhaseRef.current = 'listening';
    setVoicePhase('listening');
    setLiveTranscript('');

    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      if (!voiceModeActiveRef.current || voicePhaseRef.current !== 'listening') return;
      let sessionFinal = '';
      let sessionInterim = '';
      for (let i = 0; i < ev.results.length; i += 1) {
        const item = ev.results[i];
        const piece = item[0]?.transcript?.trim() || '';
        if (!piece) continue;
        if (item.isFinal) {
          sessionFinal = sessionFinal ? `${sessionFinal} ${piece}` : piece;
        } else {
          sessionInterim = sessionInterim ? `${sessionInterim} ${piece}` : piece;
        }
      }
      const full = [sessionFinal, sessionInterim].filter(Boolean).join(' ').trim();
      setLiveTranscript(full);

      if (voiceSilenceTimerRef.current) {
        clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }

      if (full) {
        voiceSilenceTimerRef.current = setTimeout(() => {
          if (!voiceModeActiveRef.current || voicePhaseRef.current !== 'listening') return;
          const userText = full.trim();
          if (!userText) return;

          stopVoiceRecognition();
          voicePhaseRef.current = 'processing';
          setVoicePhase('processing');
          setLiveTranscript('');

          void sendRef.current(userText, 'voice');
        }, 1300);
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed') {
        setVoiceModeActive(false);
        voiceModeActiveRef.current = false;
        setVoicePhase('idle');
        setBanner('הגישה למיקרופון נחסמה בהגדרות הדפדפן.');
        stopVoiceRecognition();
      }
    };

    rec.onend = () => {
      if (voiceModeActiveRef.current && voicePhaseRef.current === 'listening') {
        try {
          rec.start();
        } catch {
          setTimeout(() => {
            if (voiceModeActiveRef.current && voicePhaseRef.current === 'listening') {
              startVoiceListening();
            }
          }, 300);
        }
      }
    };

    voiceRecognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setTimeout(() => {
        if (voiceModeActiveRef.current && voicePhaseRef.current === 'listening') {
          startVoiceListening();
        }
      }, 300);
    }
  }, [stopSpeaking, stopVoiceRecognition]);

  const handleInterruptSpeech = useCallback(() => {
    stopSpeaking();
    if (voiceModeActiveRef.current) {
      setTimeout(() => {
        if (voiceModeActiveRef.current) {
          startVoiceListening();
        }
      }, 200);
    }
  }, [stopSpeaking, startVoiceListening]);

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeActive) {
      voiceModeActiveRef.current = false;
      setVoiceModeActive(false);
      voicePhaseRef.current = 'idle';
      setVoicePhase('idle');
      setLiveTranscript('');
      stopSpeaking();
      stopVoiceRecognition();
    } else {
      if (!speechCtor()) {
        setBanner('הדפדפן אינו תומך בזיהוי קולי רציף (נתמך ב-Chrome, Edge ו-Safari).');
        return;
      }
      stopSpeaking();
      if (isListeningRef.current) {
        isManualStopRef.current = true;
        isListeningRef.current = false;
        setListening(false);
        try { recognitionRef.current?.stop(); } catch {}
      }
      voiceModeActiveRef.current = true;
      setVoiceModeActive(true);
      startVoiceListening();
    }
  }, [voiceModeActive, stopSpeaking, stopVoiceRecognition, startVoiceListening]);

  const handleCopyText = useCallback((msgId: string, text: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedMsgId(msgId);
    setTimeout(() => {
      setCopiedMsgId((cur) => (cur === msgId ? null : cur));
    }, 2000);
  }, []);

  const handleStopAi = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && !m.metadata?.error) {
        const blocks = parseBlocks(m.content);
        const tables = blocks.filter((b) => b.type === 'table' && b.headers && b.rows && b.rows.length > 0);
        if (tables.length > 0) {
          const firstTbl = tables[0];
          const allRows = tables.flatMap((t) => t.rows || []);
          let reportTitle = m.content.split('\n')[0]?.replace(/[#*`]/g, '').trim() || 'דוח תביעות פתוחות';
          if (!reportTitle.includes('תביעות פתוחות') && !reportTitle.includes('סה״כ')) {
            reportTitle = `${reportTitle} (סה״כ תביעות פתוחות: ${allRows.length})`;
          }
          const reportData = {
            headers: firstTbl.headers || [],
            rows: allRows,
            title: reportTitle,
            updatedAt: new Date(m.created_at || Date.now()).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
          };
          setDockedReport(reportData);
          try {
            sessionStorage.setItem(`claims_ai_docked_${userId}`, JSON.stringify(reportData));
          } catch {}
          break;
        }
      }
    }
  }, [messages, userId]);

  const filteredDockedRows = useMemo(() => {
    if (!dockedReport) return [];
    if (!dockedFilter.trim()) return dockedReport.rows;
    const q = dockedFilter.trim().toLowerCase();
    return dockedReport.rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));
  }, [dockedReport, dockedFilter]);

  const handleCopyDockedTsv = useCallback(() => {
    if (!dockedReport) return;
    const tsv = [
      dockedReport.headers.join('\t'),
      ...filteredDockedRows.map((r) => r.join('\t')),
    ].join('\n');
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tsv);
    }
    setCopiedDocked(true);
    setTimeout(() => setCopiedDocked(false), 2000);
  }, [dockedReport, filteredDockedRows]);

  useEffect(() => {
    setMicOk(!!speechCtor() && !!window.isSecureContext);
  }, []);

  useEffect(() => {
    if (!open) {
      stopSpeaking();
      if (voiceModeActiveRef.current) {
        voiceModeActiveRef.current = false;
        setVoiceModeActive(false);
        voicePhaseRef.current = 'idle';
        setVoicePhase('idle');
        stopVoiceRecognition();
      }
    }
  }, [open, stopSpeaking, stopVoiceRecognition]);

  useEffect(() => {
    stopSpeaking();
  }, [activeId, stopSpeaking]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopVoiceRecognition();
      if (recognitionRef.current) {
        isManualStopRef.current = true;
        isListeningRef.current = false;
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [stopSpeaking, stopVoiceRecognition]);

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

    const fileList = files.slice(0, 150);
    if (files.length > 150) {
      errors.push('ניתן להעלות עד 150 קבצים בפעולה אחת. נבחרו 150 הקבצים הראשונים.');
    }

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const mime = f.type.toLowerCase();
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      const isImageExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      const isPdfExt = ext === 'pdf';

      if (!allowed.includes(mime) && !isImageExt && !isPdfExt) {
        errors.push(`הקובץ "${f.name}" אינו נתמך (נתמכים: JPG, PNG, WEBP, PDF)`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        errors.push(`הקובץ "${f.name}" גדול מדי (מקסימום 25MB לקובץ בודד)`);
        continue;
      }

      const isImage = mime.startsWith('image/') || isImageExt;
      // Only generate preview URLs for the first 12 images to avoid browser DOM & memory exhaustion with 120 files
      const previewUrl = isImage && i < 12 ? URL.createObjectURL(f) : undefined;
      newStaged.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
        file: f,
        name: f.name,
        size: f.size,
        mimeType: mime || (isPdfExt ? 'application/pdf' : 'image/jpeg'),
        previewUrl,
      });
    }

    if (errors.length > 0) {
      setBanner(errors.slice(0, 3).join('\n') + (errors.length > 3 ? ` ועוד ${errors.length - 3} שגיאות` : ''));
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
    if (prevClaimIdRef.current !== claimId) {
      prevClaimIdRef.current = claimId;
      setMessages([]);
      setInput('');
      setStagedAttachments([]);
      setPendingDelete(null);
      void loadList();
    } else if (conversations.length === 0) {
      void loadList();
    }
  }, [open, claimId, loadList, conversations.length]);

  useEffect(() => {
    if (!open || !activeId) {
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
        return;
      }
      setMessages(res.data || []);
      writeActiveId(userId, claimId, activeId);
    });
    return () => { cancelled = true; };
  }, [open, activeId, conversations, claimId, userId]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      const el = threadRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string, source: 'text' | 'voice') => {
    if (isSubmittingRef.current) return;
    const trimmed = text.trim();
    if ((!trimmed && stagedAttachments.length === 0) || loading) return;

    isSubmittingRef.current = true;

    // Clear input box immediately upon send
    setInput('');
    if (textareaRef.current) textareaRef.current.value = '';

    scrollToBottom(true);

    // Stop one-off dictation immediately if active so it does not re-populate the input
    if (isListeningRef.current) {
      isManualStopRef.current = true;
      isListeningRef.current = false;
      setListening(false);
      try { recognitionRef.current?.stop(); } catch {}
    }
    baseInputRef.current = '';
    finalTranscriptRef.current = '';

    // Typed approval: "מאשר" / "שלח" approves the card currently shown (and only that one). The model is not
    // involved, so it cannot send anything on its own; the same server path as the card button executes it.
    if (trimmed && stagedAttachments.length === 0 && (isApprovalText(trimmed) || isCancelText(trimmed))) {
      let target: { msg: ClaimsAiMessage; pending: ClaimsAiPendingAction } | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if ((m.metadata as Record<string, unknown> | null)?.error) continue;
        const p = pendingActionOf(m.metadata);
        if (p && p.status === 'pending') {
          target = { msg: m, pending: p };
          break;
        }
      }
      if (target && activeId) {
        setInput('');
        if (textareaRef.current) textareaRef.current.value = '';
        const userRow = await insertClaimsAiMessage({
          conversationId: activeId,
          role: 'user',
          content: trimmed,
          metadata: { claim_id: claimId, source, typed_decision: isApprovalText(trimmed) ? 'approve' : 'cancel', preview_id: target.pending.preview_id },
        });
        if (userRow.data) setMessages((prev) => [...prev, userRow.data!]);
        if (isApprovalText(trimmed)) await confirmRef.current(target.msg, target.pending);
        else await cancelRef.current(target.msg, target.pending);
        return;
      }
    }
    const effectiveText = trimmed || (stagedAttachments.length === 1 ? 'צירפתי קובץ לבדיקה' : 'צירפתי קבצים לבדיקה');
    const filesToUpload = [...stagedAttachments];

    setStagedAttachments([]);
    setLoading(true);
    setBanner('');
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let didTimeout = false;
    const timeoutTimer = setTimeout(() => {
      didTimeout = true;
      try {
        controller.abort();
      } catch {}
    }, 55000);
    let conversationId = activeId;
    let draft = '';
    let userSavedSuccessfully = false;
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

      const BATCH_SIZE = 10;
      for (let b = 0; b < filesToUpload.length; b += BATCH_SIZE) {
        const chunk = filesToUpload.slice(b, b + BATCH_SIZE);
        if (filesToUpload.length > 5) {
          setBatchUploadProgress({ current: Math.min(b + BATCH_SIZE, filesToUpload.length), total: filesToUpload.length });
        }
        await Promise.all(chunk.map(async (staged, cIdx) => {
          const globalIdx = b + cIdx;
          try {
            let fileId: string | undefined = undefined;
            if (claimId) {
              for (let att = 1; att <= 2; att++) {
                try {
                  const upRes = await uploadChatAttachmentToClaim(claimId, staged.file);
                  if (upRes.success && upRes.file_id) {
                    fileId = upRes.file_id;
                    break;
                  }
                } catch {
                  if (att === 2) throw new Error('upload_failed');
                }
              }
            }
            let base64: string | undefined = undefined;
            if (filesToUpload.length <= 5 && staged.size < 4 * 1024 * 1024) {
              base64 = await readFileAsBase64(staged.file);
            } else if (globalIdx < 3 && staged.mimeType.startsWith('image/') && staged.size < 2 * 1024 * 1024) {
              base64 = await readFileAsBase64(staged.file);
            }
            finalAttachments[globalIdx] = {
              name: staged.name,
              mime_type: staged.mimeType,
              byte_size: staged.size,
              file_id: fileId,
              data_base64: base64,
              preview_url: staged.previewUrl,
            };
          } catch (err) {
            console.error('Failed reading/uploading attachment:', staged.name, err);
          }
        }));
      }
      setBatchUploadProgress(null);

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
      userSavedSuccessfully = true;
      const history = [...messages, userSaved.data];
      setMessages(history);

      let pendingFromStream: ClaimsAiPendingAction | null = null;
      const detectedClaimId = claimId || (effectiveText.match(/DAL-\d{4}-\d{4}/)?.[0] ?? null);
      const effectiveTargetClaim = claimId || detectedClaimId;
      const answer = await streamHelpAi({
        messages: messagesForModel(history),
        claimId: effectiveTargetClaim,
        companyName,
        signal: controller.signal,
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
          ...(answer.documentCards.length ? { document_cards: answer.documentCards } : {}),
          ...(answer.toolsUsed ? { tools_used: answer.toolsUsed } : {}),
        },
      });
      if (saved.error || !saved.data) throw new Error(saved.error?.message || 'שמירת התשובה נכשלה');
      setMessages([...history, saved.data]);
      setConversations((prev) => prev.map((row) => row.id === conversationId ? { ...row, updated_at: saved.data!.created_at } : row));

      // Continuous Voice Mode: automatically speak the response and resume listening
      if (voiceModeActiveRef.current) {
        voicePhaseRef.current = 'speaking';
        setVoicePhase('speaking');
        stopVoiceRecognition();
        speakAnswer('voice-continuous', answer.text || draft, () => {
          if (voiceModeActiveRef.current) {
            setTimeout(() => {
              if (voiceModeActiveRef.current) {
                startVoiceListening();
              }
            }, 350);
          }
        });
      }
    } catch (err) {
      if (!userSavedSuccessfully) {
        setInput(trimmed);
      }
      if (voiceModeActiveRef.current) {
        setTimeout(() => {
          if (voiceModeActiveRef.current) {
            startVoiceListening();
          }
        }, 500);
      }
      if (didTimeout) {
        const timeoutMsg = 'זמן ההמתנה לתשובה עבר (שגיאת Timeout). שרת ה-AI התעכב במענה. אנא נסה שוב או נסח מחדש.';
        setBanner(timeoutMsg);
        if (conversationId) {
          const failed = await insertClaimsAiMessage({
            conversationId,
            role: 'assistant',
            content: timeoutMsg,
            metadata: { error: true, timeout: true, claim_id: claimId },
          });
          if (failed.data) {
            setMessages((prev) => [...prev.filter((m) => m.id !== 'draft'), failed.data!]);
          }
        }
        return;
      }
      const isAbort = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
      if (isAbort) {
        if (conversationId && draft.trim()) {
          const abortedMsg = await insertClaimsAiMessage({
            conversationId,
            role: 'assistant',
            content: `${draft}\n\n*(התשובה נעצרה על ידי המשתמש)*`,
            metadata: { claim_id: claimId, stopped: true },
          });
          if (abortedMsg.data) {
            setMessages((prev) => [...prev.filter((m) => m.id !== 'draft'), abortedMsg.data!]);
          }
        } else if (conversationId) {
          const abortedMsg = await insertClaimsAiMessage({
            conversationId,
            role: 'assistant',
            content: `*(התשובה נעצרה על ידי המשתמש טרם התקבל מענה)*`,
            metadata: { claim_id: claimId, stopped: true },
          });
          if (abortedMsg.data) {
            setMessages((prev) => [...prev.filter((m) => m.id !== 'draft'), abortedMsg.data!]);
          }
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== 'draft'));
        }
        return;
      }
      const rawMsg = err instanceof Error ? err.message : 'שגיאה';
      let message = rawMsg;
      if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('Load failed')) {
        message = 'שגיאת תקשורת עם שרת דליה (Failed to fetch). נא לבדוק את חיבור האינטרנט ולנסות שוב.';
      } else if (rawMsg.includes('504') || rawMsg.includes('503')) {
        message = 'שרת ה-AI עמוס כרגע (שגיאת עומס 504/503). אנא נסה שוב בעוד מספר רגעים.';
      }
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
      clearTimeout(timeoutTimer);
      abortControllerRef.current = null;
      isSubmittingRef.current = false;
      setBatchUploadProgress(null);
      setLoading(false);
    }
  }, [activeId, claimId, companyName, conversations, loading, messages, stagedAttachments, userId]);

  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  const handleConfirmPending = useCallback(async (msg: ClaimsAiMessage, pending: ClaimsAiPendingAction) => {
    // One execution per card: a double click, or a typed "מאשר" right after a click, must never send twice.
    const guardKey = pending.preview_id || msg.id;
    if (executingRef.current.has(guardKey)) return;
    executingRef.current.add(guardKey);
    setExecutingActionId(msg.id);
    setBanner('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData?.session;
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60000)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) session = refreshed.session;
      }
      if (!session?.access_token) throw new Error('יש להתחבר למערכת');

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({
          action: 'execute_pending_action',
          claim_id: claimId || (pending.parameters as Record<string, unknown>)?.claim_id || null,
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
            claim_id: claimId || (pending.parameters as Record<string, unknown>)?.claim_id || null,
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
      onActionExecuted?.(pending);
    } catch (err) {
      // Failure: keep guardKey for 1500ms cooldown to prevent accidental rapid double-tap on mobile
      setTimeout(() => {
        executingRef.current.delete(guardKey);
      }, 1500);
      const message = err instanceof Error ? err.message : 'שגיאה בביצוע הפעולה';
      setBanner(message);
      if (activeId) {
        const errorContent = `❌ הפעולה לא בוצעה: ${message}`;
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.content === errorContent) {
            return prev;
          }
          // Insert asynchronously into DB without duplicating
          void insertClaimsAiMessage({
            conversationId: activeId,
            role: 'assistant',
            content: errorContent,
            metadata: { error: true, claim_id: claimId, preview_id: pending.preview_id },
          }).then((res) => {
            if (res.data) {
              setMessages((curr) => curr.map((m) => m.id === 'temp-error' ? res.data! : m));
            }
          });
          return [...prev, {
            id: `err-${Date.now()}`,
            conversation_id: activeId,
            role: 'assistant',
            content: errorContent,
            metadata: { error: true, claim_id: claimId, preview_id: pending.preview_id },
            created_at: new Date().toISOString(),
          }];
        });
      }
    } finally {
      setExecutingActionId(null);
    }
  }, [activeId, claimId, onActionExecuted]);

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

  useEffect(() => {
    confirmRef.current = handleConfirmPending;
    cancelRef.current = handleCancelPending;
  }, [handleConfirmPending, handleCancelPending]);

  const toggleMic = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening || isListeningRef.current) {
      isManualStopRef.current = true;
      isListeningRef.current = false;
      setListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      baseInputRef.current = inputRef.current.trim();
      return;
    }

    // Stop voice mode & TTS if active to prevent dual recording
    stopVoiceRecognition();
    stopSpeaking();

    isManualStopRef.current = false;
    isListeningRef.current = true;
    baseInputRef.current = inputRef.current.trim();

    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      if (!isListeningRef.current || isManualStopRef.current) return;
      let sessionFinal = '';
      let sessionInterim = '';
      for (let i = 0; i < ev.results.length; i += 1) {
        const item = ev.results[i];
        const piece = item[0]?.transcript?.trim() || '';
        if (!piece) continue;
        if (item.isFinal) {
          sessionFinal = sessionFinal ? `${sessionFinal} ${piece}` : piece;
        } else {
          sessionInterim = sessionInterim ? `${sessionInterim} ${piece}` : piece;
        }
      }
      const full = [baseInputRef.current, sessionFinal, sessionInterim]
        .filter(Boolean)
        .join(' ')
        .trim();
      setInput(full);
      inputRef.current = full;
    };

    rec.onerror = (ev) => {
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setBanner('זיהוי הדיבור נתקל בשגיאה. הטקסט שהוקלט נשמר בתיבה, ואפשר להמשיך להקליד.');
      }
      if (ev.error === 'not-allowed') {
        isManualStopRef.current = true;
        isListeningRef.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      if (isListeningRef.current && !isManualStopRef.current) {
        // Commit current text to baseInputRef before restarting session
        baseInputRef.current = inputRef.current.trim();
        try {
          rec.start();
          return;
        } catch {
          // Restart failed, stop gracefully
        }
      }
      isListeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setBanner('');
    } catch {
      isListeningRef.current = false;
      setListening(false);
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
      style={viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : undefined}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className={`claims-ai-voice-call-btn${voiceModeActive ? ' active' : ''}`}
              data-testid="claims-ai-voice-call-toggle"
              onClick={toggleVoiceMode}
              title={voiceModeActive ? 'סיים שיחה קולית רציפה' : 'התחל שיחה קולית רציפה (Hands-Free)'}
            >
              {voiceModeActive ? '🔴 סיים שיחה קולית' : '🎙️ התחל שיחה קולית'}
            </button>
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

        {voiceModeActive ? (
          <div className={`claims-ai-voice-mode-bar phase-${voicePhase}`} data-testid="claims-ai-voice-mode-bar">
            <div className="claims-ai-voice-mode-status">
              <span className="claims-ai-voice-pulse-dot" />
              <span>
                {voicePhase === 'listening' && (liveTranscript ? `מאזין: "${liveTranscript}"` : '🎙️ דליה מאזינה... דבר כעת')}
                {voicePhase === 'processing' && '⏳ דליה מעבדת את הדברים...'}
                {voicePhase === 'speaking' && '🔊 דליה מדברת... (המיקרופון מושהה למניעת הד)'}
                {voicePhase === 'idle' && 'שיחה קולית רציפה פעילה'}
              </span>
            </div>
            <div className="claims-ai-voice-mode-actions">
              {voicePhase === 'speaking' ? (
                <button
                  type="button"
                  className="claims-ai-voice-bar-btn stop"
                  data-testid="claims-ai-voice-interrupt-btn"
                  onClick={handleInterruptSpeech}
                  title="עצור את דליה וחזור להאזנה"
                >
                  ⏹️ התפרץ / עצור דיבור
                </button>
              ) : null}
              <button
                type="button"
                className="claims-ai-voice-bar-btn exit"
                data-testid="claims-ai-voice-end-btn"
                onClick={toggleVoiceMode}
                title="סיים שיחה קולית"
              >
                ✕ סיים שיחה
              </button>
            </div>
          </div>
        ) : speakingMsgId ? (
          <div className="claims-ai-speaking-bar" data-testid="claims-ai-speaking-bar">
            <span>🔊 דליה מקריאה תשובה ברמקול...</span>
            <button
              type="button"
              className="claims-ai-voice-bar-btn stop"
              data-testid="claims-ai-stop-speaking-global"
              onClick={stopSpeaking}
              title="עצור הקראה קולית"
            >
              ⏹️ עצור הקראה
            </button>
          </div>
        ) : null}

        <div className="claims-ai-thread" ref={threadRef} onScroll={handleScroll} data-testid="claims-ai-thread">
          {batchUploadProgress ? (
            <div className="claims-ai-upload-progress" data-testid="claims-ai-upload-progress">
              ⏳ מעלה {batchUploadProgress.current} מתוך {batchUploadProgress.total} קבצים במנות מאובטחות…
            </div>
          ) : null}
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
                  <ClaimsMessageContent
                    content={msg.content}
                    onOpenClaim={onOpenClaim}
                    onCopyText={(txt) => void handleCopyText(msg.id, txt)}
                  />
                  {msg.role === 'assistant' && (
                    msg.content.includes('מאגר המסמכים והטפסים') ||
                    msg.content.includes('קטגוריה א:') ||
                    msg.content.includes('חבילת פתיחת תיק') ||
                    (toolTraceOf(msg.metadata) || []).some((t) => t.tool === 'list_available_claim_documents_and_forms')
                  ) ? (
                    <ClaimsCatalogWidget
                      claimId={claimId || String((pendingActionOf(msg.metadata)?.parameters as any)?.claim_id || '')}
                      onUploadCustomFile={async (file, name, cat) => {
                        const target = claimId || String((pendingActionOf(msg.metadata)?.parameters as any)?.claim_id || 'DAL-2026-0249');
                        return uploadChatAttachmentToClaim(target, file, name, cat);
                      }}
                      onPrepareLink={(docs, forms, ttlHours) => {
                        const parts: string[] = ['- שאלון פתיחת תיק: כלול'];
                        if (docs.length > 0) parts.push(`- מסמכים שהלקוח נדרש להעלות: ${docs.join(', ')}`);
                        if (forms.length > 0) parts.push(`- טפסים שהמוסך מספק למילוי וחתימה: ${forms.join(', ')}`);
                        const expLabel = ttlHours === 0 ? 'ללא תאריך תפוגה אוטומטי (פתוח עד לביטול)' : ttlHours === 168 ? 'שבוע (7 ימים)' : `${ttlHours} שעות`;
                        parts.push(`- תוקף הקישור: ${expLabel} (${ttlHours} שעות)`);
                        const targetClaim = claimId || String((pendingActionOf(msg.metadata)?.parameters as any)?.claim_id || '');
                        const prompt = targetClaim
                          ? `דליה, אשר את חבילת פתיחת התיק והפיקי קישור עבור תיק ${targetClaim}:\n${parts.join('\n')}`
                          : `דליה, אשר את חבילת פתיחת התיק והפיקי קישור עבור לקוח חדש:\n${parts.join('\n')}`;
                        void sendMessage(prompt);
                      }}
                    />
                  ) : null}
                  {toolError ? <div className="claims-ai-tool-err">הכלי נכשל: {toolError}</div> : null}
                  {msg.role === 'assistant' && toolTraceOf(msg.metadata) ? (
                    <div
                      className={`claims-ai-sources${(toolTraceOf(msg.metadata) || []).some((t) => t.outcome === 'failed') || !(toolTraceOf(msg.metadata) || []).length ? ' warn' : ''}`}
                      data-testid={`claims-ai-sources-${msg.id}`}
                    >
                      {toolTraceLine(toolTraceOf(msg.metadata) || [])}
                    </div>
                  ) : null}
                  {documentCardsOf(msg.metadata, claimId).map((card) => (
                    <ChatDocumentCard key={card.file_id} card={card} actions={documentActions || remoteDocumentActions(card.claim_id, card.original_name)} />
                  ))}
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
                      {pending.action_type === 'send_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-recipients"
                          style={{
                            margin: '8px 0',
                            fontSize: '0.82rem',
                            background: 'rgba(0,0,0,0.03)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            lineHeight: '1.5',
                            border: '1px solid rgba(0,0,0,0.06)',
                          }}
                        >
                          <div><strong>נמען (To):</strong> {String(pending.parameters.to || '')}</div>
                          {pending.parameters.cc ? <div><strong>עותק (CC):</strong> {String(pending.parameters.cc)}</div> : null}
                          {pending.parameters.bcc ? <div><strong>עותק מוסתר (BCC):</strong> {String(pending.parameters.bcc)}</div> : null}
                          {pending.parameters.subject ? <div><strong>נושא:</strong> {String(pending.parameters.subject)}</div> : null}
                        </div>
                      ) : null}
                      {pending.action_type === 'batch_send_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-batch"
                          style={{
                            margin: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {(((pending.parameters as any).actions as ClaimsAiPendingAction[]) || []).map((sub, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: 'rgba(0,0,0,0.03)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                fontSize: '0.82rem',
                                lineHeight: '1.5',
                              }}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--c-primary, #2563eb)' }}>
                                הודעה {idx + 1} מתוך {String((pending.parameters as any).count || ((pending.parameters as any).actions || []).length)}
                                {sub.parameters?.claim_id ? ` · תיק ${String(sub.parameters.claim_id)}` : ''}
                              </div>
                              <div><strong>נמען:</strong> {String(sub.parameters?.to || '')}</div>
                              {sub.parameters?.cc ? <div><strong>CC:</strong> {String(sub.parameters.cc)}</div> : null}
                              {sub.parameters?.subject ? <div><strong>נושא:</strong> {String(sub.parameters.subject)}</div> : null}
                              {Array.isArray(sub.parameters?.attachment_titles) && (sub.parameters.attachment_titles as string[]).length > 0 ? (
                                <div><strong>מסמכים:</strong> {(sub.parameters.attachment_titles as string[]).join(', ')}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {pending.action_type === 'import_claim_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-import"
                          style={{
                            margin: '8px 0',
                            fontSize: '0.82rem',
                            background: 'rgba(0,0,0,0.03)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            lineHeight: '1.5',
                            border: '1px solid rgba(0,0,0,0.06)',
                          }}
                        >
                          <div><strong>תיק תביעה:</strong> {String(pending.parameters.claim_id || '')}</div>
                          <div><strong>שולח:</strong> {String(pending.parameters.from_addr || '')}</div>
                          <div><strong>נושא המייל:</strong> {String(pending.parameters.subject || '')}</div>
                          <div><strong>קבצים לייבוא:</strong> {String(pending.parameters.attachment_count || 0)} קבצים (יורדו במנות תוך מניעת כפילויות)</div>
                        </div>
                      ) : null}
                      {pending.action_type === 'schedule_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-schedule"
                          style={{
                            margin: '8px 0',
                            fontSize: '0.82rem',
                            background: 'rgba(37, 99, 235, 0.05)',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            lineHeight: '1.6',
                            border: '1px solid rgba(37, 99, 235, 0.15)',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: 'var(--c-primary, #2563eb)', marginBottom: 4 }}>
                            📅 מועד שליחה מתוכנן: {String(pending.parameters.scheduled_label || pending.parameters.send_at || '')}
                          </div>
                          <div><strong>נמען:</strong> {String(pending.parameters.to || '')}</div>
                          {pending.parameters.cc ? <div><strong>CC:</strong> {String(pending.parameters.cc)}</div> : null}
                          {pending.parameters.bcc ? <div><strong>BCC:</strong> {String(pending.parameters.bcc)}</div> : null}
                          {pending.parameters.subject ? <div><strong>נושא:</strong> {String(pending.parameters.subject)}</div> : null}
                          {Array.isArray(pending.parameters.attachment_titles) && (pending.parameters.attachment_titles as string[]).length > 0 ? (
                            <div><strong>מסמכים מצורפים:</strong> {(pending.parameters.attachment_titles as string[]).join(', ')}</div>
                          ) : null}
                          <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--c-emerald, #10b981)', fontWeight: 600 }}>
                            ⚡ אישור מראש: המערכת תשלח את האימייל אוטומטית במועד שנקבע ללא צורך באישור נוסף. ניתן לבטל עד מועד השליחה.
                          </div>
                        </div>
                      ) : null}
                      {pending.action_type === 'cancel_scheduled_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-cancel-schedule"
                          style={{
                            margin: '8px 0',
                            fontSize: '0.82rem',
                            background: 'rgba(239, 68, 68, 0.05)',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            lineHeight: '1.6',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                            🚫 ביטול אימייל מתוזמן
                          </div>
                          <div><strong>מזהה תזמון:</strong> {String(pending.parameters.reminder_id || '')}</div>
                          <div><strong>נמען:</strong> {String(pending.parameters.mail_to || '')}</div>
                          <div><strong>נושא:</strong> {String(pending.parameters.subject || '')}</div>
                          <div><strong>מועד מתוכנן:</strong> {String(pending.parameters.planned_label || '')}</div>
                        </div>
                      ) : null}
                      {((pending.action_type === 'send_customer_intake_link') || (pending.action_type === 'send_customer_link' && pending.parameters?.link_type !== 'upload')) && pending.parameters ? (
                        <div
                          className="claims-ai-preview-custlink"
                          data-testid="claims-ai-preview-intake-card"
                          style={{
                            margin: '10px 0',
                            fontSize: '0.85rem',
                            background: '#071022',
                            color: '#f8fafc',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            lineHeight: '1.6',
                            border: '1.5px solid #10b981',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontWeight: 800, color: '#34d399', fontSize: '0.95rem' }}>
                              📝 כרטיס אישור – קישור פתיחת תיק חדש ללקוח (claims-intake)
                            </div>
                            {pending.parameters.claim_id ? (
                              <span style={{ fontSize: '0.75rem', background: '#064e3b', color: '#6ee7b7', border: '1px solid #059669', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                                ממתין למילוי הלקוח
                              </span>
                            ) : null}
                          </div>

                          {pending.parameters.claim_id ? (
                            <div style={{ marginBottom: 6, fontSize: '0.9rem' }}>
                              <strong style={{ color: '#cbd5e1' }}>מספר תיק שיוקצה:</strong>{' '}
                              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#38bdf8', fontSize: '1rem' }}>
                                {String(pending.parameters.claim_id)}
                              </span>
                            </div>
                          ) : null}

                          <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>שם הלקוח:</strong> {String(pending.parameters.recipient_name || 'לקוח')}</div>
                          {pending.parameters.recipient_phone ? <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>טלפון (WhatsApp):</strong> {String(pending.parameters.recipient_phone)}</div> : null}
                          {pending.parameters.recipient_email ? <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>אימייל:</strong> {String(pending.parameters.recipient_email)}</div> : null}
                          <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>ערוץ שליחה:</strong> {String(pending.parameters.channel || 'copy') === 'whatsapp' ? 'WhatsApp' : String(pending.parameters.channel) === 'email' ? 'אימייל' : String(pending.parameters.channel) === 'both' ? 'אימייל + WhatsApp' : 'העתקת קישור'}</div>
                          <div style={{ color: '#e2e8f0', marginTop: 2 }}>
                            <strong style={{ color: '#cbd5e1' }}>תוקף הקישור:</strong>{' '}
                            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                              {String(pending.parameters.expires_label || (pending.parameters.expires_in_hours === 0 ? 'ללא תאריך תפוגה אוטומטי (פתוח עד לביטול)' : `${pending.parameters.expires_in_hours || 24} שעות`))}
                            </span>
                          </div>

                          {/* Category A: Requested documents from customer */}
                          {Array.isArray(pending.parameters.requested_documents) && pending.parameters.requested_documents.length > 0 ? (
                            <div style={{ marginTop: 8, background: '#0c1b33', padding: '8px 12px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
                              <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 800, marginBottom: 4 }}>
                                📥 מסמכים שהלקוח נדרש להעלות ({pending.parameters.requested_documents.length}):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {pending.parameters.requested_documents.map((doc: string, idx: number) => (
                                  <span
                                    key={idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      background: '#0369a1',
                                      color: '#ffffff',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '3px 8px',
                                      borderRadius: 10,
                                      border: '1px solid #38bdf8',
                                    }}
                                  >
                                    ✓ {doc}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Category B: Provided forms to sign/fill */}
                          {Array.isArray(pending.parameters.provided_forms) && pending.parameters.provided_forms.length > 0 ? (
                            <div style={{ marginTop: 8, background: '#0a231b', padding: '8px 12px', borderRadius: '8px', border: '1px solid #14532d' }}>
                              <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 800, marginBottom: 4 }}>
                                📝 טפסים שאנו מספקים ללקוח למילוי וחתימה ({pending.parameters.provided_forms.length}):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {pending.parameters.provided_forms.map((form: string, idx: number) => (
                                  <span
                                    key={idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      background: '#15803d',
                                      color: '#ffffff',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '3px 8px',
                                      borderRadius: 10,
                                      border: '1px solid #4ade80',
                                    }}
                                  >
                                    ✍️ {form}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {pending.parameters.intake_url ? (
                            <div style={{ marginTop: 10, background: '#0f172a', padding: '8px 12px', borderRadius: '8px', border: '1px solid #334155', wordBreak: 'break-all' }}>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>כתובת קישור טופס פתיחת התיק:</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4ade80', fontWeight: 700 }}>
                                {String(pending.parameters.intake_url)}
                              </div>
                            </div>
                          ) : null}

                          {/* Interactive Preview Buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginTop: 12 }}>
                            {pending.parameters.intake_url ? (
                              <a
                                href={String(pending.parameters.intake_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-open-intake-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '42px',
                                  padding: '8px 12px',
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1.5px solid #475569',
                                }}
                                title="פותח את טופס הלקוח בטאב חדש לבדיקה בלבד (ללא שליחה וללא כפילויות)"
                              >
                                👁️ פתח ובדוק קישור
                              </a>
                            ) : null}

                            {pending.parameters.intake_url ? (
                              <button
                                type="button"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-copy-intake-btn"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '42px',
                                  padding: '8px 12px',
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1.5px solid #475569',
                                }}
                                onClick={() => void copyToClipboard(String(pending.parameters.intake_url), `intake-${pending.preview_id || msg.id}`)}
                                title="העתק את קישור פתיחת התיק ללוח"
                              >
                                {copiedLinkMap[`intake-${pending.preview_id || msg.id}`] ? '✓ הועתק!' : '📋 העתק קישור'}
                              </button>
                            ) : null}

                            {pending.parameters.wa_link ? (
                              <a
                                href={String(pending.parameters.wa_link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-wa-intake-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '42px',
                                  padding: '8px 12px',
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#16a34a',
                                  color: '#ffffff',
                                  border: 'none',
                                }}
                                onClick={(e) => handleWhatsAppClick(e, String(pending.parameters.wa_link))}
                                title="פתיחת וואטסאפ עם הודעה מוכנה הכוללת את קישור פתיחת התיק בלבד"
                              >
                                💬 שלח בוואטסאפ
                              </a>
                            ) : null}

                            {pending.parameters.claim_id ? (
                              <button
                                type="button"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-extend-intake-btn"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '42px',
                                  padding: '8px 12px',
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#fbbf24',
                                  border: '1.5px solid #d97706',
                                }}
                                onClick={() => void sendMessage(`דליה, תאריכי את הקישור של הלקוח בתיק ${pending.parameters.claim_id} לעוד שבוע`)}
                                title="הארכת תוקף הקישור של הלקוח"
                              >
                                ⏰ שנה תוקף
                              </button>
                            ) : null}

                            {pending.parameters.claim_id ? (
                              <button
                                type="button"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-revoke-intake-btn"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '42px',
                                  padding: '8px 12px',
                                  fontSize: '0.84rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#f87171',
                                  border: '1.5px solid #dc2626',
                                }}
                                onClick={() => void sendMessage(`דליה, תבטלי את הקישור של הלקוח בתיק ${pending.parameters.claim_id}`)}
                                title="ביטול מיידי של קישור הלקוח בשרת"
                              >
                                🚫 בטל קישור
                              </button>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                            ℹ️ בדיקת הקישור פותחת את טופס הלקוח בלבד ואינה שולחת ואינה פותחת תיק כפול. באישור: ייפתח התיק ויישמר בסטטוס "ממתין למילוי הלקוח", ויישלח במייל אם צוין.
                          </div>
                        </div>
                      ) : null}

                      {pending.action_type === 'revoke_customer_link' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-revoke-link"
                          data-testid="claims-ai-preview-revoke-link-card"
                          style={{
                            margin: '10px 0',
                            fontSize: '0.85rem',
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#f8fafc',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            lineHeight: '1.6',
                            border: '1.5px solid #ef4444',
                          }}
                        >
                          <div style={{ fontWeight: 800, color: '#f87171', fontSize: '0.95rem', marginBottom: 6 }}>
                            🚫 כרטיס אישור – ביטול קישורי לקוח בשרת
                          </div>
                          <div><strong>מספר תיק:</strong> {String(pending.parameters.claim_id || '')}</div>
                          {pending.parameters.reason ? <div><strong>סיבה:</strong> {String(pending.parameters.reason)}</div> : null}
                          <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#fca5a5' }}>
                            ⚠️ באישור: הקישור לשאלון פתיחת התיק והקישור להעלאת מסמכים יבוטלו בשרת מיידית ולא ניתן יהיה לגשת אליהם עוד.
                          </div>
                        </div>
                      ) : null}

                      {pending.action_type === 'extend_customer_link' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-extend-link"
                          data-testid="claims-ai-preview-extend-link-card"
                          style={{
                            margin: '10px 0',
                            fontSize: '0.85rem',
                            background: 'rgba(245, 158, 11, 0.08)',
                            color: '#f8fafc',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            lineHeight: '1.6',
                            border: '1.5px solid #f59e0b',
                          }}
                        >
                          <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.95rem', marginBottom: 6 }}>
                            ⏰ כרטיס אישור – הארכת תוקף קישורי לקוח
                          </div>
                          <div><strong>מספר תיק:</strong> {String(pending.parameters.claim_id || '')}</div>
                          <div><strong>הארכה מבוקשת:</strong> {String(pending.parameters.extend_label || `${pending.parameters.extend_hours} שעות`)}</div>
                          <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#fde68a' }}>
                            ⚡ באישור: תוקף הקישור לשאלון הלקוח והקישור להעלאת מסמכים יוארך בשרת מיידית.
                          </div>
                        </div>
                      ) : null}
                      {((pending.action_type === 'send_customer_upload_link') || (pending.action_type === 'send_customer_link' && pending.parameters?.link_type === 'upload')) && pending.parameters ? (
                        <div
                          className="claims-ai-preview-custlink"
                          data-testid="claims-ai-preview-upload-card"
                          style={{
                            margin: '10px 0',
                            fontSize: '0.85rem',
                            background: '#071022',
                            color: '#f8fafc',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            lineHeight: '1.6',
                            border: '1.5px solid #d97706',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>
                              📤 כרטיס אישור – העלאת מסמכים לתיק (claims-upload)
                            </div>
                            {pending.parameters.claim_id ? (
                              <span style={{ fontSize: '0.75rem', background: '#78350f', color: '#fde68a', border: '1px solid #b45309', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                                תיק {String(pending.parameters.claim_id)}
                              </span>
                            ) : null}
                          </div>

                          <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>נמען:</strong> {String(pending.parameters.recipient_name || 'הלקוח')}</div>
                          {pending.parameters.recipient_phone ? <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>טלפון (WhatsApp):</strong> {String(pending.parameters.recipient_phone)}</div> : null}
                          {pending.parameters.recipient_email ? <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>אימייל:</strong> {String(pending.parameters.recipient_email)}</div> : null}
                          <div style={{ color: '#e2e8f0' }}><strong style={{ color: '#cbd5e1' }}>ערוץ שליחה:</strong> {String(pending.parameters.channel || 'copy') === 'whatsapp' ? 'WhatsApp' : String(pending.parameters.channel) === 'email' ? 'אימייל' : String(pending.parameters.channel) === 'both' ? 'אימייל + WhatsApp' : 'העתקת קישור'}</div>

                          {/* Category A: Requested documents from customer */}
                          {Array.isArray(pending.parameters.requested_documents) && pending.parameters.requested_documents.length > 0 ? (
                            <div style={{ marginTop: 10, background: '#0c1b33', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
                              <div style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 800, marginBottom: 6 }}>
                                📥 מסמכים שהלקוח נדרש להעלות אלינו ({pending.parameters.requested_documents.length}):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {pending.parameters.requested_documents.map((doc: string, idx: number) => (
                                  <span
                                    key={idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: '#0369a1',
                                      color: '#ffffff',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '4px 10px',
                                      borderRadius: 12,
                                      border: '1px solid #38bdf8',
                                    }}
                                  >
                                    ✓ {doc}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRequestedDoc(msg.id, doc)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#fca5a5',
                                        padding: 0,
                                        marginLeft: 2,
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                      }}
                                      title={`הסר את ${doc}`}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Category B: Provided forms to sign/fill */}
                          {Array.isArray(pending.parameters.provided_forms) && pending.parameters.provided_forms.length > 0 ? (
                            <div style={{ marginTop: 10, background: '#0a231b', padding: '10px 12px', borderRadius: '8px', border: '1px solid #14532d' }}>
                              <div style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 800, marginBottom: 6 }}>
                                📝 טפסים שאנו מספקים ללקוח למילוי וחתימה ({pending.parameters.provided_forms.length}):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {pending.parameters.provided_forms.map((form: string, idx: number) => (
                                  <span
                                    key={idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: '#15803d',
                                      color: '#ffffff',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '4px 10px',
                                      borderRadius: 12,
                                      border: '1px solid #4ade80',
                                    }}
                                  >
                                    ✍️ {form}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveProvidedForm(msg.id, form)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#fca5a5',
                                        padding: 0,
                                        marginLeft: 2,
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                      }}
                                      title={`הסר את ${form}`}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Permanent "➕ העלה מסמך משלך" button in Card B */}
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="btn btn-g"
                              data-testid="claims-ai-preview-upload-doc-btn"
                              onClick={() => handleTriggerFormUpload(msg.id, String(pending.parameters.claim_id || claimId || 'DAL-2026-0249'))}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                minHeight: '44px',
                                padding: '8px 14px',
                                background: '#0f172a',
                                border: '1.5px dashed #4ade80',
                                color: '#4ade80',
                                borderRadius: 8,
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                width: '100%',
                              }}
                            >
                              {uploadingFormForMsg === msg.id ? '⏳ מעלה מסמך...' : '➕ העלה מסמך משלך (הוסף טופס מקובץ / צילום)'}
                            </button>
                          </div>

                          {pending.parameters.upload_url ? (
                            <div style={{ marginTop: 10, background: '#0f172a', padding: '8px 12px', borderRadius: '8px', border: '1px solid #334155', wordBreak: 'break-all' }}>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>כתובת קישור העלאת מסמכים:</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 700 }}>
                                {String(pending.parameters.upload_url)}
                              </div>
                            </div>
                          ) : null}

                          {/* Interactive Preview Buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: 12 }}>
                            {pending.parameters.upload_url ? (
                              <a
                                href={String(pending.parameters.upload_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-open-upload-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '44px',
                                  padding: '8px 14px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1.5px solid #475569',
                                }}
                                title="פותח את דף העלאת המסמכים בטאב חדש לבדיקה"
                              >
                                👁️ פתח ובדוק קישור
                              </a>
                            ) : null}

                            {pending.parameters.upload_url ? (
                              <button
                                type="button"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-copy-upload-btn"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '44px',
                                  padding: '8px 14px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1.5px solid #475569',
                                }}
                                onClick={() => void copyToClipboard(String(pending.parameters.upload_url), `upload-${pending.preview_id || msg.id}`)}
                                title="העתק את קישור ההעלאה ללוח"
                              >
                                {copiedLinkMap[`upload-${pending.preview_id || msg.id}`] ? '✓ הועתק!' : '📋 העתק קישור'}
                              </button>
                            ) : null}

                            {pending.parameters.wa_link ? (
                              <a
                                href={String(pending.parameters.wa_link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-g"
                                data-testid="claims-ai-preview-wa-upload-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '44px',
                                  padding: '8px 14px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  borderRadius: '8px',
                                  background: '#16a34a',
                                  color: '#ffffff',
                                  border: 'none',
                                }}
                                onClick={(e) => handleWhatsAppClick(e, String(pending.parameters.wa_link))}
                                title="פתיחת וואטסאפ עם קישור העלאת מסמכים"
                              >
                                💬 שלח בוואטסאפ
                              </a>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                            ⚡ באישור: ייפתח קישור מאובטח בתוקף ל-24 שעות להעלאת מסמכים ותמונות, והקישור יישלח בערוץ הנבחר.
                          </div>
                        </div>
                      ) : null}
                      {pending.action_type === 'create_share_link' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-share"
                          data-testid="claims-ai-preview-share-card"
                          style={{
                            margin: '8px 0',
                            fontSize: '0.82rem',
                            background: 'rgba(37, 99, 235, 0.05)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            lineHeight: '1.6',
                            border: '1px solid rgba(37, 99, 235, 0.25)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, color: 'var(--c-primary, #2563eb)', fontSize: '0.9rem' }}>
                              📂 כרטיס אישור – קישור שיתוף מסמכים מאובטח (claims-share)
                            </div>
                            {pending.parameters.claim_id ? (
                              <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                                תיק {String(pending.parameters.claim_id)}
                              </span>
                            ) : null}
                          </div>

                          <div><strong>נמען:</strong> {String(pending.parameters.recipient_name || '')} {pending.parameters.recipient_kind ? `(${String(pending.parameters.recipient_kind)})` : ''}</div>
                          {pending.parameters.recipient_email ? <div><strong>אימייל:</strong> {String(pending.parameters.recipient_email)}</div> : null}
                          {pending.parameters.recipient_phone ? <div><strong>טלפון (WhatsApp):</strong> {String(pending.parameters.recipient_phone)}</div> : null}
                          <div><strong>תוקף הקישור:</strong> {String(pending.parameters.ttl_hours || 72)} שעות</div>

                          {/* Selected Files List with Checkmarks */}
                          <div style={{ marginTop: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                              📄 מסמכים שנבחרו לשיתוף ({Array.isArray(pending.parameters.file_titles) ? (pending.parameters.file_titles as string[]).length : Array.isArray(pending.parameters.file_ids) ? (pending.parameters.file_ids as string[]).length : 0}):
                            </div>
                            {Array.isArray(pending.parameters.file_titles) && (pending.parameters.file_titles as string[]).length > 0 ? (
                              <ul style={{ margin: '4px 0 0 0', paddingRight: '18px', listStyleType: 'none' }}>
                                {(pending.parameters.file_titles as string[]).map((title, idx) => (
                                  <li key={idx} style={{ color: '#047857', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', marginBottom: 2 }}>
                                    <span>✓</span>
                                    <span>{title}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : Array.isArray(pending.parameters.file_ids) && (pending.parameters.file_ids as string[]).length > 0 ? (
                              <div style={{ color: '#047857', fontSize: '0.8rem' }}>
                                ✓ {(pending.parameters.file_ids as string[]).length} קבצים נבחרו
                              </div>
                            ) : (
                              <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>טרם נבחרו קבצים</div>
                            )}
                          </div>

                          {/* Missing Documents Alert & Upload Button */}
                          {Array.isArray(pending.parameters.missing_documents) && (pending.parameters.missing_documents as string[]).length > 0 ? (
                            <div
                              data-testid="claims-ai-missing-docs-alert"
                              style={{
                                marginTop: 8,
                                marginBottom: 8,
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: 6,
                                padding: '8px 12px',
                              }}
                            >
                              <div style={{ color: '#b45309', fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>
                                ⚠️ מסמכים שהתבקשו וחסרים בתיק:
                              </div>
                              {(pending.parameters.missing_documents as string[]).map((missingName, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4, padding: '4px 0', borderBottom: idx < (pending.parameters.missing_documents as string[]).length - 1 ? '1px dashed #fcd34d' : 'none' }}>
                                  <span style={{ color: '#92400e', fontSize: '0.8rem' }}>
                                    • {missingName}
                                  </span>
                                  <label
                                    className="btn btn-g btn-xs"
                                    data-testid={`claims-ai-upload-missing-${idx}`}
                                    style={{
                                      cursor: uploadingMissingDocKey === missingName ? 'wait' : 'pointer',
                                      margin: 0,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: '0.75rem',
                                      color: '#b45309',
                                      borderColor: '#f59e0b',
                                      background: '#fff',
                                    }}
                                    title={`העלה ${missingName} לתיק`}
                                  >
                                    {uploadingMissingDocKey === missingName ? 'מעלה...' : `📤 העלה מסמך חסר (${missingName})`}
                                    <input
                                      type="file"
                                      accept="image/*,application/pdf"
                                      disabled={uploadingMissingDocKey === missingName}
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) {
                                          void handleUploadMissingDoc(msg, pending, missingName, f);
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                </div>
                              ))}
                              <div style={{ fontSize: '0.74rem', color: '#78350f', marginTop: 6 }}>
                                💡 ניתן להעלות את המסמך עכשיו ישירות מהמכשיר/מחשב. לאחר ההעלאה הוא יתווסף לרשימת השיתוף ויופק קישור.
                              </div>
                            </div>
                          ) : null}

                          {/* Share URL Box */}
                          {pending.parameters.share_url ? (
                            <div style={{ marginTop: 8, background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: 2 }}>קישור שיתוף מאובטח מוכן:</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#0f172a' }}>
                                {String(pending.parameters.share_url)}
                              </div>
                            </div>
                          ) : null}

                          {/* Interactive Preview Buttons */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 10 }}>
                            {pending.parameters.share_url ? (
                              <a
                                href={String(pending.parameters.share_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-g btn-xs"
                                data-testid="claims-ai-preview-open-share-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '34px',
                                  padding: '6px 12px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                }}
                                title="פתח ובדוק את קישור השיתוף בטאב חדש"
                              >
                                👁️ פתח ובדוק קישור
                              </a>
                            ) : null}

                            {pending.parameters.share_url ? (
                              <button
                                type="button"
                                className="btn btn-g btn-xs"
                                data-testid="claims-ai-preview-copy-share-btn"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '34px',
                                  padding: '6px 12px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                }}
                                onClick={() => void copyToClipboard(String(pending.parameters.share_url), `share-${pending.preview_id || msg.id}`)}
                                title="העתק את קישור השיתוף ללוח"
                              >
                                {copiedLinkMap[`share-${pending.preview_id || msg.id}`] ? '✓ הועתק!' : '📋 העתק קישור'}
                              </button>
                            ) : null}

                            {pending.parameters.wa_link ? (
                              <a
                                href={String(pending.parameters.wa_link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-g btn-xs"
                                data-testid="claims-ai-preview-wa-share-btn"
                                style={{
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  minHeight: '34px',
                                  padding: '6px 12px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                }}
                                onClick={(e) => handleWhatsAppClick(e, String(pending.parameters.wa_link))}
                                title="פתיחת וואטסאפ עם קישור השיתוף והמסמכים המבוקשים בלבד"
                              >
                                💬 שלח בוואטסאפ
                              </a>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--t2)', fontWeight: 500 }}>
                            ⚡ באישור: המערכת תוודא את קישור השיתוף המוגן עבור המסמכים שנבחרו בלבד, תשלח במייל אם הוגדר, ותתעד בהיסטוריית התיק.
                          </div>
                        </div>
                      ) : null}
                      {pending.action_type === 'batch_schedule_email' && pending.parameters ? (
                        <div
                          className="claims-ai-preview-batch-schedule"
                          style={{
                            margin: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {(((pending.parameters as any).actions as ClaimsAiPendingAction[]) || []).map((sub, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: 'rgba(37, 99, 235, 0.04)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(37, 99, 235, 0.12)',
                                fontSize: '0.82rem',
                                lineHeight: '1.5',
                              }}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--c-primary, #2563eb)' }}>
                                תזמון {idx + 1} מתוך {String((pending.parameters as any).count || ((pending.parameters as any).actions || []).length)}
                                {sub.parameters?.claim_id ? ` · תיק ${String(sub.parameters.claim_id)}` : ''}
                                {sub.parameters?.scheduled_label ? ` · 📅 ${String(sub.parameters.scheduled_label)}` : ''}
                              </div>
                              <div><strong>נמען:</strong> {String(sub.parameters?.to || '')}</div>
                              {sub.parameters?.subject ? <div><strong>נושא:</strong> {String(sub.parameters.subject)}</div> : null}
                              {Array.isArray(sub.parameters?.attachment_titles) && (sub.parameters.attachment_titles as string[]).length > 0 ? (
                                <div><strong>מסמכים:</strong> {(sub.parameters.attachment_titles as string[]).join(', ')}</div>
                              ) : null}
                            </div>
                          ))}
                          <div style={{ fontSize: '0.78rem', color: 'var(--c-emerald, #10b981)', fontWeight: 600 }}>
                            ⚡ אישור קבוצתי: כל האימיילים יישמרו כמתוזמנים ומאושרים ויישלחו אוטומטית במועדם.
                          </div>
                        </div>
                      ) : null}
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
                            disabled={!!executingActionId || (Array.isArray(pending.parameters?.missing_documents) && (pending.parameters?.missing_documents as string[]).length > 0)}
                            title={Array.isArray(pending.parameters?.missing_documents) && (pending.parameters?.missing_documents as string[]).length > 0 ? 'יש להעלות תחילה את המסמכים החסרים' : undefined}
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
                  {msg.role === 'assistant' && msg.metadata.error !== true ? (
                    <div className="claims-ai-bubble-actions">
                      <button
                        type="button"
                        data-testid={`claims-ai-copy-${msg.id}`}
                        className={`claims-ai-action-btn claims-ai-copy-btn${copiedMsgId === msg.id ? ' copied' : ''}`}
                        onClick={() => void handleCopyText(msg.id, msg.content)}
                        title="העתק תשובה ללוח"
                      >
                        {copiedMsgId === msg.id ? '✓ הועתק!' : '📋 העתק'}
                      </button>
                      {typeof window.speechSynthesis !== 'undefined' ? (
                        speakingMsgId === msg.id ? (
                          <button
                            type="button"
                            className="claims-ai-action-btn speaking"
                            data-testid={`claims-ai-stop-speaking-${msg.id}`}
                            onClick={stopSpeaking}
                            title="עצור הקראה ברמקול"
                          >
                            ⏹️ עצור הקראה
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="claims-ai-action-btn"
                            data-testid={`claims-ai-speak-${msg.id}`}
                            onClick={() => speakAnswer(msg.id, msg.content)}
                            title="הקרא בקול"
                          >
                            🔊 הקרא
                          </button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {loading ? (
            <div className="claims-ai-loading-bar" data-testid="claims-ai-loading">
              <span className="claims-ai-loading-spinner" />
              <span>דליה מייצרת תשובה…</span>
              <button
                type="button"
                className="claims-ai-stop-btn"
                onClick={handleStopAi}
                title="עצור את יצירת התשובה"
              >
                ⏹️ עצור
              </button>
            </div>
          ) : null}
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

        {dockedReport ? (
          dockedTableState === 'hidden' ? (
            <div className="claims-ai-docked-pill-bar" data-testid="claims-ai-docked-pill-bar">
              <button
                type="button"
                className="claims-ai-docked-pill"
                data-testid="claims-ai-docked-show-btn"
                onClick={() => setDockedTableState('normal')}
                title="הצג את טבלת דוח התביעות הפעיל"
              >
                📊 הצג טבלת דוח ({dockedReport.rows.length} תביעות פתוחות) · עודכן {dockedReport.updatedAt}
              </button>
            </div>
          ) : (
            <div className={`claims-ai-docked-report ${dockedTableState}`} data-testid="claims-ai-docked-report">
              <div className="claims-ai-docked-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: 'var(--t)' }}>
                    {dockedReport.title.startsWith('📊') ? '' : '📊 '}
                    {dockedReport.title.includes('סה״כ') ? dockedReport.title : `${dockedReport.title} (סה״כ תביעות פתוחות: ${dockedReport.rows.length})`}
                    {filteredDockedRows.length !== dockedReport.rows.length ? ` · מוצגות ${filteredDockedRows.length} לפי סינון` : ''}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                    עודכן ב-{dockedReport.updatedAt}
                  </span>
                  <button
                    type="button"
                    className="claims-ai-action-btn"
                    data-testid="claims-ai-docked-refresh-btn"
                    onClick={() => void sendMessage('רענן דוח על כל התביעות הפתוחות', 'text')}
                    disabled={loading}
                    title="רענן נתוני דוח תביעות"
                  >
                    🔄 רענן נתונים
                  </button>
                  <button
                    type="button"
                    className="claims-ai-action-btn"
                    data-testid="claims-ai-docked-copy-btn"
                    onClick={handleCopyDockedTsv}
                    title="העתק טבלה ללוח (בפורמט המתאים לאקסל/וורד)"
                  >
                    {copiedDocked ? '✓ הועתק!' : '📋 העתק טבלה'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    className="claims-report-search"
                    data-testid="claims-ai-docked-search"
                    placeholder="🔍 חיפוש..."
                    value={dockedFilter}
                    onChange={(e) => setDockedFilter(e.target.value)}
                    style={{ width: 140, padding: '3px 8px', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="claims-ai-bar-toggle-btn"
                    data-testid="claims-ai-docked-expand-btn"
                    onClick={() => setDockedTableState((prev) => prev === 'expanded' ? 'normal' : 'expanded')}
                    title={dockedTableState === 'expanded' ? 'צמצם גודל' : 'הרחב למסך מלא'}
                  >
                    {dockedTableState === 'expanded' ? '🗗 צמצם' : '🗖 הרחב'}
                  </button>
                  <button
                    type="button"
                    className="claims-ai-bar-toggle-btn"
                    data-testid="claims-ai-docked-collapse-btn"
                    onClick={() => setDockedTableState((prev) => prev === 'collapsed' ? 'normal' : 'collapsed')}
                    title={dockedTableState === 'collapsed' ? 'פתח טבלה' : 'קפל טבלה'}
                  >
                    {dockedTableState === 'collapsed' ? '▼ הצג' : '▲ קפל'}
                  </button>
                  <button
                    type="button"
                    className="claims-ai-bar-toggle-btn"
                    data-testid="claims-ai-docked-close-btn"
                    onClick={() => setDockedTableState('hidden')}
                    title="הסתר טבלה"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {dockedTableState !== 'collapsed' ? (
                <div className="claims-ai-docked-table-wrap">
                  <table className="claims-report-table">
                    <thead>
                      <tr>
                        {dockedReport.headers.map((h, idx) => (
                          <th key={idx}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDockedRows.length === 0 ? (
                        <tr>
                          <td colSpan={dockedReport.headers.length} style={{ textAlign: 'center', padding: 14, color: 'var(--t3)' }}>
                            לא נמצאו תיקים התואמים את החיפוש "{dockedFilter}"
                          </td>
                        </tr>
                      ) : (
                        filteredDockedRows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>{renderFormattedCell(cell, onOpenClaim)}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )
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
            className={`claims-ai-icon${listening ? ' live recording' : ''}`}
            data-testid="claims-ai-mic"
            aria-pressed={listening}
            disabled={!micOk || loading}
            title={listening ? 'עצור הכתבה (הטקסט יישמר בתיבה לעריכה)' : (micOk ? 'התחל הכתבה קולית רציפה' : 'הדפדפן לא תומך בזיהוי דיבור')}
            aria-label={listening ? 'עצור הכתבה' : 'הכתבה קולית'}
            onClick={toggleMic}
          >{listening ? '⏹️' : '🎤'}</button>
          <textarea
            ref={textareaRef}
            data-testid="claims-ai-input"
            value={input}
            dir="rtl"
            placeholder={claim ? 'שאלה על התיק הפתוח…' : 'פתחו תיק, או שאלו שאלה כללית…'}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              inputRef.current = val;
              baseInputRef.current = val;
            }}
            onFocus={() => {
              baseInputRef.current = inputRef.current;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && !isSubmittingRef.current) {
                  void sendMessage(input, 'text');
                }
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
        {showScrollBottom && (
          <button
            type="button"
            className="claims-ai-scroll-bottom-pill"
            onClick={() => scrollToBottom(true)}
            title="גלול לתחתית הצ'אט"
            data-testid="claims-ai-scroll-bottom"
          >
            ↓ הודעות חדשות
          </button>
        )}
        <input
          ref={formFileInputRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: 'none' }}
          onChange={handleFormFileChosen}
          data-testid="claims-ai-form-file-input"
        />
      </section>
    </div>
  );
}
