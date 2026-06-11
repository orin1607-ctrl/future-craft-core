import { toast } from 'sonner';

const BLOCKED = 'הרכב לא נמצא';

const originalError = toast.error.bind(toast);

toast.error = ((message: unknown, ...args: unknown[]) => {
  const text =
    typeof message === 'string'
      ? message
      : message != null
        ? String(message)
        : '';

  if (text.includes(BLOCKED)) {
    console.error('[TOAST-TRACE] blocked toast:', text, {
      stack: new Error('toast source').stack,
    });
    return undefined;
  }

  return originalError(message as Parameters<typeof toast.error>[0], ...(args as []));
}) as typeof toast.error;
