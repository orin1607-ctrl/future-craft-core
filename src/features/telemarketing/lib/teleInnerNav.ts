export const TELE_NAV_UNSAVED =
  'יש טקסט או טופס שלא נשמר. היציאה לא תשמור דיווח, לא תשנה סטטוס ולא תסיים שיחה/טיפול. לצאת בכל זאת?';

export type TeleCloser = () => void;

export function createTeleCloserStack() {
  const stack: TeleCloser[] = [];
  return {
    push(fn: TeleCloser) {
      stack.push(fn);
      return () => {
        const i = stack.lastIndexOf(fn);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    peek(): TeleCloser | undefined {
      return stack[stack.length - 1];
    },
    goBack(): boolean {
      const fn = stack[stack.length - 1];
      if (!fn) return false;
      fn();
      return true;
    },
    closeAll() {
      const copy = stack.slice();
      for (let i = copy.length - 1; i >= 0; i -= 1) copy[i]();
    },
    get size() {
      return stack.length;
    },
  };
}

export function confirmTeleLeave(message?: string | null): boolean {
  if (!message) return true;
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm(message);
}
