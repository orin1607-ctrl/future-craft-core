// Dalia AI — claims welcome screen: "שיחה כללית" first, the main actions, and "כל הפעולות".
import { useState } from 'react';
import type { ClaimsAiClaimContext } from './claimsAiModel';
import { claimsWelcomeActions, type ClaimsWelcomeAction } from './claimsWelcomeActions';

export function ClaimsWelcomeHub({
  claim,
  actorFirstName,
  savedMessageCount,
  canResume,
  onQuestion,
  onAsk,
  onResume,
}: {
  claim: ClaimsAiClaimContext | null;
  actorFirstName?: string;
  /** Messages of the conversation kept behind the menu (0 when none is open). */
  savedMessageCount: number;
  /** A saved conversation exists to return to. */
  canResume: boolean;
  /** Dalia opens the conversation with her question ("שיחה כללית" and the actions that need a claim). */
  onQuestion: (actionId: string, question: string) => void;
  onAsk: (text: string) => void;
  onResume: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const actions = claimsWelcomeActions(claim);
  const primary = actions.filter((a) => a.primary);
  const more = actions.filter((a) => !a.primary && a.kind !== 'pending');
  const pending = actions.filter((a) => a.kind === 'pending');

  const run = (a: ClaimsWelcomeAction) => {
    if (a.kind === 'chat' || a.kind === 'question') onQuestion(a.id, a.question || '');
    else if (a.kind === 'ask') onAsk(a.text || '');
    else if (a.kind === 'resume') onResume();
  };

  const card = (a: ClaimsWelcomeAction) => {
    const disabled = a.kind === 'pending' || (a.kind === 'resume' && !canResume);
    return (
      <button
        key={a.id}
        type="button"
        className={`garage-action-card${a.kind === 'chat' ? ' garage-action-card-chat claims-hub-chat' : ''}${disabled ? ' is-disabled' : ''}`}
        data-testid={`claims-hub-${a.id}`}
        data-kind={a.kind}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => run(a)}
      >
        <span className="garage-action-icon">{a.icon}</span>
        <div className="garage-action-body">
          <strong>{a.title}</strong>
          <small>{a.kind === 'resume' && !canResume ? 'אין שיחה שמורה לחזור אליה' : a.hint}</small>
        </div>
      </button>
    );
  };

  return (
    <div className="garage-welcome-hub claims-welcome-hub" data-testid="claims-welcome-hub">
      {savedMessageCount > 0 ? (
        <div className="claims-hub-resume" data-testid="claims-hub-resume-banner">
          <span>💬 שיחה פעילה שמורה ({savedMessageCount} הודעות)</span>
          <button type="button" className="btn btn-g btn-xs" data-testid="claims-hub-resume-chat" onClick={onResume}>
            ← המשך שיחה קיימת
          </button>
        </div>
      ) : null}
      <div className="garage-welcome-badge">✨ דליה AI · ניהול תביעות</div>
      <h3 className="garage-welcome-title">
        {actorFirstName ? `שלום ${actorFirstName}, במה נטפל בתביעות?` : 'שלום, במה נטפל בתביעות היום?'}
      </h3>
      <p className="garage-welcome-subtitle">
        {claim
          ? `תביעה פתוחה: ${claim.claimNum || claim.claimId}${claim.clientName ? ` · ${claim.clientName}` : ''}${claim.plate ? ` · ${claim.plate}` : ''}`
          : 'בחרו פעולה, או כתבו ודברו עם דליה בחופשיות:'}
      </p>
      <div className="garage-actions-grid claims-hub-grid">{primary.map(card)}</div>
      <button
        type="button"
        className="claims-hub-all-toggle"
        data-testid="claims-hub-all-toggle"
        aria-expanded={showAll}
        onClick={() => setShowAll((v) => !v)}
      >
        {showAll ? 'פחות פעולות ▴' : `כל הפעולות (${actions.length}) ▾`}
      </button>
      {showAll ? (
        <div data-testid="claims-hub-all">
          <div className="garage-actions-grid claims-hub-grid claims-hub-grid-more">{more.map(card)}</div>
          <div className="claims-hub-section-title">יחוברו בשלב הבא</div>
          <div className="garage-actions-grid claims-hub-grid claims-hub-grid-more">{pending.map(card)}</div>
        </div>
      ) : null}
    </div>
  );
}
