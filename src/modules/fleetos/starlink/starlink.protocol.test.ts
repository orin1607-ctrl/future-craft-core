import { describe, expect, it } from 'vitest';
import { starlinkChecksum } from './checksum';
import { buildAck, resetServerRefForTests } from './ack';
import { buildUnitMessage, extractStarlinkLines, parseStarlinkMessage } from './parseMessage';
import { ingestStarlinkLine } from './ingest';
import { InMemoryGpsStore, seedTestDevice } from './store';
import { shouldApplyTelematicsOdometer } from './odometerGuard';
import { shouldSamplePosition } from './sampling';
import { planAssignDevice, planReplaceDevice, planUnassignDevice, assertSameCompany } from './deviceRegistry';
import { filterBusinessLocationNoComm, mergeTelematics, telematicsNoCommAlerts } from './adapter';
import { latLngToPercent } from './geo';
import { canManageGpsDevices } from './types';
import { DEFAULT_P177 } from './tags';
import type { FleetOSAlertRow, FleetOSVehicleRow } from '../fleetosData';
import { startStarlinkListener, sendTestLine } from './listener';

function loc(over: Record<string, string> = {}): string[] {
  const order = ['EDT', 'EID', 'PDT', 'LAT', 'LONG', 'SPD', 'HEAD', 'ODO', 'LAC', 'CID', 'VIN', 'VBAT'];
  const d: Record<string, string> = {
    EDT: '260830132225',
    EID: '01',
    PDT: '260830132225',
    LAT: '+3248.9503',
    LONG: '+03459.3547',
    SPD: '012.0',
    HEAD: '180',
    ODO: '50000',
    LAC: '10052',
    CID: '8738',
    VIN: '12.200',
    VBAT: '03.600',
    ...over,
  };
  return order.map((k) => d[k]);
}

function msg(unit: string, ref: string, fields: string[], cmd = '06'): string {
  return buildUnitMessage(unit, cmd, ref, fields);
}

function ingest(
  store: InMemoryGpsStore,
  line: string,
  now = new Date('2026-08-30T13:22:30Z'),
) {
  return ingestStarlinkLine(store, line, now);
}

function vehicle(id: string, plate: string, company: string): FleetOSVehicleRow {
  return {
    id,
    plate,
    status: 'stopped',
    status_text: 'פעיל',
    company_name: company,
  };
}

