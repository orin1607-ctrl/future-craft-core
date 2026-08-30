export function secondsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
}

export function treatmentSeconds(callDuration?: number | null, reportDuration?: number | null): number {
  return Math.max(0, (callDuration || 0) + (reportDuration || 0));
}

export function normalizeLeadQuery(query?: string | null): string {
  return String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^ליד\s*/, '')
    .trim();
}

export function matchesLeadQuery(
  query: string | undefined,
  leadNumber?: string | null,
  companyName?: string | null,
): boolean {
  const q = normalizeLeadQuery(query);
  if (!q) return true;
  const num = String(leadNumber || '').trim().toLowerCase();
  const company = String(companyName || '').trim().toLowerCase();
  return num === q || company.includes(q) || `${num} ${company}`.includes(q);
}

export function stampCallEnd(startedAt: string, now = new Date()) {
  const endedAt = now.toISOString();
  return {
    ended_at: endedAt,
    duration_seconds: secondsBetween(startedAt, endedAt) ?? 0,
    report_started_at: endedAt,
  };
}

export function stampReportSubmit(current: {
  ended_at?: string | null;
  duration_seconds?: number | null;
  report_started_at?: string | null;
  report_ended_at?: string | null;
}, now = new Date()) {
  if (current.report_ended_at) {
    const reportStarted = current.report_started_at || current.ended_at || current.report_ended_at;
    return {
      report_started_at: reportStarted,
      report_ended_at: current.report_ended_at,
      report_duration_seconds: secondsBetween(reportStarted, current.report_ended_at) ?? 0,
      treated_ended_at: current.report_ended_at,
      treatment_duration_seconds: treatmentSeconds(current.duration_seconds, secondsBetween(reportStarted, current.report_ended_at)),
    };
  }
  const reportStarted = current.report_started_at || current.ended_at || now.toISOString();
  const reportEnded = now.toISOString();
  const reportDuration = secondsBetween(reportStarted, reportEnded) ?? 0;
  return {
    report_started_at: reportStarted,
    report_ended_at: reportEnded,
    report_duration_seconds: reportDuration,
    treated_ended_at: reportEnded,
    treatment_duration_seconds: treatmentSeconds(current.duration_seconds, reportDuration),
  };
}

export function buildTimingSnapshot(input: {
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  reportStartedAt?: string | null;
  reportEndedAt?: string | null;
  reportDurationSeconds?: number | null;
  treatedEndedAt?: string | null;
  treatmentDurationSeconds?: number | null;
}) {
  const callSeconds = input.durationSeconds ?? secondsBetween(input.startedAt, input.endedAt) ?? 0;
  const reportSeconds = input.reportDurationSeconds ?? secondsBetween(input.reportStartedAt || input.endedAt, input.reportEndedAt) ?? 0;
  const total = input.treatmentDurationSeconds ?? treatmentSeconds(callSeconds, reportSeconds);
  return {
    callSeconds,
    reportSeconds,
    treatmentSeconds: total,
    startedAt: input.startedAt || null,
    callEndedAt: input.endedAt || null,
    reportStartedAt: input.reportStartedAt || input.endedAt || null,
    reportEndedAt: input.reportEndedAt || input.treatedEndedAt || null,
    treatedEndedAt: input.treatedEndedAt || input.reportEndedAt || null,
  };
}
