import approvedSourceHtml from './approved-source.html?raw';
import './garage.css';

/**
 * Approved garage-management source is a standalone HTML prototype.
 * Render it as-is (no redesign) inside the existing /garage-management route.
 */
export default function GarageApp() {
  return (
    <div className="gm-root" dir="rtl">
      <iframe
        title="ניהול מוסך"
        className="gm-approved-frame"
        srcDoc={approvedSourceHtml}
        sandbox="allow-scripts allow-modals allow-same-origin"
      />
    </div>
  );
}