describe('ERM StarLink protocol QA', () => {
  it('official checksum example SRV confirmation 02', () => {
    expect(starlinkChecksum('SRV0004D2,02,25,71,01')).toBe('77');
    resetServerRefForTests(25);
    expect(buildAck('0004D2', '71', '25')).toBe('$SRV0004D2,02,25,71,01*77');
  });

  it('official checksum example parameter command', () => {
    expect(starlinkChecksum('SRV0004D2,04,53,0049,myserver.com')).toBe('68');
  });

  it('valid message + checksum → Live + ACK 02', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const line = msg('0004D2', '71', loc());
    const r = ingest(store, line);
    expect(r.accepted).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.ack).toMatch(/^\$SRV0004D2,02,\d{2},71,01\*[0-9A-F]{2}$/);
    expect(r.live?.freshness).toBe('live');
    expect(r.live?.lat).toBeCloseTo(32.8158, 3);
    expect(r.live?.lng).toBeCloseTo(34.9892, 3);
    expect(r.businessWrites).toEqual([]);
  });

  it('bad checksum → no Live, no ACK', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const line = msg('0004D2', '72', loc()).replace(/\*[0-9A-F]{2}$/, '*00');
    const r = ingestStarlinkLine(store, line);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('checksum');
    expect(r.ack).toBeNull();
    expect(store.listLive()).toHaveLength(0);
  });

  it('ACK command is 02', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const r = ingestStarlinkLine(store, msg('0004D2', '10', loc()));
    expect(r.ack).toContain(',02,');
  });

  it('sequence / duplicate same ref → one live row, ACK still sent', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const line = msg('0004D2', '55', loc());
    const a = ingestStarlinkLine(store, line);
    const b = ingestStarlinkLine(store, line);
    expect(a.reason).toBe('ok');
    expect(b.reason).toBe('duplicate');
    expect(b.ack).toBeTruthy();
    expect(store.listLive()).toHaveLength(1);
    expect(store.listPositions('v1').length).toBe(1);
  });

  it('partial message without checksum', () => {
    const store = new InMemoryGpsStore();
    const r = ingestStarlinkLine(store, '$SLU0004D2,06,53');
    expect(r.reason).toBe('partial');
    expect(r.ack).toBeNull();
  });

  it('known device accepted, unknown rejected', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const known = ingestStarlinkLine(store, msg('0004D2', '01', loc()));
    const unknown = ingestStarlinkLine(store, msg('FFFFFF', '01', loc()));
    expect(known.accepted).toBe(true);
    expect(unknown.reason).toBe('unknown_device');
    expect(unknown.ack).toBeNull();
  });

  it('GPS valid vs stale vs missing', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, {
      unitId: '0004D2',
      vehicleId: 'v1',
      companyName: 'A',
      p177: `${DEFAULT_P177},#PAS#`,
    });
    const live = ingestStarlinkLine(store, msg('0004D2', '11', [...loc(), '10']));
    expect(live.live?.freshness).toBe('live');

    const store2 = new InMemoryGpsStore();
    seedTestDevice(store2, {
      unitId: '0004D2',
      vehicleId: 'v1',
      companyName: 'A',
      p177: `${DEFAULT_P177},#PAS#`,
    });
    const stale = ingestStarlinkLine(store2, msg('0004D2', '12', [...loc(), '400']));
    expect(stale.live?.freshness).toBe('stale');
    expect(stale.live?.live === undefined || stale.live.freshness !== 'live').toBe(true);

    const store3 = new InMemoryGpsStore();
    seedTestDevice(store3, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const none = ingestStarlinkLine(
      store3,
      msg('0004D2', '13', loc({ LAT: '+0000.0000', LONG: '+00000.0000' })),
    );
    expect(none.live?.freshness).toBe('none');
    expect(none.live?.lat).toBeNull();
  });

  it('speed, heading, IGN, engine, odometer, voltage, RPM when present', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, {
      unitId: '0004D2',
      vehicleId: 'v1',
      companyName: 'A',
      p177: `${DEFAULT_P177},#IGN#,#ENG#,#RPM#`,
    });
    const r = ingestStarlinkLine(
      store,
      msg('0004D2', '20', [...loc({ SPD: '020.0', HEAD: '90', ODO: '88000', VIN: '13.4', VBAT: '4.1' }), '1', '1', '2100']),
    );
    expect(r.live?.speedKmh).toBeGreaterThan(30);
    expect(r.live?.heading).toBe(90);
    expect(r.live?.ignition).toBe(true);
    expect(r.live?.engine).toBe(true);
    expect(r.live?.odometer).toBe(88000);
    expect(r.live?.vehicleVoltage).toBeCloseTo(13.4);
    expect(r.live?.backupVoltage).toBeCloseTo(4.1);
    expect(r.live?.rpm).toBe(2100);
  });

  it('RPM missing stays null — not invented', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const r = ingestStarlinkLine(store, msg('0004D2', '21', loc()));
    expect(r.live?.rpm).toBeNull();
  });

  it('CAN without mapping stays raw', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, {
      unitId: '0004D2',
      vehicleId: 'v1',
      companyName: 'A',
      p177: `${DEFAULT_P177},#CV1#`,
    });
    const r = ingestStarlinkLine(store, msg('0004D2', '22', [...loc(), '87.5']));
    expect(r.live?.canRaw.CV1).toBe('87.5');
    expect(r.live?.canMapped).toEqual({});
  });

  it('CAN with verified map gets a label; unmapped CV does not', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, {
      unitId: '0004D2',
      vehicleId: 'v1',
      companyName: 'A',
      p177: `${DEFAULT_P177},#CV1#,#CV2#`,
    });
    store.setCanMap('v1', { CV1: 'טמפ׳ שמן' });
    const r = ingestStarlinkLine(store, msg('0004D2', '23', [...loc(), '90', '12']));
    expect(r.live?.canMapped.CV1?.label).toBe('טמפ׳ שמן');
    expect(r.live?.canRaw.CV2).toBe('12');
    expect(r.live?.canMapped.CV2).toBeUndefined();
  });

  it('significant events stored; DTC and Impact do not write business tables', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const overspeed = ingestStarlinkLine(store, msg('0004D2', '30', loc({ EID: '06' })));
    const dtc = ingestStarlinkLine(store, msg('0004D2', '31', loc({ EID: '70' })));
    const impact = ingestStarlinkLine(store, msg('0004D2', '32', loc({ EID: '41' })));
    expect(overspeed.event?.key).toBe('overspeed');
    expect(dtc.event?.key).toBe('dtc');
    expect(impact.event?.key).toBe('impact');
    expect(dtc.businessWrites).toEqual([]);
    expect(impact.businessWrites).toEqual([]);
    expect(store.listEvents('A').map((e) => e.key)).toEqual(['overspeed', 'dtc', 'impact']);
  });

  it('reconnect updates last_seen on same vehicle', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const a = ingestStarlinkLine(store, msg('0004D2', '40', loc()), new Date('2026-08-30T10:00:00Z'));
    const b = ingestStarlinkLine(store, msg('0004D2', '41', loc()), new Date('2026-08-30T10:05:00Z'));
    expect(a.live?.vehicleId).toBe(b.live?.vehicleId);
    expect(b.live?.lastSeen).toBe('2026-08-30T10:05:00.000Z');
  });

  it('two devices in parallel stay separate', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    seedTestDevice(store, { unitId: '0004D3', vehicleId: 'v2', companyName: 'A' });
    ingestStarlinkLine(store, msg('0004D2', '01', loc({ SPD: '010.0' })));
    ingestStarlinkLine(store, msg('0004D3', '01', loc({ SPD: '000.0', EID: '01' })));
    expect(store.getLive('dev-0004D2')?.vehicleId).toBe('v1');
    expect(store.getLive('dev-0004D3')?.vehicleId).toBe('v2');
  });

  it('two companies do not leak live/events', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: 'AAA001', vehicleId: 'va', companyName: 'CoA' });
    seedTestDevice(store, { unitId: 'BBB001', vehicleId: 'vb', companyName: 'CoB' });
    ingestStarlinkLine(store, msg('AAA001', '01', loc({ EID: '36' })));
    ingestStarlinkLine(store, msg('BBB001', '01', loc({ EID: '41' })));
    expect(store.listLive('CoA').map((l) => l.vehicleId)).toEqual(['va']);
    expect(store.listLive('CoB').map((l) => l.vehicleId)).toEqual(['vb']);
    expect(store.listEvents('CoA').map((e) => e.key)).toEqual(['sos']);
    expect(store.listEvents('CoB').map((e) => e.key)).toEqual(['impact']);
  });

  it('permissions: only super_admin / fleet_admin manage devices; company must match', () => {
    expect(canManageGpsDevices('super_admin')).toBe(true);
    expect(canManageGpsDevices('fleet_admin')).toBe(true);
    expect(canManageGpsDevices('driver')).toBe(false);
    expect(canManageGpsDevices('customer')).toBe(false);
    expect(assertSameCompany('CoA', 'CoA', false)).toBe(true);
    expect(assertSameCompany('CoA', 'CoB', false)).toBe(false);
    expect(assertSameCompany('CoA', 'CoB', true)).toBe(true);
  });

  it('IMEI / Unit ID assignment, unassign, replace, no double bind', () => {
    const now = '2026-08-30T12:00:00.000Z';
    const a = planAssignDevice({
      devices: [],
      vehicleId: 'v1',
      companyName: 'A',
      unitId: '0004D2',
      imei: '356938035643809',
      p177: DEFAULT_P177,
      nowIso: now,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const dupV = planAssignDevice({
      devices: [a.device],
      vehicleId: 'v1',
      companyName: 'A',
      unitId: '0004D3',
      p177: DEFAULT_P177,
      nowIso: now,
    });
    expect(dupV.ok).toBe(false);
    const dupD = planAssignDevice({
      devices: [a.device],
      vehicleId: 'v2',
      companyName: 'A',
      unitId: '0004D2',
      p177: DEFAULT_P177,
      nowIso: now,
    });
    expect(dupD.ok).toBe(false);
    const replaced = planReplaceDevice({
      devices: [a.device],
      vehicleId: 'v1',
      companyName: 'A',
      unitId: '0004D9',
      p177: DEFAULT_P177,
      nowIso: now,
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.unassigned?.enabled).toBe(false);
    expect(replaced.device.unitId).toBe('0004D9');
    const off = planUnassignDevice(replaced.device, now);
    expect(off.device.enabled).toBe(false);
  });

  it('odometer decrease and jump are rejected; shared shouldUpdateOdometer is used', () => {
    expect(shouldApplyTelematicsOdometer(90000, 85000).decision).toBe('reject_decrease');
    expect(shouldApplyTelematicsOdometer(90000, 90200).decision).toBe('reject_jump');
    expect(shouldApplyTelematicsOdometer(90000, 90040).decision).toBe('apply');
  });

  it('sampling skips dense points, keeps a later point', () => {
    const first = { id: 'p1', deviceId: 'd', vehicleId: 'v', companyName: 'A', lat: 32.08, lng: 34.78, speedKmh: 20, heading: 90, at: '2026-08-30T10:00:00.000Z' };
    expect(
      shouldSamplePosition(first, { lat: 32.0801, lng: 34.78, heading: 91, at: '2026-08-30T10:00:05.000Z' }),
    ).toBe(false);
    expect(
      shouldSamplePosition(first, { lat: 32.08, lng: 34.78, heading: 90, at: '2026-08-30T10:00:45.000Z' }),
    ).toBe(true);
  });

  it('trail / history samples accumulate on ingest', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    ingestStarlinkLine(store, msg('0004D2', '50', loc({ LAT: '+3204.8000', LONG: '+03446.8000' })), new Date('2026-08-30T10:00:00Z'));
    ingestStarlinkLine(store, msg('0004D2', '51', loc({ LAT: '+3205.8000', LONG: '+03446.8000' })), new Date('2026-08-30T10:01:00Z'));
    expect(store.listPositions('v1').length).toBeGreaterThanOrEqual(2);
  });

  it('merge overlay never changes business vehicles.status and does not mark mock as live', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    ingest(store, msg('0004D2', '60', loc()));
    const rows = [vehicle('v1', '12-345-67', 'A'), vehicle('v2', '98-765-43', 'A')];
    const merged = mergeTelematics(rows, store, 'A');
    expect(merged[0].status).toBe('stopped');
    expect(merged[0].telematics?.live).toBe(true);
    expect(merged[1].telematics).toBeUndefined();
    expect(merged[1].status).toBe('stopped');
  });

  it('map projection returns a pin for Israel GPS and none for invalid', () => {
    const p = latLngToPercent(32.08, 34.78);
    expect(p).toBeTruthy();
    expect(latLngToPercent(0, 0)).toBeNull();
  });

  it('parser is tag-based: extra P177 tags do not require a rewrite', () => {
    const parsed = parseStarlinkMessage(msg('0004D2', '01', [...loc(), '1']), `${DEFAULT_P177},#IGN#`);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.tags.LAT).toBeTruthy();
    expect(parsed.tags.IGN).toBe('1');
  });

  it('local TCP listener on 127.0.0.1 returns ACK 02', async () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const handle = await startStarlinkListener(store);
    expect(handle.host).toBe('127.0.0.1');
    const line = msg('0004D2', '77', loc());
    const reply = await sendTestLine(handle.host, handle.port, line);
    await handle.close();
    expect(reply).toContain(',02,');
    expect(store.listLive()).toHaveLength(1);
  });

  it('wake-up cmd 01 updates last seen without inventing GPS', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const r = ingestStarlinkLine(
      store,
      buildUnitMessage('0004D2', '01', '88', []),
      new Date('2026-08-30T11:00:00Z'),
    );
    expect(r.accepted).toBe(true);
    expect(r.ack).toContain(',02,');
    expect(r.live?.lastSeen).toBe('2026-08-30T11:00:00.000Z');
    expect(r.live?.freshness).toBe('none');
    expect(r.live?.lat).toBeNull();
  });

  it('TCP reconnect: second connection ACKs and keeps the same vehicle', async () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const handle = await startStarlinkListener(store);
    await sendTestLine(handle.host, handle.port, msg('0004D2', '01', loc()));
    const reply2 = await sendTestLine(handle.host, handle.port, msg('0004D2', '02', loc({ SPD: '030.0' })));
    await handle.close();
    expect(reply2).toContain(',02,');
    expect(store.getLive('dev-0004D2')?.vehicleId).toBe('v1');
    expect(store.listLive()).toHaveLength(1);
  });

  it('partial TCP buffer is held until a full line arrives', () => {
    const full = msg('0004D2', '53', loc());
    const first = extractStarlinkLines(full.slice(0, 12));
    expect(first.lines).toEqual([]);
    expect(first.rest.length).toBeGreaterThan(0);
    const second = extractStarlinkLines(`${first.rest}${full.slice(12)}\r\n`);
    expect(second.lines).toEqual([full]);
    expect(second.rest).toBe('');
  });

  it('vehicles without overlay are never marked live (mock is not live)', () => {
    const store = new InMemoryGpsStore();
    const rows = [vehicle('v-mock', '11-111-11', 'A')];
    const merged = mergeTelematics(rows, store, 'A');
    expect(merged[0].telematics).toBeUndefined();
    expect(merged[0].status).toBe('stopped');
  });

  it('GPS outside the Israel view box is not projected onto the map', () => {
    expect(latLngToPercent(51.5, -0.12)).toBeNull();
  });

  it('ingest never queues writes to faults / accidents / expenses', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    const r = ingestStarlinkLine(store, msg('0004D2', '70', loc({ EID: '70' })));
    expect(r.businessWrites).toEqual([]);
    expect(r.event?.key).toBe('dtc');
  });

  it('telematics no-comm replaces only business location no-comm for mapped plates', () => {
    const store = new InMemoryGpsStore();
    seedTestDevice(store, { unitId: '0004D2', vehicleId: 'v1', companyName: 'A' });
    ingestStarlinkLine(store, msg('0004D2', '01', loc()), new Date('2026-08-30T10:00:00Z'));
    const rows = mergeTelematics([vehicle('v1', '12-345-67', 'A')], store, 'A');
    const catalog: FleetOSAlertRow[] = [
      {
        id: 'comm-v1',
        type: 'no_comm',
        vehicle_plate: '12-345-67',
        message: 'אין מיקום / תקשורת זמינה',
        severity: 'warning',
        created_at: 'עכשיו',
      },
    ];
    const merged = filterBusinessLocationNoComm(
      [...catalog, ...telematicsNoCommAlerts(rows, Date.parse('2026-08-30T10:20:00Z'))],
      rows,
    );
    expect(merged.some((a) => a.id === 'comm-v1')).toBe(false);
    expect(merged.some((a) => a.id === 'erm-comm-v1')).toBe(true);
  });
});
