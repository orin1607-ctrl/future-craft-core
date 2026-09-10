import { describe, expect, it } from 'vitest';
import { ASSIGN_RPC_CHUNK, ASSIGN_RPC_MAX, chunkLeadIds } from './assignChunks';

describe('assignChunks', () => {
  it('keeps a single small assignment as one RPC call', () => {
    expect(chunkLeadIds(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('splits 2030 ids so no chunk exceeds the existing RPC cap', () => {
    const ids = Array.from({ length: 2030 }, (_, i) => `id-${i}`);
    const chunks = chunkLeadIds(ids);
    expect(chunks.length).toBe(Math.ceil(2030 / ASSIGN_RPC_CHUNK));
    expect(chunks.every((chunk) => chunk.length <= ASSIGN_RPC_CHUNK)).toBe(true);
    expect(chunks.every((chunk) => chunk.length <= ASSIGN_RPC_MAX)).toBe(true);
    expect(chunks.flat()).toHaveLength(2030);
  });

  it('drops blanks and duplicates without inventing ids', () => {
    expect(chunkLeadIds(['a', '', 'a', 'b'])).toEqual([['a', 'b']]);
  });
});
