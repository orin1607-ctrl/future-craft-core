/**
 * Official ERM StarLink checksum (protocol 7 Jan 2026).
 * Sum of character codes from SLU/SRV until the character before `*`,
 * modulo 256, two uppercase hex digits. Not NMEA XOR.
 */
export function starlinkChecksum(payload: string): string {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    sum += payload.charCodeAt(i);
  }
  return (sum % 256).toString(16).toUpperCase().padStart(2, '0');
}

export function verifyStarlinkChecksum(payload: string, received: string): boolean {
  if (!received || received.length !== 2) return false;
  return starlinkChecksum(payload) === received.toUpperCase();
}
