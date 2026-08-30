import { describe, expect, it } from 'vitest';
import { ingestStarlinkLine } from './ingest';
import { startStarlinkListener } from './listener';
import { assertStagingUrl, persistIngestResult, PROD_REF } from './persistIngest';
import { InMemoryGpsStore, seedTestDevice } from './store';
import { buildUnitMessage } from './parseMessage';

function loc() {
  return ['260830120000', '01', '260830120000', '+3205.1180', '+03446.9080', '22.0', '90', '50100', '', '', '12.4', '3.8'];
}

function fakeDb() {
  const writes: { table: string; op: string; row: unknown }[] = [];
  return {
    writes,
    from(table: string) {
      return {
        insert: async (row: unknown) => {
          writes.push({ table, op: 'insert', row });
          return { error: null };
        },
        upsert: async (row: unknown) => {
          writes.push({ table, op: 'upsert', row });
          return { error: null };
        },
        delete: () => ({
          lt: async () => {
            writes.push({ table, op: 'delete', row: null });
            return { error: null };
          },
        }),
      };
    },
  };
}

describe('persistIngest + public bind guard', () => {
  it('refuses Production supabase URL', () => {
    expect(() => assertStagingUrl(`https://${PROD_REF}.supabase.co`)).toThrow(/production/);
  });

  it('unknown device writes gps_raw only and never business tables', async () => {
    const store = new InMemoryGpsStore();
    const r = ingestStarlinkLine(store, buildUnitMessage('DEAD01', '06', '01', loc()));
    expect(r.reason).toBe('unknown_device');
    expect(r.ack).toBeNull();
    const db = fakeDb();
    const p = await persistIngestResult(db, r, '$SLUDEAD01*00');
    expect(p.ok).toBe(true);
    expect(db.writes.map((w) => w.table)).toEqual(['gps_raw']);
    expect(db.writes.some((w) => ['faults', 'accidents', 'expenses', 'vehicles'].includes(w.table))).toBe(false);
  });

  it('accepted live upserts gps_live and does not write faults', async () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', companyName: 'טטטט' });
    const r = ingestStarlinkLine(store, buildUnitMessage('0004D2', '06', '11', loc()));
    expect(r.accepted).toBe(true);
    const db = fakeDb();
    const p = await persistIngestResult(db, r, 'line');
    expect(p.ok).toBe(true);
    expect(db.writes.some((w) => w.table === 'gps_live' && w.op === 'upsert')).toBe(true);
    expect(db.writes.some((w) => w.table === 'faults')).toBe(false);
  });

  it('refuses public TCP bind without FLEETOS_GPS_PUBLIC', async () => {
    const prev = process.env.FLEETOS_GPS_PUBLIC;
    delete process.env.FLEETOS_GPS_PUBLIC;
    const store = new InMemoryGpsStore();
    await expect(startStarlinkListener(store, { host: '0.0.0.0', port: 0 })).rejects.toThrow(/public bind/);
    if (prev == null) delete process.env.FLEETOS_GPS_PUBLIC;
    else process.env.FLEETOS_GPS_PUBLIC = prev;
  });
});
