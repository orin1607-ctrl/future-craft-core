import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** אקורדיון בסגנון כרטיס רכב (VehicleDetailsPanel / Hub) */
export default function VehicleAccordionSection({
  title,
  defaultOpen = false,
  children,
  sectionId,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  sectionId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0" data-form-accordion={sectionId || title}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 font-bold text-base text-right"
        aria-expanded={open}
      >
        {title}
        <ChevronDown size={18} className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">{children}</div>}
    </div>
  );
}
