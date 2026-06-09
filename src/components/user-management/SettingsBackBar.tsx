import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface SettingsBackBarProps {
  to?: string;
  label?: string;
}

export default function SettingsBackBar({
  to = '/admin-home',
  label = 'חזרה למרכז ניהול',
}: SettingsBackBarProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline mb-4"
    >
      <ArrowRight size={16} />
      {label}
    </Link>
  );
}
