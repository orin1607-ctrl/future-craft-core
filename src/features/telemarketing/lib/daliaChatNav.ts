export const DALIA_CHAT_PARAM = 'daliaChat';

export type DaliaChatLocationState = {
  daliaChatOpened?: boolean;
  daliaChatFrom?: 'inbox' | 'home';
};

export function stripDaliaChatSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(DALIA_CHAT_PARAM);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function withDaliaChatSearch(search: string, chatId: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set(DALIA_CHAT_PARAM, chatId);
  return `?${params.toString()}`;
}

export function readDaliaChatId(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(DALIA_CHAT_PARAM);
}
