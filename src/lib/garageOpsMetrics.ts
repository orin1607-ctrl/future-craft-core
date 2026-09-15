import {
  extraApprovalIsPending,
  garageListBucket,
  garageNextAction,
  type GarageCase,
  type GarageCaseData,
} from '@/modules/garage-management/garageBook';

export type GarageOpsMetric = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  available: boolean;
};

export function currentMonthBounds(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

function parseTime(raw: string | null | undefined): number | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

function inRange(raw: string | null | undefined, start: Date, end: Date): boolean {
  const ms = parseTime(raw);
  if (ms == null) return false;
  return ms >= start.getTime() && ms < end.getTime();
}

function caseDataOf(row: Pick<GarageCase, 'case_data'>): GarageCaseData {
  return row.case_data || {};
}

function isClosedCase(row: Pick<GarageCase, 'case_data' | 'status'>): boolean {
  return garageListBucket(caseDataOf(row), row.status) === 'closed';
}

function closedAt(row: Pick<GarageCase, 'case_data' | 'updated_at'>): string | undefined {
  const data = caseDataOf(row);
  return data.workFinishedAt || data.caseClosedAt || row.updated_at;
}

function quoteWaiting(row: Pick<GarageCase, 'case_data' | 'status'>): boolean {
  if (isClosedCase(row)) return false;
  const data = caseDataOf(row);
  if (data.quoteSent || data.waitingForApproval) return true;
  return (data.extraApprovals || []).some((item) => extraApprovalIsPending(item));
}

function currentlyInGarage(row: Pick<GarageCase, 'case_data' | 'status'>): boolean {
  if (isClosedCase(row)) return false;
  return !!caseDataOf(row).intakeDone;
}

export function computeGarageOpsMetrics(input: {
  cases: Array<Pick<GarageCase, 'id' | 'vehicle_id' | 'status' | 'created_at' | 'updated_at' | 'case_data'>>;
  openClaimsCount: number | null;
  now?: Date;
}): GarageOpsMetric[] {
  const { start, end } = currentMonthBounds(input.now);
  const cases = input.cases || [];
  const inShop = new Set<string>();
  for (const row of cases) {
    if (!currentlyInGarage(row)) continue;
    inShop.add(row.vehicle_id || row.id);
  }
  const openCases = cases.filter((row) => !isClosedCase(row)).length;
  const claimsAvailable = input.openClaimsCount != null;
  const openFilesLabel = claimsAvailable
    ? String(openCases + input.openClaimsCount)
    : String(openCases);
  const openFilesSubtitle = claimsAvailable
    ? `תיקי מוסך פתוחים ${openCases} · תביעות פתוחות ${input.openClaimsCount}`
    : `תיקי מוסך פתוחים ${openCases} · תביעות לא נספרו (אין הרשאת claims_can_access)`;

  const entered = cases.filter((row) => caseDataOf(row).intakeDone && inRange(row.created_at, start, end)).length;
  const closed = cases.filter((row) => isClosedCase(row) && inRange(closedAt(row), start, end)).length;
  const quotes = cases.filter(quoteWaiting).length;

  return [
    {
      key: 'in_shop',
      title: 'רכבים במוסך עכשיו',
      value: String(inShop.size),
      subtitle: 'תיקים עם קבלת רכב שעדיין לא נסגרו',
      available: true,
    },
    {
      key: 'open_files',
      title: 'תיקים / תביעות פתוחים',
      value: openFilesLabel,
      subtitle: openFilesSubtitle,
      available: true,
    },
    {
      key: 'due_today',
      title: 'דורש טיפול היום',
      value: '—',
      subtitle: 'אין שדה תאריך יעד אמין בתיקי המוסך — לא מוצג מספר',
      available: false,
    },
    {
      key: 'quotes_waiting',
      title: 'הצעות ממתינות לאישור',
      value: String(quotes),
      subtitle: 'נשלחה / ממתינה ללקוח / אישור נוסף פתוח',
      available: true,
    },
    {
      key: 'entered_month',
      title: 'רכבים שנכנסו החודש',
      value: String(entered),
      subtitle: 'קבלת רכב + תאריך פתיחת התיק בחודש הנוכחי',
      available: true,
    },
    {
      key: 'closed_month',
      title: 'עבודות שנסגרו החודש',
      value: String(closed),
      subtitle: 'לפי workFinishedAt / caseClosedAt / updated_at',
      available: true,
    },
  ];
}

export type GarageOpsQueueItem = {
  id: string;
  href: string;
  title: string;
  meta: string;
  nextAction: string;
};

type QueueCase = Pick<
  GarageCase,
  | 'id'
  | 'case_number'
  | 'status'
  | 'customer_name_snapshot'
  | 'vehicle_plate_snapshot'
  | 'vehicle_label_snapshot'
  | 'case_data'
>;

function toQueueItem(row: QueueCase): GarageOpsQueueItem {
  const data = caseDataOf(row);
  return {
    id: row.id,
    href: `/garage-management/${row.id}`,
    title: String(row.case_number || row.id),
    meta: [row.vehicle_plate_snapshot, row.vehicle_label_snapshot, row.customer_name_snapshot]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' · '),
    nextAction: garageNextAction(data),
  };
}

export function buildGarageOpsWorkQueues(cases: QueueCase[], limit = 8): {
  openFiles: GarageOpsQueueItem[];
  inWork: GarageOpsQueueItem[];
  waitingApproval: GarageOpsQueueItem[];
} {
  const rows = cases || [];
  const take = (list: QueueCase[]) => list.slice(0, limit).map(toQueueItem);
  return {
    openFiles: take(rows.filter((row) => !isClosedCase(row))),
    inWork: take(rows.filter((row) => garageListBucket(caseDataOf(row), row.status) === 'in_work')),
    waitingApproval: take(rows.filter(quoteWaiting)),
  };
}
