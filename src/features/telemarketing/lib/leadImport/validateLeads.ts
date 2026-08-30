import type { ExistingLeadIndex, LeadImportPreview, LeadRowIssue, LeadRowIssueKind, MappedLeadRow } from './types';

export function phoneMatchKey(phone: string): string {
  return (phone || '').replace(/[^0-9*]/g, '');
}

export function emailMatchKey(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function numberMatchKey(value: string): string {
  return (value || '').trim();
}

/** Shared switchboard/email is not enough to treat two companies as the same lead. */
export function companyMatchKey(name: string): string {
  return (name || '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BLOCKING_KINDS = new Set<LeadRowIssueKind>([
  'invalid',
  'duplicate_in_file_number',
  'duplicate_in_file_company',
  'existing_number',
  'existing_company',
]);

export function isBlockingLeadIssue(kind: LeadRowIssueKind): boolean {
  return BLOCKING_KINDS.has(kind);
}

export function buildLeadImportPreview(
  rows: MappedLeadRow[],
  existing: ExistingLeadIndex,
): LeadImportPreview {
  const issues: LeadRowIssue[] = [];
  const seenNumbers = new Map<string, number>();
  const seenCompanies = new Map<string, number>();
  const seenPhones = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const companies = existing.companies || new Set<string>();

  for (const row of rows) {
    const hasIdentity = Boolean(row.company_name || row.phone);
    if (!hasIdentity) {
      issues.push({ rowIndex: row.rowIndex, kind: 'invalid', message: 'חסרים שם חברה וטלפון' });
    }

    const numberKey = numberMatchKey(row.lead_number);
    if (numberKey) {
      const prev = seenNumbers.get(numberKey);
      if (prev) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'duplicate_in_file_number',
          message: `מספר ליד ${numberKey} כפול בקלט (שורה ${prev})`,
        });
      } else {
        seenNumbers.set(numberKey, row.rowIndex);
      }
      if (existing.numbers.has(numberKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_number',
          message: `מספר ליד ${numberKey} כבר קיים במאגר`,
        });
      }
    }

    const companyKey = companyMatchKey(row.company_name);
    if (companyKey) {
      const prev = seenCompanies.get(companyKey);
      if (prev) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'duplicate_in_file_company',
          message: `שם חברה כפול בקלט (שורה ${prev})`,
        });
      } else {
        seenCompanies.set(companyKey, row.rowIndex);
      }
      if (companies.has(companyKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_company',
          message: 'חברה כבר קיימת במאגר',
        });
      }
    }

    const phoneKey = phoneMatchKey(row.phone);
    if (phoneKey) {
      const prev = seenPhones.get(phoneKey);
      if (prev) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'duplicate_in_file_phone',
          message: `טלפון משותף בקלט עם שורה ${prev} — לא נפסל אוטומטית`,
        });
      } else {
        seenPhones.set(phoneKey, row.rowIndex);
      }
      if (existing.phones.has(phoneKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_phone',
          message: 'טלפון קיים במאגר לחברה אחרת — לא נפסל אוטומטית',
        });
      }
    }

    const emailKey = emailMatchKey(row.email);
    if (emailKey) {
      const prev = seenEmails.get(emailKey);
      if (prev) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'duplicate_in_file_email',
          message: `מייל משותף בקלט עם שורה ${prev} — לא נפסל אוטומטית`,
        });
      } else {
        seenEmails.set(emailKey, row.rowIndex);
      }
      if (existing.emails.has(emailKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_email',
          message: 'מייל קיים במאגר לחברה אחרת — לא נפסל אוטומטית',
        });
      }
    }
  }

  const blocked = new Set(issues.filter((issue) => isBlockingLeadIssue(issue.kind)).map((issue) => issue.rowIndex));
  const invalidCount = issues.filter((issue) => issue.kind === 'invalid').length;
  const duplicateCount = issues.filter((issue) => isBlockingLeadIssue(issue.kind) && issue.kind !== 'invalid').length;
  const willImportCount = rows.filter((row) => !blocked.has(row.rowIndex)).length;

  return {
    pastedCount: rows.length,
    validCount: rows.length - invalidCount,
    invalidCount,
    duplicateCount,
    willImportCount,
    rows,
    issues,
  };
}

export function rowsReadyToImport(preview: LeadImportPreview): MappedLeadRow[] {
  const blocked = new Set(preview.issues.filter((issue) => isBlockingLeadIssue(issue.kind)).map((issue) => issue.rowIndex));
  return preview.rows.filter((row) => !blocked.has(row.rowIndex));
}
