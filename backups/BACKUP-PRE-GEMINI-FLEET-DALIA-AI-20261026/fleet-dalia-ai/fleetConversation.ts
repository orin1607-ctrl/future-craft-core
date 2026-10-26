import { getFleetAction } from './actionCatalog';
import { matchIntent } from './intent';
import { executeFleetAction, type ActionResult } from './liveReads';

/** Claims and garage stay outside this module. This file never calls a live model. */
const OUTSIDE_FLEET = /תביע|DAL-\d|חבילת פתיח|שמאי|ניהול המוסך|כרטיס עבודה/;

export type FleetChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  actionId?: string;
};

export type FleetChatPlan =
  | { kind: 'read'; actionId: string; query: string }
  | { kind: 'blocked-write'; actionId: string }
  | { kind: 'outside-fleet' }
  | { kind: 'clarify' };

export function planFleetTurn(text: string, history: FleetChatTurn[] = []): FleetChatPlan {
  const intent = matchIntent(text);
  if (intent.actionId) {
    const action = getFleetAction(intent.actionId);
    if (!action?.enabled || action.mode === 'write') {
      return { kind: 'blocked-write', actionId: intent.actionId };
    }
    return { kind: 'read', actionId: intent.actionId, query: intent.query };
  }
  if (OUTSIDE_FLEET.test(text)) return { kind: 'outside-fleet' };
  const previous = [...history].reverse().find((turn) => turn.role === 'user' && turn.actionId);
  const followUp = text.trim();
  if (previous?.actionId && followUp.length < 40 && /^(ומה|עוד|אותו|שלו)(\s|$)/.test(followUp)) {
    const action = getFleetAction(previous.actionId);
    if (action?.enabled && action.mode !== 'write') {
      return { kind: 'read', actionId: previous.actionId, query: text };
    }
  }
  return { kind: 'clarify' };
}

export async function answerFleetTurn(
  text: string,
  history: FleetChatTurn[],
  ctx: { role?: string; company: string | null },
): Promise<ActionResult & { actionId?: string }> {
  const plan = planFleetTurn(text, history);
  if (plan.kind === 'blocked-write') {
    return {
      ok: false,
      actionId: plan.actionId,
      text: 'פעולת הכתיבה כבויה. דליה AI לצי קוראת נתונים בלבד.',
      links: [],
    };
  }
  if (plan.kind === 'outside-fleet') {
    return {
      ok: false,
      text: 'השיחה הזו היא לניהול צי הרכב. ניהול התביעות וניהול המוסך לא נפתחים מכאן.',
      links: [],
    };
  }
  if (plan.kind === 'clarify') {
    return {
      ok: true,
      text: 'אפשר לשאול על רכבים, נהגים, מעקב, דוחות או משימות של החברה שנבחרה. פעולות כתיבה כבויות.',
      links: [],
    };
  }
  const result = await executeFleetAction(plan.actionId, plan.query, ctx);
  return { ...result, actionId: plan.actionId };
}
