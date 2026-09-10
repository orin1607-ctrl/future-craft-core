import { Sun, Moon, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [visible, setVisible] = useState(true);
  const location = useLocation();

  if (!visible) return null;
  if (location.pathname.startsWith('/garage-management')) return null;

  return (
    <div className="fixed top-4 z-50 flex items-center gap-0 md:top-6" style={{ left: 'calc(4rem + 15px)', }}>
      <button
        onClick={() => setVisible(false)}
        className="absolute -top-3 -left-3 bg-muted text-muted-foreground border border-border flex items-center justify-center shadow-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
        style={{ width: '24px', height: '24px', borderRadius: '50%', minWidth: '24px', minHeight: '24px' }}
        aria-label="סגור"
      >
        <X size={12} />
      </button>
      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 bg-card text-foreground border border-border rounded-xl px-3 py-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
        aria-label={theme === 'light' ? 'מצב כהה' : 'מצב בהיר'}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        <span className="text-sm font-medium hidden md:inline">
          {theme === 'light' ? 'כהה' : 'בהיר'}
        </span>
      </button>
    </div>
  );
}
