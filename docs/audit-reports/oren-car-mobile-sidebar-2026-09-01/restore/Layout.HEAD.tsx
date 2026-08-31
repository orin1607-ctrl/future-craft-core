import { Outlet, useNavigate } from 'react-router-dom';
import BottomNav, { DesktopSidebar } from '@/components/BottomNav';
import RouteGuard from '@/components/RouteGuard';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import logo from '@/assets/logo.png';
import { LogOut, X, Eye, Building2 } from 'lucide-react';
import HelpButton from '@/components/HelpButton';
import SecurityActivityTracker from '@/components/SecurityActivityTracker';

export default function Layout() {
  const { user, realUser, isImpersonating, stopImpersonation, logout } = useAuth();
  const { selectedCompany, setSelectedCompany } = useCompanyScope();
  const navigate = useNavigate();
  const isSuperAdmin = realUser?.role === 'super_admin' && !isImpersonating;

  return (
    <div className="min-h-screen bg-background">
      <SecurityActivityTracker />
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between text-sm font-bold sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            <span>╫₧╫ª╫ס ╫ª╫ñ╫ש╫ש╫פ: {user?.full_name} ({user?.company_name})</span>
          </div>
          <button
            onClick={() => {
              stopImpersonation();
              navigate('/user-management');
            }}
            className="flex items-center gap-1 bg-background/20 rounded-lg px-3 py-1 hover:bg-background/40 transition-colors"
          >
            <X size={14} />
            {realUser?.role === 'super_admin' ? '╫ק╫צ╫¿╫פ ╫£╫₧╫¿╫¢╫צ ╫á╫ש╫פ╫ץ╫£' : '╫ק╫צ╫¿╫פ ╫£╫₧╫á╫פ╫£ ╫ª╫ש'}
          </button>
        </div>
      )}

      <DesktopSidebar />

      {/* Mobile header */}
      <header className="md:hidden bg-[hsl(218,58%,15%)] text-primary-foreground p-4 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <img src={logo} alt="╫ף╫£╫ש╫פ" className="h-10 brightness-0 invert" />
          <div>
            <h1 className="text-lg font-bold leading-tight">╫ף╫£╫ש╫פ</h1>
            <p className="text-[10px] opacity-80">╫ñ╫¬╫¿╫ץ╫á╫ץ╫¬ ╫¬╫ñ╫ó╫ץ╫£ ╫ץ╫¬╫ק╫צ╫ץ╫º╫פ ╫£╫¿╫¢╫ס</p>
          </div>
        </div>
        <button onClick={() => logout()} className="flex items-center gap-2 bg-primary-foreground/20 rounded-xl px-3 py-2 active:scale-95 transition-transform">
          <LogOut size={20} />
          <span className="text-sm font-medium">╫ש╫ª╫ש╫נ╫פ</span>
        </button>
      </header>

      {/* Company scope banner for super_admin */}
      {isSuperAdmin && selectedCompany && (
        <div className="hidden md:flex bg-accent text-accent-foreground px-4 py-2 items-center justify-between text-sm font-medium sticky top-0 z-40 mr-72 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 size={16} />
            <span>╫₧╫ª╫ש╫ע ╫á╫¬╫ץ╫á╫ש ╫ק╫ס╫¿╫פ: <strong>{selectedCompany}</strong></span>
          </div>
          <button
            onClick={() => setSelectedCompany(null)}
            className="flex items-center gap-1 bg-background/50 rounded-lg px-3 py-1 hover:bg-background/80 transition-colors text-xs"
          >
            <X size={12} />
            ╫פ╫ª╫ע ╫פ╫¢╫£
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
          ╫ף╫£╫ש╫פ ╫ñ╫¬╫¿╫ץ╫á╫ץ╫¬ ╫¬╫ñ╫ó╫ץ╫£ ╫ץ╫¬╫ק╫צ╫ץ╫º╫פ ╫£╫¿╫¢╫ס | ╫ñ╫¬╫¿╫ץ╫á╫ץ╫¬ ╫á╫ש╫פ╫ץ╫£ ╫ץ╫ס╫º╫¿╫פ ╫₧╫¬╫º╫ף╫₧╫ש╫¥ ╫£╫ª╫ש╫ש ╫¿╫¢╫ס |{' '}
          <a
            href="http://www.dalia-c.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            www.dalia-c.com
          </a>
          {' '}| ╫¢╫£ ╫פ╫צ╫¢╫ץ╫ש╫ץ╫¬ ╫⌐╫₧╫ץ╫¿╫ץ╫¬ ┬⌐
        </p>
      </footer>

      <BottomNav />
      <HelpButton />
    </div>
  );
}
