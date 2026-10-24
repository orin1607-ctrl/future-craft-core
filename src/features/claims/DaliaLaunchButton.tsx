// The floating "דליה AI" button that opens the assistant — one look on the dashboard and on the garage screen.
import './dalia-launch.css';

export function DaliaLaunchButton({
  onClick,
  testId,
  title,
  subtitle = 'עוזרת קולית למוסך',
  aboveBottomNav = false,
}: {
  onClick: () => void;
  testId: string;
  title: string;
  subtitle?: string;
  /** Pages with the phone bottom navigation bar: the button sits above it instead of covering it. */
  aboveBottomNav?: boolean;
}) {
  return (
    <button
      type="button"
      className={`dalia-launch-btn${aboveBottomNav ? ' above-bottom-nav' : ''}`}
      data-testid={testId}
      onClick={onClick}
      title={title}
      aria-label={`פתיחת דליה AI · ${subtitle}`}
    >
      <span className="dalia-launch-icon" aria-hidden="true">
        <span className="dalia-launch-icon-glyph">✨</span>
        <span className="dalia-launch-mic">🎙️</span>
      </span>
      <span className="dalia-launch-text">
        <strong>דליה AI</strong>
        <small>{subtitle}</small>
      </span>
    </button>
  );
}
