import { useState } from 'react';
import { formatGarageReviewedAt, garageReviewLabel, garageStatusLabel, type GarageAssignment } from './claimGarage';

type Props = {
  assignment: GarageAssignment | null;
  photoCount?: number;
  busy?: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onOpenPortal?: () => void;
  onApprove?: () => void;
  onNeedsUpdate?: (note: string) => void;
};

export default function GarageAssignBar({
  assignment,
  photoCount,
  busy,
  onAssign,
  onUnassign,
  onOpenPortal,
  onApprove,
  onNeedsUpdate,
}: Props) {
  const count = photoCount ?? assignment?.photo_count ?? 0;
  const review = String(assignment?.review_status || '');
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState('');
  const reviewLabel = garageReviewLabel(review);

  return (
    <div className="garage-assign-bar" data-testid="garage-assign-bar">
      <div className="garage-assign-title">צילומי מוסך</div>
      {assignment ? (
        <div className="garage-assign-meta" data-testid="garage-assign-current">
          <span>עובד: {assignment.worker_name || '—'}</span>
          <span>סטטוס: {garageStatusLabel(assignment.status)}</span>
          <span>תמונות: {count}</span>
          {reviewLabel ? <span data-testid="garage-review-status">{reviewLabel}</span> : null}
        </div>
      ) : (
        <div className="garage-assign-meta" data-testid="garage-assign-empty">לא שויך עובד לצילומי מוסך</div>
      )}
      {review === 'awaiting_review' ? (
        <div className="garage-review-banner need" data-testid="garage-review-awaiting">
          התקבל — לבדיקה
        </div>
      ) : null}
      {review === 'needs_update' && assignment?.review_note ? (
        <div className="garage-review-banner wait" data-testid="garage-review-needs-note">
          נדרש להשלים: {assignment.review_note}
        </div>
      ) : null}
      {review === 'approved' ? (
        <div className="garage-review-banner ok" data-testid="garage-review-approved">
          אושר{assignment?.reviewed_by_name ? ` על ידי ${assignment.reviewed_by_name}` : ''}
          {assignment?.reviewed_at ? ` · ${formatGarageReviewedAt(assignment.reviewed_at)}` : ''}
        </div>
      ) : null}
      {review === 'awaiting_review' && onApprove && onNeedsUpdate ? (
        <div className="garage-review-acts" data-testid="garage-review-acts">
          <button type="button" className="btn btn-p btn-sm" data-testid="garage-review-approve" disabled={busy} onClick={onApprove}>
            אשר
          </button>
          {askNote ? (
            <div className="garage-review-note">
              <textarea
                className="fta"
                data-testid="garage-review-note"
                rows={3}
                maxLength={400}
                placeholder="סיבה ברורה להשלמה"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
                data-testid="garage-review-needs-update"
                disabled={busy || !note.trim()}
                onClick={() => {
                  const next = note.trim();
                  if (!next) return;
                  onNeedsUpdate(next);
                  setAskNote(false);
                  setNote('');
                }}
              >
                דרוש השלמה
              </button>
              <button type="button" className="btn btn-g btn-sm" data-testid="garage-review-note-cancel" disabled={busy} onClick={() => { setAskNote(false); setNote(''); }}>
                ביטול
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-sm" data-testid="garage-review-ask-note" disabled={busy} onClick={() => setAskNote(true)}>
              דרוש השלמה
            </button>
          )}
        </div>
      ) : null}
      <div className="garage-assign-acts">
        <button type="button" className="btn btn-p btn-sm" data-testid="garage-assign-open" disabled={busy} onClick={onAssign}>
          {assignment ? 'החלף שיוך' : 'שייך עובד לצילומי מוסך'}
        </button>
        {assignment && onOpenPortal ? (
          <button type="button" className="btn btn-g btn-sm" data-testid="garage-open-worker-portal" disabled={busy} onClick={onOpenPortal}>
            פתח פורטל עובד
          </button>
        ) : null}
        {assignment ? (
          <button type="button" className="btn btn-sm" data-testid="garage-unassign" disabled={busy} style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={onUnassign}>
            בטל שיוך
          </button>
        ) : null}
      </div>
    </div>
  );
}
