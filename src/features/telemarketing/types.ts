export type UUID = string;

export const CALL_RESULTS = [
  'לא ענה',
  'לנסות שוב',
  'דיברנו',
  'מעוניין',
  'מעוניין מאוד',
  'ביקש מידע',
  'ביקש הצעת מחיר',
  'רוצה פגישה',
  'לחזור אליו',
  'לא מעוניין',
  'לא רלוונטי',
  'מספר שגוי',
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export const LEAD_RATINGS = ['קר', 'פושר', 'חם', 'דחוף'] as const;
export type LeadRating = (typeof LEAD_RATINGS)[number];

export const URGENCY_LEVELS = ['רגיל', 'חשוב', 'דחוף'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export type NotificationStatus = 'not_applicable' | 'pending' | 'sent' | 'failed';
export type RecordingStatus = 'none' | 'pending' | 'ready' | 'failed';
export type CallStatus = 'in_progress' | 'completed';
export type FollowUpStatus = 'open' | 'done';

export interface TelemarketingEmployee {
  id: UUID;
  displayName: string;
  employeeCode?: string | null;
}

export interface CustomerRef {
  customerId?: UUID | null;
  companyName: string;
  contactName?: string;
  contactRole?: string;
  phone: string;
  email?: string;
  vehicleCount?: number | null;
  city?: string;
}

export interface TelemarketingCall extends CustomerRef {
  id: UUID;
  employeeId: UUID;
  employeeName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  status: CallStatus;
  result: CallResult | null;
  leadRating: LeadRating | null;
  summary: string | null;
  needsFollowUp: boolean;
  nextAction: string | null;
  followUpOwner: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
  followUpUrgency: UrgencyLevel | null;
  managerNote: string | null;
  whatsappStatus: NotificationStatus;
  emailStatus: NotificationStatus;
  recordingPath: string | null;
  recordingStatus: RecordingStatus;
  recordingMime: string | null;
  sourceFollowUpId: string | null;
  clientToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelemarketingFollowUp {
  id: UUID;
  callId: UUID;
  companyName: string;
  contactName?: string;
  phone: string;
  actionNeeded: string;
  owner: string | null;
  dueDate: string;
  dueTime: string | null;
  urgency: UrgencyLevel;
  managerNote: string | null;
  status: FollowUpStatus;
  completedBy: UUID | null;
  completedAt: string | null;
  closedByCallId: string | null;
  createdAt: string;
}

export interface StartCallPayload {
  employeeId: UUID;
  employeeName: string;
  customerId?: UUID | null;
  companyName: string;
  contactName?: string;
  contactRole?: string;
  phone: string;
  email?: string;
  vehicleCount?: number | null;
  city?: string;
  clientToken: string;
  sourceFollowUpId?: string | null;
}

export interface CompleteCallReportPayload {
  callId: UUID;
  result: CallResult;
  leadRating: LeadRating;
  summary: string;
  needsFollowUp: boolean;
  nextAction?: string;
  followUpOwner?: string;
  followUpDate?: string;
  followUpTime?: string;
  followUpUrgency?: UrgencyLevel;
  managerNote?: string;
  clientToken: string;
  sourceFollowUpId?: string | null;
  leadColor?: 'red' | 'yellow' | 'green';
  leadStatus?: string;
  closeReason?: string;
  closeOpenFollowUps?: boolean;
}

export interface ExistingCustomerLookup {
  found: boolean;
  companyName?: string;
  contactName?: string;
  lastCallDate?: string;
  lastCallTime?: string;
  lastResult?: CallResult;
  lastSummary?: string;
  openFollowUp?: {
    dueDate: string;
    actionNeeded: string;
  } | null;
  inProgressByOtherAgent?: boolean;
}

export interface FollowUpNotificationPayload {
  companyName: string;
  contactName?: string;
  phone: string;
  vehicleCount?: number | null;
  employeeName: string;
  callDate: string;
  startedAtLabel: string;
  endedAtLabel: string;
  durationLabel: string;
  result: CallResult;
  leadRating: LeadRating;
  summary: string;
  nextAction: string;
  followUpDate: string;
  followUpTime?: string;
  urgency: UrgencyLevel;
}

export interface TelemarketingDashboardSummary {
  callsToday: number;
  answeredToday: number;
  noAnswerToday: number;
  totalCallDurationSeconds: number;
  avgCallDurationSeconds: number;
  interested: number;
  hotLeads: number;
  urgentLeads: number;
  wantsInfo: number;
  wantsQuote: number;
  wantsMeeting: number;
  followUpsOpen: number;
  followUpsToday: number;
  followUpsLate: number;
}

export interface AgentPerformance {
  employeeId: UUID;
  employeeName: string;
  employeeCode?: string | null;
  callsToday: number;
  answeredToday: number;
  noAnswerToday: number;
  hotLeads: number;
  followUpsOpen: number;
  totalCallDurationSeconds: number;
  avgCallDurationSeconds: number;
  wantsMeeting: number;
  wantsInfo: number;
  wantsQuote: number;
  workCount: number;
  workSeconds: number;
  avgWorkSeconds: number;
  totalWorkSeconds: number;
}

export interface TelemarketingSettings {
  managerWhatsappNumber: string;
  managerNotificationEmail: string;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
}

export interface FollowUpWorkItem extends TelemarketingFollowUp {
  employeeId: string;
  employeeName: string;
  lastResult: CallResult | null;
  lastSummary: string | null;
  lastRecordingPath: string | null;
  bucket: 'late' | 'today' | 'future' | 'done';
  leadColor?: 'red' | 'yellow' | 'green' | null;
  leadStatus?: string | null;
  closeReason?: string | null;
}

export const WORK_TASK_TYPES = [
  'בדיקה על לקוח',
  'חיפוש מידע',
  'הכנת חומר',
  'שליחת חומר',
  'הכנת הצעה',
  'טיפול ב-Follow-up',
  'עדכון פרטים',
  'עבודה משרדית',
  'שיחה פנימית / תיאום',
  'משימה אחרת',
] as const;
export type WorkTaskType = (typeof WORK_TASK_TYPES)[number];

export interface TelemarketingWorkSession {
  id: UUID;
  employeeId: UUID;
  employeeName: string;
  customerId: UUID | null;
  companyName: string;
  contactName?: string;
  phone: string;
  taskType: string;
  description: string | null;
  note: string | null;
  needsFollowUp: boolean;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  status: CallStatus;
  clientToken: string;
  createdAt: string;
}

export interface TelemarketingLeadState {
  id: UUID;
  leadKey: string;
  companyName: string;
  contactName?: string;
  phone: string;
  employeeId: string | null;
  employeeName: string | null;
  leadColor: 'red' | 'yellow' | 'green';
  leadStatus: string;
  reason: string | null;
  changedAt: string;
  changedBy: string | null;
  callCount?: number;
  workSeconds?: number;
  lastCallAt?: string | null;
  nextFollowUp?: string | null;
}

export interface ActivityJournalItem {
  id: string;
  kind: 'call' | 'work';
  employeeId: string;
  employeeName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  title: string;
  detail: string | null;
}

export interface WorkTimeSummary {
  employeeId: string;
  employeeName: string;
  callCount: number;
  workCount: number;
  callSeconds: number;
  workSeconds: number;
  totalSeconds: number;
  avgCallSeconds: number;
  avgWorkSeconds: number;
}
