import { LEAD_DIRECTORY_FIELDS, type ColumnMapping, type LeadDirectoryField, type MappedLeadRow, type ParsedSheet } from './types';

const ALIASES: Record<string, LeadDirectoryField> = {
  מספר: 'lead_number',
  'מספר ליד': 'lead_number',
  '#': 'lead_number',
  lead_number: 'lead_number',
  'lead number': 'lead_number',
  חברה: 'company_name',
  'שם חברה': 'company_name',
  'שם החברה': 'company_name',
  company: 'company_name',
  'company name': 'company_name',
  תחום: 'industry',
  'תחום פעילות': 'industry',
  industry: 'industry',
  אזור: 'region',
  region: 'region',
  'צי רכב': 'fleet_size',
  צי: 'fleet_size',
  fleet: 'fleet_size',
  'fleet size': 'fleet_size',
  טלפון: 'phone',
  phone: 'phone',
  נייד: 'phone',
  מייל: 'email',
  אימייל: 'email',
  'דוא"ל': 'email',
  דואל: 'email',
  email: 'email',
  'e-mail': 'email',
};

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<LeadDirectoryField>();
  const mapping: ColumnMapping = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = ALIASES[key] || ALIASES[header.trim()];
    if (field && !used.has(field)) {
      mapping[index] = field;
      used.add(field);
      return;
    }
    mapping[index] = '';
  });
  return mapping;
}

export function mappingIsComplete(mapping: ColumnMapping, headerCount: number): boolean {
  const values = Object.values(mapping);
  const mappedFields = values.filter((value): value is LeadDirectoryField =>
    LEAD_DIRECTORY_FIELDS.includes(value as LeadDirectoryField),
  );
  if (mappedFields.length === 0) return false;
  for (let i = 0; i < headerCount; i += 1) {
    if (mapping[i] === '' || mapping[i] == null) return false;
  }
  return mappedFields.includes('company_name') || mappedFields.includes('phone');
}

export function applyColumnMapping(sheet: ParsedSheet, mapping: ColumnMapping): MappedLeadRow[] {
  return sheet.rows.map((cells, index) => {
    const extra: Record<string, string> = {};
    const row: MappedLeadRow = {
      rowIndex: index + 2,
      lead_number: '',
      company_name: '',
      industry: '',
      region: '',
      fleet_size: '',
      phone: '',
      email: '',
      extra,
    };
    cells.forEach((cell, col) => {
      const target = mapping[col];
      if (!target || target === 'skip' || target === '') return;
      row[target] = cell;
    });
    return row;
  });
}
