// Claims welcome screen (stage 3): read-only actions, disabled not-yet-connected actions,
// and a saved conversation still opens as before. Storage and the AI endpoint are FAKES.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';
import { claimsWelcomeActions } from './claimsWelcomeActions';
import type { ClaimsAiClaimContext } from './claimsAiModel';

const { invoke, listClaimsAiConversations, listClaimsAiMessages, createClaimsAiConversation, insertClaimsAiMessage } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
  createClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 't', expires_at: 9999999999 } } })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })),
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: (...a: unknown[]) => listClaimsAiConversations(...a),
  listClaimsAiMessages: (...a: unknown[]) => listClaimsAiMessages(...a),
  createClaimsAiConversation: (...a: unknown[]) => createClaimsAiConversation(...a),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: (...a: unknown[]) => insertClaimsAiMessage(...a),
  renameClaimsAiConversation: vi.fn(async () => ({ error: null })),
  claimsAiSchemaMissing: () => false,
}));

const conversation = {
  id: 'conv-test', user_id: 'u', claim_id: null, module: 'claims', garage_case_id: null,
  title: 'בדיקה', created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', archived: false,
};
const savedAnswer = {
  id: 'msg-test', conversation_id: 'conv-test', user_id: 'u', role: 'assistant',
  content: 'תשובה שמורה מהשיחה הקודמת', metadata: {}, created_at: '2026-10-25T10:00:01Z',
};
const testClaim: ClaimsAiClaimContext = {
  claimId: 'claim-test', claimNum: 'DAL-2099-0001', plate: '00-000-00', vehicle: 'רכב בדיקה',
  clientName: 'לקוח בדיקה', insCompany: 'ביטוח בדיקה', status: 'פתוח',
};

let chatBodies: Array<{ messages: Array<{ role: string; content: string }>; module: string }> = [];

function renderClaims(claim: ClaimsAiClaimContext | null = null) {
  return render(<ClaimsAiWorkspace open onClose={vi.fn()} claim={claim} userId="u" companyName={null} module="claims" />);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  chatBodies = [];
  invoke.mockReset();
  invoke.mockResolvedValue({ data: null, error: { name: 'Offline', context: { status: 404, json: async () => ({}) } } });
  listClaimsAiConversations.mockResolvedValue({ data: [], error: null });
  listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
  createClaimsAiConversation.mockResolvedValue({ data: conversation, error: null });
  insertClaimsAiMessage.mockImplementation(async (row: Record<string, unknown>) => ({
    data: { id: `m-${Math.random()}`, created_at: new Date().toISOString(), metadata: {}, ...row },
    error: null,
  }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('help-ai-chat') && init?.body) chatBodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ error: 'offline test' }), { status: 503 });
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('claims welcome actions (model)', () => {
  it('has the twelve requested actions with general chat first', () => {
    const actions = claimsWelcomeActions(null);
    expect(actions).toHaveLength(12);
    expect(actions[0]).toMatchObject({ id: 'general', kind: 'chat', primary: true });
    expect(actions.map((a) => a.id)).toEqual([
      'general', 'find', 'continue', 'reports', 'documents', 'emails', 'tasks', 'resume',
      'new_claim', 'status', 'whatsapp', 'close',
    ]);
  });

  it('every action that would change claims data is disabled (pending) and carries no text to send', () => {
    const actions = claimsWelcomeActions(testClaim);
    const pending = actions.filter((a) => a.kind === 'pending').map((a) => a.id);
    expect(pending).toEqual(['new_claim', 'status', 'whatsapp', 'close']);
    for (const a of actions.filter((x) => x.kind === 'pending')) expect(a.text).toBeUndefined();
    for (const a of actions.filter((x) => x.kind === 'ask' || x.kind === 'prefill')) {
      expect(a.text).toBeTruthy();
      // read-only questions: no change verbs
      expect(a.text).not.toMatch(/תמחק|מחק|לארכב|ארכב|תסגר|סגור|תשני|לשנות|תעדכני|עדכן|שלח|תשלחי|פתחי תביעה|תפתחי/);
    }
  });

  it('with an open claim the questions name that claim', () => {
    const actions = claimsWelcomeActions(testClaim);
    for (const id of ['find', 'continue', 'documents', 'emails', 'tasks']) {
      const a = actions.find((x) => x.id === id)!;
      expect(a.kind).toBe('ask');
      expect(a.text).toContain('DAL-2099-0001');
    }
  });
});

