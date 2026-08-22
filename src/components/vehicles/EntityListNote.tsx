import { compactListNote, vehicleHasListNote } from '@/lib/entityListNote';

/** Compact list-row note. Renders nothing when the vehicle has no note. */
export default function EntityListNote({ notes }: { notes?: string | null }) {
  if (!vehicleHasListNote(notes)) return null;
  const full = String(notes).trim();
  const preview = compactListNote(notes);
  return (
    <p
      className="text-xs text-foreground/75 mt-0.5 truncate max-w-full leading-snug"
      title={full}
      data-testid="entity-list-note"
    >
      {preview}
    </p>
  );
}
