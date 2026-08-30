export const MAX_LEAD_IMPORT_ROWS = 3000;
export const MAX_LEAD_IMPORT_CHARS = 400_000;

export const LEAD_DIRECTORY_FIELDS = [
  'lead_number',
  'company_name',
  'industry',
  'region',
  'fleet_size',
  'phone',
  'email',
] as const;

export type LeadDirectoryField = (typeof LEAD_DIRECTORY_FIELDS)[number];

export type ColumnMapping = Record<number, LeadDirectoryField | 'skip' | ''>;

export type LeadImportSource = 'pasted_sheet' | 'csv' | 'xlsx';

export interface ParsedSheet {
  delimiter: 'tab' | 'comma' | 'pipe';
  headers: string[];
  rows: string[][];
  pastedCount: number;
  truncatedEmptyRows: number;
}

export interface MappedLeadRow {
  rowIndex: number;
  lead_number: string;
  company_name: string;
  industry: string;
  region: string;
  fleet_size: string;
  phone: string;
  email: string;
  extra: Record<string, string>;
}

export type LeadRowIssueKind =
  | 'invalid'
  | 'duplicate_in_file_number'
  | 'duplicate_in_file_company'
  | 'duplicate_in_file_phone'
  | 'duplicate_in_file_email'
  | 'existing_number'
  | 'existing_company'
  | 'existing_phone'
  | 'existing_email';

export interface LeadRowIssue {
  rowIndex: number;
  kind: LeadRowIssueKind;
  message: string;
}

export interface LeadImportPreview {
  pastedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  willImportCount: number;
  rows: MappedLeadRow[];
  issues: LeadRowIssue[];
}

export interface ExistingLeadIndex {
  numbers: Set<string>;
  companies: Set<string>;
  phones: Set<string>;
  emails: Set<string>;
}

export interface LeadDirectoryRecord {
  id: string;
  leadNumber: string;
  companyName: string;
  industry: string;
  region: string;
  fleetSize: string;
  phone: string;
  email: string;
  extra: Record<string, string>;
  importBatchId: string | null;
  source: string;
  createdAt: string;
  assignedTo: string | null;
  assignedName: string;
  assignedAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  archivedAt: string | null;
  leadWave: 'old' | 'new';
}

export interface LeadAssignmentEvent {
  id: string;
  leadId: string;
  leadNumber: string;
  previousAgentId: string | null;
  previousAgentName: string;
  newAgentId: string | null;
  newAgentName: string;
  changedBy: string | null;
  changedByName: string;
  createdAt: string;
}

export interface LeadAssignResult {
  assignedCount: number;
  skippedCount: number;
  skipped: { leadNumber: string; companyName: string; reason: string }[];
  agentName: string;
  agentId: string;
}

export interface LeadImportBatch {
  id: string;
  source: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  invalidCount: number;
  mapping: ColumnMapping;
  rawInputSha256: string | null;
  rawInputPreview: string | null;
  createdAt: string;
  committedAt: string | null;
}