describe('claims welcome screen', () => {
  it('empty chat: shows the hub, general chat first, four main actions and "כל הפעולות"', async () => {
    renderClaims();
    const hub = await screen.findByTestId('claims-welcome-hub');
    const cards = hub.querySelectorAll('.garage-action-card');
    expect(cards).toHaveLength(4);
    expect(cards[0].getAttribute('data-testid')).toBe('claims-hub-general');
    expect(screen.queryByTestId('claims-hub-all')).toBeNull();
    fireEvent.click(screen.getByTestId('claims-hub-all-toggle'));
    expect(screen.getByTestId('claims-hub-all')).toBeDefined();
    for (const id of ['new_claim', 'status', 'whatsapp', 'close']) {
      expect((screen.getByTestId(`claims-hub-${id}`) as HTMLButtonElement).disabled).toBe(true);
    }
    // no saved conversation: "continue last action" is disabled, not pretending
    expect((screen.getByTestId('claims-hub-resume') as HTMLButtonElement).disabled).toBe(true);
    // the garage hub is not used in claims
    expect(screen.queryByTestId('garage-welcome-hub')).toBeNull();
  });

  it('disabled actions send nothing', async () => {
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-all-toggle'));
    for (const id of ['new_claim', 'status', 'whatsapp', 'close']) fireEvent.click(screen.getByTestId(`claims-hub-${id}`));
    await new Promise((r) => setTimeout(r, 50));
    expect(chatBodies).toHaveLength(0);
    expect(createClaimsAiConversation).not.toHaveBeenCalled();
    expect(insertClaimsAiMessage).not.toHaveBeenCalled();
  });

  it('"איתור תביעה" puts the start of the question in the composer and sends nothing', async () => {
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-find'));
    const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
    expect(input.value).toBe('תמצאי לי תביעה לפי ');
    expect(document.activeElement).toBe(input);
    await new Promise((r) => setTimeout(r, 50));
    expect(chatBodies).toHaveLength(0);
  });

  it('"דוחות תביעות" asks the existing claims chat (module claims) and the conversation replaces the hub', async () => {
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-reports'));
    await waitFor(() => expect(chatBodies.length).toBeGreaterThan(0));
    const body = chatBodies[0];
    expect(body.module).toBe('claims');
    expect(body.messages.at(-1)).toMatchObject({ role: 'user', content: 'דוח על כל התביעות הפתוחות' });
    await waitFor(() => expect(screen.queryByTestId('claims-welcome-hub')).toBeNull());
  });

  it('a saved conversation opens as before; the main menu shows the hub, and "continue" brings it back', async () => {
    listClaimsAiConversations.mockResolvedValue({ data: [conversation], error: null });
    listClaimsAiMessages.mockResolvedValue({ data: [savedAnswer], error: null });
    renderClaims();
    expect(await screen.findByText('תשובה שמורה מהשיחה הקודמת')).toBeDefined();
    expect(screen.queryByTestId('claims-welcome-hub')).toBeNull();

    fireEvent.click(screen.getByTestId('dalia-main-menu-btn'));
    expect(await screen.findByTestId('claims-welcome-hub')).toBeDefined();
    expect(screen.getByTestId('claims-hub-resume-banner').textContent).toContain('1 הודעות');
    expect(screen.queryByText('תשובה שמורה מהשיחה הקודמת')).toBeNull();

    fireEvent.click(screen.getByTestId('claims-hub-resume-chat'));
    expect(await screen.findByText('תשובה שמורה מהשיחה הקודמת')).toBeDefined();
    expect(screen.queryByTestId('claims-welcome-hub')).toBeNull();
  });

  it('open claim: the hub names the claim and its questions go to that claim', async () => {
    renderClaims(testClaim);
    const hub = await screen.findByTestId('claims-welcome-hub');
    expect(hub.textContent).toContain('DAL-2099-0001');
    fireEvent.click(screen.getByTestId('claims-hub-continue'));
    await waitFor(() => expect(chatBodies.length).toBeGreaterThan(0));
    expect(chatBodies[0].messages.at(-1)?.content).toBe('מה השלב הבא בטיפול בתביעה DAL-2099-0001?');
  });
});
