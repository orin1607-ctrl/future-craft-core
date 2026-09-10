import { useCallback, useMemo, useState } from 'react';
import type { CallWithPriority } from '@/features/telemarketing/hooks/useTelemarketingDashboard';
import { PlayRecordingButton } from '@/features/telemarketing/components/AdminDashboard/PlayRecordingButton';
import { TimeStampMeta } from '@/features/telemarketing/components/TimeStampMeta';
import { formatClock, formatDay, formatDurationSeconds, formatStamp } from '@/features/telemarketing/lib/formatTime';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import { TeleInnerNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';

interface Props {
  calls: CallWithPriority[];
  forcedAgentFilter?: string | null;
}

export function CallsTable({ calls, forcedAgentFilter }: Props) {
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [selected, setSelected] = useState<CallWithPriority | null>(null);
  const closeSelected = useCallback(() => setSelected(null), []);
  useRegisterTeleCloser(Boolean(selected), closeSelected);

  const effectiveAgentFilter = forcedAgentFilter ?? agentFilter;
  const agents = useMemo(() => Array.from(new Set(calls.map((c) => c.employeeName))).filter(Boolean), [calls]);
  const results = useMemo(() => Array.from(new Set(calls.map((c) => c.result))).filter(Boolean) as string[], [calls]);
  const ratings = useMemo(() => Array.from(new Set(calls.map((c) => c.leadRating))).filter(Boolean) as string[], [calls]);

  const filtered = calls.filter((c) => {
    if (search) {
      const hay = `${c.leadNumber || ''} ${c.companyName} ${c.contactName ?? ''} ${c.phone}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    if (effectiveAgentFilter && c.employeeName !== effectiveAgentFilter) return false;
    if (resultFilter && c.result !== resultFilter) return false;
    if (ratingFilter && c.leadRating !== ratingFilter) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        <input
          placeholder="חיפוש: חברה / איש קשר / טלפון"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-12 min-w-[200px] flex-1 rounded-lg border border-border bg-background p-2 text-sm"
        />
        <select
          value={effectiveAgentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          disabled={!!forcedAgentFilter}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm disabled:opacity-60"
        >
          <option value="">כל העובדים</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {forcedAgentFilter && (
          <span className="rounded-lg bg-muted px-2 py-2 text-xs text-muted-foreground">
            מסונן לפי כרטיס עובד — {forcedAgentFilter}
          </span>
        )}
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">כל התוצאות</option>
          {results.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">כל הדירוגים</option>
          {ratings.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-right font-semibold">חברה</th>
              <th className="p-3 text-right font-semibold">עובד</th>
              <th className="p-3 text-right font-semibold">תוצאה</th>
              <th className="p-3 text-right font-semibold">דירוג</th>
              <th className="p-3 text-right font-semibold">התחלה</th>
              <th className="p-3 text-right font-semibold">סיום</th>
              <th className="p-3 text-right font-semibold">משך</th>
              <th className="p-3 text-right font-semibold">הקלטה</th>
              <th className="p-3 text-right font-semibold">תאריך</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                data-testid="call-row"
                onClick={() => setSelected(c)}
                className="cursor-pointer border-t border-border hover:bg-muted/40"
              >
                <td className="p-3 font-semibold">{formatLeadTitle(c.leadNumber, c.companyName || c.contactName)}</td>
                <td className="p-3">{c.employeeName}</td>
                <td className="p-3">{c.result || '-'}</td>
                <td className="p-3">{c.leadRating || '-'}</td>
                <td className="p-3 font-mono">{formatClock(c.startedAt)}</td>
                <td className="p-3 font-mono">{c.endedAt ? formatClock(c.endedAt) : 'פעיל'}</td>
                <td className="p-3 font-mono">{formatDurationSeconds(c.durationSeconds)}</td>
                <td className="p-3">
                  {c.recordingStatus === 'ready' && c.recordingPath ? (
                    <PlayRecordingButton path={c.recordingPath} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-3">{formatDay(c.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {filtered.length === 0 && <p className="p-6 text-center text-muted-foreground">אין שיחות תואמות</p>}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border bg-card ${
              c.leadRating === 'דחוף'
                ? 'border-destructive/50'
                : c.leadRating === 'חם'
                  ? 'border-orange-400/50'
                  : 'border-border'
            }`}
          >
            <button
              type="button"
              data-testid="call-row"
              onClick={() => setSelected(c)}
              className="w-full p-3 text-right"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{formatLeadTitle(c.leadNumber, c.companyName || c.contactName)}</span>
              </div>
              <TimeStampMeta startedAt={c.startedAt} endedAt={c.endedAt} durationSeconds={c.durationSeconds} employeeName={c.employeeName} />
              <div className="mt-1 text-sm">
                {c.result || '-'} {c.leadRating ? `· ${c.leadRating}` : ''}
                {c.isLate ? ' · באיחור' : ''}
              </div>
            </button>
            {c.recordingStatus === 'ready' && c.recordingPath && (
              <div className="border-t border-border px-3 py-2">
                <PlayRecordingButton path={c.recordingPath} />
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="tele-internal-card" onClick={closeSelected}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <TeleInnerNav onBack={closeSelected} />
            <h3 className="mb-3 text-lg font-bold">{formatLeadTitle(selected.leadNumber, selected.companyName)}</h3>
            <dl className="space-y-2 text-sm">
              <Field label="עובד" value={selected.employeeName} />
              <Field label="תאריך שיחה" value={formatDay(selected.startedAt)} />
              <Field label="שעת התחלה" value={formatStamp(selected.startedAt)} />
              <Field label="שעת סיום" value={selected.endedAt ? formatStamp(selected.endedAt) : 'פעיל'} />
              <Field label="משך שיחה" value={formatDurationSeconds(selected.durationSeconds)} />
              <Field label="איש קשר" value={selected.contactName} />
              <Field label="טלפון" value={selected.phone} />
              <Field label="תוצאה" value={selected.result ?? undefined} />
              <Field label="דירוג ליד" value={selected.leadRating ?? undefined} />
              <Field label="סיכום" value={selected.summary ?? undefined} />
              <Field label="פעולה הבאה" value={selected.nextAction ?? undefined} />
              <Field
                label="מועד Follow-up"
                value={selected.followUpDate ? `${selected.followUpDate} ${selected.followUpTime ?? ''}` : undefined}
              />
              <Field label="סטטוס WhatsApp" value={selected.whatsappStatus} />
              <Field label="סטטוס Email" value={selected.emailStatus} />
            </dl>
            {selected.recordingStatus === 'ready' && selected.recordingPath && (
              <div className="mt-4">
                <PlayRecordingButton path={selected.recordingPath} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
