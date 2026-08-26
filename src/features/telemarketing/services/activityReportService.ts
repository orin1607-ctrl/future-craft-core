import { getDashboardData, getFollowUpWorkItems } from '@/features/telemarketing/services/telemarketingService';
import { getWorkSessions } from '@/features/telemarketing/services/workSessionService';
import { getTeamChats } from '@/features/telemarketing/services/teamChatService';
import { dayKey, inDayRange } from '@/features/telemarketing/lib/formatTime';
import type { CallResult, FollowUpWorkItem, TeamChat, TelemarketingCall, TelemarketingWorkSession } from '@/features/telemarketing/types';

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
  workSeconds: number;
  dialAttempts: number;
  answered: number;
  noAnswer: number;
  wrongNumber: number;
  notInterested: number;
  interested: number;
  hotLeads: number;
  meetings: number;
  followUps: number;
  daliaReports: number;
  daliaSeconds: number;
  answerRate: number | null;
  interestRate: number | null;
  meetingRate: number | null;
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
    workSeconds: 0,
    dialAttempts: 0,
    answered: 0,
    noAnswer: 0,
    wrongNumber: 0,
    notInterested: 0,
    interested: 0,
    hotLeads: 0,
    meetings: 0,
    followUps: 0,
    daliaReports: 0,
    daliaSeconds: 0,
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
  row.measuredWorkSeconds = row.callSeconds + row.workSeconds;
  if (row.firstActivityAt && row.lastActivityAt) {
    row.activityWindowSeconds = Math.max(0, Math.round((new Date(row.lastActivityAt).getTime() - new Date(row.firstActivityAt).getTime()) / 1000));
  }
  row.answerRate = rate(row.answered, row.dialAttempts);
  row.interestRate = rate(row.interested, row.answered);
  row.meetingRate = rate(row.meetings, row.interested);
  return row;
}

export function buildActivityReport(input: {
  filters: ActivityFilters;
  calls: TelemarketingCall[];
  work: TelemarketingWorkSession[];
  followUps: FollowUpWorkItem[];
  chats: TeamChat[];
}): ActivityReport {
  const { filters } = input;
  const calls = input.calls.filter((c) => {
    if (!inDayRange(c.startedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && c.employeeName !== filters.employeeName) return false;
    if (filters.result && c.result !== filters.result) return false;
    if (filters.status && c.status !== filters.status) return false;
    return true;
  });
  const work = input.work.filter((s) => {
    if (!inDayRange(s.startedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && s.employeeName !== filters.employeeName) return false;
    return true;
  });
  const followUps = input.followUps.filter((f) => {
    const createdDay = f.createdAt ? dayKey(f.createdAt) : '';
    const inDue = (!filters.from || f.dueDate >= filters.from) && (!filters.to || f.dueDate <= filters.to);
    const inCreated = (!filters.from || createdDay >= filters.from) && (!filters.to || createdDay <= filters.to);
    if (!inDue && !inCreated) return false;
    if (filters.employeeName && f.employeeName !== filters.employeeName) return false;
    return true;
  });
  const chats = input.chats.filter((c) => {
    if (!inDayRange(c.openedAt, filters.from, filters.to)) return false;
    if (filters.employeeName && c.agentName !== filters.employeeName) return false;
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
    row.callSeconds += call.durationSeconds || 0;
    markBounds(row, call.startedAt, call.endedAt);
  }
  for (const session of work) {
    const row = rowFor(session.employeeId, session.employeeName);
    row.workSeconds += session.durationSeconds || 0;
    markBounds(row, session.startedAt, session.endedAt);
  }
  for (const fu of followUps) {
    const row = rowFor(fu.employeeId, fu.employeeName);
    row.followUps++;
  }
  for (const chat of chats) {
    const row = rowFor(chat.agentId, chat.agentName);
    row.daliaReports++;
    if (chat.openedAt && chat.closedAt) {
      row.daliaSeconds += Math.max(0, Math.round((new Date(chat.closedAt).getTime() - new Date(chat.openedAt).getTime()) / 1000));
    }
    markBounds(row, chat.openedAt, chat.closedAt);
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
    acc.daliaReports += row.daliaReports;
    acc.daliaSeconds += row.daliaSeconds;
    acc.callSeconds += row.callSeconds;
    acc.workSeconds += row.workSeconds;
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
    unmeasured: [
      {
        measured: false,
        label: 'שעת כניסה/יציאה למשמרת',
        reason: 'אין שעון נוכחות. מוצג חלון בין הפעילות הראשונה לאחרונה בטווח (שיחה או משימה).',
      },
      {
        measured: false,
        label: 'זמן מסך / זמן פעילות במערכת',
        reason: 'אין heartbeat. נמדד רק משך שיחות + משך משימות עבודה.',
      },
      {
        measured: false,
        label: 'תפוס / מנותק',
        reason: 'תוצאות השיחה כוללות «לא ענה» ו«מספר שגוי» בלבד. אין פיצול לתפוס/מנותק.',
      },
      {
        measured: false,
        label: 'זמן מילוי דיווח שיחה',
        reason: 'הדיווח נשמר אחרי סיום הטיימר. אין מדידת זמן נפרדת למילוי הטופס. משך פניית דליה נמדד מפתיחה עד סגירה בלבד.',
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
  const [{ calls }, work, followUps, chats] = await Promise.all([
    getDashboardData(1000),
    getWorkSessions(1000),
    getFollowUpWorkItems(),
    getTeamChats(),
  ]);
  return buildActivityReport({ filters, calls, work, followUps, chats });
}
