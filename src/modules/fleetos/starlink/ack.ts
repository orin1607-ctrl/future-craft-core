import { starlinkChecksum } from './checksum';

let serverRefSeq = 0;

export function nextServerRef(): string {
  serverRefSeq = (serverRefSeq + 1) % 100;
  return String(serverRefSeq).padStart(2, '0');
}

export function resetServerRefForTests(value = 0): void {
  serverRefSeq = value;
}

/** Official Confirmation 02. Example: $SRV0004D2,02,25,71,01*77 */
export function buildAck(unitId: string, unitRef: string, serverRef = nextServerRef()): string {
  const payload = `SRV${unitId},02,${serverRef},${unitRef},01`;
  return `$${payload}*${starlinkChecksum(payload)}`;
}
