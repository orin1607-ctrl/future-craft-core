import { garageStatusLabel, type GarageAssignment } from './claimGarage';

type Props = {
  assignment: GarageAssignment | null;
  photoCount?: number;
  busy?: boolean;
  onAssign: () => void;
  onUnassign: () => void;
};

export default function GarageAssignBar({ assignment, photoCount, busy, onAssign, onUnassign }: Props) {
  const count = photoCount ?? assignment?.photo_count ?? 0;
  return (
    <div className="garage-assign-bar" data-testid="garage-assign-bar">
      <div className="garage-assign-title">צילומי מוסך</div>
      {assignment ? (
        <div className="garage-assign-meta" data-testid="garage-assign-current">
          <span>עובד: {assignment.worker_name || '—'}</span>
          <span>סטטוס: {garageStatusLabel(assignment.status)}</span>
          <span>תמונות: {count}</span>
        </div>
      ) : (
        <div className="garage-assign-meta" data-testid="garage-assign-empty">לא שויך עובד לצילומי מוסך</div>
      )}
      <div className="garage-assign-acts">
        <button type="button" className="btn btn-p btn-sm" data-testid="garage-assign-open" disabled={busy} onClick={onAssign}>
          {assignment ? 'החלף שיוך' : 'שייך עובד לצילומי מוסך'}
        </button>
        {assignment ? (
          <button type="button" className="btn btn-sm" data-testid="garage-unassign" disabled={busy} style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={onUnassign}>
            בטל שיוך
          </button>
        ) : null}
      </div>
    </div>
  );
}
