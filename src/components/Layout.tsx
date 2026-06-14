import { Outlet, useNavigate } from 'react-router-dom';
import BottomNav, { DesktopSidebar } from '@/components/BottomNav';
import RouteGuard from '@/components/RouteGuard';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import logo from '@/assets/logo.png';
import { LogOut, X, Eye, Building2 } from 'lucide-react';
import HelpButton from '@/components/HelpButton';

export default function Layout() {
  const { user, realUser, isImpersonating, stopImpersonation, logout } = useAuth();
  const { selectedCompany, setSelectedCompany } = useCompanyScope();
  const navigate = useNavigate();
  const isSuperAdmin = realUser?.role === 'super_admin' && !isImpersonating;

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between text-sm font-bold sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            <span>מצב צפייה: {user?.full_name} ({user?.company_name})</span>
          </div>
          <button
            onClick={() => {
              stopImpersonation();
              navigate('/user-management');
            }}
            className="flex items-center gap-1 bg-background/20 rounded-lg px-3 py-1 hover:bg-background/40 transition-colors"
          >
            <X size={14} />
            {realUser?.role === 'super_admin' ? 'חזרה למרכז ניהול' : 'חזרה למנהל צי'}
          </button>
        </div>
      )}

      <DesktopSidebar />

      {/* Mobile header */}
      <header className="md:hidden bg-[hsl(218,58%,15%)] text-primary-foreground p-4 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <img src={logo} alt="דליה" className="h-10 brightness-0 invert" />
          <div>
            <h1 className="text-lg font-bold leading-tight">דליה</h1>
            <p className="text-[10px] opacity-80">פתרונות תפעול ותחזוקה לרכב</p>
          </div>
        </div>
        <button onClick={() => logout()} className="flex items-center gap-2 bg-primary-foreground/20 rounded-xl px-3 py-2 active:scale-95 transition-transform">
          <LogOut size={20} />
          <span className="text-sm font-medium">יציאה</span>
        </button>
      </header>

      {/* Company scope banner for super_admin */}
      {isSuperAdmin && selectedCompany && (
        <div className="hidden md:flex bg-accent text-accent-foreground px-4 py-2 items-center justify-between text-sm font-medium sticky top-0 z-40 mr-72 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 size={16} />
            <span>מציג נתוני חברה: <strong>{selectedCompany}</strong></span>
          </div>
          <button
            onClick={() => setSelectedCompany(null)}
            className="flex items-center gap-1 bg-background/50 rounded-lg px-3 py-1 hover:bg-background/80 transition-colors text-xs"
          >
            <X size={12} />
            הצג הכל
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="md:mr-72 pb-24 md:pb-8 p-4 md:p-8">
        <RouteGuard>
          <Outlet />
        </RouteGuard>
      </main>

      {/* Footer credits */}
      <footer className="md:mr-72 pb-20 md:pb-4 px-4 text-center">
        <p className="text-muted-foreground text-xs">
          דליה פתרונות תפעול ותחזוקה לרכב | פתרונות ניהול ובקרה מתקדמים לציי רכב |{' '}
          <a
            href="http://www.dalia-c.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            www.dalia-c.com
          </a>
          {' '}| כל הזכויות שמורות ©
        </p>
      </footer>

      <BottomNav />
      <HelpButton />
    </div>
  );
}
