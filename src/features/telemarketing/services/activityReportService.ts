import { getDashboardData, getFollowUpWorkItems } from '@/features/telemarketing/services/telemarketingService';
import { getWorkSessions } from '@/features/telemarketing/services/workSessionService';
import { getTeamChats } from '@/features/telemarketing/services/teamChatService';
import { getLeadStates } from '@/features/telemarketing/services/leadStateService';
import { attachLeadNumbers, listLeadDirectory } from '@/features/telemarketing/services/leadDirectoryService';
import { dayKey, inDayRange } from '@/features/telemarketing/lib/formatTime';
import { buildTimingSnapshot, matchesLeadQuery, normalizeLeadQuery } from '@/features/telemarketing/lib/callTiming';
import { keepsContinuedTreatment } from '@/features/telemarketing/lib/leadTraffic';
import type { CallResult, FollowUpWorkItem, TeamChat, TelemarketingCall, TelemarketingLeadState, TelemarketingWorkSession } from '@/features/telemarketing/types';
import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export const INTERESTED_RESULTS: CallResult[] = ['מעוניין', 'מעוניין מאוד', 'ביקש מידע', 'ביקש הצעת מחיר', 'רוצה פגישה', 'לחזור אליו'];
export const HOT_RATINGS = ['חם', 'דחוף'] as const;

export function isAnsweredResult(result: CallResult | null): boolean {
  return !!result && result !== 'לא ענה' && result !== 'מספר שגוי';
}

export function isNoAnswerResult(result: CallResult | null): boolean {
  return result === 'לא ענה';
}

export interface ActivityFilters {
  from: string;
  to: string;
  employeeName: string;
  result: string;
  status: '' | 'completed' | 'in_progress';
  leadQuery?: string;
}

export interface UnmeasuredMetric {
  measured: false;
  label: string;
  reason: string;
}

export interface EmployeeActivityRow {
  employeeId: string;
  employeeName: string;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  activityWindowSeconds: number;
  measuredWorkSeconds: number;
  callSeconds: number;
  reportSeconds: number;
  callTreatmentSeconds: number;
  workSeconds: number;
  workReportSeconds: number;
  workTreatmentSeconds: number;
  workTaskCount: number;
  dialAttempts: number;
  answered: number;
  noAnswer: number;
  wrongNumber: number;
  notInterested: number;
  interested: number;
  hotLeads: number;
  meetings: number;
  followUps: number;
  continuedTreatments: number;
  daliaReports: number;
  daliaSeconds: number | null;
  answerRate: number | null;
  interestRate: number | null;
  meetingRate: number | null;
}

export interface LeadAttemptView {
  attempt: number;
  callId: string;
  date: string;
  employeeName: string;
  startedAt: string;
  callEndedAt: string | null;
  callSeconds: number;
  reportStartedAt: string | null;
  reportEndedAt: string | null;
  reportSeconds: number;
  treatedEndedAt: string | null;
  treatmentSeconds: number;
  result: string | null;
  notes: string | null;
  followUp: string | null;
  leadRating: string | null;
}

export interface LeadActivityDetail {
  leadNumber: string;
  companyName: string;
  assignedName: string | null;
  source: string | null;
  createdAt: string | null;
  currentStatus: string | null;
  attempts: LeadAttemptView[];
  totals: { attemptCount: number; callSeconds: number; reportSeconds: number; treatmentSeconds: number };
}

export interface ActivityReport {
  filters: ActivityFilters;
  employeeNames: string[];
  totals: EmployeeActivityRow;
  employees: EmployeeActivityRow[];
  calls: TelemarketingCall[];
  work: TelemarketingWorkSession[];
  followUps: FollowUpWorkItem[];
  meetings: { companyName: string; employeeName: string; when: string; callId: string; leadNumber?: string | null }[];
  notInterested: { companyName: string; employeeName: string; reason: string; at: string; leadNumber?: string | null }[];
  interested: { companyName: string; employeeName: string; result: string; at: string; leadNumber?: string | null }[];
  hotLeads: { companyName: string; employeeName: string; rating: string; at: string; leadNumber?: string | null }[];
  notes: { companyName: string; employeeName: string; note: string; at: string; leadNumber?: string | null }[];
  daliaReports: TeamChat[];
  leadDetail: LeadActivityDetail | null;
  unmeasured: UnmeasuredMetric[];
}

