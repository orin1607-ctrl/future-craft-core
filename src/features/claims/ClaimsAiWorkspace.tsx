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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('יש להתחבר למערכת');

  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    signal: input.signal,
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

    let localFinal = '';

    rec.onresult = (ev) => {
      if (!voiceModeActiveRef.current || voicePhaseRef.current !== 'listening') return;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript || '';
        if (ev.results[i].isFinal) {
          localFinal = (localFinal ? `${localFinal} ` : '') + piece;
        } else {
          interim = (interim ? `${interim} ` : '') + piece;
        }
      }
      const full = [localFinal, interim].filter(Boolean).join(' ').trim();
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
      const answer = await streamHelpAi({
        messages: messagesForModel(history),
        claimId,
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
      const message = rawMsg.includes('504') || rawMsg.includes('503')
        ? 'שרת ה-AI עמוס כרגע (שגיאת עומס 504/503). אנא נסה שוב בעוד מספר רגעים.'
        : rawMsg;
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
      // Failure: the card stays pending so it can be retried, and the user sees the real reason.
      executingRef.current.delete(guardKey);
      const message = err instanceof Error ? err.message : 'שגיאה בביצוע הפעולה';
      setBanner(message);
      if (activeId) {
        const failed = await insertClaimsAiMessage({
          conversationId: activeId,
          role: 'assistant',
          content: `❌ הפעולה לא בוצעה: ${message}`,
          metadata: { error: true, claim_id: claimId, preview_id: pending.preview_id },
        });
        if (failed.data) setMessages((prev) => [...prev, failed.data!]);
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
      }
      return;
    }

    isManualStopRef.current = false;
    isListeningRef.current = true;
    baseInputRef.current = input.trim();
    finalTranscriptRef.current = '';

    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      if (!isListeningRef.current || isManualStopRef.current) return;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript || '';
        if (ev.results[i].isFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current ? `${finalTranscriptRef.current} ` : '') + piece;
        } else {
          interim = (interim ? `${interim} ` : '') + piece;
        }
      }
      const full = [baseInputRef.current, finalTranscriptRef.current, interim]
        .filter(Boolean)
        .join(' ')
        .trim();
      setInput(full);
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
        try {
          rec.start();
          return;
        } catch {
          // Restart failed, stop gracefully
        }
      }
      isListeningRef.current = false;
      setListening(false);
      // NOTE: Do NOT force textarea focus here on mobile, preventing unwanted keyboard jump
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
            onChange={(e) => setInput(e.target.value)}
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
      </section>
    </div>
  );
}
