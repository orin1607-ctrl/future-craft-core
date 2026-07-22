import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  format,
} from 'date-fns';
import { he } from 'date-fns/locale';

export type ReportPeriodMode = 'month' | 'week' | 'year' | 'custom' | 'all';

export interface ReportPeriodRange {
  mode: ReportPeriodMode;
  from?: Date;
  to?: Date;
  /** Hebrew phrase for summaries, e.g. "באוקטובר" / "השבוע" / "בתקופה שנבחרה" */
  labelSuffix: string;
}

export function resolveReportPeriod(
  mode: ReportPeriodMode,
  customFrom?: Date,
  customTo?: Date,
  now: Date = new Date(),
): ReportPeriodRange {
  if (mode === 'all') {
    return { mode, labelSuffix: 'בכל הזמנים' };
  }
  if (mode === 'custom') {
    return {
      mode,
      from: customFrom,
      to: customTo,
      labelSuffix: customFrom || customTo ? 'בתקופה שנבחרה' : 'בכל הזמנים',
    };
  }
  if (mode === 'week') {
    const from = startOfWeek(now, { weekStartsOn: 0 });
    const to = endOfWeek(now, { weekStartsOn: 0 });
    return { mode, from, to, labelSuffix: 'השבוע' };
  }
  if (mode === 'year') {
    const from = startOfYear(now);
    const to = endOfYear(now);
    return { mode, from, to, labelSuffix: `בשנת ${format(now, 'yyyy')}` };
  }
  // month (default)
  const from = startOfMonth(now);
  const to = endOfMonth(now);
  const monthName = format(now, 'MMMM', { locale: he });
  return { mode: 'month', from, to, labelSuffix: `ב${monthName}` };
}

export function formatSummaryHeadline(count: number, noun: string, suffix: string): string {
  return `${count} ${noun} ${suffix}`.trim();
}

export function dateInReportRange(
  dateStr: string | null | undefined,
  from?: Date | null,
  to?: Date | null,
): boolean {
  if (!dateStr) return !from && !to;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    if (d < start) return false;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (d > end) return false;
  }
  return true;
}
