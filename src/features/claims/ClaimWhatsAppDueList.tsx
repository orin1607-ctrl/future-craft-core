import { isWaReady, waMeHref, type WaScheduleRow } from './claimWhatsApp';

export type WaDueItem = WaScheduleRow & { claimId?: string; contactName?: string; claimLabel?: string };

type Props = {
  rows: WaDueItem[];
  now?: Date;
  onOpened: (row: WaDueItem) => void;
  onMarkSent: (row: WaDueItem) => void;
};

export default function ClaimWhatsAppDueList({ rows, now = new Date(), onOpened, onMarkSent }: Props) {
  const due = rows.filter((row) => isWaReady(row, now) && row.phone && row.body);
  if (!due.length) return null;
  return (
    <div data-testid="wa-due-banner" style={{ background: 'rgba(21,128,61,.08)', border: '1px solid #15803d', borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>הודעת WhatsApp מוכנה לשליחה ({due.length})</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>הפתיחה לא שולחת. אחרי שלחצת «שלח» ב-WhatsApp שלך, סמן כאן ידנית.</div>
      {due.map((row) => {
        const href = waMeHref(row.phone || '', row.body || '');
        return (
          <div key={row.id} data-testid={`wa-due-${row.id}`} style={{ background: 'var(--bg)', borderRadius: 7, padding: 8, marginBottom: 6 }}>
            <div style={{ fontWeight: 700 }}>{row.claimLabel || row.claimId} · {row.contactName || row.phone}</div>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '4px 0' }}>{row.body}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <a
                className="btn btn-p btn-sm"
                style={{ background: '#15803d' }}
                data-testid={`wa-due-open-${row.id}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={() => onOpened(row)}
              >
                פתח ב-WhatsApp שלי
              </a>
              <button type="button" className="btn btn-g btn-sm" data-testid={`wa-due-mark-${row.id}`} onClick={() => onMarkSent(row)}>סימנתי ששלחתי</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
