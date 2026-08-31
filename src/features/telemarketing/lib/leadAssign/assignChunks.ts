/** Split ids so each call stays under the existing telemarketing_assign_leads 2000 cap. */
export const ASSIGN_RPC_CHUNK = 80;
export const ASSIGN_RPC_MAX = 2000;

export function chunkLeadIds(ids: string[], size = ASSIGN_RPC_CHUNK): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}
