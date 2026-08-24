import { useState, type MouseEvent } from 'react';
import { createRecordingSignedUrl } from '@/features/telemarketing/services/callRecordingService';

export function PlayRecordingButton({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async (event: MouseEvent) => {
    event.stopPropagation();
    if (url || busy) return;
    setBusy(true);
    setFailed(false);
    const signed = await createRecordingSignedUrl(path);
    setBusy(false);
    if (!signed) {
      setFailed(true);
      return;
    }
    setUrl(signed);
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      {!url && (
        <button
          type="button"
          onClick={(event) => void load(event)}
          disabled={busy}
          className="min-h-10 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'טוען...' : '▶ השמע הקלטה'}
        </button>
      )}
      {url && <audio controls src={url} className="mt-1 w-full max-w-xs" />}
      {failed && <p className="mt-1 text-xs text-destructive">לא ניתן להשמיע את ההקלטה</p>}
    </div>
  );
}
