import { describe, expect, it } from 'vitest';
import { readDaliaChatId, stripDaliaChatSearch, withDaliaChatSearch } from './daliaChatNav';

describe('daliaChatNav', () => {
  it('adds and reads the chat param without dropping other filters', () => {
    expect(withDaliaChatSearch('?from=2026-08-01', 'chat-1')).toBe('?from=2026-08-01&daliaChat=chat-1');
    expect(readDaliaChatId('?daliaChat=chat-1')).toBe('chat-1');
  });

  it('strips only the chat overlay param', () => {
    expect(stripDaliaChatSearch('?daliaChat=chat-1&from=2026-08-01')).toBe('?from=2026-08-01');
    expect(stripDaliaChatSearch('?daliaChat=chat-1')).toBe('');
  });
});
