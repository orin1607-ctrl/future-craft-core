import { describe, expect, it, vi } from 'vitest';
import { confirmTeleLeave, createTeleCloserStack } from './teleInnerNav';

describe('createTeleCloserStack', () => {
  it('goBack closes only the top overlay', () => {
    const stack = createTeleCloserStack();
    const inbox = vi.fn();
    const thread = vi.fn();
    stack.push(inbox);
    stack.push(thread);
    expect(stack.goBack()).toBe(true);
    expect(thread).toHaveBeenCalledTimes(1);
    expect(inbox).not.toHaveBeenCalled();
    expect(stack.size).toBe(2);
  });

  it('closeAll closes nested overlays from the top down', () => {
    const stack = createTeleCloserStack();
    const order: string[] = [];
    stack.push(() => order.push('inbox'));
    stack.push(() => order.push('thread'));
    stack.closeAll();
    expect(order).toEqual(['thread', 'inbox']);
  });

  it('unregister removes a closer without calling it', () => {
    const stack = createTeleCloserStack();
    const inbox = vi.fn();
    const thread = vi.fn();
    stack.push(inbox);
    const unreg = stack.push(thread);
    unreg();
    expect(stack.goBack()).toBe(true);
    expect(thread).not.toHaveBeenCalled();
    expect(inbox).toHaveBeenCalledTimes(1);
  });
});

describe('confirmTeleLeave', () => {
  it('skips the dialog when there is nothing unsaved', () => {
    expect(confirmTeleLeave(null)).toBe(true);
    expect(confirmTeleLeave(undefined)).toBe(true);
    expect(confirmTeleLeave('')).toBe(true);
  });
});