function emptyRow(employeeId: string, employeeName: string): EmployeeActivityRow {
  return {
    employeeId,
    employeeName,
    firstActivityAt: null,
    lastActivityAt: null,
    activityWindowSeconds: 0,
    measuredWorkSeconds: 0,
    callSeconds: 0,
    reportSeconds: 0,
    callTreatmentSeconds: 0,
    workSeconds: 0,
    workReportSeconds: 0,
    workTreatmentSeconds: 0,
    workTaskCount: 0,
    dialAttempts: 0,
    answered: 0,
    noAnswer: 0,
    wrongNumber: 0,
    notInterested: 0,
    interested: 0,
    hotLeads: 0,
    meetings: 0,
    followUps: 0,
    continuedTreatments: 0,
    daliaReports: 0,
    daliaSeconds: null,
    answerRate: null,
    interestRate: null,
    meetingRate: null,
  };
}

function markBounds(row: EmployeeActivityRow, start: string | null | undefined, end: string | null | undefined) {
  if (!start) return;
  if (!row.firstActivityAt || start < row.firstActivityAt) row.firstActivityAt = start;
  const finish = end || start;
  if (!row.lastActivityAt || finish > row.lastActivityAt) row.lastActivityAt = finish;
}

function rate(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function finalize(row: EmployeeActivityRow): EmployeeActivityRow {
  row.callTreatmentSeconds = row.callSeconds + row.reportSeconds;
  row.workTreatmentSeconds = row.workSeconds + row.workReportSeconds;
  row.measuredWorkSeconds = row.callTreatmentSeconds + row.workTreatmentSeconds;
  row.daliaSeconds = null;
  if (row.firstActivityAt && row.lastActivityAt) {
    row.activityWindowSeconds = Math.max(0, Math.round((new Date(row.lastActivityAt).getTime() - new Date(row.firstActivityAt).getTime()) / 1000));
  }
  row.answerRate = rate(row.answered, row.dialAttempts);
  row.interestRate = rate(row.interested, row.answered);
  row.meetingRate = rate(row.meetings, row.interested);
  return row;
}

function matchesLead(query: string | undefined, leadNumber?: string | null, companyName?: string | null) {
  return matchesLeadQuery(query, leadNumber, companyName);
}

export function buildLeadDetail(input: {
  filters: ActivityFilters;
  calls: TelemarketingCall[];
  directory?: LeadDirectoryRecord[];
  leadStates?: TelemarketingLeadState[];
}): LeadActivityDetail | null {
  const q = normalizeLeadQuery(input.filters.leadQuery);
  if (!q) return null;
  const directoryHits = (input.directory || []).filter((row) => matchesLead(q, row.leadNumber, row.companyName));
  const callHits = input.calls.filter((c) => matchesLead(q, c.leadNumber, c.companyName));
  const uniqueNumbers = [...new Set([
    ...directoryHits.map((row) => row.leadNumber),
    ...callHits.map((c) => c.leadNumber).filter(Boolean) as string[],
  ])];
  if (uniqueNumbers.length !== 1 && directoryHits.length !== 1) return null;
  const resolvedNumber = directoryHits.length === 1 ? directoryHits[0].leadNumber : uniqueNumbers[0];
  const dir = (input.directory || []).find((row) => row.leadNumber === resolvedNumber) || directoryHits[0] || null;
  const attemptsSource = input.calls
    .filter((c) => c.leadNumber === resolvedNumber || (!c.leadNumber && dir && matchesLead(resolvedNumber, null, c.companyName)))
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const attempts: LeadAttemptView[] = attemptsSource.map((call, index) => {
    const snap = buildTimingSnapshot(call);
    const completed = call.status === 'completed';
    return {
      attempt: index + 1,
      callId: call.id,
      date: dayKey(call.startedAt),
      employeeName: call.employeeName,
      startedAt: call.startedAt,
      callEndedAt: call.endedAt,
      callSeconds: completed || call.endedAt ? snap.callSeconds : 0,
      reportStartedAt: snap.reportStartedAt,
      reportEndedAt: snap.reportEndedAt,
      reportSeconds: completed ? snap.reportSeconds : 0,
      treatedEndedAt: snap.treatedEndedAt,
      treatmentSeconds: completed ? snap.treatmentSeconds : 0,
      result: call.result,
      notes: [call.summary, call.managerNote].filter(Boolean).join(' · ') || null,
      followUp: call.needsFollowUp
        ? [call.nextAction, call.followUpDate, call.followUpTime].filter(Boolean).join(' · ')
        : null,
      leadRating: call.leadRating,
    };
  });
  const totals = attempts.reduce(
    (acc, row) => {
      acc.callSeconds += row.callSeconds;
      acc.reportSeconds += row.reportSeconds;
      acc.treatmentSeconds += row.treatmentSeconds;
      return acc;
    },
    { attemptCount: attempts.length, callSeconds: 0, reportSeconds: 0, treatmentSeconds: 0 },
  );
  const state = (input.leadStates || []).find((s) => s.leadNumber === resolvedNumber)
    || (input.leadStates || []).find((s) => dir && matchesLead(dir.leadNumber, s.leadNumber, s.companyName));
  return {
    leadNumber: resolvedNumber,
    companyName: dir?.companyName || attemptsSource[0]?.companyName || '',
    assignedName: dir?.assignedName || null,
    source: dir?.source || null,
    createdAt: dir?.createdAt || null,
    currentStatus: state ? `${state.leadColor} / ${state.leadStatus}` : null,
    attempts,
    totals,
  };
}

export function buildActivityReport(input: {
  filters: ActivityFilters;
  calls: TelemarketingCall[];
  work: TelemarketingWorkSession[];
  followUps: FollowUpWorkItem[];
  chats: TeamChat[];
  directory?: LeadDirectoryRecord[];
  leadStates?: TelemarketingLeadState[];
}): ActivityReport {
  const { filters } = input;
  const calls = input.calls.filter((c) => {
    if (!inDayRange(c.startedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && c.employeeName !== filters.employeeName) return false;
    if (filters.result && c.result !== filters.result) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (!matchesLead(filters.leadQuery, c.leadNumber, c.companyName)) return false;
    return true;
  });
  const work = input.work.filter((s) => {
    if (!inDayRange(s.startedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && s.employeeName !== filters.employeeName) return false;
    if (!matchesLead(filters.leadQuery, s.leadNumber, s.companyName)) return false;
    return true;
  });
  const followUps = input.followUps.filter((f) => {
    const createdDay = f.createdAt ? dayKey(f.createdAt) : '';
    const inDue = (!filters.from || f.dueDate >= filters.from) && (!filters.to || f.dueDate <= filters.to);
    const inCreated = (!filters.from || createdDay >= filters.from) && (!filters.to || createdDay <= filters.to);
    if (!inDue && !inCreated) return false;
    if (filters.employeeName && f.employeeName !== filters.employeeName) return false;
    if (!matchesLead(filters.leadQuery, f.leadNumber, f.companyName)) return false;
    return true;
  });
  const chats = input.chats.filter((c) => {
    if (!inDayRange(c.openedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && c.agentName !== filters.employeeName) return false;
    if (!matchesLead(filters.leadQuery, c.leadNumber, c.companyName)) return false;
    return true;
  });

  const byAgent = new Map<string, EmployeeActivityRow>();
  const rowFor = (id: string, name: string) => {
    const key = id || name;
    if (!byAgent.has(key)) byAgent.set(key, emptyRow(id, name));
    return byAgent.get(key)!;
  };

  for (const call of calls) {
    const row = rowFor(call.employeeId, call.employeeName);
    row.dialAttempts++;
    if (isAnsweredResult(call.result)) row.answered++;
    if (isNoAnswerResult(call.result)) row.noAnswer++;
    if (call.result === 'מספר שגוי') row.wrongNumber++;
    if (call.result === 'לא מעוניין' || call.result === 'לא רלוונטי') row.notInterested++;
    if (INTERESTED_RESULTS.includes((call.result || '') as CallResult)) row.interested++;
    if (HOT_RATINGS.includes((call.leadRating || '') as (typeof HOT_RATINGS)[number])) row.hotLeads++;
    if (call.result === 'רוצה פגישה') row.meetings++;
    if (keepsContinuedTreatment(call.result)) row.continuedTreatments++;
    if (call.status === 'completed') {
      const snap = buildTimingSnapshot(call);
      row.callSeconds += snap.callSeconds;
      row.reportSeconds += snap.reportSeconds;
    }
    markBounds(row, call.startedAt, call.treatedEndedAt || call.reportEndedAt || call.endedAt);
  }
  for (const session of work) {
    const row = rowFor(session.employeeId, session.employeeName);
    row.workTaskCount++;
    if (session.status === 'completed') {
      const snap = buildTimingSnapshot(session);
      row.workSeconds += snap.callSeconds;
      row.workReportSeconds += snap.reportSeconds;
    }
    markBounds(row, session.startedAt, session.treatedEndedAt || session.reportEndedAt || session.endedAt);
  }
  for (const fu of followUps) {
    const row = rowFor(fu.employeeId, fu.employeeName);
    row.followUps++;
  }
  for (const chat of chats) {
    const row = rowFor(chat.agentId, chat.agentName);
    row.daliaReports++;
  }

  const employees = Array.from(byAgent.values()).map(finalize).sort((a, b) => b.dialAttempts - a.dialAttempts);
  const totals = finalize(employees.reduce((acc, row) => {
    acc.employeeName = 'כל העובדים';
    acc.dialAttempts += row.dialAttempts;
    acc.answered += row.answered;
    acc.noAnswer += row.noAnswer;
    acc.wrongNumber += row.wrongNumber;
    acc.notInterested += row.notInterested;
    acc.interested += row.interested;
    acc.hotLeads += row.hotLeads;
    acc.meetings += row.meetings;
    acc.followUps += row.followUps;
    acc.continuedTreatments += row.continuedTreatments;
    acc.daliaReports += row.daliaReports;
    acc.callSeconds += row.callSeconds;
    acc.reportSeconds += row.reportSeconds;
    acc.workSeconds += row.workSeconds;
    acc.workReportSeconds += row.workReportSeconds;
    acc.workTaskCount += row.workTaskCount;
    markBounds(acc, row.firstActivityAt, row.lastActivityAt);
    return acc;
  }, emptyRow('', 'כל העובדים')));

  return {
    filters,
    employeeNames: Array.from(new Set([...input.calls, ...input.work].map((row) => row.employeeName).filter(Boolean))).sort(),
    totals,
    employees,
    calls,
    work,
    followUps,
    meetings: calls
      .filter((c) => c.result === 'רוצה פגישה')
      .map((c) => ({
        companyName: c.companyName || c.contactName || 'ללא שם',
        employeeName: c.employeeName,
        when: c.followUpDate ? `${c.followUpDate}${c.followUpTime ? ` ${c.followUpTime}` : ''}` : 'ללא מועד שמור',
        callId: c.id,
        leadNumber: c.leadNumber,
      })),
    notInterested: calls
      .filter((c) => c.result === 'לא מעוניין' || c.result === 'לא רלוונטי')
      .map((c) => ({
        companyName: c.companyName || c.contactName || 'ללא שם',
        employeeName: c.employeeName,
        reason: c.managerNote || c.summary || c.result || '',
        at: c.startedAt,
        leadNumber: c.leadNumber,
      })),
    interested: calls
      .filter((c) => INTERESTED_RESULTS.includes((c.result || '') as CallResult))
      .map((c) => ({
        companyName: c.companyName || c.contactName || 'ללא שם',
        employeeName: c.employeeName,
        result: c.result || '',
        at: c.startedAt,
        leadNumber: c.leadNumber,
      })),
    hotLeads: calls
      .filter((c) => HOT_RATINGS.includes((c.leadRating || '') as (typeof HOT_RATINGS)[number]))
      .map((c) => ({
        companyName: c.companyName || c.contactName || 'ללא שם',
        employeeName: c.employeeName,
        rating: c.leadRating || '',
        at: c.startedAt,
        leadNumber: c.leadNumber,
      })),
    notes: calls
      .filter((c) => (c.summary || c.managerNote || '').trim())
      .map((c) => ({
        companyName: c.companyName || c.contactName || 'ללא שם',
        employeeName: c.employeeName,
        note: [c.summary, c.managerNote].filter(Boolean).join(' · '),
        at: c.startedAt,
        leadNumber: c.leadNumber,
      })),
    daliaReports: chats,
    leadDetail: buildLeadDetail({ filters, calls, directory: input.directory, leadStates: input.leadStates }),
    unmeasured: [
      {
        measured: false,
        label: 'שעת כניסה/יציאה למשמרת',
        reason: 'אין שעון נוכחות. מוצג חלון בין הפעילות הראשונה לאחרונה בטווח (שיחה או משימה).',
      },
      {
        measured: false,
        label: 'זמן מסך / זמן פעילות במערכת',
        reason: 'אין heartbeat. נמדד רק זמן טיפול בשיחות + זמן טיפול במשימות.',
      },
      {
        measured: false,
        label: 'תפוס / מנותק',
        reason: 'תוצאות השיחה כוללות «לא ענה» ו«מספר שגוי» בלבד. אין פיצול לתפוס/מנותק.',
      },
      {
        measured: false,
        label: 'פנייה לצוות דליה / דיווח למנהל',
        reason: 'אין נקודת התחלה וסיום אמינה לכתיבת ההודעה. צ׳אט פתוח אינו זמן עבודה. בדוח: לא נמדד.',
      },
      {
        measured: false,
        label: 'הפסקות מתועדות',
        reason: 'אין כפתור הפסקה. הפער בין חלון הפעילות לזמן המדוד אינו הפסקה מאושרת.',
      },
    ],
  };
}

export async function loadActivityReport(filters: ActivityFilters): Promise<ActivityReport> {
  const [{ calls }, work, followUps, chats, directory, leadStates] = await Promise.all([
    getDashboardData(1000),
    getWorkSessions(1000),
    getFollowUpWorkItems(),
    getTeamChats(),
    listLeadDirectory().catch(() => [] as LeadDirectoryRecord[]),
    getLeadStates().catch(() => [] as TelemarketingLeadState[]),
  ]);
  const numberedChats = await attachLeadNumbers(chats);
  return buildActivityReport({
    filters,
    calls,
    work,
    followUps,
    chats: numberedChats,
    directory,
    leadStates,
  });
}
