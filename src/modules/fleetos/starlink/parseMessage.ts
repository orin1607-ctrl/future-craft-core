import { starlinkChecksum, verifyStarlinkChecksum } from './checksum';
import { parseP177Template } from './tags';
import type { ParsedStarlinkMessage } from './types';

/** Optional leading `$`. Payload for checksum is always SLU/SRV… (never the `$`). */
const LINE_RE = /^\$?((?:SLU|SRV)[^*]+)\*([0-9A-Fa-f]{2})\s*$/;

export function extractStarlinkLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.length > 0), rest };
}

export function parseStarlinkMessage(
  line: string,
  p177: string,
): ParsedStarlinkMessage | { error: 'partial' | 'malformed' | 'checksum' } {
  const trimmed = line.trim();
  if (!trimmed) return { error: 'malformed' };
  if (/^\$?(?:SLU|SRV)/.test(trimmed) && !trimmed.includes('*')) return { error: 'partial' };

  const m = LINE_RE.exec(trimmed);
  if (!m) return { error: 'malformed' };

  const payload = m[1];
  const checksum = m[2].toUpperCase();
  const checksumOk = verifyStarlinkChecksum(payload, checksum);
  if (!checksumOk) {
    return { error: 'checksum' };
  }

  const header = payload.slice(0, 3) as 'SLU' | 'SRV';
  const rest = payload.slice(3);
  const comma = rest.indexOf(',');
  if (comma < 0) return { error: 'malformed' };
  const unitId = rest.slice(0, comma);
  const afterId = rest.slice(comma + 1);
  const parts = afterId.split(',');
  const cmd = parts[0] || '';
  const unitRef = parts[1] || '';
  if (!/^\d{2}$/.test(cmd) || !unitId || !unitRef) return { error: 'malformed' };
  const dataFields = parts.slice(2);

  const tagNames = parseP177Template(p177);
  const tags: Record<string, string | null> = {};
  const unknownTags: Record<string, string> = {};
  for (let i = 0; i < tagNames.length; i++) {
    const name = tagNames[i];
    const value = dataFields[i] == null || dataFields[i] === '' ? null : dataFields[i];
    tags[name] = value;
  }
  for (let i = tagNames.length; i < dataFields.length; i++) {
    unknownTags[`extra_${i}`] = dataFields[i];
  }

  return {
    raw: trimmed,
    header,
    unitId,
    cmd,
    unitRef,
    dataFields,
    checksum,
    checksumOk,
    tags,
    unknownTags,
  };
}

export function sealStarlinkMessage(payload: string): string {
  return `$${payload}*${starlinkChecksum(payload)}`;
}

export function buildUnitMessage(
  unitId: string,
  cmd: string,
  ref: string,
  dataFields: string[],
): string {
  const payload = `SLU${unitId},${cmd},${ref}${dataFields.length ? `,${dataFields.join(',')}` : ''}`;
  return sealStarlinkMessage(payload);
}
