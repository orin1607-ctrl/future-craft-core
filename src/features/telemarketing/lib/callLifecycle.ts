export const RELEASED_STATUS = 'released' as const;

/** Accidental-click window after התחל שיחה. There is no PSTN answered event. */
export const UNSTARTED_VOID_GRACE_SECONDS = 15;

export const REPORT_DURATION_CAP_SECONDS = 180;
export const REPORT_DURATION_WARN_SECONDS = 150;

export function isReleasedStatus(status?: string | null): boolean {
  return status === RELEASED_STATUS;
}

export function canVoidUnstartedCall(input: {
  endedAt?: string | null;
  elapsedSeconds?: number | null;
}): boolean {
  if (input.endedAt) return false;
  const elapsed = input.elapsedSeconds ?? 0;
  return elapsed >= 0 && elapsed < UNSTARTED_VOID_GRACE_SECONDS;
}

export function capReportDurationSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, REPORT_DURATION_CAP_SECONDS);
}

export function reportDurationPhase(elapsedSeconds: number): 'ok' | 'warn' | 'cap' {
  if (elapsedSeconds >= REPORT_DURATION_CAP_SECONDS) return 'cap';
  if (elapsedSeconds >= REPORT_DURATION_WARN_SECONDS) return 'warn';
  return 'ok';
}

export const TELE_DESKTOP_PAIR_GRID =
  'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:only-child]:col-span-2';

export const TELE_DESKTOP_HOME_GRID =
  'grid grid-cols-1 gap-2 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:only-child]:col-span-2';
