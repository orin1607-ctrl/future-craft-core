import type { TelemarketingDashboardSummary } from '@/features/telemarketing/types';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ש' ${m}ד'`;
  return `${m} דקות`;
}

export function SummaryCards({ summary }: { summary: TelemarketingDashboardSummary }) {
  const cards: { label: string; value: string | number; tone?: 'hot' | 'urgent' | 'late' }[] = [
    { label: 'שיחות היום', value: summary.callsToday },
    { label: 'נענו היום', value: summary.answeredToday },
    { label: 'לא ענו היום', value: summary.noAnswerToday },
    { label: 'זמן שיחה כולל היום', value: formatDuration(summary.totalCallDurationSeconds) },
    { label: 'זמן שיחה ממוצע', value: formatDuration(summary.avgCallDurationSeconds) },
    { label: 'מתעניינים', value: summary.interested },
    { label: 'לידים חמים', value: summary.hotLeads, tone: 'hot' },
    { label: 'לידים דחופים', value: summary.urgentLeads, tone: 'urgent' },
    { label: 'ביקשו מידע', value: summary.wantsInfo },
    { label: 'ביקשו הצעת מחיר', value: summary.wantsQuote },
    { label: 'רוצים פגישה', value: summary.wantsMeeting },
    { label: 'Follow-up פתוחים', value: summary.followUpsOpen },
    { label: 'Follow-up היום', value: summary.followUpsToday },
    { label: 'Follow-up באיחור', value: summary.followUpsLate, tone: 'late' },
  ];

  const toneClass: Record<string, string> = {
    hot: 'text-orange-500',
    urgent: 'text-destructive',
    late: 'text-destructive',
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-3 text-center">
          <div className={`text-2xl font-extrabold ${c.tone ? toneClass[c.tone] : 'text-foreground'}`}>{c.value}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
