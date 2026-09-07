import { describe, expect, it } from 'vitest';
import { starlinkChecksum } from './checksum';
import { parseStarlinkMessage } from './parseMessage';
import { ingestStarlinkLine } from './ingest';
import { InMemoryGpsStore, seedTestDevice } from './store';
import { DEFAULT_P177 } from './tags';
import { parseSignedNmea } from './coords';

const REAL_NO_DOLLAR =
  'SLU043284,06,3,260906145430,01,260906145430,+3159.8342,+03445.9747,000.0,000,000000,17221,8716810,12.735,03.897,0,2*B8';

function classicPayload(): string {
  return 'SLU0004D2,06,71,260830132225,01,260830132225,+3248.9503,+03459.3547,012.0,180,50000,10052,8738,12.200,03.600';
}

describe('StarLink optional leading $ (STAGING ingest)', () => {
  it('TEST 1: valid frame with $ PASS', () => {
    const payload = classicPayload();
    const line = `$${payload}*${starlinkChecksum(payload)}`;
    const parsed = parseStarlinkMessage(line, DEFAULT_P177);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.header).toBe('SLU');
    expect(parsed.unitId).toBe('0004D2');
    expect(parsed.cmd).toBe('06');
    expect(parsed.checksumOk).toBe(true);
  });

  it('TEST 2: same valid frame without $ PASS', () => {
    const payload = classicPayload();
    const withDollar = `$${payload}*${starlinkChecksum(payload)}`;
    const noDollar = `${payload}*${starlinkChecksum(payload)}`;
    const a = parseStarlinkMessage(withDollar, DEFAULT_P177);
    const b = parseStarlinkMessage(noDollar, DEFAULT_P177);
    expect('error' in a).toBe(false);
    expect('error' in b).toBe(false);
    if ('error' in a || 'error' in b) return;
    expect(b.unitId).toBe(a.unitId);
    expect(b.cmd).toBe(a.cmd);
    expect(b.checksum).toBe(a.checksum);
    expect(b.dataFields).toEqual(a.dataFields);
    expect(b.checksumOk).toBe(true);
  });

  it('TEST 3: real 043284 frame without $ and valid checksum PASS', () => {
    expect(starlinkChecksum(REAL_NO_DOLLAR.slice(0, REAL_NO_DOLLAR.lastIndexOf('*')))).toBe('B8');
    const parsed = parseStarlinkMessage(REAL_NO_DOLLAR, DEFAULT_P177);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.header).toBe('SLU');
    expect(parsed.unitId).toBe('043284');
    expect(parsed.cmd).toBe('06');
    expect(parsed.unitRef).toBe('3');
    expect(parsed.tags.EID).toBe('01');
    expect(parsed.checksum).toBe('B8');
    expect(parsed.checksumOk).toBe(true);
    expect(parsed.tags.LAT).toBe('+3159.8342');
    expect(parsed.tags.LONG).toBe('+03445.9747');
    const lat = parseSignedNmea(parsed.tags.LAT, true);
    const lng = parseSignedNmea(parsed.tags.LONG, false);
    expect(lat).toBeCloseTo(31 + 59.8342 / 60, 5);
    expect(lng).toBeCloseTo(34 + 45.9747 / 60, 5);
  });

  it('TEST 4: no $ with bad checksum FAIL', () => {
    const parsed = parseStarlinkMessage(REAL_NO_DOLLAR.replace('*B8', '*00'), DEFAULT_P177);
    expect(parsed).toEqual({ error: 'checksum' });
  });

  it('TEST 5: with $ with bad checksum FAIL', () => {
    const payload = classicPayload();
    const parsed = parseStarlinkMessage(`$${payload}*00`, DEFAULT_P177);
    expect(parsed).toEqual({ error: 'checksum' });
  });

  it('TEST 6: garbage FAIL', () => {
    expect(parseStarlinkMessage('hello world', DEFAULT_P177)).toEqual({ error: 'malformed' });
    expect(parseStarlinkMessage('not-a-frame*FF', DEFAULT_P177)).toEqual({ error: 'malformed' });
  });

  it('TEST 7: partial frame FAIL', () => {
    expect(parseStarlinkMessage('$SLU043284,06,3,260906145430', DEFAULT_P177)).toEqual({ error: 'partial' });
    expect(parseStarlinkMessage('SLU043284,06,3,260906145430', DEFAULT_P177)).toEqual({ error: 'partial' });
  });

  it('TEST 8: unknown / invalid structure FAIL', () => {
    expect(parseStarlinkMessage('$FOO043284,06,3*B8', DEFAULT_P177)).toEqual({ error: 'malformed' });
    expect(parseStarlinkMessage('SLX043284,06,3*B8', DEFAULT_P177)).toEqual({ error: 'malformed' });
    const noComma = parseStarlinkMessage('SLU043284*B8', DEFAULT_P177);
    expect('error' in noComma).toBe(true);
  });

  it('does not accept arbitrary text by stripping $', () => {
    const parsed = parseStarlinkMessage('SLU', DEFAULT_P177);
    expect('error' in parsed).toBe(true);
  });

  it('no-dollar ingest still ACKs 02 for a mapped device', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '043284', vehicleId: '36806603', companyName: 'A' });
    const r = ingestStarlinkLine(store, REAL_NO_DOLLAR);
    expect(r.accepted).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.ack).toMatch(/^\$SRV043284,02,\d{2},3,01\*[0-9A-F]{2}$/);
    expect(r.live?.lat).toBeCloseTo(31 + 59.8342 / 60, 4);
    expect(r.live?.lng).toBeCloseTo(34 + 45.9747 / 60, 4);
  });
});
