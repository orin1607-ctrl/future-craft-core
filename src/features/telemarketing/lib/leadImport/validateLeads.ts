import type { ExistingLeadIndex, LeadImportPreview, LeadRowIssue, MappedLeadRow } from './types';

export function phoneMatchKey(phone: string): string {
  return (phone || '').replace(/[^0-9*]/g, '');
}

export function emailMatchKey(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function numberMatchKey(value: string): string {
  return (value || '').trim();
}

export function buildLeadImportPreview(
  rows: MappedLeadRow[],
  existing: ExistingLeadIndex,
): LeadImportPreview {
  const issues: LeadRowIssue[] = [];
  const seenNumbers = new Map<string, number>();
  const seenPhones = new Map<string, number>();
  const seenEmails = new Map<string, number>();

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

    const phoneKey = phoneMatchKey(row.phone);
    if (phoneKey) {
      const prev = seenPhones.get(phoneKey);
      if (prev) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'duplicate_in_file_phone',
          message: `טלפון כפול בקלט (שורה ${prev})`,
        });
      } else {
        seenPhones.set(phoneKey, row.rowIndex);
      }
      if (existing.phones.has(phoneKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_phone',
          message: 'טלפון כבר קיים במאגר — ללא Merge אוטומטי',
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
          message: `מייל כפול בקלט (שורה ${prev})`,
        });
      } else {
        seenEmails.set(emailKey, row.rowIndex);
      }
      if (existing.emails.has(emailKey)) {
        issues.push({
          rowIndex: row.rowIndex,
          kind: 'existing_email',
          message: 'מייל כבר קיים במאגר — ללא Merge אוטומטי',
        });
      }
    }
  }

  const blocked = new Set(issues.map((issue) => issue.rowIndex));
  const invalidCount = issues.filter((issue) => issue.kind === 'invalid').length;
  const duplicateCount = issues.filter((issue) => issue.kind !== 'invalid').length;
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
  const blocked = new Set(preview.issues.map((issue) => issue.rowIndex));
  return preview.rows.filter((row) => !blocked.has(row.rowIndex));
}
