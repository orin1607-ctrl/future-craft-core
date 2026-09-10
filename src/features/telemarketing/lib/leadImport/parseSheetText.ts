import { MAX_LEAD_IMPORT_CHARS, MAX_LEAD_IMPORT_ROWS, type ParsedSheet } from './types';

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function detectDelimiter(sample: string): 'tab' | 'comma' | 'pipe' {
  const first = sample.split(/\r?\n/).find((line) => line.trim()) || '';
  const tabs = (first.match(/\t/g) || []).length;
  const pipes = (first.match(/\|/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  if (tabs >= 1 && tabs >= pipes && tabs >= commas) return 'tab';
  if (pipes > commas) return 'pipe';
  return 'comma';
}

function trimCell(value: string): string {
  return value.replace(/^[ \u00a0]+|[ \u00a0]+$/g, '');
}

function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => !cell);
}

function dropTrailingEmpty(cells: string[]): string[] {
  const next = [...cells];
  while (next.length > 0 && !next[next.length - 1]) next.pop();
  return next;
}

export function parseSheetText(raw: string): ParsedSheet {
  if (raw.length > MAX_LEAD_IMPORT_CHARS) {
    throw new Error(`ההדבקה גדולה מדי (${raw.length} תווים). המגבלה הבטוחה היא ${MAX_LEAD_IMPORT_CHARS.toLocaleString('he-IL')} תווים.`);
  }
  const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiterChar = { tab: '\t', comma: ',', pipe: '|' }[detectDelimiter(text)];
  const delimiter = detectDelimiter(text);
  const lines = text.split('\n');
  const parsed = lines.map((line) => parseDelimitedLine(line, delimiterChar).map(trimCell));

  let start = 0;
  while (start < parsed.length && isEmptyRow(parsed[start])) start += 1;
  let end = parsed.length - 1;
  let truncatedEmptyRows = 0;
  while (end >= start && isEmptyRow(parsed[end])) {
    truncatedEmptyRows += 1;
    end -= 1;
  }
  const body = parsed.slice(start, end + 1);
  if (body.length === 0) {
    throw new Error('לא נמצאו שורות בהדבקה');
  }

  const headerWidth = Math.max(...body.map((row) => dropTrailingEmpty(row).length), 0);
  const normalized = body.map((row) => {
    const next = row.slice(0, headerWidth);
    while (next.length < headerWidth) next.push('');
    return next;
  });

  const headers = dropTrailingEmpty(normalized[0]);
  const rows = normalized.slice(1).map((row) => row.slice(0, headers.length));
  if (rows.length > MAX_LEAD_IMPORT_ROWS) {
    throw new Error(`יותר מדי שורות (${rows.length}). המגבלה הבטוחה היא ${MAX_LEAD_IMPORT_ROWS.toLocaleString('he-IL')} לידים בבת אחת.`);
  }

  return {
    delimiter,
    headers,
    rows,
    pastedCount: rows.length,
    truncatedEmptyRows,
  };
}
