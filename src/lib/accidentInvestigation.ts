/** Driver fault and investigation answers on public.accidents.
 * Values are 'yes' / 'no'; NULL means not determined / not done yet.
 */

export type YesNo = '' | 'yes' | 'no';

export type AccidentInvestigation = {
  driverAtFault: YesNo;
  investigationDone: YesNo;
  investigationConclusions: string;
};

type InvestigationRow = {
  driver_at_fault?: string | null;
  investigation_done?: string | null;
  investigation_conclusions?: string | null;
};

function toYesNo(value: string | null | undefined): YesNo {
  return value === 'yes' || value === 'no' ? value : '';
}

export function investigationFromRow(row: InvestigationRow | null | undefined): AccidentInvestigation {
  return {
    driverAtFault: toYesNo(row?.driver_at_fault),
    investigationDone: toYesNo(row?.investigation_done),
    investigationConclusions: row?.investigation_conclusions || '',
  };
}

/** Columns to write. Only fields that differ from `initial` are returned, so a save
 * that does not touch the investigation never references the new columns. */
export function investigationPayload(
  current: AccidentInvestigation,
  initial: AccidentInvestigation = investigationFromRow(null),
): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  if (current.driverAtFault !== initial.driverAtFault) payload.driver_at_fault = current.driverAtFault || null;
  if (current.investigationDone !== initial.investigationDone) payload.investigation_done = current.investigationDone || null;
  const conclusions = current.investigationConclusions.trim();
  if (conclusions !== initial.investigationConclusions.trim()) payload.investigation_conclusions = conclusions || null;
  return payload;
}

export function yesNoLabel(value: string | null | undefined, empty: string): string {
  if (value === 'yes') return 'כן';
  if (value === 'no') return 'לא';
  return empty;
}
